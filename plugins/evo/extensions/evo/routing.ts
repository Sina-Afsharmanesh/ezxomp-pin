/**
 * Canonical EVO routing guidance and stable reason codes.
 *
 * This module owns the deterministic, model-agnostic message surface for EVO
 * mode: one concise canonical routing ladder (injected into the system prompt
 * while the MAIN evo lane is active) and the stable, machine-checkable reason
 * codes returned by the tool_call hook. Hook logic stays small and
 * deterministic here — a full tool inventory is NEVER injected.
 *
 * Reason-code contract (asserted by transactional tests):
 *   EVO_FS_READ_USE_NAV — native read on a filesystem path while evo is on.
 *   EVO_SUBSTATE_INVALID — task dispatch for a cook-* profile while sub evo is
 *     on but the committed generation, policy/catalog identity, or effective
 *     hash cannot be proven to match the project-nearest profile.
 *   EVO_REPEAT_VIOLATION — the same bad native tool was already taught this
 *     turn; no A<->B redirect loop (hard block, no re-teach).
 */

/**
 * Protocols `read` may resolve while evo is active (incl. xd://). Static
 * literal lookup table — membership via `=== true`; never mutated.
 */
const PROTOCOL_SCHEMES: Record<string, true> = {
  artifact: true,
  agent: true,
  history: true,
  http: true,
  https: true,
  issue: true,
  local: true,
  memory: true,
  omp: true,
  pr: true,
  rule: true,
  skill: true,
  ssh: true,
  xd: true,
};

/**
 * Stable predicate: is this path a protocol URI that `read` may resolve
 * under evo? Accepts every supported scheme including `xd://` plus the
 * `scheme://` shape generally (forward-compatible with new protocols).
 */
export const PROTOCOL_URI_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

export function isProtocolUri(value: string): boolean {
  if (typeof value !== "string" || !PROTOCOL_URI_RE.test(value)) return false;
  const scheme = value.slice(0, value.indexOf("://")).toLowerCase();
  return PROTOCOL_SCHEMES[scheme] === true;
}

/** Stable EVO reason codes (prefix contract asserted by tests). */
export const REASON_FS_READ_USE_NAV = "EVO_FS_READ_USE_NAV";
export const REASON_SUBSTATE_INVALID = "EVO_SUBSTATE_INVALID";
export const REASON_REPEAT_VIOLATION = "EVO_REPEAT_VIOLATION";

/**
 * One concise canonical routing ladder for the main agent system prompt.
 * Owning plugin for the domain → codesight/code-nav for code context →
 * protocol artifact read → eval for mutation/shell/batch/bounded bytes ONLY.
 * Kept deliberately short: the point is routing, not tool inventory.
 */
export function buildRoutingLadder(): string {
  return [
    "EVO routing (main active):",
    "- Domain operation: use the owning plugin first — backlog_* for tickets/plans/docs, codesight_*/code_nav_* for code, skillforge/read_skills for guidance, omp_workflow_* for recipes.",
    "- Repository orientation: climb the codesight ladder first (codesight_get_summary / codesight_get_symbol_index), then code_nav_get_symbol / code_nav_find_references for exact slices.",
    "- Protocol artifact: native read resolves supported protocol URIs only (skill://, memory://, agent://, xd://, artifact://, issue://, ...); filesystem paths are blocked — use eval read(offset, limit) as the LAST resort.",
    "- eval (persistent eval kernel) handles ONLY mutation, shell, batch operations, and bounded raw-byte reads (eval read with offset/limit, last resort) — never a substitute for an owning plugin tool.",
    "- Never use a blocked native (write/bash/edit/glob/grep, read on fs paths): routing is block+reason, never automatic substitution.",
  ].join("\n");
}

/**
 * Bounded per-turn violation state for the tool_call hook.
 *
 * - teach once: the first bad call of a native tool emits the full teaching
 *   reason; every later call of the same tool in the same turn is a hard
 *   block (EVO_REPEAT_VIOLATION) that never re-teaches — no A<->B redirect
 *   loops.
 * - Reset at turn_start so teaching repeats once per turn, deterministic and
 *   bounded (one string per blocked native tool; never a tool inventory).
 */
export class PerTurnViolationTracker {
  private taught = new Set<string>();

  reset(): void {
    this.taught.clear();
  }

  alreadyTaught(tool: string): boolean {
    return this.taught.has(tool);
  }

  markTaught(tool: string): void {
    this.taught.add(tool);
  }
}
