/**
 * Task-dispatch preflight for cook-* profiles under persisted sub evo.
 *
 * Spawning a cook-* subagent is only legitimate while the persisted config
 * requests sub evo (config.sub === true) AND the committed sub generation can
 * be proven to cover the actual project-nearest profile for that role. The
 * proof is fail-closed even when the process-local controller fails to
 * hydrate: the hook re-reads config, generation evidence, and profiles from
 * disk itself and never trusts controller state.
 *
 * Proof legs (all must hold or dispatch blocks with EVO_SUBSTATE_INVALID):
 *   - persisted config.sub === true (otherwise no interception).
 *   - a committed active sub generation exists under the dispatch cwd.
 *   - the generation's policy version equals the current derived policy
 *     version (SUB_POLICY_VERSION).
 *   - the generation's catalog identity equals the live catalog hash
 *     recomputed from the derived per-role effective surfaces.
 *   - the generation carries an entry whose canonical path equals the ACTUAL
 *     project-nearest profile (project <cwd>/.omp/agents/<name>.md wins,
 *     else global <OMP_HOME>/agents/<name>.md) and whose committed
 *     effectiveContentHash equals contentHash(recomputed overlay derived
 *     from that profile's byte-exact originalContent), and the file on disk
 *     still carries that effective hash plus the live overlay marker.
 *
 * Returns undefined when the profile is not a cook-* profile (no
 * interception) and a stable EVO_SUBSTATE_INVALID blocking reason when any
 * proof leg fails. Redirects are block+reason — never automatic tool
 * substitution.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { readEvoConfig } from "./config.ts";
import {
  EVO_SUB_BRIEF_START,
  injectEvoSubInstructions,
  parseToolsFrontmatter,
  rewriteToolsFrontmatter,
} from "./frontmatter.ts";
import {
  contentHash,
  readSubGeneration,
  type SubGenerationRecord,
} from "./generation-state.ts";
import { ompAgentProfilesDir, projectAgentProfilesDir } from "./paths.ts";
import { REASON_SUBSTATE_INVALID } from "./routing.ts";
import { buildEvoSubTools, evoSubCatalogHash, SUB_POLICY_VERSION } from "./tools.ts";

/** Cook-* profile names whose dispatch is preflighted under sub evo. */
const COOK_PROFILE_NAMES: Record<string, true> = {
  "cook-audit.md": true,
  "cook-council-synthesis.md": true,
  "cook-council.md": true,
  "cook-judge.md": true,
  "cook-planner.md": true,
  "cook-refute.md": true,
  "cook-researcher.md": true,
  "cook-scout.md": true,
  "cook-validator.md": true,
  "cook-worker.md": true,
};

export interface SubDispatchPreflightResult {
  block?: boolean;
  reason?: string;
}

export function isCookProfileName(name: string): boolean {
  return COOK_PROFILE_NAMES[name] === true;
}

/** True when the profile has been rewritten by a live evo-sub generation. */
function hasEvoOverlay(content: string): boolean {
  return content.includes(EVO_SUB_BRIEF_START);
}

/**
 * Preflight one task dispatch. `cwd` is the owning agent's working
 * directory. Mirrors /evo-sub on: the project-nearest profile is
 * <cwd>/.omp/agents/<name>.md when present, otherwise
 * <OMP_HOME>/agents/<name>.md.
 */
export async function preflightSubTaskDispatch(
  agent: unknown,
  cwd: string,
): Promise<SubDispatchPreflightResult> {
  if (typeof agent !== "string") return {};
  const agentName = agent.trim();
  const basename = agentName.endsWith(".md") ? agentName : `${agentName}.md`;
  if (!isCookProfileName(basename)) return {};

  // Gate on the PERSISTED config request, never on the process-local
  // controller hydrate. If hydrate failed (invalid/foreign state) while the
  // config still requests sub evo, preflight must still demand proof and
  // block — no silent fallback to the original cook profiles.
  const config = await readEvoConfig();
  if (!config.sub) return {};

  const generation = await readSubGeneration([cwd]);
  if (generation === null || generation.status !== "active" || generation.profiles.length === 0) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: persisted config requests sub evo but no committed active sub generation exists for ${basename} at ${cwd}; run /evo-sub on first.`,
    };
  }

  // The generation must be covered by the CURRENT derived policy version.
  // A record written by an older policy derivation is not proof of a live
  // sub surface — fail closed, never fall back silently.
  if (generation.policyVersion !== SUB_POLICY_VERSION) {
    const catalog =
      typeof generation.catalogHash === "string" && generation.catalogHash.length > 0
        ? generation.catalogHash.slice(0, 8)
        : "unknown";
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: committed sub generation policy ${generation.policyVersion} (catalog ${catalog}) does not match ${SUB_POLICY_VERSION}; run /evo-sub regenerate.`,
    };
  }

  const profile = resolveGenerationProfile(generation, basename);
  if (!profile) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: no committed sub generation entry for ${basename} covering the project-nearest profile; run /evo-sub regenerate to rebuild the generation.`,
    };
  }

  // Owner-cwd binding: when the record owns a project cwd, dispatch from any
  // other directory cannot prove lane identity.
  if (
    generation.ownerProjectCwd !== undefined &&
    path.resolve(cwd) !== path.resolve(generation.ownerProjectCwd)
  ) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: sub generation owner ${generation.ownerProjectCwd} does not match working directory ${cwd}; run /evo-sub on from the project root first.`,
    };
  }

  // The generation entry must describe the ACTUAL resolved profile
  // (project-nearest, else global) via canonical equality. A record for the
  // original global profile must not authorize dispatch through a shadowing
  // project profile — and vice versa.
  const resolved = await resolveProjectNearestProfile(agent, cwd);
  if (!resolved || path.resolve(resolved) !== path.resolve(profile.canonicalPath)) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: committed sub generation entry for ${basename} does not match the actual project-nearest profile ${resolved ?? "(none)"}; run /evo-sub regenerate.`,
    };
  }

  // Expected overlay = derive the role surface from the generation's
  // byte-exact originalContent under the CURRENT policy, then rewrite the
  // frontmatter plus the survival brief. The committed effectiveContentHash
  // must equal this recomputation — a stale or hand-tampered record fails.
  const expected = computeExpectedEffectiveContent(basename, profile.originalContent);
  if (
    profile.originalContent.length === 0 ||
    profile.effectiveContentHash !== contentHash(expected)
  ) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: ${basename} committed effective hash does not match the recomputed overlay under ${SUB_POLICY_VERSION}; run /evo-sub regenerate.`,
    };
  }

  // Live catalog identity: the generation's catalogHash must equal the hash
  // recomputed from the derived per-role effective surfaces of the generation
  // entries — consistent, derived from current policy, never duplicated
  // policy state.
  const liveCatalogHash = evoSubCatalogHash(
    generation.profiles.map((entry) => ({
      basename: path.basename(entry.canonicalPath),
      originalTools: parseToolsFrontmatter(entry.originalContent) ?? [],
    })),
  );
  if (liveCatalogHash !== generation.catalogHash) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: committed sub generation catalog identity does not match the live derived catalog; run /evo-sub regenerate.`,
    };
  }

  let current: string;
  try {
    current = await fs.readFile(profile.canonicalPath, "utf8");
  } catch {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: profile ${profile.canonicalPath} is missing; run /evo-sub regenerate.`,
    };
  }
  if (contentHash(current) !== profile.effectiveContentHash || !hasEvoOverlay(current)) {
    return {
      block: true,
      reason:
        `${REASON_SUBSTATE_INVALID}: ${basename} no longer matches the committed sub generation (hash drift); run /evo-sub regenerate.`,
    };
  }

  return {};
}

/** Recompute the expected effective file content for one profile from its
 *  immutable originalContent under the CURRENT derived role policy. */
function computeExpectedEffectiveContent(
  basename: string,
  originalContent: string,
): string {
  const originalTools = parseToolsFrontmatter(originalContent) ?? [];
  const tools = buildEvoSubTools(basename, originalTools);
  return injectEvoSubInstructions(rewriteToolsFrontmatter(originalContent, tools).content);
}

/** Find the generation entry whose canonical path basename matches, preferring project scope. */
function resolveGenerationProfile(
  generation: SubGenerationRecord,
  basename: string,
): (typeof generation.profiles)[number] | undefined {
  const byName = generation.profiles.filter(
    (p) => path.basename(p.canonicalPath) === basename,
  );
  if (byName.length === 0) return undefined;
  const project = byName.find((p) => p.scope === "project");
  return project ?? byName[0];
}

/** Resolve the actual project-nearest profile path for a cook role under cwd. */
export async function resolveProjectNearestProfile(
  agent: unknown,
  cwd: string,
): Promise<string | null> {
  if (typeof agent !== "string") return null;
  const agentName = agent.trim();
  const basename = agentName.endsWith(".md") ? agentName : `${agentName}.md`;
  if (!isCookProfileName(basename)) return null;
  const candidates = [
    path.join(projectAgentProfilesDir(cwd), basename),
    path.join(ompAgentProfilesDir(), basename),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.realpath(candidate);
    } catch {
      continue;
    }
  }
  return null;
}
