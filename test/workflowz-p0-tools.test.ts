import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerP0Tools } from "../plugins/extensible-workflows/src/p0-tools.ts";
import { createRun, readRunEvents, reconstructCheckpointsFromBranch } from "../plugins/extensible-workflows/src/runtime.ts";

type RegisteredTool = {
	name: string;
	execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, update: unknown, ctx: Record<string, unknown>) => Promise<{ details: unknown; isError?: true }>;
};

function toolProbe(): { tools: Map<string, RegisteredTool>; entries: Array<{ type: string; data: unknown }>; api: unknown } {
	const tools = new Map<string, RegisteredTool>();
	const entries: Array<{ type: string; data: unknown }> = [];
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		tools,
		entries,
		api: {
			zod: schema,
			exec: async () => ({ code: 0, stdout: "", stderr: "" }),
			appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
			registerTool: (spec: RegisteredTool) => tools.set(spec.name, spec),
		},
	};
}

function context(cwd: string, hasUI = false): Record<string, unknown> {
	return {
		cwd,
		hasUI,
		ui: { confirm: async () => { throw new Error("headless checkpoints must not prompt"); } },
	};
}

describe("workflowz P0 tools", () => {
	test("refuses a selected worktree without an isolation name", async () => {
		const { api, tools } = toolProbe();
		registerP0Tools(api as never);
		const result = await tools.get("omp_workflow_worktree")!.execute("worktree", { action: "resolve", selected: true }, undefined, undefined, context("/tmp"));
		expect(result).toMatchObject({ isError: true, details: { code: "WORKFLOW_WORKTREE_NAME_REQUIRED" } });
	});

	test("enforces headless checkpoint policy and journals both outcomes", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-tools-"));
		const runId = createRun(cwd, "release", {});
		const { api, entries, tools } = toolProbe();
		registerP0Tools(api as never);
		const checkpoint = tools.get("omp_workflow_checkpoint")!;
		try {
			const rejected = await checkpoint.execute("checkpoint", { runId, prompt: "Approve?", auto: false }, undefined, undefined, context(cwd));
			expect(rejected).toMatchObject({ isError: true, details: { approved: false, status: "rejected" } });
			const omittedAuto = await checkpoint.execute("checkpoint", { runId, prompt: "Approve?" }, undefined, undefined, context(cwd));
			expect(omittedAuto).toMatchObject({ isError: true, details: { approved: false, status: "rejected" } });
			const approved = await checkpoint.execute("checkpoint", { runId, prompt: "Approve?", auto: true }, undefined, undefined, context(cwd));
			expect(approved).toMatchObject({ details: { approved: true, status: "approved" } });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "checkpoint")).toMatchObject([
				{ status: "rejected", policy: "headless-requires-auto" },
				{ status: "rejected", policy: "headless-requires-auto" },
				{ status: "approved", policy: "auto" },
			]);
			expect(entries).toMatchObject([
				{ type: "ezxomp.workflowz.checkpoint", data: { status: "rejected" } },
				{ type: "ezxomp.workflowz.checkpoint", data: { status: "rejected" } },
				{ type: "ezxomp.workflowz.checkpoint", data: { status: "approved" } },
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("threads LLM evidence and journals budget GateReports", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-tools-"));
		const runId = createRun(cwd, "release", {});
		const { api, tools } = toolProbe();
		registerP0Tools(api as never);
		const gate = tools.get("omp_workflow_gate")!;
		const evidence = { schema: { verdict: "pass" }, explanation: "review evidence" };
		try {
			const llm = await gate.execute("llm", {
				runId,
				workflow: "release",
				stageId: "review",
				gate: { id: "review", type: "llm", prompt: "Review" },
				inputs: {},
				results: {},
				evidence,
			}, undefined, undefined, context(cwd));
			expect(llm).toMatchObject({ details: { gate: "review", advisory: true, evidence } });
			const budget = await gate.execute("budget", {
				runId,
				workflow: "release",
				stageId: "verify",
				gate: { id: "budget", type: "budget", threshold: 10 },
				inputs: {},
				results: {},
			}, undefined, undefined, context(cwd));
			expect(budget).toMatchObject({ details: { gate: "budget", checks: [{ item: "budget" }] } });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "gate")).toMatchObject([
				{ gateId: "review", report: { evidence } },
				{ gateId: "budget", report: { gate: "budget", checks: [{ item: "budget" }] } },
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("workflowz final AC closure tools (TASK-15.2 cycle 3)", () => {
	test("AC16: checkpoint approval appends a namespaced session entry with route/journal/artifact refs reconstructible from a branch", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac16-"));
		try {
			const runId = createRun(cwd, "release", {});
			const { api, entries, tools } = toolProbe();
			registerP0Tools(api as never);
			const checkpoint = tools.get("omp_workflow_checkpoint")!;
			const approved = await checkpoint.execute("c1", {
				runId,
				prompt: "Approve release?",
				auto: true,
				routeRef: "route://preview-1",
				artifactRefs: ["artifact://7"],
			}, undefined, undefined, context(cwd));
			expect(approved).toMatchObject({ details: { approved: true } });
			// Session entry carries the full reference set; journalRef always resolves.
			expect(entries).toHaveLength(1);
			const entry = entries[0]! as { type: string; data: Record<string, unknown> };
			expect(entry.type).toBe("ezxomp.workflowz.checkpoint");
			expect(entry.data).toMatchObject({ runId, status: "approved", routeRef: "route://preview-1", artifactRefs: ["artifact://7"] });
			expect(typeof entry.data.journalRef).toBe("string");
			expect(String(entry.data.journalRef)).toContain(runId.slice(0, 8));
			// Reconstruction from sessionManager.getBranch() returns the latest state per run.
			const reconstructed = reconstructCheckpointsFromBranch([{ type: "custom", customType: "ezxomp.workflowz.checkpoint", data: entry.data }]);
			expect(reconstructed).toMatchObject([{ runId, status: "approved", routeRef: "route://preview-1" }]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC23: operationId replay returns the cached envelope for idempotent events and refuses manual side effects", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac23-"));
		try {
			const runId = createRun(cwd, "release", {});
			const { api, tools } = toolProbe();
			registerP0Tools(api as never);
			const report = tools.get("omp_workflow_report")!;
			const ctx = context(cwd);

			const first = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify", operationId: "op-stage-1" }, undefined, undefined, ctx);
			expect(first.isError).toBeUndefined();
			const replay = await report.execute("r2", { runId, workflow: "release", event: "stage_complete", stageId: "verify", operationId: "op-stage-1" }, undefined, undefined, ctx);
			expect(replay.details).toMatchObject({ replay: { class: "pure", replayed: true } });

			const manualFirst = await report.execute("r3", { runId, workflow: "release", event: "checkpoint", status: "approved", operationId: "op-manual-1" }, undefined, undefined, ctx);
			expect(manualFirst.isError).toBeUndefined();
			const manualReplay = await report.execute("r4", { runId, workflow: "release", event: "checkpoint", status: "approved", operationId: "op-manual-1" }, undefined, undefined, ctx);
			expect(manualReplay.isError).toBe(true);
			expect(manualReplay.details).toMatchObject({ code: "WORKFLOW_OPERATION_MANUAL_CONFIRM", class: "manual" });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC24: launch reservation fails closed once the ceiling is exhausted and journals budget_exhausted", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac24-"));
		try {
			const runId = createRun(cwd, "release", {});
			const { api, tools } = toolProbe();
			registerP0Tools(api as never);
			const reserve = tools.get("omp_workflow_reserve_launch")!;
			const ctx = context(cwd);

			for (let index = 0; index < 3; index++) {
				const okReservation = await reserve.execute("l" + index, { runId, maxLaunches: 3 }, undefined, undefined, ctx);
				expect(okReservation.isError).toBeUndefined();
			}
			const refused = await reserve.execute("l-final", { runId, maxLaunches: 3 }, undefined, undefined, ctx);
			expect(refused.isError).toBe(true);
			expect(refused.details).toMatchObject({ code: "WORKFLOW_BUDGET_EXHAUSTED" });
			// The exhaustion is journaled as a terminal failed event, not just returned.
			const events = readRunEvents(cwd, runId).filter(event => event.status === "budget_exhausted");
			expect(events.length).toBeGreaterThanOrEqual(1);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
