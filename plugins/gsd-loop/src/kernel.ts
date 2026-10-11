/**
 * src/kernel.ts — pure loop state machine (WU-4).
 *
 * Port of gsd-pi auto/loop.ts iteration contract:
 * advance → guards → runUnit → finalize → repeat.
 * Pure module: no `pi`, no fs. All dependencies injected via KernelDeps.
 */

import type { AdvanceResult, KernelDeps, PhaseResult } from "./kernel-types.js";
import type { Unit } from "./units.js";
import type { VerifyOutcome } from "./verify-types.js";

import type { GsdLoopSettings } from "./settings.js";
import { GSD_LOOP_CONSTANTS } from "./settings.js";
import type { GsdLoopState } from "./state.js";
import { renderBrief } from "./units.js";

export type { AdvanceResult, KernelDeps, PhaseResult };

export function wedgeSignature(unitId: string, attempts: number): string {
 return `${unitId}${GSD_LOOP_CONSTANTS.wedgeSignatureSeparator}${attempts}`;
}

function defaultNow(): string {
 return new Date().toISOString();
}

function defaultHeapRatio(): number {
 const g = globalThis as { v8?: { getHeapStatistics?: () => { used_heap_size: number; heap_size_limit: number } } };
 if (typeof g.v8?.getHeapStatistics === "function") {
  const s = g.v8.getHeapStatistics();
  return s.used_heap_size / s.heap_size_limit;
 }
 const mem = process.memoryUsage();
 return mem.heapUsed / mem.heapTotal;
}

function defaultUuid(): string {
 return crypto.randomUUID();
}

export function makeDeps(overrides: Partial<KernelDeps> = {}): KernelDeps {
 return {
  now: overrides.now ?? defaultNow,
  heapRatio: overrides.heapRatio ?? defaultHeapRatio,
  uuid: overrides.uuid ?? defaultUuid,
  stopFlag: overrides.stopFlag,
  foreignLock: overrides.foreignLock,
  cwd: overrides.cwd,
 };
}

/** Start a run: refuse on unacknowledged wedge or foreign lock. */
export function start(
 state: GsdLoopState,
 options: { mode: "auto" | "step"; verbose?: boolean },
 deps: KernelDeps,
): PhaseResult {
 if (state.wedge && !state.wedge.acknowledged) {
  return {
   action: "break",
   reason: `unacknowledged wedge ${state.wedge.id} (unit ${state.wedge.unitId}) — resume with --wedge ${state.wedge.id}`,
  };
 }
 if (deps.foreignLock?.()) {
  return {
   action: "break",
   reason: "Stopped: foreign live lock — /gsd-loop stop writes the STOP flag for that session",
  };
 }
 state.run.id = deps.uuid();
 state.run.mode = options.mode;
 state.run.verbose = options.verbose ?? false;
 state.run.status = "running";
 state.run.startedAt = deps.now();
 state.run.stoppedAt = null;
 state.run.stopReason = null;
 state.paused = null;
 return { action: "next", data: undefined };
}

/**
 * The loop.ts:717–816 guard pipeline, in order:
 * 1 stop-flag  2 iteration cap  3 memory  4 error ladder  5 cooldown ladder
 * 6 finalize-timeout ladder  7 queue drained  8 wedge (no-advance repeat)
 */
export function computeGuard(
 state: GsdLoopState,
 settings: GsdLoopSettings,
 deps: KernelDeps,
): AdvanceResult {
 // 0. cross-instance STOP flag — even a completed run must honor a pending
 // STOP before the completion shortcut reports success.
 const stopGuard = checkStopGuard(state, deps);
 if (stopGuard) return stopGuard;
 if (state.run.status === "complete") {
  return { kind: "stop", reason: "Run complete: all queued units processed" };
 }
 // 0a. unacknowledged persisted wedge
 if (state.wedge && !state.wedge.acknowledged) {
  return {
   kind: "stop",
   reason: "Stopped: unacknowledged wedge",
   recoveryHint: `Acknowledge with /gsd-loop resume --wedge ${state.wedge.id}`,
  };
 }
 // 0b. foreign live lock
 if (deps.foreignLock?.()) {
  return {
   kind: "stop",
   reason: "Stopped: foreign live lock",
   recoveryHint: "Foreign session holds the lock. /gsd-loop stop writes the STOP flag for that session.",
  };
 }
 // 1. iteration cap
 if (state.counters.iterations >= settings["loop.maxIterations"]) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Safety: loop exceeded max iterations";
  return { kind: "stop", reason: "Safety: loop exceeded max iterations", recoveryHint: "Raise loop.maxIterations or start a new run." };
 }
 // 2. memory pressure — interval-gated per plan AC (checkpoint runs every
 // loop.memoryCheckInterval iterations, not on every advance).
 if (
  settings["loop.memoryCheckInterval"] > 0 &&
  state.counters.iterations % settings["loop.memoryCheckInterval"] === 0 &&
  deps.heapRatio() > settings["loop.memoryHeapThresholdRatio"]
 ) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Safety: memory pressure exceeded threshold";
  return { kind: "stop", reason: "Safety: memory pressure exceeded threshold", recoveryHint: "Free memory or lower loop.memoryHeapThresholdRatio." };
 }
 // 3. error ladder
 if (state.counters.consecutiveErrors >= settings["loop.maxConsecutiveErrors"]) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: error ladder exhausted";
  return { kind: "stop", reason: "Stopped: error ladder exhausted", recoveryHint: "Inspect activity/ crash notes; resume after fixing the failing unit." };
 }
 // 4. cooldown ladder
 if (state.counters.consecutiveCooldowns >= settings["loop.maxCooldownRetries"]) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: cooldown retries exhausted";
  return { kind: "stop", reason: "Stopped: cooldown retries exhausted", recoveryHint: "Resume later with /gsd-loop resume." };
 }
 // 5. finalize-timeout ladder
 if (state.counters.consecutiveFinalizeTimeouts >= settings["loop.maxFinalizeTimeouts"]) {
  state.run.status = "paused";
  state.paused = {
   pausedAt: deps.now(),
   reason: "finalize-timeout ladder exhausted",
   unitInFlight: currentUnit(state)?.id ?? null,
  };
  return { kind: "pause", reason: "Paused: finalize-timeout ladder exhausted" };
 }
 // 6. queue drained
 if (state.pointer >= state.queue.length) {
  state.run.status = "complete";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Run complete: queue drained";
  return { kind: "stop", reason: "Run complete: queue drained" };
 }
 // 7. wedge: same dispatch key unchanged twice
 if (state.counters.noAdvanceRepeats >= 2) {
  state.run.status = "wedged";
  const unit = currentUnit(state);
  state.wedge = {
   id: deps.uuid(),
   signature: wedgeSignature(unit?.id ?? "none", unit?.attempts ?? 0),
   unitId: unit?.id ?? "none",
   createdAt: deps.now(),
   acknowledged: false,
  };
  state.run.stopReason = "Stopped: dispatch wedge detected";
  return {
   kind: "stop",
   reason: "Stopped: dispatch wedge detected",
   recoveryHint: `Acknowledge with /gsd-loop resume --wedge ${state.wedge.id}.`,
  };
 }
 return nextUnit(state, deps);
}

function checkStopGuard(state: GsdLoopState, deps: KernelDeps): AdvanceResult | null {
 if (deps.stopFlag?.()) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: stop requested";
  return { kind: "stop", reason: "Stopped: stop requested", recoveryHint: "Resume with /gsd-loop resume." };
 }
 return null;
}

function currentUnit(state: GsdLoopState) {
 return state.queue[state.pointer] ?? null;
}

function nextUnit(state: GsdLoopState, deps: KernelDeps): AdvanceResult {
 const unit = currentUnit(state);
 if (!unit) {
  state.run.status = "complete";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Run complete: queue drained";
  return { kind: "stop", reason: "Run complete: queue drained" };
 }
 if (state.run.status === "paused") {
  return { kind: "pause", reason: state.paused?.reason ?? "paused" };
 }
 state.counters.iterations++;
 unit.status = "running";
 unit.startedAt = deps.now();
 const dispatchKey = `${unit.id}:${unit.attempts}`;
 const signature = wedgeSignature(unit.id, unit.attempts);
 if (state.counters.lastDispatchKey === dispatchKey) {
  state.counters.noAdvanceRepeats++;
  if (state.counters.noAdvanceRepeats >= 2) {
   state.run.status = "wedged";
   state.wedge = {
    id: deps.uuid(),
    signature,
    unitId: unit.id,
    createdAt: deps.now(),
    acknowledged: false,
   };
   state.run.stopReason = "Stopped: dispatch wedge detected";
   return {
    kind: "stop",
    reason: "Stopped: dispatch wedge detected",
    recoveryHint: `Acknowledge with /gsd-loop resume --wedge ${state.wedge.id}.`,
   };
  }
 } else {
  state.counters.noAdvanceRepeats = 1;
 }
 state.counters.lastDispatchKey = dispatchKey;
 state.run.status = "running";
 return {
  kind: "run",
  unit,
  brief: renderBrief(unit, deps.cwd?.() ?? undefined),
  instructions: `Execute unit ${unit.id}: ${unit.title}. Then call gsd_loop_record_result with unitId ${unit.id}.`,
  signature,
 } as AdvanceResult & { signature: string };
}

/** Pick up the next unit and present it to the model. */
export function advance(
 state: GsdLoopState,
 settings: GsdLoopSettings,
 deps: KernelDeps,
): AdvanceResult {
 return computeGuard(state, settings, deps);
}

/**
 * Finalize ladders on the model's report:
 * error 3-strike, cooldown non-consuming, infrastructure immediate,
 * finalize-timeout 3-pause, verify-retry, model-policy pause.
 */
export function recordResult(
 state: GsdLoopState,
 unitId: string,
 outcome: {
  status: "completed" | "failed" | "crashed";
  summary: string;
  verify?: VerifyOutcome;
  errorClass?: "rate-limit" | "infrastructure" | "model-policy" | "unknown";
 },
 settings: GsdLoopSettings,
 deps: KernelDeps,
): PhaseResult {
 // FIFO contract: only the pointer's current unit may report results. A model
 // completing a future/pending unit out of order is rejected, not applied.
 const current = currentUnit(state);
 const unit = state.queue.find((u) => u.id === unitId);
 if (!unit || unit !== current) {
  return {
   action: "break",
   reason: unit
    ? `out-of-order result for ${unitId}: unit ${current?.id ?? "(none)"} is at the queue pointer — record that unit first`
    : `unknown unit ${unitId}`,
  };
 }
 switch (outcome.status) {
  case "completed": {
   if (outcome.verify && !outcome.verify.passed) {
    // Verify timeout counts toward the finalize-timeout ladder (B7 contract).
    if (outcome.verify.timedOut) {
     state.counters.consecutiveFinalizeTimeouts++;
     if (
      state.counters.consecutiveFinalizeTimeouts >=
      settings["loop.maxFinalizeTimeouts"]
     ) {
      state.run.status = "paused";
      state.paused = {
       pausedAt: deps.now(),
       reason: "Paused: finalize-timeout ladder exhausted",
       unitInFlight: unit.id,
      };
      return { action: "break", reason: "Paused: finalize-timeout ladder exhausted" };
     }
    }
    return verifyRetry(state, unit, outcome, settings, deps);
   }
   unit.status = "complete";
   unit.completedAt = deps.now();
   unit.resultSummary = outcome.summary;
   state.counters.consecutiveErrors = 0;
   state.counters.consecutiveCooldowns = 0;
   state.counters.consecutiveFinalizeTimeouts = 0;
   state.counters.recentErrorMessages = [];
   state.counters.lastDispatchKey = null;
   state.counters.noAdvanceRepeats = 0;
   state.pointer++;
   if (state.run.mode === "step") {
    state.run.status = "paused";
    state.paused = { pausedAt: deps.now(), reason: "step-mode: unit complete", unitInFlight: null };
    return { action: "retry", reason: "step-mode: unit complete" };
   }
   return { action: "next", data: undefined };
  }
  case "failed": {
   return failUnit(state, unit, outcome, settings, deps);
  }
  case "crashed": {
   return crashUnit(state, unit, outcome, deps);
  }
 }
}

function verifyRetry(
 state: GsdLoopState,
 unit: Unit,
 outcome: { verify?: VerifyOutcome; summary: string },
 _settings: GsdLoopSettings,
 deps: KernelDeps,
): PhaseResult {
 unit.verifyAttempts++;
 const max = unit.maxRetries ?? _settings["verify.maxRetries"];
 if (unit.verifyAttempts > max) {
  state.counters.consecutiveErrors++;
  unit.status = "failed";
  unit.lastError = `verify failed after ${unit.verifyAttempts} attempts: ${outcome.summary}`;
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: verify retries exhausted";
  return { action: "break", reason: "Stopped: verify retries exhausted" };
 }
 unit.status = "pending";
 // Requeue resets the dispatch-wedge counters: the requeued unit re-dispatches
 // with the SAME unit:attempts key, and a stale lastDispatchKey would count
 // that legitimate re-dispatch as a no-advance repeat and wedge the run.
 state.counters.lastDispatchKey = null;
 state.counters.noAdvanceRepeats = 0;
 return {
  action: "retry",
  reason: `verify failed (attempt ${unit.verifyAttempts}/${max}); re-run with fixes`,
 };
}

function failUnit(
 state: GsdLoopState,
 unit: Unit,
 outcome: { status?: string; summary: string; errorClass?: "rate-limit" | "infrastructure" | "model-policy" | "unknown" },
 _settings: GsdLoopSettings,
 deps: KernelDeps,
): PhaseResult {
 unit.attempts++;
 unit.status = "pending";
 unit.lastError = outcome.summary;
 state.counters.recentErrorMessages.push(outcome.summary);
 // Bounded ring: the recent-error window exists for diagnostics, never for
 // unbounded growth across a long run.
 if (state.counters.recentErrorMessages.length > 3) {
  state.counters.recentErrorMessages.splice(0, state.counters.recentErrorMessages.length - 3);
 }

 if (outcome.errorClass === "model-policy") {
  // loop.ts:2114–2142 — pause the run; "retry" would invite the model to
  // advance again against a paused run. "break" hands control back to the
  // operator (resume is the only path forward).
  state.run.status = "paused";
  state.paused = { pausedAt: deps.now(), reason: `model-policy failure: ${outcome.summary}`, unitInFlight: unit.id };
  return { action: "break", reason: `Paused: model-policy failure — ${outcome.summary}` };
 }
 if (outcome.errorClass === "rate-limit") {
  state.counters.consecutiveCooldowns++;
  if (state.counters.consecutiveCooldowns >= _settings["loop.maxCooldownRetries"]) {
   state.run.status = "stopped";
   state.run.stoppedAt = deps.now();
   state.run.stopReason = "Stopped: cooldown retries exhausted";
   return { action: "break", reason: "Stopped: cooldown retries exhausted" };
  }
  // Non-consuming cooldown: the facade waits loop.cooldownFallbackWaitMs
  // (abortable) on the returned retry before surfacing it — kernel stays pure
  // and never blocks the host event loop.
  return { action: "retry", reason: `rate-limit cooldown ${state.counters.consecutiveCooldowns}` };
 }
 if (outcome.errorClass === "infrastructure") {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: infrastructure failure";
  return { action: "break", reason: "Stopped: infrastructure failure" };
 }
 state.counters.consecutiveErrors++;
 if (state.counters.consecutiveErrors >= _settings["loop.maxConsecutiveErrors"]) {
  state.run.status = "stopped";
  state.run.stoppedAt = deps.now();
  state.run.stopReason = "Stopped: error ladder exhausted";
  return { action: "break", reason: "Stopped: error ladder exhausted" };
 }
 return { action: "retry", reason: `unit failed; retry ${state.counters.consecutiveErrors}/${_settings["loop.maxConsecutiveErrors"]}` };
}

function crashUnit(
 state: GsdLoopState,
 unit: Unit,
 outcome: { summary: string },
 deps: KernelDeps,
): PhaseResult {
 unit.attempts++;
 unit.status = "crashed";
 unit.lastError = outcome.summary;
 state.counters.recentErrorMessages.push(outcome.summary);
 state.run.status = "stopped";
 state.run.stoppedAt = deps.now();
 state.run.stopReason = "Stopped: unit crashed";
 return { action: "break", reason: "Stopped: unit crashed", payload: outcome.summary };
}
