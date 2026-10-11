/**
 * Main-agent evo lifecycle.
 *
 * Owns activation/deactivation of evo mode on the main OMP agent via
 * pi.getAllTools / getActiveTools / setActiveTools. Snapshots the prior
 * tool set before activating so /evo off restores exactly what was there.
 * Persists each transition to config.yml via evo/config.ts.
 *
 * Recovery authority is the independent main-lane record
 * (main-generation.json): grants/hashes only, never profile paths. Sub-lane
 * state lives in its own record and is never touched here.
 */

import { buildEvoMainTools, type PiToolsSurface } from "./tools.ts";
import { readEvoConfig, writeEvoConfig } from "./config.ts";
import {
  contentHash,
  deleteMainGeneration,
  migrateLegacySharedRecord,
  newMainGeneration,
  readMainGeneration,
  serializeTransition,
  writeMainGeneration,
  type MainGenerationRecord,
} from "./generation-state.ts";
import { atomicWriteFile } from "./atomic.ts";
import * as fs from "node:fs/promises";
import { ompMainGenerationFile } from "./paths.ts";

export interface MainEvoTransition {
  changed: boolean;
  msg: string;
}

export class MainEvoController {
  private active = false;
  private preEvoSnapshot: string[] | null = null;

  constructor(private piTools: PiToolsSurface) {}

  isActive(): boolean {
    return this.active;
  }

  /** Called on session_start to hydrate from config.yml. */
  async hydrate(): Promise<void> {
    await serializeTransition(async () => {
      // Legacy shared record is not recovery authority; main may only prove
      // a main/global-only legacy (no roots). Ambiguous evidence fails closed.
      if (await migrateLegacySharedRecord() === "retained") {
        this.active = false;
        this.preEvoSnapshot = null;
        return;
      }
      const state = await readMainGeneration();
      const persisted = await readEvoConfig();
      // A config flag is not recovery authority.  In particular, never
      // re-apply an EVO surface when the committed generation is unreadable.
      if (!state || state.status !== "active" || !persisted.main) {
        this.active = false;
        this.preEvoSnapshot = null;
        return;
      }
      const evoTools = state.main.effectiveToolNames ?? await buildEvoMainTools(this.piTools);
      if (this.piTools.setActiveTools) await this.piTools.setActiveTools(evoTools);
      this.preEvoSnapshot = [...state.main.originalToolNames];
      this.active = true;
    });
  }

  /** Called on turn_start to pick up out-of-band config edits. */
  async refreshFromConfig(): Promise<void> {
    await serializeTransition(async () => {
      const persisted = await readEvoConfig();
      if (persisted.main === this.active) return;
      if (persisted.main) {
        await this.activateLocked();
      } else {
        await this.deactivateLocked();
      }
    });
  }

  async activate(): Promise<MainEvoTransition> {
    return serializeTransition(() => this.activateLocked());
  }

  private async activateLocked(): Promise<MainEvoTransition> {
    if (this.active) {
      return { changed: false, msg: "evo main already active" };
    }
    // Resolve any legacy shared record before touching the lane record;
    // ambiguous legacy evidence must never be overwritten by a fresh start.
    if (await migrateLegacySharedRecord() === "retained") {
      throw new Error("EVO_GENERATION_INVALID");
    }
    const previous = await readMainGeneration();
    if (previous !== null && previous.status === "active") {
      // A live generation already committed (e.g. just materialized by
      // migration): hydrate its surface instead of starting over.
      const evoTools = previous.main.effectiveToolNames ?? await buildEvoMainTools(this.piTools);
      if (this.piTools.setActiveTools) await this.piTools.setActiveTools(evoTools);
      this.preEvoSnapshot = [...previous.main.originalToolNames];
      this.active = true;
      return { changed: true, msg: `evo main activated (${evoTools.length} tools)` };
    }
    const original = this.piTools.getActiveTools
      ? await this.piTools.getActiveTools()
      : [];
    const evoTools = await buildEvoMainTools(this.piTools);
    const next = newMainGeneration({
      policyVersion: "1",
      catalogHash: contentHash(evoTools.join("\0")),
      status: "pending",
      main: {
        originalToolNames: [...original],
        effectiveToolNames: [...evoTools],
        originalHash: contentHash(original.join("\0")),
        effectiveHash: contentHash(evoTools.join("\0")),
      },
    });
    await atomicCommitMain(next);
    try {
      if (this.piTools.setActiveTools) await this.piTools.setActiveTools(evoTools);
      next.status = "active";
      next.updatedAt = new Date().toISOString();
      await writeMainGeneration(next);
      const persisted = await readEvoConfig();
      await writeEvoConfig({ main: true, sub: persisted.sub });
    } catch (error) {
      if (this.piTools.setActiveTools) {
        try { await this.piTools.setActiveTools(original); } catch { /* retain failed recovery evidence */ }
      }
      next.status = "failed";
      next.updatedAt = new Date().toISOString();
      try { await writeMainGeneration(next); } catch { /* retain pending evidence */ }
      throw error;
    }
    this.preEvoSnapshot = [...original];
    this.active = true;
    return { changed: true, msg: `evo main activated (${evoTools.length} tools)` };
  }

  async deactivate(): Promise<MainEvoTransition> {
    return serializeTransition(() => this.deactivateLocked());
  }

  private async deactivateLocked(): Promise<MainEvoTransition> {
    if (!this.active) {
      return { changed: false, msg: "evo main already inactive" };
    }
    if (await migrateLegacySharedRecord() === "retained") {
      throw new Error("EVO_GENERATION_INVALID");
    }
    const state = await readMainGeneration();
    if (!state || state.status !== "active") throw new Error("EVO_GENERATION_INVALID");
    const restoreList = [...state.main.originalToolNames];
    try {
      if (this.piTools.setActiveTools) await this.piTools.setActiveTools(restoreList);
      const persisted = await readEvoConfig();
      await writeEvoConfig({ main: false, sub: persisted.sub });
      await deleteMainGeneration();
    } catch (error) {
      if (this.piTools.setActiveTools && state.main.effectiveToolNames) {
        try { await this.piTools.setActiveTools(state.main.effectiveToolNames); } catch { /* retain recoverable evidence */ }
      }
      try {
        await writeMainGeneration(state);
      } catch { /* preserve the last committed state */ }
      throw error;
    }
    this.preEvoSnapshot = null;
    this.active = false;
    return {
      changed: true,
      msg: `evo main deactivated (${restoreList.length} tools restored)`,
    };
  }

  /** Rotate the effective surface without ever replacing immutable originals. */
  async refresh(): Promise<MainEvoTransition> {
    return serializeTransition(async () => {
      if (!this.active) return { changed: false, msg: "evo main is not active" };
      if (await migrateLegacySharedRecord() === "retained") {
        throw new Error("EVO_GENERATION_INVALID");
      }
      const state = await readMainGeneration();
      if (!state || state.status !== "active") throw new Error("EVO_GENERATION_INVALID");
      const evoTools = await buildEvoMainTools(this.piTools);
      const next = newMainGeneration({
        policyVersion: state.policyVersion,
        catalogHash: contentHash(evoTools.join("\0")),
        status: "pending",
        main: {
          ...state.main,
          effectiveToolNames: [...evoTools],
          effectiveHash: contentHash(evoTools.join("\0")),
        },
      });
      await atomicCommitMain(next);
      try {
        if (this.piTools.setActiveTools) await this.piTools.setActiveTools(evoTools);
        next.status = "active";
        next.updatedAt = new Date().toISOString();
        await writeMainGeneration(next);
      } catch (error) {
        if (this.piTools.setActiveTools && state.main.effectiveToolNames) {
          try { await this.piTools.setActiveTools(state.main.effectiveToolNames); } catch { /* retain failed evidence */ }
        }
        next.status = "failed";
        next.updatedAt = new Date().toISOString();
        try { await writeMainGeneration(next); } catch { /* preserve evidence */ }
        throw error;
      }
      return { changed: true, msg: `evo main refreshed (${evoTools.length} tools)` };
    });
  }

  snapshotSize(): number {
    return this.preEvoSnapshot?.length ?? 0;
  }
}

async function mainStateFileExists(): Promise<boolean> {
  try { await fs.access(ompMainGenerationFile()); return true; } catch { return false; }
}

async function atomicCommitMain(state: MainGenerationRecord): Promise<void> {
  if (await mainStateFileExists()) {
    await writeMainGeneration(state);
  } else {
    await atomicWriteFile(ompMainGenerationFile(), JSON.stringify(state, null, 2));
  }
}
