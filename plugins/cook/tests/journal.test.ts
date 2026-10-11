import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	appendIntent,
	appendRecord,
	appendGate,
	appendExternal,
	readJournal,
	findDanglingIntents,
	JOURNAL_DIR,
} from "../extensions/journal.ts";

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "cook-journal-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("cook journal", () => {
	it("appends entries with monotonic seq starting at 0", () => {
		const a = appendIntent(cwd, "TASK-1", "implement", "about to dispatch");
		const b = appendRecord(cwd, "TASK-1", "implement");
		expect(a.seq).toBe(0);
		expect(b.seq).toBe(1);
		const entries = readJournal(cwd, "TASK-1");
		expect(entries).toHaveLength(2);
		expect(entries[0].event).toBe("intent");
		expect(entries[1].event).toBe("record");
	});

	it("keeps seq monotonic under rapid successive appends", () => {
		for (let i = 0; i < 10; i++) {
			appendIntent(cwd, "TASK-2", "stage-" + i);
			appendRecord(cwd, "TASK-2", "stage-" + i);
		}
		const entries = readJournal(cwd, "TASK-2");
		expect(entries.map((e) => e.seq)).toEqual([...Array(20).keys()]);
	});

	it("isolates journals per task id", () => {
		appendIntent(cwd, "TASK-A", "plan");
		appendIntent(cwd, "TASK-B", "plan");
		expect(readJournal(cwd, "TASK-A")).toHaveLength(1);
		expect(readJournal(cwd, "TASK-B")).toHaveLength(1);
	});

	it("writes gate and external events", () => {
		appendGate(cwd, "TASK-3", "abc123", true);
		appendExternal(cwd, "TASK-3", "pr created");
		const entries = readJournal(cwd, "TASK-3");
		expect(entries[0].event).toBe("gate");
		expect(entries[0].hash).toBe("abc123");
		expect(entries[1].event).toBe("external");
	});

	it.each([
		"NOT JSON AT ALL",
		JSON.stringify({ nope: true }),
		JSON.stringify({ seq: 0, at: "2026-01-01T00:00:01Z", event: "record", stage: "plan" }),
		JSON.stringify({ seq: 2, at: "2026-01-01T00:00:01Z", event: "invented" }),
		"",
	])("rejects corrupt history without appending or dropping prior intent (%s)", (badLine) => {
		const p = join(cwd, JOURNAL_DIR, "TASK-4.jsonl");
		mkdirSync(join(cwd, JOURNAL_DIR), { recursive: true });
		const content = JSON.stringify({ seq: 0, at: "2026-01-01T00:00:00Z", event: "intent", stage: "plan" }) + "\n" + badLine + "\n";
		writeFileSync(p, content);
		expect(() => readJournal(cwd, "TASK-4")).toThrow("Invalid Cook journal");
		expect(() => appendRecord(cwd, "TASK-4", "plan")).toThrow("Invalid Cook journal");
		expect(readFileSync(p, "utf-8")).toBe(content);
	});

	it("rejects incomplete final records instead of silently accepting a truncated history", () => {
		appendIntent(cwd, "TASK-TORN", "implement");
		const p = join(cwd, JOURNAL_DIR, "TASK-TORN.jsonl");
		const content = readFileSync(p, "utf-8") + '{"seq":1';
		writeFileSync(p, content);
		expect(() => readJournal(cwd, "TASK-TORN")).toThrow("final line is incomplete");
		expect(() => appendRecord(cwd, "TASK-TORN", "implement")).toThrow("final line is incomplete");
		expect(readFileSync(p, "utf-8")).toBe(content);
	});

	it("rejects a zero-byte existing journal rather than restarting sequence", () => {
		mkdirSync(join(cwd, JOURNAL_DIR), { recursive: true });
		const path = join(cwd, JOURNAL_DIR, "TASK-EMPTY.jsonl");
		writeFileSync(path, "");
		expect(() => readJournal(cwd, "TASK-EMPTY")).toThrow("Invalid Cook journal");
		expect(() => appendIntent(cwd, "TASK-EMPTY", "implement")).toThrow("Invalid Cook journal");
		expect(readFileSync(path, "utf-8")).toBe("");
	});

	it("returns empty array when no journal exists", () => {
		expect(readJournal(cwd, "TASK-NOPE")).toEqual([]);
	});

	it("findDanglingIntents: intent without later record for same stage dangles", () => {
		const entries = readJournal(cwd, "TASK-5");
		// empty; build synthetic
		const synthetic = [
			{ seq: 0, at: "t0", event: "intent" as const, stage: "implement" },
			{ seq: 1, at: "t1", event: "record" as const, stage: "implement" },
			{ seq: 2, at: "t2", event: "intent" as const, stage: "review" },
		];
		const dangling = findDanglingIntents(synthetic);
		expect(dangling).toHaveLength(1);
		expect(dangling[0].stage).toBe("review");
	});

	it("findDanglingIntents: no dangling when every intent has a matching record", () => {
		const synthetic = [
			{ seq: 0, at: "t0", event: "intent" as const, stage: "plan" },
			{ seq: 1, at: "t1", event: "record" as const, stage: "plan" },
		];
		expect(findDanglingIntents(synthetic)).toHaveLength(0);
	});

	it("findDanglingIntents: a matching gate is also terminal", () => {
		const synthetic = [
			{ seq: 0, at: "t0", event: "intent" as const, stage: "verify" },
			{ seq: 1, at: "t1", event: "gate" as const, stage: "verify", hash: "receipt", note: "green" },
		];
		expect(findDanglingIntents(synthetic)).toHaveLength(0);
	});

	it("surfaces unreadable journal paths instead of resetting sequence", () => {
		mkdirSync(join(cwd, JOURNAL_DIR, "TASK-7.jsonl"), { recursive: true });
		expect(() => readJournal(cwd, "TASK-7")).toThrow("Cannot read Cook journal");
		expect(() => appendIntent(cwd, "TASK-7", "plan")).toThrow("Cannot read Cook journal");
	});
});
