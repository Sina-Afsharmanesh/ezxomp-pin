/**
 * Path resolution for omp-evo-mode.
 *
 * Centralizes OMP_HOME lookup and derived paths (agent dir, config file,
 * state file, profile dir) so every other module gets them from one place.
 * Respects OMP_HOME env var override (used by tests to isolate).
 */

import * as path from "node:path";

export function ompHome(): string {
  return process.env.OMP_HOME ?? path.join(process.env.HOME ?? "~", ".omp");
}

export function ompAgentDir(): string {
  return path.join(ompHome(), "agent");
}

export function ompConfigPath(): string {
  return path.join(ompAgentDir(), "config.yml");
}

export const MOD_ID = "evo-mode";

export function ompStateFile(): string {
  return path.join(ompAgentDir(), MOD_ID, "sub-state.json");
}

/** Durable main-lane recovery record: grants/hashes only, never profile paths. */
export function ompMainGenerationFile(): string {
  return path.join(ompAgentDir(), MOD_ID, "main-generation.json");
}

/**
 * Legacy pre-TASK-55.7 shared generation record. Not recovery authority
 * anymore: consumed only by the conservative migration helper in
 * generation-state.ts, and retained untouched when ambiguous.
 */
export function ompGenerationStateFile(): string {
  return path.join(ompAgentDir(), MOD_ID, "generation-state.json");
}

export function ompAgentProfilesDir(): string {
  return path.join(ompHome(), "agents");
}

/** Project-local agent profiles: <cwd>/.omp/agents. Cook installs here via /cook install project. */
export function projectAgentProfilesDir(cwd: string): string {
  return path.join(cwd, ".omp", "agents");
}
