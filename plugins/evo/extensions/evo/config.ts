/**
 * YAML persistence for omp-evo-mode.
 *
 * Reads/writes the extensions.evo-mode section of ~/.omp/agent/config.yml.
 * Used to persist main/sub evo state across OMP sessions. Atomic write via
 * tmp + rename so a mid-write crash can't corrupt the user's config.
 */

import * as fs from "node:fs/promises";
import * as yaml from "../../vendor/js-yaml.mjs";
import { MOD_ID, ompConfigPath } from "./paths.ts";
import { atomicWriteFile } from "./atomic.ts";

export interface EvoConfigState {
  main: boolean;
  sub: boolean;
}

export async function readEvoConfig(): Promise<EvoConfigState> {
  try {
    const raw = await fs.readFile(ompConfigPath(), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown> | undefined;
    const evo = (parsed?.[MOD_ID] ?? {}) as Record<string, unknown>;
    return { main: evo.main === true, sub: evo.sub === true };
  } catch {
    return { main: false, sub: false };
  }
}

// Extensions-array collision guard: `extensions:` in config.yml is a LIST of paths
// (per docs/extension-loading.md). Evo state therefore lives at top-level `evo-mode:`
// key, NOT under `extensions.evo-mode`. Mixing would either corrupt the list or be
// ignored by OMP's extension loader.
export async function writeEvoConfig(state: EvoConfigState): Promise<void> {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(ompConfigPath(), "utf-8");
    parsed = (yaml.load(raw) as Record<string, unknown> | undefined) ?? {};
  } catch {
    // File missing — start from empty object.
  }
  parsed[MOD_ID] = { main: state.main, sub: state.sub };
  const out = yaml.dump(parsed, { lineWidth: 120 });
  await atomicWriteFile(ompConfigPath(), out);
}
