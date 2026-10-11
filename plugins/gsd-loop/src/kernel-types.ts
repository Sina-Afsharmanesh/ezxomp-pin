/**
 * src/kernel-types.ts — kernel shared types.
 */

export type PhaseResult<T = void> =
 | { action: "continue" }
 | { action: "break"; reason: string; payload?: string }
 | { action: "retry"; reason: string }
 | { action: "next"; data?: T };

export interface KernelDeps {
 now(): string;
 /** v8.getHeapStatistics() used/limit; fallback process.memoryUsage().heapUsed/heapTotal. */
 heapRatio(): number;
 uuid(): string;
 /** Optional cross-instance stop-flag probe; guard #0 when present. */
 stopFlag?(): boolean;
 /** Optional foreign live lock probe; guard #2 when present. */
 foreignLock?(): boolean;
 /** Optional cwd for cwd-dependent reads (briefFile resolution). */
 cwd?(): string;
}

export interface KernelStop {
 kind: "stop";
 reason: string;
 recoveryHint?: string;
}

export interface KernelPause {
 kind: "pause";
 reason: string;
}

export interface KernelRun {
 kind: "run";
 unit: import("./units.js").Unit;
 brief: string;
 instructions: string;
 /** wedge signature `${unitId}:${attempts}` for dispatch tracking */
 signature: string;
}

export type AdvanceResult = KernelStop | KernelPause | KernelRun;
