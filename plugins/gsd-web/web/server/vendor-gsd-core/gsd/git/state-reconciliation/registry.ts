// Project/App: gsd-pi
// File Purpose: ADR-017 drift handler registry and explicit repair phases.

import { completionTimestampHandler } from "./drift/completion.ts";
import {
  artifactDbStatusDivergenceHandler,
  completedMilestoneReopenedHandler,
  diskSliceIdDivergenceHandler,
} from "./drift/artifact-db.ts";
import { mergeStateHandler } from "./drift/merge-state.ts";
import { unregisteredMilestoneHandler } from "./drift/project-md.ts";
import { roadmapDivergenceHandler, roadmapMissingHandler } from "./drift/roadmap.ts";
import { sketchFlagHandler } from "./drift/sketch-flag.ts";
import { staleRenderHandler } from "./drift/stale-render.ts";
import { staleWorkerHandler } from "./drift/stale-worker.ts";
import type { DriftHandler } from "./types.ts";

export interface ReconciliationRepairPhase {
  name: string;
  /** Stop before later phases when this phase surfaces a terminal blocker. */
  stopOnBlocker?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: ReadonlyArray<DriftHandler<any>>;
}

/**
 * Repairs run phase-by-phase; detection uses the flattened registry (all handlers).
 * Projection observation and rendering are owned by the Projection Worker.
 * Pre-dispatch reconciliation contains only workflow-state repair phases, so a
 * readable projection cannot block otherwise valid database-backed work.
 */
export const RECONCILIATION_REPAIR_PHASES: ReadonlyArray<ReconciliationRepairPhase> = [
  {
    name: "normalize-db",
    handlers: [
      sketchFlagHandler,
      mergeStateHandler,
      staleWorkerHandler,
      unregisteredMilestoneHandler,
      diskSliceIdDivergenceHandler,
      completedMilestoneReopenedHandler,
      artifactDbStatusDivergenceHandler,
    ],
  },
  {
    name: "re-project",
    // roadmap-missing sits beside roadmap-divergence but cannot fight it:
    // detection for ALL handlers runs before any repair, and both repairs
    // invoke the same renderRoadmapFromDb, so a missing-file render can never
    // create state the divergence repair would undo (#1634).
    handlers: [staleRenderHandler, roadmapMissingHandler, roadmapDivergenceHandler, completionTimestampHandler],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DRIFT_REGISTRY: ReadonlyArray<DriftHandler<any>> =
  RECONCILIATION_REPAIR_PHASES.flatMap((phase) => phase.handlers);

export function handlerPhaseIndex(kind: string): number {
  return RECONCILIATION_REPAIR_PHASES.findIndex((phase) =>
    phase.handlers.some((handler) => handler.kind === kind),
  );
}
