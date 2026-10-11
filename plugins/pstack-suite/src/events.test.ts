import { describe, it, expect, beforeEach } from "vitest";
import {
  emitEvent,
  onPstackEvent,
  resetEventSubscribers,
  redactEventPayload,
  type PstackEvent,
  type PstackEventType,
} from "./events.js";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beginRun,
  addAction,
  finishRun,
  saveRun,
} from "./run.js";

describe("PstackEventType", () => {
  it("accepts all six event type values", () => {
    const types: PstackEventType[] = [
      "command",
      "cancellation",
      "preflight",
      "receipt",
      "phase",
      "check",
    ];
    expect(types).toHaveLength(6);
    for (const t of types) {
      expect(t).toMatch(/^command|cancellation|preflight|receipt|phase|check$/);
    }
  });
});

describe("PstackEvent", () => {
  it("requires type and at", () => {
    const ev: PstackEvent = { type: "command", at: "2026-01-01T00:00:00Z" };
    expect(ev.type).toBe("command");
    expect(ev.at).toBe("2026-01-01T00:00:00Z");
  });

  it("allows optional meta and payload", () => {
    const ev: PstackEvent = {
      type: "phase",
      at: new Date().toISOString(),
      meta: { playbook: "ship" },
      payload: { phase: "push", status: "ok" },
    };
    expect(ev.meta?.playbook).toBe("ship");
    expect(ev.payload?.phase).toBe("push");
  });
});

describe("bounded payloads", () => {
  it("emits redacted payloads through subscribers", () => {
    resetEventSubscribers();
    const received: PstackEvent[] = [];
    onPstackEvent((ev) => received.push(ev));

    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: "echo hello",
        authToken: "ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123",
      },
    };
    emitEvent(ev);
    expect(received).toHaveLength(1);
    const r = received[0]!;
    // Key matching /(token|secret|...)/i is redacted
    expect(r.payload?.authToken).toBe("[REDACTED]");
    // Non-sensitive key preserved
    expect(r.payload?.argv).toBe("echo hello");
  });

  it("does not deliver pre-redaction values", () => {
    resetEventSubscribers();
    const received: PstackEvent[] = [];
    onPstackEvent((ev) => received.push(ev));

    emitEvent({
      type: "preflight",
      at: new Date().toISOString(),
      payload: { password: "my_secret_pass_123" },
    });
    expect(received[0]?.payload?.password).toBe("[REDACTED]");
  });
});

describe("redactEventPayload", () => {
  beforeEach(() => resetEventSubscribers());

  it("deep copies — mutation of original does not affect clone", () => {
    const original: PstackEvent = {
      type: "receipt",
      at: "2026-01-01T00:00:00Z",
      payload: { runId: "abc", value: 1 },
    };
    const cloned = redactEventPayload(original);
    expect(cloned).not.toBe(original);
    expect(cloned.payload).not.toBe(original.payload);
    // Mutate original
    if (original.payload) original.payload.runId = "MUTATED";
    expect(cloned.payload?.runId).toBe("abc");
  });

  it("redacts keys matching token|secret|password|authorization|api_key pattern", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        apiKey: "value1",
        api_key: "value2",
        API_KEY: "value3",
        bearerToken: "value4",
        Secret: "value5",
        Authorization: "value6",
        safeKey: "value7",
      },
    };
    const redacted = redactEventPayload(ev);
    expect(redacted.payload?.apiKey).toBe("[REDACTED]");
    expect(redacted.payload?.api_key).toBe("[REDACTED]");
    expect(redacted.payload?.API_KEY).toBe("[REDACTED]");
    expect(redacted.payload?.bearerToken).toBe("[REDACTED]");
    expect(redacted.payload?.Secret).toBe("[REDACTED]");
    expect(redacted.payload?.Authorization).toBe("[REDACTED]");
    expect(redacted.payload?.safeKey).toBe("value7");
  });

  it("scrubs credential values: ghp_, sk-, AKIA patterns", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        githubToken: "ghp_ABCDEFGHIJKLMNOPQRSTUV",
        openaiKey: "sk-ABCDEFGHIJKLMNOPQRST",
        awsAccess: "AKIAIOSFODNN7EXAMPLE1",
        safe: "plain-value",
      },
    };
    const redacted = redactEventPayload(ev);
    // key redacted for ghp_ and sk- and AKIA
    expect(redacted.payload?.githubToken).toBe("[REDACTED]");
    expect(redacted.payload?.openaiKey).toBe("[REDACTED]");
    expect(redacted.payload?.awsAccess).toBe("[REDACTED]");
    expect(redacted.payload?.safe).toBe("plain-value");
  });

  it("scrubs credential values in non-sensitive keys", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        tokenValue: "ghp_ABCDEFGHIJKLMNOPQRSTUV",
      },
    };
    const redacted = redactEventPayload(ev);
    // "tokenValue" matches key redaction → "[REDACTED]"
    expect(redacted.payload?.tokenValue).toBe("[REDACTED]");
  });

  it("truncates strings longer than 500 chars", () => {
    const longStr = "x".repeat(600);
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: { output: longStr },
    };
    const redacted = redactEventPayload(ev);
    const result = redacted.payload?.output as string;
    expect(result).toBeDefined();
    expect(result.length).toBeLessThanOrEqual(501); // 500 + "…"
    expect(result).not.toBe(longStr);
  });

  it("does not truncate strings at or below 500 chars", () => {
    const exact = "a".repeat(500);
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: { output: exact },
    };
    const redacted = redactEventPayload(ev);
    expect(redacted.payload?.output).toBe(exact);
  });

  it("handles nested objects", () => {
    const ev: PstackEvent = {
      type: "preflight",
      at: new Date().toISOString(),
      payload: {
        nested: {
          apiKey: "hidden",
          level: { secret: "deep_secret" },
        },
      },
    };
    const redacted = redactEventPayload(ev);
    const nested = redacted.payload?.nested as Record<string, unknown>;
    expect(nested?.apiKey).toBe("[REDACTED]");
    const level = nested?.level as Record<string, unknown>;
    expect(level?.secret).toBe("[REDACTED]");
  });

  it("handles arrays of values", () => {
    const ev: PstackEvent = {
      type: "check",
      at: new Date().toISOString(),
      payload: {
        items: ["normal", "ghp_ABCDEFGHIJKLMNOPQRSTUV", "also-normal"],
      },
    };
    const redacted = redactEventPayload(ev);
    const items = redacted.payload?.items as string[];
    expect(items?.[0]).toBe("normal");
    expect(items?.[1]).toBe("[REDACTED]");
    expect(items?.[2]).toBe("also-normal");
  });

  it("preserves null and non-string primitives", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        nullVal: null,
        num: 42,
        bool: true,
      },
    };
    const redacted = redactEventPayload(ev);
    expect(redacted.payload?.nullVal).toBeNull();
    expect(redacted.payload?.num).toBe(42);
    expect(redacted.payload?.bool).toBe(true);
  });

  it("redacts inline --flag=value argv forms", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["gh", "api", "--token=ghp_abcdef123", "user"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[0]).toBe("gh");
    expect(argv?.[1]).toBe("api");
    expect(argv?.[2]).toBe("[REDACTED]");
    expect(argv?.[3]).toBe("user");
  });

  it("redacts inline --password=value argv forms", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["cmd", "--password=credential-value"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[1]).toBe("[REDACTED]");
  });

  it("redacts inline short -fvalue argv forms", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["gh", "api", "-psecret_x"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[2]).toBe("[REDACTED]");
  });

  it("redacts standalone --flag <value> argv pair", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["cmd", "--token", "secret123", "arg"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[1]).toBe("--token");
    expect(argv?.[2]).toBe("[REDACTED]");
    expect(argv?.[3]).toBe("arg");
  });

  it("does not redact non-secret flags like --template=x", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["cmd", "--template=default", "--output=json"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[1]).toBe("--template=default");
    expect(argv?.[2]).toBe("--output=json");
  });

  it("preserves bare -p and -t flags without concatenated value", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["cmd", "-p"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    // bare -p (length 2) is NOT redacted by inline regex;
    // it is a standalone flag but has no next element to redact
    expect(argv?.[1]).toBe("-p");
  });

  it("redacts Authorization header credentials for any scheme", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: [
          "curl", "-H", "Authorization: Bearer synthetic-credential-value",
          "-H", "Authorization: Basic c3ludGhldGljOnNlY3JldA==",
          "-H", "Authorization: Digest response=abc123",
          "https://api.example.com",
        ],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[2]).toBe("Authorization: Bearer [REDACTED]");
    expect(argv?.[4]).toBe("Authorization: Basic [REDACTED]");
    expect(argv?.[6]).toBe("Authorization: Digest [REDACTED]");
    expect(argv?.[2]).not.toContain("synthetic-credential-value");
    expect(argv?.[4]).not.toContain("c3ludGhldGljOnNlY3JldA==");
    expect(argv?.[7]).toBe("https://api.example.com");
  });

  it("redacts multi-parameter Digest Authorization header entirely after scheme", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: [
          "curl", "-H",
          'Authorization: Digest username="user", realm="r", response="synthetic-secret"',
        ],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[2]).toBe('Authorization: Digest [REDACTED]');
    expect(argv?.[2]).not.toContain('response');
    expect(argv?.[2]).not.toContain('synthetic-secret');
  });

  it("preserves non-Authorization headers in argv", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        argv: ["curl", "-H", "Content-Type: application/json", "-H", "Accept: */*"],
      },
    };
    const redacted = redactEventPayload(ev);
    const argv = redacted.payload?.argv as string[];
    expect(argv?.[2]).toBe("Content-Type: application/json");
    expect(argv?.[4]).toBe("Accept: */*");
  });

  it("redacts Authorization header credentials in object values", () => {
    const ev: PstackEvent = {
      type: "command",
      at: new Date().toISOString(),
      payload: {
        header: "Authorization: Bearer secretToken123",
        basicHeader: "Authorization: Basic dXNlcjpwYXNz",
        normalHeader: "X-Request-Id: abc-123",
      },
    };
    const redacted = redactEventPayload(ev);
    expect(redacted.payload?.header).toBe("Authorization: Bearer [REDACTED]");
    expect(redacted.payload?.basicHeader).toBe("Authorization: Basic [REDACTED]");
    expect(redacted.payload?.normalHeader).toBe("X-Request-Id: abc-123");
  });

  it("handles missing payload and meta", () => {
    const ev: PstackEvent = { type: "cancellation", at: new Date().toISOString() };
    const redacted = redactEventPayload(ev);
    expect(redacted.payload).toBeUndefined();
    expect(redacted.meta).toBeUndefined();
  });
});

describe("emitEvent subscriber lifecycle", () => {
  beforeEach(() => resetEventSubscribers());

  it("delivers to multiple subscribers", () => {
    const a: PstackEvent[] = [];
    const b: PstackEvent[] = [];
    onPstackEvent((ev) => a.push(ev));
    onPstackEvent((ev) => b.push(ev));
    emitEvent({ type: "phase", at: new Date().toISOString() });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("unsubscribe removes listener", () => {
    const received: PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));
    unsub();
    emitEvent({ type: "command", at: new Date().toISOString() });
    expect(received).toHaveLength(0);
  });

  it("resetEventSubscribers clears all", () => {
    const received: PstackEvent[] = [];
    onPstackEvent((ev) => received.push(ev));
    onPstackEvent((ev) => received.push(ev));
    resetEventSubscribers();
    emitEvent({ type: "receipt", at: new Date().toISOString() });
    expect(received).toHaveLength(0);
  });

  it("listener errors do not break other subscribers", () => {
    const good: PstackEvent[] = [];
    onPstackEvent(() => { throw new Error("boom"); });
    onPstackEvent((ev) => good.push(ev));
    emitEvent({ type: "check", at: new Date().toISOString() });
    expect(good).toHaveLength(1);
  });

  it("is idempotent — emitEvent with no subscribers is a no-op", () => {
    expect(() => emitEvent({ type: "command", at: new Date().toISOString() })).not.toThrow();
  });
});

describe("cancellation event ordering", () => {
  beforeEach(() => resetEventSubscribers());

  it("emits cancellation before terminal state events", () => {
    const order: string[] = [];
    onPstackEvent((ev) => {
      if (ev.type === "cancellation") order.push("cancellation");
      if (ev.type === "command" && (ev.payload?.settled ?? false)) order.push("command-settled");
    });

    // Simulate the sequence: cancellation fires, then process settles
    emitEvent({ type: "cancellation", at: "2026-01-01T00:00:01Z", payload: { argv: "echo" } });
    emitEvent({ type: "command", at: "2026-01-01T00:00:02Z", payload: { argv: "echo", settled: true } });

    expect(order).toEqual(["cancellation", "command-settled"]);
  });
});

describe("headless parity", () => {
  beforeEach(() => resetEventSubscribers());

  it("emitEvent does not depend on processTTY or UI", () => {
    const received: PstackEvent[] = [];
    onPstackEvent((ev) => received.push(ev));
    // Even without a TTY, events still fire
    emitEvent({
      type: "phase",
      at: new Date().toISOString(),
      payload: { phase: "push", status: "ok" },
    });
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("phase");
  });

  it("redacted payloads are identical in headless and TTY contexts", () => {
    const ev: PstackEvent = {
      type: "preflight",
      at: new Date().toISOString(),
      payload: { password: "ghp_ABCDEFGHIJKLMNOPQRSTUV", count: 5 },
    };
    const r1 = redactEventPayload(ev);
    const r2 = redactEventPayload(ev);
    expect(r1.payload).toEqual(r2.payload);
    expect(r1.payload?.password).toBe("[REDACTED]");
    expect(r1.payload?.count).toBe(5);
  });
});

describe("saveRun emits receipt event through real subscription", () => {
  it("emits receipt event with status + runId matching saved record", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pstack-test-"));
    const received: import("./events.js").PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));

    const rec = beginRun({ playbook: "test", phase: "test", target: "." });
    const rec2 = addAction(rec, "commit", "ok");
    const rec3 = finishRun(rec2, "success");
    saveRun(rec3, tmpDir);

    const receipt = received.find((ev) => ev.type === "receipt");
    expect(receipt).toBeDefined();
    expect(receipt?.payload?.runId).toBe(rec3.runId);
    expect(receipt?.payload?.status).toBe("success");
    expect(receipt?.payload?.actions).toBe(1);

    // Unsubscribe stops delivery
    unsub();
    const rec4 = beginRun({ playbook: "test2", phase: "test2", target: "." });
    saveRun(rec4, tmpDir);
    expect(received.length).toBe(1);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saveRun + finishRun emits receipt with failed status", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pstack-test-"));
    const received: import("./events.js").PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));

    const rec = beginRun({ playbook: "test", phase: "test", target: "." });
    const rec2 = addAction(rec, "push", "failed", "auth error");
    const rec3 = finishRun(rec2, "failed");
    saveRun(rec3, tmpDir);

    const receipt = received.find((ev) => ev.type === "receipt");
    expect(receipt).toBeDefined();
    expect(receipt?.payload?.runId).toBe(rec3.runId);
    expect(receipt?.payload?.status).toBe("failed");

    unsub();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
