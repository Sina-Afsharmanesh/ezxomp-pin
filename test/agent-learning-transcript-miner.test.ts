import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { mkdir } from "node:fs/promises";
import { utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  digestPiSession,
  mineTranscripts,
  dedupTasks,
  harvestTranscripts,
  redactSecrets,
  type SessionDigest,
  type TaskRecord,
} from "../plugins/agent-learning/src/procedures/transcript/miner.ts";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures", "transcripts");

// Fixtures are already on disk in the sessions/ subdirectory
// (created earlier via bash; beforeAll just ensures directory exists)
beforeAll(async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
});

beforeEach(async () => {
  // no-op: fixtures persist across tests
});

// ─── 1. redactSecrets ────────────────────────────────────────────────
describe("redactSecrets", () => {
  it("redacts AWS Access Key ID pattern AKIA[0-9A-Z]{16}", () => {
    const input = "AKIAIOW4QCDFEXAMPLEKEY something";
    const result = redactSecrets(input);
    expect(result).not.toContain("AKIAIOW4QCDFEXAMPLEKEY");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts GitHub personal token ghp_[A-Za-z0-9]{36}", () => {
    const input =
      "My token is ghp_A1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8 and more";
    const result = redactSecrets(input);
    expect(result).not.toContain("ghp_A1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts Slack tokens xoxb-, xoxp-, xoxa-, xoxr-", () => {
    const input = "xoxb-1234567890 ABC and xoxa-1234567890ABC";
    const result = redactSecrets(input);
    expect(result).not.toMatch(/xox[bap][-/]/i);
  });

  it("redacts Bearer tokens", () => {
    const input = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const result = redactSecrets(input);
    expect(result).toContain("Bearer [REDACTED]");
  });

  it("redacts PEM blocks", () => {
    const input =
      "-----BEGIN CERTIFICATE----- MIIBpDCCAQw-----END CERTIFICATE-----";
    const result = redactSecrets(input);
    expect(result).not.toMatch(/-----BEGIN/);
    expect(result).not.toMatch(/-----END/);
  });

  it("redacts password=value", () => {
    const input = "password=supersecret123";
    const result = redactSecrets(input);
    expect(result).toContain("password=[REDACTED]");
  });

  it("redacts generic key=value with high-entropy value", () => {
    const input = "apiKey=AKIAIOW4QCDFEXAMPLE";
    const result = redactSecrets(input);
    expect(result).toContain("= [REDACTED]");
  });
});

// ─── 2. digestPiSession ──────────────────────────────────────────────
describe("digestPiSession", () => {
  it("parses a v1 session with session header and messages", async () => {
    const fp = join(FIXTURE_DIR, "sessions", "clean-success.jsonl");
    const digest = await digestPiSession(fp);
    expect(digest).not.toBeNull();
    expect(digest!.sessionId).toBe("session-001");
    expect(digest!.project).toBe("my-awesome-project");
    expect(digest!.nUserTurns).toBe(3);
    expect(digest!.nAssistantTurns).toBe(2);
    expect(digest!.feedbackSignals).toEqual(["pos"]);
  });

  it("processes v2 session with retry chain and negative feedback", async () => {
    const fp = join(FIXTURE_DIR, "sessions", "retry-negative.jsonl");
    const digest = await digestPiSession(fp);
    expect(digest).not.toBeNull();
    expect(digest!.sessionId).toBe("session-020");
    expect(digest!.nUserTurns).toBe(5);
    expect(digest!.feedbackSignals).toEqual(["fail"]);
  });

  it("rejects malformed v2 session wholly (dangling parentId)", async () => {
    const fp = join(FIXTURE_DIR, "sessions", "dangling.jsonl");
    const digest = await digestPiSession(fp);
    expect(digest).toBeNull();
  });
});

// ─── 3. mineTranscripts ──────────────────────────────────────────────
describe("mineTranscripts", () => {
  it("builds task records from v1 session digests", async () => {
    const fp = join(FIXTURE_DIR, "sessions", "clean-success.jsonl");
    const digest = await digestPiSession(fp);
    expect(digest).not.toBeNull();
    const records = mineTranscripts([digest!]);
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe("session-001");
    expect(records[0].project).toBe("my-awesome-project");
    expect(records[0].contextExcerpt).toBeDefined();
  });

  it("contextExcerpt is built from follow-up prompts", async () => {
    const fp = join(FIXTURE_DIR, "sessions", "clean-success.jsonl");
    const digest = await digestPiSession(fp);
    expect(digest).not.toBeNull();
    const records = mineTranscripts([digest!]);
    expect(records).toHaveLength(1);
    expect(records[0].contextExcerpt).toContain("Hello world");
  });
});

// ─── 4. dedupTasks ───────────────────────────────────────────────────
describe("dedupTasks", () => {
  it("removes duplicate tasks by sessionId", () => {
    const records = [
      { sessionId: "s1", project: "p1", contextExcerpt: "Hello", timestamp: 1 },
      { sessionId: "s1", project: "p1", contextExcerpt: "Hello", timestamp: 1 },
      { sessionId: "s2", project: "p1", contextExcerpt: "World", timestamp: 2 },
    ] as unknown as TaskRecord[];
    const deduped = dedupTasks(records);
    expect(deduped).toHaveLength(2);
  });
});

// ─── 5. harvestTranscripts ──────────────────────────────────────────
describe("harvestTranscripts", () => {
  beforeAll(() => {
    // Deterministic fixture mtimes (git checkout does not preserve them).
    const mtimes: Record<string, number> = {
      "dangling.jsonl": 1788700000,
      "malformed-v2.jsonl": 1788701000,
      "clean-success.jsonl": 1788702000,
      "secrets-test.jsonl": 1788703000,
      "iserror-test.jsonl": 1788703500,
      "retry-negative.jsonl": 1788704000,
    };
    for (const [name, secs] of Object.entries(mtimes)) {
      utimesSync(join(FIXTURE_DIR, "sessions", name), secs, secs);
    }
  });
  it("walks .jsonl files under sessions dir and returns digests", async () => {
    const digests = await harvestTranscripts({ root: FIXTURE_DIR });
    expect(digests).toHaveLength(5); // clean-success, malformed-v2, retry-negative, secrets-test, iserror-test
    const projects = digests.map((d) => d.project).sort();
    expect(projects).toEqual([
      "iserror-project",
      "malformed-v2",
      "my-awesome-project",
      "retry-negative",
      "secrets-test",
    ]);
  });

  it("respects limit option", async () => {
    const digests = await harvestTranscripts({ root: FIXTURE_DIR, limit: 2 });
    expect(digests).toHaveLength(2);
  });

  it("sorts by mtime descending (newest first)", async () => {
    const digests = await harvestTranscripts({ root: FIXTURE_DIR });
    expect(digests).toHaveLength(5);
    // Newest by mtime first (deterministic fixture mtimes, secs:
    // retry-negative 1788704000 > iserror-test 1788703500 > secrets-test 1788703000
    // > clean-success 1788702000 > malformed-v2 1788701000 > dangling 1788700000)
    expect(digests[0].project).toBe("retry-negative");
    expect(digests[1].project).toBe("iserror-project");
  });

  it("respects since filter", async () => {
    // Fixture mtimes (secs): dangling 1788700000 < malformed-v2 1788701000
    // < clean-success 1788702000 < secrets-test 1788703000 < iserror-test 1788703500
    // cut between clean-success (2000) and secrets-test (3000) excludes exactly
    // clean-success (its mtime 1788702000 < cut) → 4 digests remain.
    const cut = 1788702250000;
    const digests = await harvestTranscripts({ root: FIXTURE_DIR, since: cut });
    expect(digests).toHaveLength(3);
    const projects = digests.map((d) => d.project).sort();
    expect(projects).toEqual([
      "iserror-project",
      "retry-negative",
      "secrets-test",
    ]);
  });
});
