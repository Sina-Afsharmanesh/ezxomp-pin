/**
 * src/cdp/client.ts — minimal CDP JSON-RPC client (W6).
 *
 * Id correlation, event subscription, per-call timeout, close handling.
 * Transport is injectable so tests drive a fake WebSocket factory. When no
 * factory is supplied the platform `WebSocket` global is used; if the host
 * has none the failure reason is `no_websocket` (never a raw crash).
 */

export type CdpReason =
 | "no_browser_backend"
 | "no_websocket"
 | "profile_locked"
 | "target_unreachable"
 | "timeout"
 | "invalid_params";

export class CdpError extends Error {
 constructor(
  public readonly reason: CdpReason,
  message: string,
 ) {
  super(message);
  this.name = "CdpError";
 }
}

export interface CdpTransport {
 send(data: string): void;
 close(): void;
 on(event: "open", cb: () => void): void;
 on(event: "message", cb: (data: string) => void): void;
 on(event: "close", cb: () => void): void;
 on(event: "error", cb: (err: Error) => void): void;
}

export type TransportFactory = (url: string) => CdpTransport;

interface Pending {
 resolve: (value: unknown) => void;
 reject: (err: CdpError) => void;
 timer: ReturnType<typeof setTimeout>;
}

export type CdpEventHandler = (params: Record<string, unknown>) => void;

const DEFAULT_CALL_TIMEOUT_MS = 10_000;

/** Default transport over the platform WebSocket global (Bun / Node >= 22). */
export const platformTransportFactory: TransportFactory = (url) => {
 if (typeof WebSocket !== "function") {
  throw new CdpError(
   "no_websocket",
   "No WebSocket implementation available on this runtime; CDP backend unavailable.",
  );
 }
 const ws = new WebSocket(url);
 const wrapped: CdpTransport = {
  send: (data) => ws.send(data),
  close: () => {
   try {
    ws.close();
   } catch {
    /* already closed */
   }
  },
  on: ((event: "open" | "message" | "close" | "error", cb: (arg?: unknown) => void) => {
   switch (event) {
    case "message":
     ws.addEventListener("message", (ev: MessageEvent) =>
      cb(typeof ev.data === "string" ? ev.data : String(ev.data)),
     );
     return;
    case "open":
     ws.addEventListener("open", () => cb());
     return;
    case "close":
     ws.addEventListener("close", () => cb());
     return;
    default:
     ws.addEventListener("error", () => cb(new Error("WebSocket connection error")));
   }
  }) as CdpTransport["on"],
 };
 return wrapped;
};

export class CdpClient {
 private transport: CdpTransport | null = null;
 private nextId = 0;
 private readonly pending = new Map<number, Pending>();
 private readonly handlers = new Map<string, Set<CdpEventHandler>>();

 constructor(
  private readonly factory: TransportFactory = platformTransportFactory,
  private readonly callTimeoutMs: number = DEFAULT_CALL_TIMEOUT_MS,
 ) { }

 get connected(): boolean {
  return this.transport !== null;
 }

 /** Open the socket; resolves on open, rejects on error with a CdpReason. */
 open(url: string, openTimeoutMs = DEFAULT_CALL_TIMEOUT_MS): Promise<void> {
  let transport: CdpTransport;
  try {
   transport = this.factory(url);
  } catch (err) {
   if (err instanceof CdpError) return Promise.reject(err);
   return Promise.reject(
    new CdpError("no_websocket", `Transport creation failed: ${String(err)}`),
   );
  }
  this.transport = transport;
  return new Promise((resolve, reject) => {
   let settled = false;
   const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    this.close();
    reject(new CdpError("timeout", `Timed out connecting to ${url}`));
   }, openTimeoutMs);
   transport.on("open", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve();
   });
   transport.on("message", (data) => this.handleMessage(data));
   transport.on("close", () => {
    // Remote close kills the transport: `connected` must flip false so
    // later call()s fail fast instead of writing into a dead socket.
    this.transport = null;
    if (settled) {
     this.rejectAll(new CdpError("target_unreachable", "Connection closed"));
     return;
    }
    settled = true;
    clearTimeout(timer);
    reject(new CdpError("target_unreachable", `Connection closed before open: ${url}`));
   });
   transport.on("error", (err) => {
    const message = `Connection error: ${err.message}`;
    this.transport = null;
    if (settled) {
     this.rejectAll(new CdpError("target_unreachable", message));
     return;
    }
    settled = true;
    clearTimeout(timer);
    reject(new CdpError("target_unreachable", message));
   });
  });
 }


 /** JSON-RPC call with id correlation and per-call timeout. */
 call<T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs = this.callTimeoutMs,
 ): Promise<T> {
  if (!this.transport) {
   return Promise.reject(new CdpError("target_unreachable", "CDP client is not connected"));
  }
  const id = ++this.nextId;
  return new Promise<T>((resolve, reject) => {
   const timer = setTimeout(() => {
    this.pending.delete(id);
    reject(new CdpError("timeout", `CDP call timed out: ${method}`));
   }, timeoutMs);
   this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
   this.transport!.send(JSON.stringify({ id, method, params: params ?? {} }));
  });
 }

 /** Subscribe to a CDP event (e.g. "Page.loadEventFired"). */
 on(event: string, handler: CdpEventHandler): void {
  let set = this.handlers.get(event);
  if (!set) {
   set = new Set();
   this.handlers.set(event, set);
  }
  set.add(handler);
 }

 close(): void {
  const transport = this.transport;
  this.transport = null;
  if (transport) transport.close();
  this.rejectAll(new CdpError("target_unreachable", "CDP client closed"));
 }

 private rejectAll(err: CdpError): void {
  for (const pending of this.pending.values()) {
   clearTimeout(pending.timer);
   pending.reject(err);
  }
  this.pending.clear();
 }

 private handleMessage(data: string): void {
  let msg: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
  try {
   msg = JSON.parse(data);
  } catch {
   return;
  }
  if (typeof msg.id === "number") {
   const pending = this.pending.get(msg.id);
   if (!pending) return;
   this.pending.delete(msg.id);
   clearTimeout(pending.timer);
   if (msg.error) {
    pending.reject(
     new CdpError("target_unreachable", `CDP error: ${msg.error.message ?? "unknown"}`),
    );
   } else {
    pending.resolve(msg.result ?? {});
   }
   return;
  }
  if (typeof msg.method === "string") {
   const set = this.handlers.get(msg.method);
   if (set) for (const handler of set) handler(msg.params ?? {});
  }
 }
}
