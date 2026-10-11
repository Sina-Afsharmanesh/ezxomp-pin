import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import makePi, { __getToolHandler, __resetHandlers, makeCtx, type CtxStub } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext, defaultCookState } from "../extensions/state.ts";
import { appendIntent, appendRecord } from "../extensions/journal.ts";

let workDir: string;

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-reliability-"));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function setup() {
	const pi = makePi();
	const sc = createStoreContext(pi);
	registerCookTools(pi, sc);
	const ctx = makeCtx({ cwd: workDir });
	return { pi, sc, ctx };
}

async function invoke(tool: string, params: Record<string, unknown>, ctx: CtxStub) {
	return __getToolHandler(tool).execute("test", params, {} as AbortSignal, null, ctx) as Promise<{
		isError?: boolean;
		content: Array<{ text: string }>;
	}>;
}

describe("cook orchestration reliability", () => {
	it("does not start a workflow for an unreadable task or failed status mutation", async () => {
		const { pi, sc, ctx } = setup();
		pi.exec = vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "missing" });
		const missing = await invoke("cook_start", { task_id: "TASK-X", chain_name: "implement" }, ctx);
		expect(missing.isError).toBe(true);
		expect(sc.getStoreFor(workDir).chainName).toBeFalsy();

		pi.exec = vi.fn()
			.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ task: { id: "TASK-X", title: "X" } }), stderr: "" })
			.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "status denied" });
		const denied = await invoke("cook_start", { task_id: "TASK-X", chain_name: "implement" }, ctx);
		expect(denied.isError).toBe(true);
		expect(denied.content[0]?.text).toContain("status denied");
		expect(sc.getStoreFor(workDir).chainName).toBeFalsy();
	});

	it("rejects stage advancement until a durable result exists", async () => {
		const { sc, ctx } = setup();
		const state = defaultCookState();
		sc.setStoreFor(workDir, {
			...state,
			chain: ["implement", "review"],
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});

		const blocked = await invoke("cook_advance", {}, ctx);
		expect(blocked.isError).toBe(true);
		expect(blocked.content[0]?.text).toContain("no durable completion record");
		expect(sc.getStoreFor(workDir).currentStage).toBe(0);

		const recorded = await invoke("cook_record_result", {
			task_id: "TASK-1",
			stage: "implement",
			outcome: "success",
			evidence: "verified",
			receipt: "worker-envelope",
		}, ctx);
		expect(recorded.isError).toBeUndefined();
		expect((await invoke("cook_advance", {}, ctx)).isError).toBeUndefined();
		expect(sc.getStoreFor(workDir).currentStage).toBe(1);
	});

	it("requires every parallel judge dispatch to succeed before advancing", async () => {
		const { sc, ctx } = setup();
		const first = appendIntent(workDir, "TASK-1", "dispatch:judge:1", "dispatch");
		const second = appendIntent(workDir, "TASK-1", "dispatch:judge:2", "dispatch");
		appendRecord(workDir, "TASK-1", "dispatch:judge:1", JSON.stringify({ outcome: "failed", receipt: "judge-a" }));
		appendRecord(workDir, "TASK-1", "dispatch:judge:2", JSON.stringify({ outcome: "success", receipt: "judge-b" }));
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["review", "plan"],
			currentStage: 0,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			agentLog: [
				{ taskId: "TASK-1", stage: "dispatch:judge:1", role: "judge", model: "test", timestamp: first.at },
				{ taskId: "TASK-1", stage: "dispatch:judge:2", role: "judge", model: "test", timestamp: second.at },
			],
		});
		const result = await invoke("cook_advance", {}, ctx);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("dispatch:judge:1");
		expect(sc.getStoreFor(workDir).currentStage).toBe(0);
	});

	it("does not advance past a red gate or persist an invalid recovery route", async () => {
		const { sc, ctx } = setup();
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["verify", "review"],
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});
		expect((await invoke("cook_journal", {
			task_id: "TASK-1",
			event: "gate",
			stage: "verify",
			hash: "red-receipt",
			green: false,
		}, ctx)).isError).toBeUndefined();
		const redAdvance = await invoke("cook_advance", {}, ctx);
		expect(redAdvance.isError).toBe(true);
		expect(redAdvance.content[0]?.text).toContain("red gate");

		sc.setStoreFor(workDir, {
			...sc.getStoreFor(workDir),
			chain: ["implement", "review"],
			currentStage: 0,
		});
		const invalid = await invoke("cook_record_result", {
			task_id: "TASK-2",
			stage: "implement",
			outcome: "failed",
			evidence: "verified",
			receipt: "worker-failed",
			finding: { source: "validator", file: "x.ts", line: 1, what: "failed", kickTo: "missing" },
		}, ctx);
		expect(invalid.isError).toBe(true);
		expect(invalid.content[0]?.text).toContain("finding must contain a valid");
		const stillBlocked = await invoke("cook_advance", {}, ctx);
		expect(stillBlocked.isError).toBe(true);
		expect(stillBlocked.content[0]?.text).toContain("no durable completion record");
	});

	it("reports partial decomposition without claiming full in-memory success", async () => {
		const { pi, sc, ctx } = setup();
		pi.exec = vi.fn()
			.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ tasks: [{ id: "TASK-1", title: "Parent", status: "In Progress", dependencies: [] }] }), stderr: "" })
			.mockResolvedValueOnce({ code: 0, stdout: "Created task TASK-1.1\n", stderr: "" })
			.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "disk full" });

		const result = await invoke("cook_decompose", {
			parent_task_id: "TASK-1",
			subtasks: [{ title: "First" }, { title: "Second" }],
		}, ctx);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("created: TASK-1.1");
		expect(result.content[0]?.text).toContain("disk full");
		expect(sc.getStoreFor(workDir).taskIds).not.toContain("TASK-1.1");
	});

	it("rejects unknown decomposition dependencies before creating children", async () => {
		const { pi, ctx } = setup();
		pi.exec = vi.fn().mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [{ id: "TASK-1", title: "Parent", status: "In Progress", dependencies: [] }] }),
			stderr: "",
		});
		const result = await invoke("cook_decompose", {
			parent_task_id: "TASK-1",
			subtasks: [{ title: "Child", depends_on: ["TASK-404"] }],
		}, ctx);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("unknown dependency");
		expect(pi.exec).toHaveBeenCalledTimes(1);
	});

	it("rejects claims whose dependencies are missing or unfinished", async () => {
		const { pi, sc, ctx } = setup();
		pi.exec = vi.fn().mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				tasks: [
					{ id: "TASK-2", title: "Child", status: "To Do", dependencies: ["TASK-1"] },
					{ id: "TASK-1", title: "Dependency", status: "In Progress", dependencies: [] },
				],
			}),
			stderr: "",
		});
		const result = await invoke("cook_claim", { task_id: "TASK-2", by: "lane-a" }, ctx);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("non-terminal");
		expect(sc.getStoreFor(workDir).claims).toEqual({});
		expect(pi.exec).toHaveBeenCalledTimes(1);
	});

	it("rejects a null finding before journal or state mutation", async () => {
		const { sc, ctx } = setup();
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});
		const before = sc.getStoreFor(workDir);
		const result = await invoke("cook_record_result", {
			task_id: "TASK-1",
			stage: "review",
			outcome: "failed",
			evidence: "verified",
			receipt: "bad",
			finding: null,
		}, ctx);
		expect(result.isError).toBe(true);
		expect(sc.getStoreFor(workDir)).toEqual(before);
	});

	it("records failed judge results as typed recovery state", async () => {
		const { sc, ctx } = setup();
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});
		const result = await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "review", outcome: "failed",
			evidence: "verified", receipt: "judge-failed",
			finding: { source: "judge", file: "src/a.ts", line: 4, what: "broken", kickTo: "implement" },
		}, ctx);
		expect(result.isError).toBeUndefined();
		const state = sc.getStoreFor(workDir);
		expect(state.reviewCycles["TASK-1"]).toBe(1);
		expect(state.lastFindings["TASK-1"]).toEqual([
			{ source: "judge", file: "src/a.ts", line: 4, what: "broken", kickTo: "implement" },
		]);
		expect(state.convergence["TASK-1"]?.judge).toEqual({ cycles: 1 });
		expect(state.currentStage).toBe(0);
	});

	it("records validator failures and routes to their declared recovery stage", async () => {
		const { sc, ctx } = setup();
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "verify", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "verify", outcome: "failed",
			evidence: "verified", receipt: "validator-failed",
			finding: { source: "validator", file: "src/b.ts", line: 8, what: "missing", kickTo: "implement" },
		}, ctx);
		const state = sc.getStoreFor(workDir);
		expect(state.reviewCycles["TASK-1"]).toBe(1);
		expect(state.convergence["TASK-1"]?.validator).toEqual({ cycles: 1 });
		expect(state.currentStage).toBe(0);
	});

	it("retains sibling findings during a scoped judge repair", async () => {
		const { sc, ctx } = setup();
		const prior = { source: "validator" as const, file: "src/b.ts", line: 2, what: "sibling", kickTo: "implement" as const };
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			lastFindings: { "TASK-1": [prior] },
		});
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "review", outcome: "failed",
			evidence: "verified", receipt: "judge-failed",
			finding: { source: "judge", file: "src/a.ts", line: 4, what: "new", kickTo: "implement" },
		}, ctx);
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "implement", outcome: "success",
			evidence: "verified", receipt: "worker-fixed",
			modified_files: ["src/a.ts"],
		}, ctx);
		expect(sc.getStoreFor(workDir).lastFindings["TASK-1"]).toEqual([
			prior,
			{ source: "judge", file: "src/a.ts", line: 4, what: "new", kickTo: "implement" },
		]);
	});

	it("fails closed to a full repair without confined modified-file evidence", async () => {
		const { sc, ctx } = setup();
		const prior = { source: "validator" as const, file: "src/b.ts", line: 2, what: "sibling", kickTo: "implement" as const };
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			lastFindings: { "TASK-1": [prior] },
		});
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "review", outcome: "failed",
			evidence: "verified", receipt: "judge-failed",
			finding: { source: "judge", file: "src/a.ts", line: 4, what: "new", kickTo: "implement" },
		}, ctx);
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "implement", outcome: "success",
			evidence: "verified", receipt: "worker-fixed",
			modified_files: ["src/out-of-scope.ts"],
		}, ctx);
		expect(sc.getStoreFor(workDir).lastFindings["TASK-1"]).toEqual([
			{ source: "judge", file: "src/a.ts", line: 4, what: "new", kickTo: "implement" },
		]);
	});

	it("does not accept a sibling file as proof of the latest repair", async () => {
		const { sc, ctx } = setup();
		const sibling = { source: "validator" as const, file: "src/b.ts", line: 2, what: "sibling", kickTo: "implement" as const };
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			lastFindings: { "TASK-1": [sibling] },
		});
		await invoke("cook_record_result", {
			task_id: "task-1", stage: "review", outcome: "failed",
			evidence: "verified", receipt: "judge-failed",
			finding: { source: "judge", file: "src/a.ts", line: 4, what: "latest", kickTo: "implement" },
		}, ctx);
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "implement", outcome: "success",
			evidence: "verified", receipt: "worker-touched-sibling",
			modified_files: ["src/b.ts"],
		}, ctx);
		expect(sc.getStoreFor(workDir).lastFindings["TASK-1"]).toEqual([
			{ source: "judge", file: "src/a.ts", line: 4, what: "latest", kickTo: "implement" },
		]);
		expect(sc.getStoreFor(workDir).lastFindings["task-1"]).toBeUndefined();
	});

	it("records audit findings through the typed result path", async () => {
		const { sc, ctx } = setup();
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "audit"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		});
		const result = await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "audit", outcome: "failed",
			evidence: "verified", receipt: "audit-failed",
			finding: { source: "audit", file: "src/a.ts", line: 7, what: "unsafe", kickTo: "implement" },
		}, ctx);
		expect(result.isError).toBeUndefined();
		expect(sc.getStoreFor(workDir).lastFindings["TASK-1"]?.[0]?.source).toBe("audit");
		expect(sc.getStoreFor(workDir).currentStage).toBe(0);
	});

	it("grants one shrinking confined bonus cycle at the cap", async () => {
		const { sc, ctx } = setup();
		const oldFindings = [
			{ source: "judge" as const, file: "src/a.ts", line: 1, what: "a", kickTo: "implement" as const },
			{ source: "judge" as const, file: "src/b.ts", line: 2, what: "b", kickTo: "implement" as const },
		];
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			reviewCycles: { "TASK-1": 3 },
			lastFindings: { "TASK-1": oldFindings },
		});
		await invoke("cook_record_result", {
			task_id: "TASK-1", stage: "review", outcome: "failed",
			evidence: "verified", receipt: "judge-failed",
			finding: { source: "judge", file: "src/a.ts", line: 1, what: "remaining", kickTo: "implement" },
		}, ctx);
		const state = sc.getStoreFor(workDir);
		expect(state.reviewCycles["TASK-1"]).toBe(4);
		expect(state.convergence["TASK-1"]?.judge).toEqual({ cycles: 1, bonusGranted: true });
	});

	it("persists and completes the full council episode", async () => {
		const { sc, ctx } = setup();
		const finding = { source: "judge" as const, file: "src/a.ts", line: 1, what: "stuck", kickTo: "implement" as const };
		sc.setStoreFor(workDir, {
			...defaultCookState(),
			chain: ["plan", "implement", "verify", "review"],
			currentStage: 3,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			councilEpisodes: { "TASK-1": { status: "pending", finding } },
		});

		const inquiry = await invoke("cook_dispatch_council", { task_id: "TASK-1" }, ctx);
		expect(inquiry.isError, inquiry.content[0]?.text).toBeUndefined();
		expect(inquiry.content[0]?.text).toContain("PARALLEL COUNCIL BATCH");
		expect(sc.getStoreFor(workDir).councilEpisodes["TASK-1"]?.status).toBe("inquiries-dispatched");

		const synthesis = await invoke("cook_dispatch_council_synthesis", {
			task_id: "TASK-1",
			votes: ["integrity vote", "security vote", "pragmatist vote"],
		}, ctx);
		expect(synthesis.isError).toBeUndefined();
		expect(sc.getStoreFor(workDir).councilEpisodes["TASK-1"]?.status).toBe("synthesis-dispatched");

		const recorded = await invoke("cook_record_council", {
			task_id: "TASK-1",
			route: "implement",
			receipt: "synthesis-envelope",
		}, ctx);
		expect(recorded.isError).toBeUndefined();
		expect(sc.getStoreFor(workDir).councilEpisodes["TASK-1"]?.status).toBe("completed");
		expect(sc.getStoreFor(workDir).currentStage).toBe(1);
	});
});
