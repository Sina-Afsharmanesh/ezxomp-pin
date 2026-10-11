// ---------------------------------------------------------------------------
// Pstack event emitter — redacted, bounded payloads for UI consumers
// ---------------------------------------------------------------------------

/** Event categories emitted by pstack-suite. */
export type PstackEventType =
  | "command"       // runner: before spawn / after settle
  | "cancellation"  // runner: abort/signal received, before resolving
  | "preflight"     // run: after runPreflight completes
  | "receipt"       // run: after saveRun persists a RunRecord
  | "phase"         // commands: stage transition
  | "check";        // commands: individual check result

/** Payload shapes per event type. */
export interface PstackEvent {
  type: PstackEventType;
  at: string;
  /** Optional correlation ID (runId, playbook, etc.) */
  meta?: Record<string, unknown>;
  /** Event-specific payload — always redacted + bounded. */
  payload?: Record<string, unknown>;
}

/** Listener callback. */
export type PstackEventListener = (event: PstackEvent) => void;

// ---------------------------------------------------------------------------
// In-memory subscriber list — process-scoped, resettable
// ---------------------------------------------------------------------------

let subscribers: PstackEventListener[] = [];

/** Register a listener. Returns an unsubscribe function. */
export function onPstackEvent(listener: PstackEventListener): () => void {
  subscribers.push(listener);
  return () => {
    subscribers = subscribers.filter((l) => l !== listener);
  };
}

/** Remove all subscribers (testing / teardown). */
export function resetEventSubscribers(): void {
  subscribers = [];
}

/** Emit an event to all subscribers. Errors are swallowed — never breaks callers. */
export function emitEvent(event: PstackEvent): void {
  try {
    const safe = redactEventPayload(event);
    for (const fn of subscribers) {
      try {
        fn(safe);
      } catch {
        // listener errors never propagate
      }
    }
  } catch {
    // redaction errors never propagate
  }
}

// ---------------------------------------------------------------------------
// Redaction — deep-copy + scrub sensitive keys/values + truncate strings
// Bounded: depth <= MAX_REDACT_DEPTH, collection <= MAX_COLLECTION_SIZE,
// cyclic refs replaced with [CYCLE].
// ---------------------------------------------------------------------------

const REDACT_KEY_RE = /(token|secret|password|authorization|api[_-]?key)/i;
const REDACT_VALUE_RE = /\b(ghp_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9]{10,}|sk_live_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{16,}|xox[bpasrs]-[A-Za-z0-9-]+)\b/g;

/** Scrub known secret token patterns from a single string (shared by overlays). */
export function redactSecrets(s: string): string {
  return s.replace(REDACT_VALUE_RE, "[REDACTED]");
}
const MAX_STRING_LEN = 500;
const MAX_REDACT_DEPTH = 4;
const MAX_COLLECTION_SIZE = 100;

/**
 * Deep-copy and redact a PstackEvent payload. Returns a clean clone.
 *
 * Bounds:
 *  - Max recursion depth: 4 (deeper values -> "[MAX_DEPTH]")
 *  - Max array/object entries: 100 (overflow -> truncated marker + first 100)
 *  - Cyclic object references: replaced with "[CYCLE]"
 *  - Max string length: 500
 */
export function redactEventPayload(event: PstackEvent): PstackEvent {
  const cloned: PstackEvent = {
    type: event.type,
    at: event.at,
  };
  if (event.meta) {
    const seen = new WeakSet<object>();
    cloned.meta = redactObject(event.meta, 0, seen);
  }
  if (event.payload) {
    const seen = new WeakSet<object>();
    cloned.payload = redactObject(event.payload, 0, seen);
  }
  return cloned;
}

function redactObject(obj: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  if (depth > MAX_REDACT_DEPTH) return { _truncated: "[MAX_DEPTH]" };
  if (seen.has(obj)) return { _cycle: "[CYCLE]" };
  seen.add(obj);
  const keys = Object.keys(obj);
  if (keys.length > MAX_COLLECTION_SIZE) {
    const out: Record<string, unknown> = { _truncated: `[truncated: ${keys.length}]` };
    for (const [k, v] of Object.entries(obj).slice(0, MAX_COLLECTION_SIZE)) {
      out[k] = REDACT_KEY_RE.test(k) ? "[REDACTED]" : redactValue(v, depth + 1, seen);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEY_RE.test(k) ? "[REDACTED]" : redactValue(v, depth + 1, seen);
  }
  return out;
}

/** Key-name patterns for argv redaction. When seen, the NEXT array element is redacted. */
const ARGV_SECRET_FLAGS = new Set([
  "--token", "--password", "--secret", "--api-key", "--authorization",
  "-t", "-p",
]);

/** Matches --flag=value or -fvalue where flag is a known secret flag */
const ARGV_SECRET_INLINE_RE =
  /^(--(?:token|password|secret|api-key|authorization))=.+|^(-[tp])\S+/i;

/** Redacts credential values in Authorization headers for any auth scheme. */
const AUTH_HEADER_RE = /(Authorization:\s*[A-Za-z]+)\s+(.+)/gi;

function redactValue(v: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object" && typeof v !== "function") {
    if (typeof v !== "string") return v;
    const authScrubbed = v.replace(AUTH_HEADER_RE, "$1 [REDACTED]");
    const scrubbed = authScrubbed.replace(REDACT_VALUE_RE, "[REDACTED]");
    return scrubbed.length > MAX_STRING_LEN ? scrubbed.slice(0, MAX_STRING_LEN) + "\u2026" : scrubbed;
  }
  if (Array.isArray(v)) {
    if (seen.has(v)) return "[CYCLE]";
    seen.add(v);
    if (v.length > MAX_COLLECTION_SIZE) {
      const redacted = v.slice(0, MAX_COLLECTION_SIZE).map((item, i, arr) => redactArrayItem(item, i, arr as readonly unknown[], depth + 1, seen));
      return redacted;
    }
    return v.map((item, i, arr) => redactArrayItem(item, i, arr as readonly unknown[], depth + 1, seen));
  }
  return redactObject(v as Record<string, unknown>, depth, seen);
}

function redactArrayItem(item: unknown, index: number, arr: readonly unknown[], depth: number, seen: WeakSet<object>): unknown {
  if (typeof item === "string") {
    // Inline: --flag=value or -fvalue
    if (ARGV_SECRET_INLINE_RE.test(item)) {
      return "[REDACTED]";
    }
    // Standalone: previous element is a secret flag
    if (index > 0) {
      const prev = arr[index - 1];
      if (typeof prev === "string" && ARGV_SECRET_FLAGS.has(prev)) {
        return "[REDACTED]";
      }
    }
  }
  return redactValue(item, depth, seen);
}
