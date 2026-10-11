/**
 * omp-lean-ctx gateway — shared, module-scope MCP stdio bridge to lean-ctx.
 *
 * Why this exists
 * ───────────────
 * The plugin registers 11 native `ctx_*` tools (`ctx_glob`, `ctx_search`,
 * `ctx_tree`, `ctx_callgraph`, `ctx_expand`, `ctx_overview`, `ctx_shell`,
 * `ctx_read`, `ctx_call`, `ctx_compose`, `ctx_patch`, `ctx_session`) plus a
 * generic `lean-ctx-gateway` for downstream MCP servers. Each call previously
 * either:
 *   (a) spawned a fresh `lean-ctx` process via stdio JSON-RPC, paying ~50-100ms
 *       of cold-start cost per invocation (the `lean-ctx-gateway` pattern), or
 *   (b) invoked `lean-ctx call <tool> --json '<args>'` which is stateless and
 *       breaks for stateful tools (`ctx_shell`, `ctx_read`, etc. need an MCP
 *       session the `call` subcommand does not open).
 *
 * This module holds ONE long-lived `lean-ctx` child per OMP session and routes
 * all tool calls through it via JSON-RPC over stdio. Per-call cost is ~1ms
 * (process-write-and-read), and stateful tools work because the MCP session is
 * established once at spawn time.
 *
 * Concurrency
 * ───────────
 * JSON-RPC over stdio is request/response — the gateway serializes
 * `tools/call` writes via a simple promise queue (the in-flight request gets
 * the next slot). Responses are correlated by `id`.
 *
 * Crash recovery
 * ──────────────
 * If the child exits unexpectedly, all pending requests are rejected and the
 * next `callTool` re-spawns.
 *
 * Lifecycle
 * ─────────
 * `dispose()` kills the child and rejects in-flight requests. Call this from
 * any OMP `session_end` handler you wire up; if you don't, the child is
 * reaped when OMP's parent process exits.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

/** JSON-RPC 2.0 message. */
interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** MCP tools/call response. */
interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Gateway instance — one per project root. */
interface Gateway {
  callTool(toolName: string, args?: Record<string, unknown>): Promise<McpToolResult>;
  /** Force a re-spawn (e.g. after a fatal error). */
  reset(): Promise<void>;
  /** Tear down. Safe to call multiple times. */
  dispose(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const gateways = new Map<string, Promise<Gateway>>();

/** Get or create the gateway for a project root. */
export function ensureGateway(
  projectRoot: string,
  opts: { timeoutMs?: number } = {},
): Promise<Gateway> {
  const key = projectRoot;
  let pending = gateways.get(key);
  if (pending) return pending;

  pending = createGateway(projectRoot, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  gateways.set(key, pending);
  // Auto-evict on failure so the next call re-spawns.
  pending.catch(() => gateways.delete(key));
  return pending;
}

/** Tear down all gateways (call from OMP session_end). */
export async function disposeAllGateways(): Promise<void> {
  const all = [...gateways.values()];
  gateways.clear();
  await Promise.allSettled(all.map((g) => g.then((gw) => gw.dispose())));
}

async function createGateway(projectRoot: string, timeoutMs: number): Promise<Gateway> {
  let child: ChildProcess | null = null;
  let nextId = 1;
  let stdoutBuf = "";
  const pending = new Map<number, {
    resolve: (r: McpToolResult) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  let writeQueue: Promise<void> = Promise.resolve();
  let disposed = false;

  function rejectAllPending(err: Error): void {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  }

  async function spawnChild(): Promise<void> {
    if (child) return;
    // Clear any leftover pending entries from a prior child (e.g. after reset).
    rejectAllPending(new Error("lean-ctx gateway: re-spawning"));
    nextId = 1;
    const c = spawn("lean-ctx", [], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LEAN_CTX_PROJECT_ROOT: projectRoot },
    });
    child = c;

    c.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg: JsonRpcMessage;
        try { msg = JSON.parse(trimmed); }
        catch { continue; } // ignore non-JSON noise
        if (msg.id !== undefined && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) {
            p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            const r = msg.result as McpToolResult | undefined;
            p.resolve(r ?? { content: [{ type: "text", text: JSON.stringify(msg.result ?? msg) }] });
          }
        }
      }
    });

    c.stderr?.on("data", () => { /* drop WARN/INFO — non-fatal */ });

    c.on("error", (err) => {
      if (child === c) {
        rejectAllPending(new Error(`lean-ctx spawn error: ${err.message}`));
        child = null;
      }
    });

    c.on("close", () => {
      // Only clean up if this is still the current child. After reset() /
      // re-spawn, the old child's close event fires after the new child has
      // taken over — we must not blow away the new gateway's pending map.
      if (child === c) {
        rejectAllPending(new Error("lean-ctx gateway: process closed before responding"));
        child = null;
      }
    });

    // Install the pending entry BEFORE writing, so a fast lean-ctx response
    // can't race past our pending.set(0) and get dropped.
    const initPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(0);
        reject(new Error("lean-ctx initialize timed out"));
      }, timeoutMs);
      pending.set(0, {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        timer,
      });
    });
    // Send initialize
    const init: JsonRpcMessage = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "omp-lean-ctx", version: "0.1.7-ezxomp.5" },
      },
      id: 0,
    };
    await writeRpc(init);
    await initPromise;
    // Send initialized notification
    await writeRpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async function writeRpc(msg: JsonRpcMessage): Promise<void> {
    if (!child?.stdin) throw new Error("lean-ctx gateway: stdin not writable");
    const line = JSON.stringify(msg) + "\n";
    // Serialize writes so concurrent tools/call requests don't interleave.
    writeQueue = writeQueue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!child?.stdin) return reject(new Error("lean-ctx gateway: stdin closed"));
          child.stdin.write(line, (err) => (err ? reject(err) : resolve()));
        }),
    );
    return writeQueue;
  }

  async function callToolInner(toolName: string, args?: Record<string, unknown>): Promise<McpToolResult> {
    if (disposed) throw new Error("lean-ctx gateway: disposed");
    if (!child) await spawnChild();
    const id = nextId++;
    // Install the pending entry BEFORE writing, so a fast response doesn't
    // race past pending.set(id).
    const responsePromise = new Promise<McpToolResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`lean-ctx call ${toolName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
    const call: JsonRpcMessage = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args ?? {} },
      id,
    };
    try {
      await writeRpc(call);
    } catch (err) {
      const entry = pending.get(id);
      if (entry) { clearTimeout(entry.timer); pending.delete(id); entry.reject(err as Error); }
      throw err;
    }
    return responsePromise;
  }

  const gateway: Gateway = {
    callTool: callToolInner,
    async reset(): Promise<void> {
      if (child) {
        try { child.kill(); } catch { /* best-effort */ }
        child = null;
      }
      // Reject any in-flight requests; clear the pending map so the next
      // call doesn't see stale id correlations from the old child.
      rejectAllPending(new Error("lean-ctx gateway: reset"));
      // Reset id sequence so the new child starts fresh.
      nextId = 1;
    },
    async dispose(): Promise<void> {
      disposed = true;
      if (child) {
        try { child.kill(); } catch { /* best-effort */ }
        child = null;
      }
      rejectAllPending(new Error("lean-ctx gateway: disposed"));
    },
  };

  await spawnChild();
  return gateway;
}
