/**
 * @ezxomp/gsd-loop — entry point (WU-9).
 *
 * Wiring only: registers tools, command, and hooks. All behavior lives in
 * the sibling modules (kernel, state, verify, units, settings, prompts, core).
 *
 * Hooks:
 * - session_start: capture cwd/hasUI, load state, crash-recovery check, guarded notify.
 * - turn_start: refresh cwd/hasUI cache.
 * - before_agent_start: inject the auto-mode operating instruction when running+auto.
 * - session_stop: {continue:true} bridging with a no-progress fingerprint guard.
 * - session_shutdown: auto-pause a running run with reason "session-shutdown".
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import * as core from "./core.js";
import { pauseRun } from "./core.js";
import { registerGsdLoopTools } from "./tools.js";
import { registerGsdLoopCommand } from "./commands.js";
import { autoOperatingInstruction } from "./prompts.js";
import { makeDeps as makeKernelDeps } from "./kernel.js";
import * as state from "./state.js";
import type { GsdLoopState } from "./state.js";

/** Fingerprint of loop progress: iteration counter + settled-unit status digest. */
function progressFingerprint(s: GsdLoopState): string {
 const settled = s.queue.map((u) => `${u.id}:${u.status}:${u.attempts}`).join("|");
 return `i${s.counters.iterations}:${settled}`;
}

interface SessionTelemetry {
 cwd: string;
 hasUI: boolean;
 lastContinueFingerprint: string | null;
 continueIssued: boolean;
}

const telemetry: SessionTelemetry = {
 cwd: process.cwd(),
 hasUI: false,
 lastContinueFingerprint: null,
 continueIssued: false,
};

function syncContext(ctx: ExtensionContext): void {
 telemetry.cwd = ctx.cwd;
 telemetry.hasUI = ctx.hasUI;
 core.setFacadeContext({ cwd: ctx.cwd, hasUI: ctx.hasUI });
}

/** Session_start work: load state, crash-recovery, one guarded notify. Exported for tests. */
export function onSessionStart(pi: ExtensionAPI, ctx: ExtensionContext): { note?: string } {
 syncContext(ctx);
 core.setFacadeSettings(readSettings(pi));
 const s = core.loadOrCreateState();
 // Crash recovery: dead-pid lock + running ⇒ paused with recovery summary.
 const lock = state.readLock(ctx.cwd);
 if (lock && lock.ownerPid !== process.pid && s.run.status === "running") {
  let alive = true;
  try {
   process.kill(lock.ownerPid, 0);
  } catch (error) {
   // EPERM: the owner exists but we may not signal it — treat as alive.
   alive = (error as NodeJS.ErrnoException).code === "EPERM";
  }
  if (!alive) {
   const inFlight = s.queue.find((u) => u.status === "running");
   if (inFlight) {
    inFlight.status = "crashed";
    inFlight.failedAt = new Date().toISOString();
   }
   state.writeCrashNote(ctx.cwd, {
    createdAt: new Date().toISOString(),
    errorType: "error-ladder",
    errorMessage: `crash recovery: owner pid ${lock.ownerPid} died mid-run`,
    unitId: inFlight?.id ?? null,
   });
   s.run.status = "paused";
   s.run.stopReason = "crash-recovery";
   s.paused = {
    pausedAt: new Date().toISOString(),
    reason: "crash-recovery: previous session died mid-run",
    unitInFlight: inFlight?.id ?? null,
   };
   state.releaseLock(ctx.cwd);
   core.persistState(s);
   const note = `gsd-loop crash recovery: session (pid ${lock.ownerPid}) died mid-run. Unit ${inFlight?.id ?? "none"} marked crashed; run paused — /gsd-loop resume to continue.`;
   if (ctx.hasUI && typeof ctx.ui?.notify === "function") ctx.ui.notify(note, "warning");
   return { note };
  }
 }
 telemetry.lastContinueFingerprint = null;
 telemetry.continueIssued = false;
 return {};
}

function readSettings(pi: ExtensionAPI): unknown {
 // Settings: resolveGsdLoopSettings merges declared defaults with persisted
 // PluginManager overrides; core.setFacadeSettings normalizes. The host may
 // supply overrides via pi.getPluginSettings when present.
 const getter = (pi as { getPluginSettings?: (name: string) => unknown }).getPluginSettings;
 try {
  return typeof getter === "function" ? getter.call(pi, "@ezxomp/gsd-loop") : {};
 } catch {
  return {};
 }
}

/** Session_shutdown work: auto-pause + journal flush. Exported for tests. */
export function onSessionShutdown(ctx: ExtensionContext): void {
 syncContext(ctx);
 const s = core.loadOrCreateState();
 if (s.run.status === "running") {
  pauseRun(s, "session-shutdown", makeKernelDeps());
  core.persistState(s);
  // Durable seq: allocate from the journal tail (same contract as core.journal),
  // never from counters — counters regress across restarts.
  const events = state.readJournal(ctx.cwd);
  const last = events[events.length - 1];
  const lastSeq = last && typeof last.seq === "number" ? last.seq : 0;
  state.appendJournal(ctx.cwd, {
   flowId: s.run.id,
   seq: lastSeq + 1,
   eventType: "paused",
   data: { reason: "session-shutdown" },
  });
 }
}

/** Session_stop work: continue bridge with no-progress guard. Exported for tests. */
export function onSessionStop(ctx: ExtensionContext): { continue: true; reason: string } | undefined {
 syncContext(ctx);
 const s = core.loadOrCreateState();
 if (s.run.status !== "running" || s.run.mode !== "auto") return undefined;
 const fingerprint = progressFingerprint(s);
 if (telemetry.continueIssued && telemetry.lastContinueFingerprint === fingerprint) {
  // No progress since the last continue — stop bridging (wedge backstop analog).
  pauseRun(s, "no-progress across continues — auto bridge stopped", makeKernelDeps());
  // Persist a wedge so sanctioned recovery is resume --wedge <id>, not blind resume.
  if (!s.wedge) {
   s.wedge = {
    id: `wedge-${Date.now().toString(36)}`,
    signature: `no-progress:${s.pointer}`,
    unitId: s.queue[s.pointer]?.id ?? "none",
    createdAt: new Date().toISOString(),
    acknowledged: false,
   };
   state.writeWedge(ctx.cwd, s.wedge);
  }
  core.persistState(s);
  telemetry.continueIssued = false;
  telemetry.lastContinueFingerprint = null;
  if (ctx.hasUI && typeof ctx.ui?.notify === "function") {
   ctx.ui.notify(`gsd-loop: no progress across continues — pausing. Sanctioned re-entry: /gsd-loop resume --wedge ${s.wedge?.id ?? "(id in .gsd-loop/wedge.json)"}.`, "warning");
  }
  return undefined;
 }
 telemetry.continueIssued = true;
 telemetry.lastContinueFingerprint = fingerprint;
 return { continue: true, reason: "gsd-loop auto: call gsd_loop_advance" };
}

export default function gsdLoopExtension(pi: ExtensionAPI): void {
 registerGsdLoopTools(pi);
 registerGsdLoopCommand(pi);

 pi.on("session_start", async (_event, ctx) => {
  onSessionStart(pi, ctx);
 });

 pi.on("turn_start", async (_event, ctx) => {
  syncContext(ctx);
 });

 pi.on("before_agent_start", (event, ctx) => {
  syncContext(ctx);
  const s = core.loadOrCreateState();
  if (s.run.status === "running" && s.run.mode === "auto") {
   return { systemPrompt: [...event.systemPrompt, autoOperatingInstruction(s)] };
  }
  return undefined;
 });

 pi.on("session_stop", (event, ctx) => {
  // The host contract: returning {continue:true} keeps the session alive.
  return onSessionStop(ctx);
 });

 pi.on("session_shutdown", async (_event, ctx) => {
  onSessionShutdown(ctx);
 });
}
