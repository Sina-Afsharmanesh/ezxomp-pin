// Project/App: gsd-pi
// File Purpose: v37 authorization for settling an active Attempt during Task cancellation.

import {
  createAttemptSettlementShapeTrigger,
  createAttemptTransitionFencingTrigger,
} from "./db-attempt-recovery-schema.ts";
import type { DbAdapter } from "./db-adapter.ts";

export function createTaskCancellationSchemaV37(db: DbAdapter): void {
  createAttemptTransitionFencingTrigger(db, ["task.cancel"]);
  createAttemptSettlementShapeTrigger(db, ["task.cancel"]);
}
