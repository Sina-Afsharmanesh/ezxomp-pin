import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { performance } from "node:perf_hooks";
import { kill } from "node:process";
import type { SpawnSyncOptions } from "node:child_process";
import { emitEvent } from "./events.js";

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  timeout: boolean;
  cancelled: boolean;
  spawnError: string | null;
  ok: boolean;
}

/** Options for runProcess / runProcessSync */
export interface RunOptions {
  cwd?: string;
  /** Timeout in ms. 0 = no timeout (unbounded). Default: 30000 */
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  /** Correlates runner events with the owning pstack run. */
  runId?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 32_000;

// ---------------------------------------------------------------------------
// Sync variant — wraps spawnSync without shell:true
// ---------------------------------------------------------------------------

/**
 * Synchronous process run. NOTE: `signal` is only checked before spawn; a
 * running sync process cannot be aborted mid-flight. Use async `runProcess`
 * when cancellation during execution is required.
 */
export function runProcessSync(
  argv: string[],
  options: RunOptions = {},
): CommandResult {
  if (argv.length === 0) {
    return {
      exitCode: null, signal: null,
      stdout: "", stderr: "",
      stdoutTruncated: false, stderrTruncated: false,
      durationMs: 0, timeout: false, cancelled: false,
      spawnError: "empty argv", ok: false,
    };
  }

  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    env,
    signal,
    runId,
  } = options;

  const maxBytes = maxOutputBytes;
  const maxLen = Math.floor(maxBytes * 0.7);

  const mergedEnv = env
    ? { ...(process.env as Record<string, string>), ...env }
    : undefined;

  const startMs = performance.now();
  if (signal?.aborted) {
    return {
      exitCode: null, signal: null,
      stdout: "", stderr: "",
      stdoutTruncated: false, stderrTruncated: false,
      durationMs: 0, timeout: false, cancelled: true,
      spawnError: null, ok: false,
    };
  }

  const opts: SpawnSyncOptions = {
    cwd,
    env: mergedEnv,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "buffer",
    maxBuffer: Math.floor(maxBytes * 2),
    timeout: timeoutMs,
  };

  try {
    emitEvent({
      type: "command",
      at: new Date().toISOString(),
      ...(runId ? { meta: { runId } } : {}),
      payload: { argv: [...argv], cwd },
    });
    const result = spawnSync(argv[0]!, [ ...(argv.slice(1) as readonly string[]) ], opts);
    const dur = Math.round(performance.now() - startMs);

    let stdoutRaw = result.stdout?.toString("utf-8") ?? "";
    let stderrRaw = result.stderr?.toString("utf-8") ?? "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    if (stdoutRaw.length > maxLen) {
      stdoutTruncated = true;
      stdoutRaw = stdoutRaw.slice(-maxLen);
    }
    if (stderrRaw.length > maxLen) {
      stderrTruncated = true;
      stderrRaw = stderrRaw.slice(-maxLen);
    }

    const timedOut = result.signal === "SIGTERM" && result.status === null && (result.error as NodeJS.ErrnoException | null)?.code === "ETIMEDOUT";
    const spawnErr = result.error ? (result.error.message ?? String(result.error)) : null;
    const resultSignal = (result.signal as NodeJS.Signals | null) ?? null;
    emitEvent({
      type: "command",
      at: new Date().toISOString(),
      ...(runId ? { meta: { runId } } : {}),
      payload: {
        argv: [...argv],
        exitCode: result.status,
        signal: resultSignal,
        settled: true,
        timeout: timedOut,
        cancelled: false,
      },
    });

    return {
      exitCode: result.status,
      signal: resultSignal,
      stdout: stdoutRaw,
      stderr: stderrRaw,
      stdoutTruncated,
      stderrTruncated,
      durationMs: dur,
      timeout: timedOut,
      cancelled: false,
      spawnError: spawnErr,
      ok: result.status === 0 && !timedOut && !spawnErr,
    };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return {
      exitCode: null, signal: null,
      stdout: "", stderr: "",
      stdoutTruncated: false, stderrTruncated: false,
      durationMs: Math.round(performance.now() - startMs),
      timeout: false, cancelled: false,
      spawnError: msg, ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// isToolAvailable — uses spawnSync for `which`, no shell:true, no user args
// ---------------------------------------------------------------------------

export function isToolAvailable(tool: string): boolean {
  const r = spawnSync("which", [tool], {
    stdio: ["ignore", "ignore", "ignore"],
    encoding: "utf-8",
  });
  return r.status === 0;
}

// ---------------------------------------------------------------------------
// Async variant — spawns without shell:true
// ---------------------------------------------------------------------------

export function runProcess(
  argv: string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  if (argv.length === 0) {
    return Promise.resolve({
      exitCode: null, signal: null,
      stdout: "", stderr: "",
      stdoutTruncated: false, stderrTruncated: false,
      durationMs: 0, timeout: false, cancelled: false,
      spawnError: "empty argv", ok: false,
    });
  }
  if (options.signal?.aborted) {
    return Promise.resolve({
      exitCode: null, signal: null,
      stdout: "", stderr: "",
      stdoutTruncated: false, stderrTruncated: false,
      durationMs: 0, timeout: false, cancelled: true,
      spawnError: null, ok: false,
    });
  }

  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    signal,
    env,
    runId,
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const startMs = performance.now();
    let child: ChildProcess;

    const stdoutBuf = new BufferAcc(maxOutputBytes);
    const stderrBuf = new BufferAcc(maxOutputBytes);

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const onSettled = (exitCode: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      process.removeListener("exit", onProcessExit);
      clearTimeout(timeoutTimer);
      clearTimeout(graceTimer);
      signal?.removeEventListener("abort", onAbort);
      try {
        emitEvent({
          type: "command",
          at: new Date().toISOString(),
          ...(runId ? { meta: { runId } } : {}),
          payload: {
            argv: [...argv],
            exitCode,
            signal: sig,
            settled: true,
            timeout: timedOut,
            cancelled,
          },
        });
      } catch {}
      const dur = Math.round(performance.now() - startMs);
      const out = stdoutBuf.finalize();
      const err = stderrBuf.finalize();
      resolve({
        exitCode, signal: sig,
        stdout: out.data, stderr: err.data,
        stdoutTruncated: out.truncated, stderrTruncated: err.truncated,
        durationMs: dur,
        timeout: timedOut, cancelled,
        spawnError: null,
        ok: exitCode === 0 && !timedOut && !cancelled,
      });
    };

    const doKill = (sig: string, escalate = false) => {
      if (settled || !child || child.pid == null) return;
      try { kill(child.pid, sig); } catch {}
      if (escalate) {
        try { kill(child.pid, "SIGKILL"); } catch {}
      }
    };

    const doTimeout = () => {
      if (settled) return;
      timedOut = true;
      // Emit cancellation BEFORE killing the process (before settle)
      try { emitEvent({ type: "cancellation", at: new Date().toISOString(), ...(runId ? { meta: { runId } } : {}), payload: { reason: "timeout", pid: child?.pid } }); } catch {}
      doKill("SIGTERM");
      graceTimer = setTimeout(() => doKill("SIGKILL", true), 2000);
    };

    const doCancel = () => {
      if (settled) return;
      cancelled = true;
      // Emit cancellation BEFORE killing the process (before settle)
      try { emitEvent({ type: "cancellation", at: new Date().toISOString(), ...(runId ? { meta: { runId } } : {}), payload: { reason: "cancel", pid: child?.pid } }); } catch {}
      doKill("SIGTERM");
      graceTimer = setTimeout(() => doKill("SIGKILL", true), 2000);
    };

    const onAbort = () => { doCancel(); };

    const onProcessExit = () => {
      if (settled) return;
      // Host process exiting — emit cancellation before we die
      try { emitEvent({ type: "cancellation", at: new Date().toISOString(), ...(runId ? { meta: { runId } } : {}), payload: { reason: "process-exit", pid: child?.pid } }); } catch {}
      doKill("SIGKILL", true);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    process.on("exit", onProcessExit);

    try {
      const mergedEnv = env
        ? { ...(process.env as Record<string, string>), ...env }
        : undefined;

      emitEvent({ type: "command", at: new Date().toISOString(), ...(runId ? { meta: { runId } } : {}), payload: { argv: [...argv], cwd } });
      child = spawn(argv[0]!, [ ...(argv.slice(1)) ], {
        cwd,
        env: mergedEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true,
      });

      const onStream = (buf: BufferAcc, chunk: Buffer): void => {
        buf.push(chunk);
        emitEvent({
          type: "check",
          at: new Date().toISOString(),
          ...(runId ? { meta: { runId } } : {}),
          payload: { status: "running", detail: chunk.toString("utf-8").slice(-500) },
        });
      };

      child.stdout?.on("data", (chunk: Buffer) => onStream(stdoutBuf, chunk));
      child.stderr?.on("data", (chunk: Buffer) => onStream(stderrBuf, chunk));

      child.on("close", (code, sig) => onSettled(code, sig ?? null));
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        process.removeListener("exit", onProcessExit);
        clearTimeout(timeoutTimer);
        clearTimeout(graceTimer);
        signal?.removeEventListener("abort", onAbort);
        emitEvent({
          type: "command",
          at: new Date().toISOString(),
          ...(runId ? { meta: { runId } } : {}),
          payload: { argv: [...argv], exitCode: null, signal: null, settled: true, timeout: false, cancelled: false },
        });
        resolve({
          exitCode: null, signal: null,
          stdout: "", stderr: "",
          stdoutTruncated: false, stderrTruncated: false,
          durationMs: Math.round(performance.now() - startMs),
          timeout: false, cancelled: false,
          spawnError: err.message,
          ok: false,
        });
      });

      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(doTimeout, timeoutMs);
      }

    } catch (cause) {
      if (settled) return;
      settled = true;
      process.removeListener("exit", onProcessExit);
      clearTimeout(timeoutTimer);
      clearTimeout(graceTimer);
      signal?.removeEventListener("abort", onAbort);
      const msg = cause instanceof Error ? cause.message : String(cause);
      resolve({
        exitCode: null, signal: null,
        stdout: "", stderr: "",
        stdoutTruncated: false, stderrTruncated: false,
        durationMs: Math.round(performance.now() - startMs),
        timeout: false, cancelled: false,
        spawnError: msg, ok: false,
      });
    }
  });
}


class BufferAcc {
  chunks: Buffer[] = [];
  totalBytes = 0;
  truncated = false;
  private maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;
    if (this.totalBytes > this.maxBytes) {
      this.truncated = true;
      const maxLen = Math.floor(this.maxBytes * 0.7);
      const tail = this.chunks[this.chunks.length - 1];
      if (tail === undefined) {
        this.chunks = [];
        this.totalBytes = 0;
        return;
      }
      if (tail.length > maxLen) {
        this.chunks = [tail.slice(-maxLen)];
      } else {
        let tailBuf: Buffer;
        const first = this.chunks[0];
        if (first !== undefined && this.chunks.length === 1) {
          tailBuf = first;
        } else {
          tailBuf = Buffer.concat(this.chunks);
        }
        const tailStr = tailBuf.toString("utf-8");
        if (tailStr.length > maxLen) {
          this.chunks = [Buffer.from(tailStr.slice(-maxLen), "utf-8")];
        } else {
          this.chunks = [tailBuf];
        }
      }
    }
  }

  finalize(): { data: string; truncated: boolean } {
    let data: string;
    if (this.chunks.length === 0) {
      data = "";
    } else if (this.chunks.length === 1) {
      data = this.chunks[0]!.toString("utf-8");
    } else {
      data = Buffer.concat(this.chunks).toString("utf-8");
    }
    return { data, truncated: this.truncated };
  }
}
