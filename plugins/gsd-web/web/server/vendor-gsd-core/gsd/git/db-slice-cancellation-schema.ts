// Project/App: gsd-pi
// File Purpose: v40 authorization for settling an active Attempt during Slice cancellation.

import {
  createAttemptSettlementShapeTrigger,
  createAttemptTransitionFencingTrigger,
} from "./db-attempt-recovery-schema.ts";
import type { DbAdapter } from "./db-adapter.ts";

export function createSliceCancellationSchemaV40(db: DbAdapter): void {
  const cancellationOperations = ["task.cancel", "slice.cancel"] as const;
  createAttemptTransitionFencingTrigger(db, cancellationOperations);
  createAttemptSettlementShapeTrigger(db, cancellationOperations);
}
