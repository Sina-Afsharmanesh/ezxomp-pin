import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { showConfirmOverlay } from "../overlay/confirm-overlay.js";

/** Remove comments, dead code
 * Scans for dead comment blocks: TODO markers (comment-only lines), 3+ consecutive comment-only lines.
 * --list (default): list candidates only, no file changes.
 * --confirm: delete identified comment blocks from source files.
 * Only removes full comment-only lines; never touches code lines even if they contain TODO markers.
 * @implements TASK-37.6
 */
export async function handleDeslop(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const flags = parseFlags(args);
  const doDelete = flags.has("--confirm");

  const sources = globTs(cwd);
  if (sources.length === 0) {
    ctx.ui.notify("pstack deslop: no TypeScript files found.", "error");
    return;
  }

  const candidates: DeslopCandidate[] = [];

  for (const file of sources) {
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const blocks = scanCommentBlocks(lines);
      const todos = scanTodoMarkers(lines);
      for (const b of blocks) {
        candidates.push({ file, start: b.start, end: b.end, kind: "comment-block" });
      }
      for (const t of todos) {
        candidates.push({ file, start: t.line, end: t.line, kind: "todo-marker" });
      }
    } catch {
      // skip unreadable files
    }
  }

  if (candidates.length === 0) {
    ctx.ui.notify("pstack deslop: no candidates found.", "info");
    return;
  }

  // Report counts
  const blockCount = candidates.filter((c) => c.kind === "comment-block").length;
  const todoCount = candidates.filter((c) => c.kind === "todo-marker").length;
  ctx.ui.notify(
    `pstack deslop: found ${blockCount} comment-block(s), ${todoCount} TODO marker(s) across ${sources.length} file(s)`,
    "info",
  );

  // List candidates (always shown)
  for (const c of candidates) {
    const rel = c.file.replace(cwd + "/", "");
    ctx.ui.notify(
      `  ${rel}: ${c.kind} at line ${c.start}-${c.end}`,
      "info",
    );
  }

  // Without --confirm: scan-only, stop here
  if (!doDelete) {
    ctx.ui.notify(
      "pstack deslop: scan complete. Pass --confirm to delete identified comment blocks.",
      "info",
    );
    return;
  }

  // Show confirmation overlay before destructive deletion
  const deslopConfirmed = await showConfirmOverlay(ctx, {
    title: "⚠ Deslop Confirmation",
    lines: [
      `Comment blocks: ${blockCount}`,
      `TODO markers: ${todoCount}`,
      `Files scanned: ${sources.length}`,
      "",
      "Delete identified comment blocks? (irreversible)",
    ],
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  });
  if (deslopConfirmed === false) {
    ctx.ui.notify("pstack deslop: deletion cancelled.", "info");
    return;
  }

  // --confirm: delete exact candidate spans, preserving non-comment lines
  const result = await applyDeslop(candidates, cwd, ctx);
  if (result.ok === 0 && result.fail === 0) {
    ctx.ui.notify("pstack deslop: no files modified.", "info");
  } else {
    ctx.ui.notify(
      `pstack deslop: deleted from ${result.ok} file(s), ${result.fail} failure(s).`,
      "info",
    );
  }
}

interface DeslopCandidate {
  file: string;
  start: number;
  end: number;
  kind: "comment-block" | "todo-marker";
}

/** Apply deletions: group by file, remove exact marked lines, write back preserving newline. */
async function applyDeslop(
  candidates: DeslopCandidate[],
  cwd: string,
  ctx: ExtensionCommandContext,
): Promise<{ ok: number; fail: number }> {
  // Group candidates by file
  const fileMap = new Map<string, DeslopCandidate[]>();
  for (const c of candidates) {
    const arr = fileMap.get(c.file) || [];
    arr.push(c);
    fileMap.set(c.file, arr);
  }

  let ok = 0, fail = 0;

  for (const [file, cands] of fileMap) {
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // Build set of 0-based line indices to remove — exact spans only
      const removeIndices = new Set<number>();
      for (const c of cands) {
        for (let ln = c.start; ln <= c.end; ln++) {
          removeIndices.add(ln - 1); // 1-based → 0-based
        }
      }

      // Sanity: verify every marked line is actually a comment-only line
      for (const idx of removeIndices) {
        if (!isCommentLine(lines[idx]!)) {
          ctx.ui.notify(
            `  SKIPPED ${file}: line ${idx + 1} is not a comment line — aborting file to protect code`,
            "error",
          );
          fail++;
          continue; // skip this file, don't delete
        }
      }

      const newLines = lines.filter((_, idx) => !removeIndices.has(idx));
      const newContent = newLines.join("\n");

      if (newContent !== content) {
        writeFileSync(file, newContent, "utf-8");
        const rel = file.replace(cwd + "/", "");
        ctx.ui.notify(
          `  deleted from ${rel}: removed ${removeIndices.size} line(s)`,
          "info",
        );
        ok++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      ctx.ui.notify(`  failed to edit ${file}: ${msg}`, "error");
      fail++;
    }
  }

  return { ok, fail };
}

/** Scan for consecutive comment-only line blocks of 3+ lines. */
function scanCommentBlocks(lines: string[]): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < lines.length) {
    if (isCommentLine(lines[i]!)) {
      let j = i;
      while (j < lines.length && isCommentLine(lines[j]!)) {
        j++;
      }
      if (j - i >= 3) {
        blocks.push({ start: i + 1, end: j });
      }
      i = j;
    } else {
      i++;
    }
  }
  return blocks;
}

/** Scan for TODO/FIXME/HACK/XXX markers — comment-only lines only (never code lines). */
function scanTodoMarkers(lines: string[]): Array<{ line: number }> {
  const markers: Array<{ line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i]!) && /TODO|FIXME|HACK|XXX/i.test(lines[i]!)) {
      markers.push({ line: i + 1 });
    }
  }
  return markers;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    (trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/"))
  );
}

/** Recursively find .ts/.tsx files, skipping node_modules, dist, test. */
function globTs(root: string): string[] {
  const result: string[] = [];
  function scan(current: string) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const skip = entry === "node_modules" || entry === "dist" || entry === ".git" || entry === "test";
      if (skip) continue;
      const full = join(current, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          scan(full);
        } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
          result.push(full);
        }
      } catch {
        // skip
      }
    }
  }
  scan(root);
  return result;
}

/** Parse ONLY --prefixed flags (keeps -- prefix for exact matching). */
function parseFlags(raw: string): Set<string> {
  const s = new Set<string>();
  for (const tok of raw.split(/\s+/)) {
    if (tok.startsWith("--")) {
      s.add(tok);
    }
  }
  return s;
}
