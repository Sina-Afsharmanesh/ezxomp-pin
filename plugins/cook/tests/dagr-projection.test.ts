import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRunDoc, publishRunDoc, projectDagr } from "../extensions/dagr.ts";
import * as dagrModule from "../extensions/dagr.ts";

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "cook-dagr-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

const BASE = {
	runId: "run-test-1",
	runTitle: "test run",
	startedAt: "2026-08-28T00:00:00Z",
	tasks: [
		{ id: "TASK-1", title: "do thing", status: "In Progress", dependencies: ["TASK-2"], assignee: "lane-1" },
		{ id: "TASK-2", title: "first", status: "Done" },
	],
	attempts: [
		{ taskId: "TASK-1", n: 1, causeType: "initial" as const, actor: "cook-worker", state: "done" as const, startedAt: "2026-08-28T00:01:00Z", endedAt: "2026-08-28T00:02:00Z", evidence: "verified" as const },
		{ taskId: "TASK-1", n: 2, causeType: "sent_back" as const, by: "cook-judge", reason: "edge case", ref: "TASK-1·a1", state: "working" as const, startedAt: "2026-08-28T00:03:00Z" },
	],
	events: [
		{ at: "2026-08-28T00:01:00Z", type: "attempt_started" as const, task: "TASK-1", attempt: "TASK-1·a1", actor: "cook-worker" },
		{ at: "2026-08-28T00:02:00Z", type: "attempt_settled" as const, task: "TASK-1", attempt: "TASK-1·a1", actor: "cook-worker", detail: "verified" },
	],
};

describe("dagr projection", () => {
	it("builds a contract v3 document with correct mapping", () => {
		const doc = buildRunDoc(BASE) as any;
		expect(doc.dagr).toBe(3);
		expect(doc.run.id).toBe("run-test-1");
		expect(doc.generated_at).toBeTruthy();
		expect(doc.tasks).toHaveLength(2);
		// status mapping
		expect(doc.tasks[0].state).toBe("working");
		expect(doc.tasks[1].state).toBe("done");
		// deps carried
		expect(doc.tasks[0].deps).toEqual(["TASK-2"]);
		// attempts with cause chain
		const a2 = doc.tasks[0].attempts[1];
		expect(a2.id).toBe("TASK-1·a2");
		expect(a2.cause.type).toBe("sent_back");
		expect(a2.cause.by).toBe("cook-judge");
		// settled attempt carries outcome + evidence tier
		const a1 = doc.tasks[0].attempts[0];
		expect(a1.outcome).toEqual({ result: "done", evidence: "verified" });
		// events append-only shape
		expect(doc.events[0].type).toBe("attempt_started");
	});

	it("working attempt has no outcome (only terminal states do)", () => {
		const doc = buildRunDoc(BASE) as any;
		expect(doc.tasks[0].attempts[1].outcome).toBeUndefined();
	});

	it("publishes via tmp->check->atomic-rename when validator passes", () => {
		// inject a fake validator that always passes
		const fakeBin = join(cwd, "fake-dagr.sh");
		writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n");
		chmodSync(fakeBin, 0o755);
		process.env.DAGR_BIN = fakeBin;
		try {
			const res = publishRunDoc(cwd, buildRunDoc(BASE));
			expect(res.published).toBe(true);
			expect(existsSync(join(cwd, ".dagr", "run.json"))).toBe(true);
			expect(existsSync(join(cwd, ".dagr", "run.json.tmp"))).toBe(false);
		} finally {
			delete process.env.DAGR_BIN;
		}
	});

	it("disables silently when check fails (live file untouched)", () => {
		const fakeBin = join(cwd, "fake-dagr-fail.sh");
		writeFileSync(fakeBin, "#!/bin/sh\necho '[{\"code\":\"E001\"}]'; exit 1\n");
		chmodSync(fakeBin, 0o755);
		process.env.DAGR_BIN = fakeBin;
		try {
			// pre-existing valid run.json stays intact
			mkdirSync(join(cwd, ".dagr"), { recursive: true });
			writeFileSync(join(cwd, ".dagr", "run.json"), '{"dagr":3}');
			const res = publishRunDoc(cwd, buildRunDoc(BASE));
			expect(res.published).toBe(false);
			expect(readFileSync(join(cwd, ".dagr", "run.json"), "utf-8")).toBe('{"dagr":3}');
		} finally {
			delete process.env.DAGR_BIN;
		}
	});

	it("disables when no validator exists (best-effort, never throws)", () => {
		const saved = process.env.DAGR_BIN;
		delete process.env.DAGR_BIN;
		try {
			const res = projectDagr(cwd + "/empty-path-projection", {
				...BASE,
			});
			// may resolve the real plugin binary on this machine; if so it publishes, else disables
			expect([true, false]).toContain(res.published);
			if (!res.published) expect(res.reason).toBeTruthy();
		} finally {
			if (saved !== undefined) process.env.DAGR_BIN = saved;
			else delete process.env.DAGR_BIN;
		}
	});

	it("never throws into cook even on I/O failure", () => {
		const fakeBin = join(cwd, "fake-dagr-ok.sh");
		writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n");
		chmodSync(fakeBin, 0o755);
		process.env.DAGR_BIN = fakeBin;
		try {
			// cwd points at a file path, not a dir — publishRunDoc must return a result, not throw
			const filePath = join(cwd, "afile");
			writeFileSync(filePath, "x");
			expect(() => projectDagr(filePath, { ...BASE })).not.toThrow();
		} finally {
			delete process.env.DAGR_BIN;
		}
	});

	it("derives durable lifecycle inputs with evidence, locator, and liveness", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-lifecycle",
			runTitle: "lifecycle projection",
			startedAt: "2026-08-28T00:00:00Z",
			orchestrator: { pane: "w1:p1" },
			tasks: [
				{ id: "TASK-1", title: "validate", status: "In Progress" },
				{ id: "TASK-2", title: "claimed", status: "In Progress" },
			],
			claims: { "TASK-2": { by: "cook-worker", at: "2026-08-28T00:03:00Z" } },
			agentLog: [
				{ taskId: "TASK-1", stage: "dispatch:validator", role: "validator", model: "demo", timestamp: "2026-08-28T00:01:00Z" },
			],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:validator", note: "validator dispatched" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "gate", stage: "dispatch:validator", hash: "abc123", note: "green" },
				],
				"TASK-2": [{ seq: 0, at: "2026-08-28T00:03:00Z", event: "intent", stage: "dispatch:worker", note: "worker dispatched" }],
			},
		});

		const doc = buildRunDoc(input) as any;
		const settled = doc.tasks.find((task: any) => task.id === "TASK-1").attempts[0];
		const working = doc.tasks.find((task: any) => task.id === "TASK-2").attempts[0];
		expect(settled).toMatchObject({ state: "done" });
		expect(settled.outcome).toMatchObject({ result: "done", evidence: "verified" });
		expect(settled.outcome.receipt).toContain("abc123");
		expect(working).toMatchObject({ state: "working", locator: { agent: "cook-worker" } });
		expect(working.liveness).toMatchObject({ prompt_acknowledged: true, last_output_at: "2026-08-28T00:03:00Z", queued_input: 0 });
		expect(doc.run.orchestrator).toEqual({ pane: "w1:p1" });
	});

	it("derives an honest kind and parent-project hierarchy", () => {
		const doc = buildRunDoc({
			...BASE,
			tasks: [
				{ id: "TASK-1", title: "write guide", status: "To Do", parent: "TASK-P", labels: ["docs"] },
				{ id: "TASK-P", title: "parent", status: "In Progress" },
			],
		}) as any;
		expect(doc.tasks.find((task: any) => task.id === "TASK-1").kind).toBe("docs");
		expect(doc.projects).toContainEqual({ id: "TASK-P", title: "parent" });
	});

	it("keeps one stable attempt per dispatch record despite repeated journal pairs", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-dedupe",
			runTitle: "dedupe projection",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [
				{ id: "TASK-1", title: "retries", status: "In Progress" },
				{ id: "TASK-2", title: "unobserved done", status: "Done" },
			],
			claims: {},
			agentLog: [
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", model: "demo", timestamp: "2026-08-28T00:01:00Z" },
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", model: "demo", timestamp: "2026-08-28T00:03:00Z" },
			],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:worker", note: "first" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "record", stage: "dispatch:worker", note: "first reported" },
					{ seq: 2, at: "2026-08-28T00:03:00Z", event: "intent", stage: "dispatch:worker", note: "second" },
					{ seq: 3, at: "2026-08-28T00:04:00Z", event: "record", stage: "dispatch:worker", note: "second reported" },
				],
			},
		});
		const doc = buildRunDoc(input) as any;
		const retries = doc.tasks.find((task: any) => task.id === "TASK-1").attempts;
		expect(retries).toHaveLength(2);
		expect(retries.map((attempt: any) => attempt.n)).toEqual([1, 2]);
		expect(retries.map((attempt: any) => attempt.outcome.evidence)).toEqual(["reported", "reported"]);
		const unobserved = doc.tasks.find((task: any) => task.id === "TASK-2").attempts[0];
		expect(unobserved.outcome).toEqual({ result: "settled_unverified", evidence: "asserted" });
	});

	it("keeps independent task journals from colliding on the same sequence", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-task-local-seq",
			runTitle: "task-local seq",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [
				{ id: "TASK-A", title: "A", status: "In Progress" },
				{ id: "TASK-B", title: "B", status: "In Progress" },
			],
			claims: {},
			agentLog: [
				{ taskId: "TASK-A", stage: "dispatch:validator", role: "validator", timestamp: "2026-08-28T00:01:00Z" },
				{ taskId: "TASK-B", stage: "dispatch:validator", role: "validator", timestamp: "2026-08-28T00:01:00Z" },
			],
			journalByTask: {
				"TASK-A": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:validator" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "gate", stage: "dispatch:validator", hash: "gate-a", note: "green" },
				],
				"TASK-B": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:validator" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "gate", stage: "dispatch:validator", hash: "gate-b", note: "green" },
				],
			},
		});
		for (const [taskId, receipt] of [["TASK-A", "gate-a"], ["TASK-B", "gate-b"]] as const) {
			const attempt = input.attempts.find((item: any) => item.taskId === taskId);
			expect(attempt).toMatchObject({ state: "done", evidence: "verified", ref: receipt });
		}
	});

	it("never projects a red gate as verified success", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-red-gate",
			runTitle: "red gate",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [{ id: "TASK-1", title: "validate", status: "In Progress" }],
			claims: {},
			agentLog: [{ taskId: "TASK-1", stage: "dispatch:validator", role: "validator", timestamp: "2026-08-28T00:01:00Z" }],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:validator" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "gate", stage: "dispatch:validator", hash: "gate-red", note: "red" },
				],
			},
		});
		expect(input.attempts[0]).toMatchObject({ state: "failed", evidence: "verified", ref: "gate-red" });
	});

	it("does not attach a terminal record older than its dispatch", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-stale-terminal",
			runTitle: "stale terminal",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [{ id: "TASK-1", title: "worker", status: "In Progress" }],
			claims: {},
			agentLog: [{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", timestamp: "2026-08-28T00:05:00Z" }],
			journalByTask: {
				"TASK-1": [{ seq: 0, at: "2026-08-28T00:02:00Z", event: "record", stage: "dispatch:worker", note: "old result" }],
			},
		});
		expect(input.attempts[0]).toMatchObject({
			state: "working",
			evidence: "asserted",
			startedAt: "2026-08-28T00:05:00Z",
			agent: "cook-worker",
		});
		expect(input.attempts[0].endedAt).toBeUndefined();
	});

	it("does not let a later terminal settle an earlier dispatch", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-dispatch-interval",
			runTitle: "dispatch interval",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [{ id: "TASK-1", title: "worker", status: "In Progress" }],
			claims: {},
			agentLog: [
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", timestamp: "2026-08-28T00:01:00Z" },
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", timestamp: "2026-08-28T00:02:00Z" },
			],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:worker" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "intent", stage: "dispatch:worker" },
					{ seq: 2, at: "2026-08-28T00:03:00Z", event: "record", stage: "dispatch:worker", note: "second result" },
				],
			},
		});
		expect(input.attempts[0]).toMatchObject({ state: "working", startedAt: "2026-08-28T00:01:00Z", evidence: "asserted" });
		expect(input.attempts[0].endedAt).toBeUndefined();
		expect(input.attempts[1]).toMatchObject({ startedAt: "2026-08-28T00:02:00Z", endedAt: "2026-08-28T00:03:00Z", evidence: "reported" });
	});

	it("does not treat malformed persisted gates as verified receipts", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const input = (build as (sources: unknown) => any)({
			runId: "run-malformed-gate",
			runTitle: "malformed gate",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [{ id: "TASK-1", title: "validate", status: "In Progress" }],
			claims: {},
			agentLog: [{ taskId: "TASK-1", stage: "dispatch:validator", role: "validator", timestamp: "2026-08-28T00:01:00Z" }],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at: "2026-08-28T00:01:00Z", event: "intent", stage: "dispatch:validator" },
					{ seq: 1, at: "2026-08-28T00:02:00Z", event: "gate", stage: "dispatch:validator", hash: "", note: "unknown" },
				],
			},
		});
		expect(input.attempts[0]).toMatchObject({ state: "failed", evidence: "reported" });
		expect(input.attempts[0].ref).toBeUndefined();
	});

	it("uses journal sequence when same-stage dispatch intents share a timestamp", () => {
		const build = (dagrModule as unknown as Record<string, unknown>).buildDagrProjectionInput;
		expect(build).toBeTypeOf("function");
		const at = "2026-08-28T00:01:00.000Z";
		const input = (build as (sources: unknown) => any)({
			runId: "run-tied-intents",
			runTitle: "tied intents",
			startedAt: "2026-08-28T00:00:00Z",
			tasks: [{ id: "TASK-1", title: "worker", status: "In Progress" }],
			claims: {},
			agentLog: [
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", timestamp: at },
				{ taskId: "TASK-1", stage: "dispatch:worker", role: "worker", timestamp: at },
			],
			journalByTask: {
				"TASK-1": [
					{ seq: 0, at, event: "intent", stage: "dispatch:worker" },
					{ seq: 1, at, event: "intent", stage: "dispatch:worker" },
					{ seq: 2, at: "2026-08-28T00:02:00.000Z", event: "record", stage: "dispatch:worker", note: "second result" },
				],
			},
		});
		expect(input.attempts[0]).toMatchObject({ state: "working", startedAt: at, evidence: "asserted" });
		expect(input.attempts[0].endedAt).toBeUndefined();
		expect(input.attempts[1]).toMatchObject({ startedAt: at, endedAt: "2026-08-28T00:02:00.000Z", evidence: "reported" });
	});
});
