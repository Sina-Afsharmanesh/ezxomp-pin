/**
 * src/core.ts — facade shared by commands and tools (WU-7).
 *
 * Ops parse to kernel ops and return text envelopes
 * `{ text, isError?, details? }` — consumed by both tools.ts and commands.ts.
 * All state access through state.ts; all settings through settings.ts.
 */
import { resolveGsdLoopSettings } from "./settings.js";
import type { GsdLoopSettings } from "./settings.js";
import * as kernel from "./kernel.js";
import type { AdvanceResult, KernelDeps } from "./kernel.js";
import * as state from "./state.js";
import type { GsdLoopState } from "./state.js";
import * as units from "./units.js";
import type { Unit } from "./units.js";
import { nextActionLine, unitExecutionEnvelope } from "./prompts.js";
import { runVerify } from "./verify.js";
import type { VerifyOutcome } from "./verify.js";
import { readFileSync, unlinkSync } from "node:fs";
import * as path from "node:path";

export interface FacadeResult {
 text: string;
 isError?: boolean;
 details?: unknown;
}

export interface FacadeContext {
 cwd: string;
 hasUI: boolean;
 notify?: (message: string, level?: "info" | "warning" | "error") => void;
}

let ctx: FacadeContext = { cwd: process.cwd(), hasUI: false };
let cachedState: GsdLoopState | null = null;
let settings: GsdLoopSettings = resolveGsdLoopSettings({});

export function setFacadeContext(next: Partial<FacadeContext>): void {
 ctx = { ...ctx, ...next };
 cachedState = null; // cwd changed → reload from disk
}

export function getFacadeContext(): FacadeContext {
 return ctx;
}

export function setFacadeSettings(raw: unknown): void {
 settings = resolveGsdLoopSettings(raw);
}

export function getFacadeSettings(): GsdLoopSettings {
 return settings;
}

function deps(): KernelDeps {
 return kernel.makeDeps({
  stopFlag: () => state.checkStopFlag(ctx.cwd),
  foreignLock: () => foreignLockProbe(),
  cwd: () => ctx.cwd,
 });
}

/** Loads (or creates) persisted state; surfaces the STOP flag to the pure kernel. */
export function loadOrCreateState(): GsdLoopState {
 if (cachedState) return cachedState;
 cachedState = state.loadState(ctx.cwd) ?? state.initialState();
 // Hydrate a persisted wedge: a crash between writeWedge() and persist()
 // leaves wedge.json on disk that the state snapshot lacks. Disk is the
 // wedge authority unless state already carries the same acknowledged wedge.
 if (!cachedState.wedge) {
  const diskWedge = state.readWedge(ctx.cwd);
  if (diskWedge && !diskWedge.acknowledged) cachedState.wedge = diskWedge;
 }
 return cachedState;
}

function persist(s: GsdLoopState): void {
 state.saveState(ctx.cwd, s);
}

function notify(message: string, level: "info" | "warning" | "error" = "info"): void {
 if (!ctx.hasUI) return; // headless/RPC: no RPC-visible UI calls
 if (typeof ctx.notify === "function") ctx.notify(message, level);
}

function journal(s: GsdLoopState, eventType: string, unitId?: string, data?: unknown): void {
 // Durable seq allocator: derive from the on-disk journal tail so seq stays
 // monotonic across process restarts (no module-local counter).
 const events = state.readJournal(ctx.cwd);
 const last = events[events.length - 1];
 const lastSeq = last && typeof last.seq === "number" ? last.seq : 0;
 state.appendJournal(ctx.cwd, { flowId: s.run.id, seq: lastSeq + 1, eventType, unitId, data });
}

/** Persisted pause: paused metadata + running→paused status. */
export function pauseRun(s: GsdLoopState, reason: string, deps: KernelDeps): void {
 s.run.status = "paused";
 s.run.stopReason = reason;
 s.paused = {
  pausedAt: deps.now(),
  reason,
  unitInFlight: s.queue.find((u) => u.status === "running")?.id ?? null,
 };
}

/** Map a terminal stop reason to the crash-note enum. */
function crashNoteType(reason: string): "infrastructure" | "cooldown-exhausted" | "iteration-exhausted" | "error-ladder" {
 if (reason.includes("infrastructure")) return "infrastructure";
 if (reason.includes("cooldown")) return "cooldown-exhausted";
 if (reason.includes("iterations") || reason.includes("iteration")) return "iteration-exhausted";
 return "error-ladder";
}

function err(message: string, details?: unknown): FacadeResult {
 return { text: message, isError: true, details };
}

/** True when a live foreign pid holds loop.lock. */
export function isForeignLockHeld(): boolean {
 return foreignLockProbe();
}
/** Read-only lock info for UI surfaces (smart entry, status). */
export function readLockInfo(): { ownerPid: number; acquiredAt?: string } | null {
 return state.readLock(ctx.cwd) as { ownerPid: number; acquiredAt?: string } | null;
}
function foreignLockProbe(): boolean {
 const lock = state.readLock(ctx.cwd);
 if (!lock || lock.ownerPid === process.pid) return false;
 try {
  process.kill(lock.ownerPid, 0);
  return true;
 } catch (error) {
  return (error as NodeJS.ErrnoException).code === "EPERM";
 }
}

function lockRefusal(what: string): FacadeResult {
 const lock = state.readLock(ctx.cwd);
 return err(`Refusing to ${what}: live foreign session (pid ${lock?.ownerPid}) holds the lock. /gsd-loop stop writes the STOP flag for that session.`);
}

// ── ops ──────────────────────────────────────────────────────────────────

export function doStart(params: { verbose?: boolean; mode?: "auto" | "step" }): FacadeResult {
 const s = loadOrCreateState();
 if (foreignLockProbe()) return lockRefusal("start");
 const mode = params.mode ?? "auto";
 const phase = kernel.start(s, { mode, verbose: params.verbose }, deps());
 if (phase.action === "break") return err(phase.reason);
 if (!state.acquireLock(ctx.cwd, { ownerPid: process.pid, sessionId: "local" })) {
  return lockRefusal("start");
 }
 persist(s);
 journal(s, "run-start", undefined, { mode, verbose: params.verbose ?? false });
 notify(`gsd-loop: auto loop active (${s.queue.length} units queued)`);
 return {
  text: `Auto loop active (mode: ${mode}, run ${s.run.id}). ${s.queue.length} units queued, pointer ${s.pointer}.\n\nEach turn:\n1. call \`gsd_loop_advance\`;\n2. execute the returned unit brief (dispatch via native \`task\` tool if \`dispatch: "subagent"\`);\n3. call \`gsd_loop_record_result\` with the outcome; repeat until it returns a terminal stop.`,
  details: { run: s.run, pointer: s.pointer, queued: s.queue.length },
 };
}

export function doStop(): FacadeResult {
 const s = loadOrCreateState();
 const lock = state.readLock(ctx.cwd);
 const foreign = foreignLockProbe();
 if (foreign && lock) {
  // Cross-instance stop: STOP flag; the owning session's next advance stops gracefully.
  state.setStopFlag(ctx.cwd);
  return {
   text: `Foreign session (pid ${lock.ownerPid}) holds the lock — STOP flag written. Its next advance will stop gracefully.`,
   details: { stopFlag: true, foreignPid: lock.ownerPid },
  };
 }
 state.releaseLock(ctx.cwd);
 if (s.run.status === "running" || s.run.status === "paused") {
  s.run.status = "stopped";
  s.run.stoppedAt = deps().now();
  s.run.stopReason = "stopped by user";
  s.paused = null;
  for (const u of s.queue) if (u.status === "running") u.status = "pending";
  journal(s, "terminal", undefined, { reason: "stopped by user" });
 }
 persist(s);
 return { text: "gsd-loop stopped. State persisted; lock released.", details: { run: s.run } };
}

export function doPause(params: { reason?: string }): FacadeResult {
 const s = loadOrCreateState();
 if (foreignLockProbe()) return lockRefusal("pause");
 if (s.run.status !== "running") {
  return err(`Cannot pause: run status is "${s.run.status}" (only a running run pauses).`);
 }
 const reason = params.reason ?? "paused by user";
 pauseRun(s, reason, deps());
 persist(s);
 journal(s, "paused", undefined, { reason });
 return { text: `gsd-loop paused: ${reason}`, details: { run: s.run } };
}

export function doResume(params: { wedge?: string }): FacadeResult {
 const s = loadOrCreateState();
 if (foreignLockProbe()) return lockRefusal("resume");
 if (s.run.status !== "paused" && s.run.status !== "stopped" && s.run.status !== "wedged") {
  return err(`Cannot resume: run status is "${s.run.status}".`);
 }
 if (params.wedge) {
  const wedge = state.readWedge(ctx.cwd);
  if (!wedge || wedge.id !== params.wedge) {
   return err(`Wedge id mismatch: ${params.wedge}${wedge ? ` (active wedge is ${wedge.id})` : " (no wedge on disk)"}`);
  }
  // Disk-first acknowledgment: unlink the wedge record BEFORE updating state.
  // The reverse order leaves a crash window where state says acknowledged but
  // disk still holds an unacknowledged wedge (recovery would refuse).
  try {
   unlinkSync(path.join(state.stateDir(ctx.cwd), "wedge.json"));
  } catch (error) {
   if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    return err(`Cannot acknowledge wedge: ${(error as Error).message}`);
   }
  }
  state.acknowledgeWedge(ctx.cwd, params.wedge);
  s.wedge = { ...wedge, acknowledged: true };
  s.counters.noAdvanceRepeats = 0;
  s.counters.lastDispatchKey = null;
  journal(s, "wedge-acknowledged", wedge.unitId, { wedgeId: wedge.id });
 }
 // Unacknowledged wedge is a hard gate: bare resume must not bypass it.
 if (s.wedge && !s.wedge.acknowledged && !params.wedge) {
  return err(`Cannot resume: unacknowledged wedge ${s.wedge.id} — run /gsd-loop resume --wedge ${s.wedge.id}`);
 }
 // Wedge record was unlinked disk-first in the ack path above; nothing to clean.
 s.wedge = null;
 // Reset dispatch-wedge counters on EVERY resume (not only wedge-ack paths):
 // a pause while a unit is in flight leaves lastDispatchKey set, and the
 // first resumed advance of the same unit would count as a no-advance repeat.
 s.counters.lastDispatchKey = null;
 s.counters.noAdvanceRepeats = 0;
 s.run.status = "running";
 s.run.stopReason = null;
 s.paused = null;
 if (!state.acquireLock(ctx.cwd, { ownerPid: process.pid, sessionId: "local" })) {
  return lockRefusal("resume");
 }
 persist(s);
 journal(s, "resumed");
 return { text: "gsd-loop resumed — auto driver active. Call `gsd_loop_advance`.", details: { run: s.run } };
}

export function doStatus(): FacadeResult {
 const s = loadOrCreateState();
 const lock = state.readLock(ctx.cwd);
 const wedge = state.readWedge(ctx.cwd);
 const journalTail = state.readJournal(ctx.cwd).slice(-5);
 const lines: string[] = [];
 lines.push(`gsd-loop status: ${s.run.status} (mode ${s.run.mode}, run ${s.run.id})`);
 lines.push(`Pointer: ${s.pointer}/${s.queue.length} units settled`);
 for (const u of s.queue) {
  lines.push(`  ${u.status.padEnd(8)} ${u.id} — ${u.title} (attempts ${u.attempts})`);
 }
 lines.push(`Counters: iterations ${s.counters.iterations}, errors ${s.counters.consecutiveErrors}, cooldowns ${s.counters.consecutiveCooldowns}, finalize-timeouts ${s.counters.consecutiveFinalizeTimeouts}, no-advance ${s.counters.noAdvanceRepeats}`);
 lines.push(`Lock: ${lock ? `pid ${lock.ownerPid} since ${lock.acquiredAt}` : "none"}`);
 if (wedge) lines.push(`Wedge: ${wedge.id} (${wedge.unitId})${wedge.acknowledged ? " acknowledged" : " UNACKNOWLEDGED"}`);
 if (journalTail.length) {
  lines.push("Last journal events:");
  for (const e of journalTail) lines.push(`  ${e.ts} ${e.eventType}${e.unitId ? ` ${e.unitId}` : ""}`);
 }
 return { text: lines.join("\n"), details: { state: s, lock, wedge } };
}

export function doAdvance(params: { dryRun?: boolean }): FacadeResult {
 const s = loadOrCreateState();
 if (params.dryRun) {
  const unit = (units.listQueue(s)[s.pointer] ?? null) as Unit | null;
  if (!unit || unit.status !== "pending") return { text: "STOPPED: Queue complete", details: { dryRun: true, stop: true } };
  return { text: `DRY-RUN — would claim: ${unit.id} — ${unit.title}`, details: { dryRun: true, unit } };
 }
 if (s.run.status !== "running") {
  return err(`Cannot advance: run status is "${s.run.status}". /gsd-loop start to activate the loop.`);
 }
 if (foreignLockProbe()) return lockRefusal("advance");
 const result = kernel.advance(s, settings, deps());
 if (result.kind === "stop" && s.wedge && !s.wedge.acknowledged) {
  // Kernel wedge: persist wedge.json so the sanctioned resume --wedge path works.
  state.writeWedge(ctx.cwd, s.wedge);
 }
 persist(s);
 if (result.kind === "run") {
  state.heartbeatLock(ctx.cwd);
  journal(s, "unit-start", result.unit.id, { attempts: result.unit.attempts });
  let brief: string;
  try {
   brief = units.renderBrief(result.unit, ctx.cwd);
  } catch (error) {
   return err(error instanceof Error ? error.message : String(error));
  }
  const instructions = unitExecutionEnvelope(result.unit, s, brief);
  return {
   text: `${nextActionLine(result)}\n\n${instructions}`,
   details: { unit: result.unit, brief, instructions },
  };
 }
 // Terminal stop/pause — release lock on stop, persist, journal terminal.
 if (result.kind === "stop") {
  state.releaseLock(ctx.cwd);
  state.clearStopFlag(ctx.cwd);
  journal(s, "terminal", undefined, { reason: result.reason });
  // Crash-note artifact for every hard stop (iteration cap, memory pressure,
  // infrastructure, cooldown/verify exhaustion, wedge) — same contract as the
  // record path. STOP-flag/wedge-ack pauses are not hard stops and are skipped.
  const current = s.queue[s.pointer];
  // Coordination stops (operator STOP flag, foreign live lock, unacknowledged
  // wedge) are not failures — no crash note. Everything else is a hard stop.
  const coordinationStop =
   result.reason.startsWith("Stopped: stop requested") ||
   result.reason.startsWith("Stopped: foreign live lock") ||
   (s.wedge !== null && !s.wedge.acknowledged);
  if (!coordinationStop) {
   state.writeCrashNote(ctx.cwd, {
    createdAt: deps().now(),
    errorType: crashNoteType(result.reason),
    errorMessage: result.reason,
    unitId: current?.id ?? null,
   });
  }
 }
 if (result.kind === "pause") {
  journal(s, "paused", undefined, { reason: result.reason });
 }
 persist(s);
 return {
  text: nextActionLine(result),
  isError: result.kind === "stop" && result.reason.startsWith("Safety"),
  details: { result },
 };
}

export async function doRecordResult(params: {
 unitId: string;
 status: "completed" | "failed" | "crashed";
 errorClass?: "rate-limit" | "infrastructure" | "model-policy" | "unknown";
 summary: string;
}): Promise<FacadeResult> {
 const s = loadOrCreateState();
 const unit = units.listQueue(s).find((u) => u.id === params.unitId);
 if (!unit) return err(`record_result: unknown unit "${params.unitId}"`);
 if (s.run.status !== "running" && s.run.status !== "paused") {
  return err(`Cannot record: run status is "${s.run.status}".`);
 }
 if (foreignLockProbe()) return lockRefusal("record_result");
 // FIFO preflight: only the pointer's current unit may report. Reject BEFORE
 // any side effect (journal, verify spawn) so out-of-order records are inert.
 const currentUnit = s.queue[s.pointer];
 if (!currentUnit || currentUnit.id !== params.unitId) {
  return err(
   currentUnit
    ? `out-of-order result for ${params.unitId}: unit ${currentUnit.id} is at the queue pointer — record that unit first`
    : `unknown unit ${params.unitId}: queue pointer is exhausted`,
  );
 }
 journal(s, "finalize-start", unit.id);

 // Verify gate: completed units declaring a verify command must pass before finalize.
 let verify: VerifyOutcome | undefined;
 if (params.status === "completed" && unit.verifyCommand) {
  verify = await runVerify({
   command: unit.verifyCommand,
   cwd: ctx.cwd,
   maxRetries: unit.maxRetries ?? settings["verify.maxRetries"],
   timeoutMs: settings["verify.timeoutMs"],
  });
  journal(s, "verify-retry", unit.id, { attempts: verify.attempts, passed: verify.passed, timedOut: verify.timedOut });
 }

 const phase = kernel.recordResult(
  s,
  params.unitId,
  { status: params.status, summary: params.summary, errorClass: params.errorClass, verify },
  settings,
  deps(),
 );
 // FIFO rejections (out-of-order / unknown unit) must not emit side effects:
 // no activity log, no journals, no lock release — just the refusal.
 if (phase.action === "break" && phase.reason.startsWith("out-of-order")) {
  return err(phase.reason);
 }
 if (phase.action === "break" && phase.reason.startsWith("unknown unit")) {
  return err(phase.reason);
 }
 // B4 non-consuming cooldown: wait the fallback window (abortable by STOP)
 // before handing the retry back to the model.
 if (phase.action === "retry" && phase.reason.startsWith("rate-limit cooldown")) {
  const waitMs = settings["loop.cooldownFallbackWaitMs"];
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && !state.checkStopFlag(ctx.cwd)) {
   await new Promise((r) => setTimeout(r, Math.min(250, deadline - Date.now())));
  }
 }
 // Activity log: model-provided summary (port of .gsd/activity/ logs).
 state.writeActivityLog(ctx.cwd, unit.id, unit.attempts, params.summary);
 persist(s);
 journal(s, "unit-end", unit.id, { status: unit.status, attempts: unit.attempts });
 journal(s, "finalize-end", unit.id, { phase: phase.action });

 // Crash-note writers for hard stops (error ladder / infrastructure / cooldown /
 // verify exhaustion). Every terminal break gets an artifact; payload-equals-
 // summary is NOT a reason to skip (upstream gate was too narrow).
 if (phase.action === "break" && s.run.status !== "paused") {
  state.writeCrashNote(ctx.cwd, {
   createdAt: deps().now(),
   errorType: crashNoteType(phase.reason),
   errorMessage: phase.reason,
   unitId: params.unitId,
  });
 }

 // Next-action envelope: terminal/pause line on break, else invite the next advance.
 if (phase.action === "break") {
  if (s.run.status === "paused") {
   return { text: `PAUSED: ${s.run.stopReason}\n/gsd-loop resume to continue`, details: { phase, run: s.run } };
  }
  // Terminal stop via record path: release the lock + journal terminal.
  state.releaseLock(ctx.cwd);
  journal(s, "terminal", undefined, { reason: phase.reason });
  const result: AdvanceResult = { kind: "stop", reason: phase.reason, recoveryHint: "/gsd-loop resume to continue" };
  return { text: nextActionLine(result), details: { phase, run: s.run } };
 }
 const pending = s.queue.find((u) => u.status === "pending")
 if (!pending && s.run.status === "running") {
  state.releaseLock(ctx.cwd);
  s.run.status = "complete";
  s.run.stoppedAt = deps().now();
  s.run.stopReason = "Queue complete";
  persist(s);
  journal(s, "terminal", undefined, { reason: "Queue complete" });
  notify("gsd-loop: queue complete");
  return { text: "STOPPED: Queue complete", details: { run: s.run } };
 }
 if (s.run.status === "paused") {
  // Step-mode pause after successful record: the next advance would error
  // against a paused run — hand control back with the resume instruction.
  return {
   text: `Recorded: ${unit.id} → ${unit.status}. Run is paused (${s.run.stopReason ?? s.paused?.reason ?? "paused"}) — /gsd-loop resume to continue.`,
   details: { phase, unit: { id: unit.id, status: unit.status, attempts: unit.attempts }, run: s.run },
  };
 }
 return {
  text: `Recorded: ${unit.id} → ${unit.status}. ${pending ? `NEXT: call gsd_loop_advance for unit ${pending.id}.` : "Advance for the next action."}`,
  details: { phase, unit: { id: unit.id, status: unit.status, attempts: unit.attempts } },
 };
}

export function doNext(params: { dryRun?: boolean }): FacadeResult {
 if (params.dryRun) return doAdvance({ dryRun: true });
 // Step mode: ensure a running run in step mode, then advance once.
 const s = loadOrCreateState();
 if (s.run.status !== "running") {
  if (foreignLockProbe()) return lockRefusal("next");
  const started = kernel.start(s, { mode: "step" }, deps());
  if (started.action === "break") return err(started.reason);
  if (!state.acquireLock(ctx.cwd, { ownerPid: process.pid, sessionId: "local" })) {
   return lockRefusal("next");
  }
  journal(s, "run-start", undefined, { mode: "step" });
 }
 s.run.mode = "step";
 persist(s);
 return doAdvance({});
}

export function doEnqueue(params: {
 id: string;
 title: string;
 brief?: string;
 briefFile?: string;
 verifyCommand?: string;
 maxRetries?: number;
 dispatch?: "inline" | "subagent";
 subagentAgent?: string;
}): FacadeResult {
 // Lock fencing: a second live session must not mutate the queue/state.
 if (foreignLockProbe()) return lockRefusal("enqueue");
 const s = loadOrCreateState();
 try {
  if (params.briefFile) checkBriefFile(params.briefFile);
  const unit = makeUnit({
   id: params.id,
   title: params.title,
   brief: params.brief ?? null,
   briefFile: params.briefFile ?? null,
   verifyCommand: params.verifyCommand ?? null,
   maxRetries: params.maxRetries ?? null,
   dispatch: params.dispatch ?? "inline",
   subagentAgent: params.subagentAgent ?? null,
  });
  units.enqueue(s, unit, ctx.cwd);
 } catch (error) {
  return err(error instanceof Error ? error.message : String(error));
 }
 persist(s);
 journal(s, "enqueued", params.id, { title: params.title });
 return { text: `Enqueued ${params.id} — ${params.title} (${s.queue.length} units total, pointer ${s.pointer}).`, details: { queued: s.queue.length, pointer: s.pointer } };
}

export function doList(): FacadeResult {
 const s = loadOrCreateState();
 const queue = units.listQueue(s);
 const lines = ["id       status    attempts  title"];
 for (const u of queue) {
  lines.push(`${u.id.padEnd(8)} ${u.status.padEnd(9)} ${String(u.attempts).padEnd(9)} ${u.title}`);
 }
 if (!queue.length) lines.push("(queue empty)");
 return { text: lines.join("\n"), details: { queue, pointer: s.pointer } };
}

/** Build a default Unit (units.makeUnit equivalent). */
function makeUnit(partial: Partial<Unit> & { id: string; title: string }): Unit {
 return {
  brief: null,
  briefFile: null,
  verifyCommand: null,
  maxRetries: null,
  dispatch: "inline",
  subagentAgent: null,
  status: "pending",
  attempts: 0,
  verifyAttempts: 0,
  lastError: null,
  failureHash: null,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  resultSummary: null,
  ...partial,
 };
}

/** briefFile path validation: inside cwd, readable. */
function checkBriefFile(briefFile: string): void {
 const resolved = path.resolve(ctx.cwd, briefFile);
 const root = path.resolve(ctx.cwd);
 const rel = path.relative(root, resolved);
 if (rel.startsWith("..") || path.isAbsolute(rel)) {
  throw new Error(`briefFile ${briefFile} resolves outside the project root (${resolved})`);
 }
 readFileSync(resolved, "utf8");
}

/** Persist-through helper for index.ts hook paths (crash recovery, shutdown, stop bridge). */
export function persistState(s: GsdLoopState): void {
 persist(s);
}

export type { GsdLoopState, Unit };
