/**
 * Sub-state backup file.
 *
 * /evo-sub on snapshots every agent profile's byte content into
 * ~/.omp/agent/evo-mode/sub-state.json. /evo-sub off restores from it.
 * Full content snapshot ensures user's manual edits to OTHER profile fields
 * made *before* evo-sub was activated are preserved across the toggle cycle.
 *
 * A malformed, wrong-shaped, or unsafe state file is intentionally preserved
 * and blocks /evo-sub on and /evo-sub off until the user manually removes
 * ~/.omp/agent/evo-mode/sub-state.json (or the equivalent OMP_HOME path).
 * This fail-closed behavior avoids silently losing the byte-exact originals.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { atomicWriteFile } from "./atomic.ts";
import { ompAgentProfilesDir, ompStateFile, projectAgentProfilesDir } from "./paths.ts";

export interface SubStateEntry {
  path: string;
  originalContent: string;
}

export interface SubStateFile {
  timestamp: string;
  toolListHash: string;
  files: SubStateEntry[];
  /** Project cwds whose .omp/agents profiles are covered by this state (dual-scope support). */
  projectCwds?: string[];
}

function isValidSubStateFile(value: unknown): value is SubStateFile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const state = value as Record<string, unknown>;
  if (
    typeof state.timestamp !== "string" ||
    typeof state.toolListHash !== "string" ||
    !Array.isArray(state.files)
  ) {
    return false;
  }

  // Entries may live under the global profiles dir OR any project-local dir
  // (<cwd>/.omp/agents) since /evo-sub on covers both scopes.
  const profileRoots = [path.resolve(ompAgentProfilesDir())].map(
    (root) => `${root}${path.sep}`,
  );
  const projectCwds = state.projectCwds;
  if (projectCwds !== undefined && (
    !Array.isArray(projectCwds) || projectCwds.some((cwd) => typeof cwd !== "string")
  )) return false;
  const projectRoots = (projectCwds ?? []).map(
    (cwd) => `${path.resolve(projectAgentProfilesDir(cwd))}${path.sep}`,
  );
  const allowedPrefixes = [...profileRoots, ...projectRoots];
  return state.files.every((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.path !== "string" || typeof candidate.originalContent !== "string") {
      return false;
    }
    const entryPath = path.resolve(candidate.path);
    return allowedPrefixes.some((prefix) => entryPath.startsWith(prefix));
  });
}

export async function writeSubState(
  entries: SubStateEntry[],
  toolList: string[],
  projectCwds?: string[],
): Promise<void> {
  const toolListHash = createHash("sha256").update(toolList.join(",")).digest("hex");
  const state: SubStateFile = {
    timestamp: new Date().toISOString(),
    toolListHash,
    files: entries,
    ...(projectCwds?.length ? { projectCwds } : {}),
  };
  await atomicWriteFile(ompStateFile(), JSON.stringify(state, null, 2));
}

export async function readSubState(): Promise<SubStateFile | null> {
  try {
    const raw = await fs.readFile(ompStateFile(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidSubStateFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function deleteSubState(): Promise<void> {
  try {
    await fs.unlink(ompStateFile());
  } catch {
    // Already gone — fine.
  }
}
