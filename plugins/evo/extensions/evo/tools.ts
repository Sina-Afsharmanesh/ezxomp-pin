/**
 * Evo allowlist builder.
 *
 * Computes the allowed tool names when evo mode is on. The set is built from
 * the live pi.getAllTools() output at toggle time. Composition:
 *   - every registered tool: base orchestration utilities, all MCP tools,
 *     and every marketplace-plugin tool (backlog_*, codesight_*,
 *     code_nav_*, agent_experience_*, read_skills/skillforge_*,
 *     cook_*, omp_workflow_*, plannotator tools, ...)
 *   - natives are excluded, except `read` (protocol URIs only — filesystem
 *     paths are blocked by the tool_call hook)
 *
 * `read` is included so the agent can access OMP-native protocol URIs
 * (skill://, agent://, memory://, artifact://, history://, issue://,
 * pr://, local://, omp://) that ctx_* tools cannot resolve. The tool_call
 * hook blocks `read` on filesystem paths, allowing only protocol URIs.
 */

import { contentHash } from "./generation-state.ts";

export const NATIVE_BLOCK_LIST: ReadonlySet<string> = new Set([
  "read",
  "write",
  "bash",
  "edit",
  "glob",
  "grep",
]);

/**
 * Protected floor: tools that MUST survive evo mode regardless of what the
 * getAllTools() snapshot captured at toggle time. Without them the main agent
 * loses orchestration primitives (task spawning, subagent messaging, the eval
 * kernel) and cook-style workflows dead-end — the orchestrator cannot spawn
 * specialists and burns turns improvising with omp CLI workarounds.
 * Always-unioned into the active set; never removed by the snapshot.
 */
export const PROTECTED_TOOLS: ReadonlySet<string> = new Set([
  "task",
  "hub",
  "eval",
  "read",
]);

export interface ToolInfo {
  name: string;
}

export interface PiToolsSurface {
  getAllTools?: () => Promise<ToolInfo[]>;
  getActiveTools?: () => Promise<string[]>;
  setActiveTools?: (tools: string[]) => Promise<void>;
}

export async function buildEvoMainTools(piTools: PiToolsSurface): Promise<string[]> {
  const all = (await piTools.getAllTools?.()) ?? [];
  const allowed = new Set<string>();
  for (const tool of all) {
    // Natives (except `read`, kept for protocol-URI access) stay out of the
    // active set; the tool_call hook re-blocks `read` on filesystem paths.
    if (NATIVE_BLOCK_LIST.has(tool.name) && tool.name !== "read") continue;
    // Everything else is allowed: base utilities, MCP tools, and every
    // marketplace-plugin registered tool (backlog, codesight,
    // code-nav, experiences, agent-learning, cook, extensible-workflows,
    // plannotator, ...). Newly installed plugins are picked up on the next
    // /evo on via live getAllTools().
    allowed.add(tool.name);
  }
  // Protected floor beats snapshot gaps: orchestration primitives (task, hub,
  // eval) and protocol-URI read are contract-required even when getAllTools()
  // missed them at toggle time (e.g. lazily-registered session-scoped tools).
  for (const name of PROTECTED_TOOLS) {
    if (name === "read") continue; // read is added below only if registered
    allowed.add(name);
  }
  // `read` joins the floor only when the host actually registers it — the
  // tool_call hook re-blocks it on filesystem paths, so keeping it registered
  // but blocked is safe and preserves protocol-URI access.
  if (all.some((tool) => tool.name === "read")) {
    allowed.add("read");
  }
  return [...allowed].sort();
}

/**
 * Sub-agent allowlist builder.
 *
 * Per-role surfaces for /evo-sub child profiles. Natives (read, write, bash,
 * edit, glob, grep) are replaced by the persistent `eval` kernel; hub exists
 * so spawned agents can report findings, status, and blockers to Main per
 * protocol. Every role keeps its marketplace-plugin tools — codesight for
 * orientation, code-nav for symbol work, backlog_* for ticket writes,
 * web_search for external evidence — and read-only cook_* utilities. Role
 * briefing briefs are pre-digested, so subs get role-specific navigation rights
 * they had pre-toggle, never sub-orchestration tools (task, cook_dispatch_*,
 * cook_next, cook_advance, cook_decompose) that would loop spawning.
 */
export const SUB_DENIED_TOOLS: ReadonlySet<string> = new Set([
  "read", "write", "bash", "edit", "glob", "grep", "task",
  "cook_dispatch_worker", "cook_dispatch_planner", "cook_dispatch_scout",
  "cook_dispatch_researcher", "cook_dispatch_validator", "cook_dispatch_judge",
  "cook_dispatch_council", "cook_dispatch_audit", "cook_dispatch_refute",
  "cook_next", "cook_advance", "cook_decompose",
]);
export const SUB_POLICY_VERSION = "evo-sub-policy-v1";

export function isDeniedSubTool(name: string): boolean {
  return SUB_DENIED_TOOLS.has(name) || name.startsWith("cook_dispatch_");
}

export const SUB_BASE_TOOLS: ReadonlySet<string> = new Set([
  "eval",
  "hub",
  "yield",
]);

const SUB_ROLE_TOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  "cook-judge.md": new Set([
    "backlog_task_edit",
    "backlog_task_view",
    "codesight_get_blast_radius",
    "codesight_get_change_impact",
    "codesight_get_import_graph",
    "codesight_get_symbol_index",
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
  ]),
  "cook-planner.md": new Set([
    "backlog_task_create",
    "backlog_task_edit",
    "backlog_task_list",
    "backlog_task_view",
    "backlog_doc_create",
    "codesight_get_symbol_index",
    "codesight_get_wiki_index",
    "codesight_get_summary",
    "codesight_get_wiki_article",
    "codesight_get_blast_radius",
  ]),
  "cook-researcher.md": new Set([
    "backlog_doc_create",
    "codesight_get_symbol_index",
    "codesight_get_import_graph",
    "codesight_get_wiki_index",
    "codesight_get_summary",
    "codesight_get_wiki_article",
    "cook_adhd_diverge",
    "cook_adhd_focus",
  ]),
  "cook-scout.md": new Set([
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
  ]),
  "cook-validator.md": new Set([
    "backlog_task_edit",
    "backlog_task_view",
    "cook_journal",
    "codesight_get_change_impact",
    "codesight_get_blast_radius",
    "codesight_get_import_graph",
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
  ]),
  "cook-council.md": new Set([
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
    "codesight_get_blast_radius",
    "codesight_get_change_impact",
    "codesight_get_import_graph",
  ]),
  "cook-council-synthesis.md": new Set([
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
    "codesight_get_blast_radius",
    "codesight_get_change_impact",
    "codesight_get_import_graph",
  ]),
  "cook-worker.md": new Set([
    "backlog_task_edit",
    "backlog_task_view",
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
    "codesight_get_blast_radius",
    "codesight_get_change_impact",
    "codesight_get_import_graph",
  ]),
  "cook-audit.md": new Set([
    "backlog_task_view",
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
    "codesight_get_change_impact",
    "codesight_get_blast_radius",
    "codesight_get_import_graph",
  ]),
  "cook-refute.md": new Set([
    "backlog_task_view",
    "codesight_get_summary",
    "codesight_get_wiki_index",
    "codesight_get_wiki_article",
    "codesight_get_symbol_index",
    "codesight_get_change_impact",
    "codesight_get_blast_radius",
    "codesight_get_import_graph",
  ]),
};

/**
 * Allowlist for one cook profile under evo-sub. Unknown profile names fall
 * back to the shared base so a renamed/untracked profile still gets eval+hub.
 */
export function buildEvoSubTools(
  profileFile?: string,
  originalTools?: Iterable<string>,
): string[] {
  const tools = new Set(SUB_BASE_TOOLS);
  if (profileFile) {
    const roleTools = SUB_ROLE_TOOLS[profileFile];
    if (roleTools) {
      for (const name of roleTools) tools.add(name);
      // Explicit role addition: every known cook role may use grounded symbol
      // navigation, while unknown profiles receive only the minimal floor.
      tools.add("code_nav_get_symbol");
    }
  }
  if (originalTools) {
    const derived = new Set<string>();
    for (const name of originalTools) {
      if (!isDeniedSubTool(name)) derived.add(name);
    }
    for (const name of tools) derived.add(name);
    return [...derived].sort();
  }
  return [...tools].sort();
}

/** Derive an evo-sub surface from the immutable grants in a profile. */
export function deriveEvoSubTools(
  originalTools: Iterable<string>,
  profileFile?: string,
): string[] {
  return buildEvoSubTools(profileFile, originalTools);
}

/**
 * Stable derived catalog identity for a sub generation: hash of the per-role
 * effective surfaces derived under the CURRENT policy, entry-ordered exactly
 * as the generation record stores them. Writers (activate/refresh) and the
 * task-dispatch preflight compute the SAME value from the same entries, so
 * the stored catalogHash is always cross-checkable against the live derived
 * state. The hash is derived data — never a duplicated policy list.
 */
export function evoSubCatalogHash(
  surfaces: ReadonlyArray<{ basename: string; originalTools: readonly string[] }>,
): string {
  let acc = "";
  for (const { basename, originalTools } of surfaces) {
    const derived = buildEvoSubTools(basename, originalTools);
    acc += `${basename}\0${derived.join(",")}\0`;
  }
  return contentHash(acc);
}
