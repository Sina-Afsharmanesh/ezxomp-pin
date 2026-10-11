/**
 * Frontmatter rewrite utility.
 *
 * Agent profiles in ~/.omp/agents/*.md have YAML frontmatter. /evo-sub on
 * overwrites the `tools:` key with the evo allowlist. /evo-sub off restores
 * from a byte-exact snapshot.
 *
 * Handles three cases:
 *   1. No frontmatter → prepend minimal `---\ntools: ...\n---\n\n` block.
 *   2. Frontmatter present, no `tools:` key → append `tools:` line inside FM.
 *   3. Frontmatter present with `tools:` → replace value, preserve other keys.
 */

export interface FrontmatterRewrite {
  content: string;
  previous: string[] | null; // null if no prior tools: key
}

/** Parse CSV and YAML-list forms without changing the source bytes. */
export function parseToolsFrontmatter(content: string): string[] | null {
  const match = content.match(/^tools:[ \t]*(.*)(?:\r?\n|$)/m);
  if (!match || !(match[1]?.trim())) {
    const arrayMatch = content.match(/^tools:[ \t]*\r?\n((?:[ \t]*-[ \t]*.*(?:\r?\n|$))+)/m);
    if (arrayMatch) return arrayMatch[1].split(/\r?\n/)
      .map((line) => line.match(/^[ \t]*-[ \t]*(.*)$/)?.[1]?.trim() ?? "")
      .filter(Boolean)
      .map((value) => value.replace(/^['"]|['"]$/g, ""));
    if (!match) return null;
    return [];
  }
  const csv = match[1]?.trim() ?? "";
  return csv ? csv.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Return one profile per role, preferring project-local files over globals.
 * Inputs are paths (or directory listings) and are never mutated.
 */
export function selectProjectNearestProfiles(
  globalProfiles: readonly string[],
  projectProfiles: readonly string[],
): string[] {
  const projectByName = new Map(projectProfiles.map((file) => [file.split("/").pop(), file]));
  const selected = globalProfiles.map((file) => projectByName.get(file.split("/").pop()) ?? file);
  const globalNames = new Set(globalProfiles.map((file) => file.split("/").pop()));
  for (const file of projectProfiles) {
    if (!globalNames.has(file.split("/").pop())) selected.push(file);
  }
  return [...new Set(selected)];
}

export function rewriteToolsFrontmatter(
  origContent: string,
  newTools: string[],
): FrontmatterRewrite {
  const newToolsCsv = newTools.join(", ");

  const newline = origContent.includes("\r\n") ? "\r\n" : "\n";
  if (!origContent.startsWith("---\n") && !origContent.startsWith("---\r\n")) {
    return {
      content: `---${newline}tools: ${newToolsCsv}${newline}---${newline}${newline}${origContent}`,
      previous: null,
    };
  }

  const closeIdx = origContent.search(/\r?\n---\r?\n/);
  const closeIdxEof = origContent.search(/\r?\n---$/);
  let fmEnd = -1;
  let fmEndInclusive = -1;
  let wasEofClose = false;
  if (closeIdx !== -1) {
    fmEnd = closeIdx;
    fmEndInclusive = closeIdx + (origContent.startsWith("\r\n", closeIdx) ? 7 : 5);
  } else if (
    closeIdxEof !== -1 &&
    (closeIdxEof === origContent.length - 4 || closeIdxEof === origContent.length - 5)
  ) {
    fmEnd = closeIdxEof;
    fmEndInclusive = origContent.length;
    wasEofClose = true;
  } else {
    return {
      content: `---\ntools: ${newToolsCsv}\n---\n\n${origContent}`,
      previous: null,
    };
  }

  const fmBody = origContent.slice(origContent.startsWith("---\r\n") ? 5 : 4, fmEnd);
  const rest = origContent.slice(fmEndInclusive);

  const toolsLineRe = /^tools:[ \t]*(.*)(?:\r?\n|$)/m;
  const match = fmBody.match(toolsLineRe);
  let previous: string[] | null = null;
  let newFmBody: string;
  if (match) {
    previous = parseToolsFrontmatter(`---${newline}${fmBody}`) ?? [];
    // Derive from the original grant set: unknown plugin grants survive while
    // denied native/orchestration tools are removed.
    const effective = new Set(previous.filter((name) =>
      ![
        "read", "write", "bash", "edit", "glob", "grep", "task",
        "cook_next", "cook_advance", "cook_decompose",
      ].includes(name) && !name.startsWith("cook_dispatch_")
    ));
    for (const name of newTools) effective.add(name);
    newFmBody = fmBody.replace(toolsLineRe, `tools: ${[...effective].sort().join(", ")}${newline}`);
    // Remove YAML array continuation lines that belonged to the old key.
    newFmBody = newFmBody.replace(
      new RegExp(`(?:^[ \\t]*-[ \\t]*.*(?:\\r?\\n|$))+`, "m"),
      "",
    );
  } else {
    newFmBody = fmBody.endsWith("\n") || fmBody.endsWith("\r") || fmBody.length === 0
      ? `${fmBody}tools: ${newToolsCsv}${newline}`
      : `${fmBody}${newline}tools: ${newToolsCsv}${newline}`;
  }

  const trimmed = newFmBody.replace(/\r?\n$/, "");
  const closeMarker = wasEofClose ? `${newline}---` : `${newline}---${newline}`;
  const finalContent = `---${newline}${trimmed}${closeMarker}${rest}`;
  return { content: finalContent, previous };
}

export const EVO_SUB_BRIEF_START = "<!-- evo-sub:brief:start -->";

const EVO_SUB_BRIEF_END = "<!-- evo-sub:brief:end -->";

/**
 * Mandatory survival brief appended to cook profile bodies while evo-sub is
 * active: hub reporting duty to Main plus the three proven survival patterns.
 * Idempotent — a body already carrying the start marker passes through
 * unchanged, so repeated transformations never duplicate the block.
 */
export function injectEvoSubInstructions(content: string): string {
  if (content.includes(EVO_SUB_BRIEF_START)) return content;
  const block = [
    EVO_SUB_BRIEF_START,
    "### Evo-sub survival brief",
    "- Report findings, status, and blockers to Main via hub at milestones and on completion.",
    "- Treat supplied context as pre-digested evidence: no exploration homework.",
    "- Gathering context? Climb the ladder before any raw read: codesight_get_summary / codesight_get_symbol_index (orient, ground), then code_nav_get_symbol / code_nav_find_references (exact slices). eval read(offset, limit) is the LAST resort — full-file reads are routing failures.",
    "- Native read/grep/glob/bash/write/edit are blocked: use the persistent eval kernel for file and shell operations; your frontmatter `tools:` line names the plugin tools (codesight_*, code_nav_*, backlog_*, web_search) still available to your role.",
    "- Repo mutations follow the project's parallel-agent Git protocol (`docs/parallel-agents.md`, single source of truth): work in your assigned `git worktree` on branch `task/<slug>` from `main` only, commit there, and report the branch plus your immutable `HEAD` OID; NEVER `git push` (anything) or move `main` — the coordinator integrates serially and is the only pusher.",
    "- Land every file change within about 3 tool calls.",
    "- Strict single-file ownership: one agent owns one file.",
    EVO_SUB_BRIEF_END,
  ].join("\n");
  return content.endsWith("\n") || content.length === 0
    ? `${content}\n${block}\n`
    : `${content}\n\n${block}\n`;
}
