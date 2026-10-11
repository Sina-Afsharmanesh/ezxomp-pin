import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	appendRunEvent,
	createRun,
	executeGate,
	listWorkflowDefinitions,
	renderWorkflowDefinition,
	readRunEvents,
	resolveWorkflowDefinition,
	routeError,
	buildRoutePlan,
	MAX_ROUTE_PLAN_DEPTH,
	normalizeGateReport,
	runStatus,
	saveWorkflowDefinition,
	validateOutputs,
	validateWorkflowDefinition,
	type WorkflowFileV2,
} from "../plugins/extensible-workflows/src/runtime.ts";
import { approveGate, draftGate, saveGateFile } from "../plugins/extensible-workflows/src/templates.ts";

function workflow(overrides: Partial<WorkflowFileV2> = {}): WorkflowFileV2 {
	return {
		schemaVersion: 2,
		name: "release",
		description: "Release workflow",
		inputs: { env: { description: "Target environment", required: true } },
		stages: [{
			id: "build",
			label: "Build",
			tasks: [{ id: "compile", prompt: "Compile for {{input.env}}" }],
			gates: [
				{ id: "shell-check", type: "shell", executable: "just", args: ["check"], retries: 1, repair: "Fix the failing check" },
				{ id: "llm-check", type: "llm", prompt: "Review the output", advisory: true },
				{ id: "checkpoint", type: "checkpoint", prompt: "Approve release" },
				{ id: "budget", type: "budget", advisory: true },
			],
		}],
		outputs: { result: { type: "string" } },
		...overrides,
	};
}

describe("workflowz v2 runtime", () => {
	test("validates V2 gates, outputs, and artifacts", () => {
		expect(validateWorkflowDefinition(workflow())).toBeNull();
		expect(validateWorkflowDefinition(workflow({ outputs: { result: { type: "unsupported" } } }))).toMatchObject({ code: "WORKFLOW_INVALID" });
		expect(validateWorkflowDefinition(workflow({ stages: [{ ...workflow().stages[0]!, gates: [{ id: "duplicate", type: "shell", executable: "just" }, { id: "duplicate", type: "shell", executable: "just" }] }] }))).toMatchObject({ code: "WORKFLOW_INVALID" });
	});

	test("renders V2 gates through native eval helpers with repair and interpolation", () => {
		const code = renderWorkflowDefinition(workflow(), { env: "prod" }, "11111111-1111-4111-8111-111111111111");
		expect(code).toContain("tool.omp_workflow_gate");
		const rawShell = workflow({ stages: [{ ...workflow().stages[0]!, gates: [{ id: "raw-shell", type: "shell", command: "just verify" }] }] });
		expect(renderWorkflowDefinition(rawShell, { env: "prod" })).toContain("tool.bash");
		expect(validateWorkflowDefinition(workflow({ stages: [{ ...workflow().stages[0]!, gates: [{ id: "unsafe", type: "shell", command: "just && rm -rf /" }] }] }))).toMatchObject({ code: "WORKFLOW_INVALID" });
		expect(code).toContain("tool.omp_workflow_checkpoint");
		expect(code).toContain("completion(");
		expect(code).toContain("budget.remaining");
		expect(code).toContain("inputs[id]");
		expect(code).toContain("attempt <= 1");
		expect(code).toContain("workflow: workflow.name");
	});

	test("inlines child workflows with namespaced ids and detects cycles", () => {
		const child = workflow({ name: "child", stages: [{ id: "child-stage", label: "Child", tasks: [{ id: "compile-child", prompt: "Compile child" }], gates: [] }] });
		const parent = workflow({ name: "parent", stages: [{ id: "parent-stage", label: "Parent", tasks: [{ id: "child-step", prompt: "delegate", workflow: "child" }], gates: [] }] });
		const code = renderWorkflowDefinition(parent, { env: "prod" }, "33333333-3333-4333-8333-333333333333", name => name === "child" ? child : undefined);
		expect(code).toContain("child-step-compile-child");
		expect(() => renderWorkflowDefinition(parent, { env: "prod" }, undefined, name => name === "child" ? parent : undefined)).toThrow("cycle");
	});

	test("executes rendered V2 JavaScript through the native helper contract", async () => {
		const code = renderWorkflowDefinition(workflow(), { env: "prod" }, "22222222-2222-4222-8222-222222222222");
		const prompts: string[] = [];
		const tool = {
			omp_workflow_report: async (payload: { event: string }) => ({ details: { status: payload.event === "complete" ? "completed" : "running" } }),
			omp_workflow_gate: async () => ({ details: { passed: true, violations: [] } }),
			omp_workflow_checkpoint: async () => ({ details: { approved: true, status: "approved" } }),
		};
		const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
		const result = await evaluate(() => {}, async (prompt: string) => { prompts.push(prompt); return "compiled"; }, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "advisory", { remaining: () => 100 });
		expect(result.status).toBe("completed");
		expect(result.results.compile).toBe("compiled");
		expect(prompts[0]).toContain("prod");
	});

	test("records journal events, exposes malformed entries, and preserves stop precedence", () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-runtime-"));
		try {
			const runId = createRun(cwd, "release", { env: "prod" });
			appendRunEvent(cwd, runId, { event: "stage_start", status: "running", operationId: "stage-start" });
			appendRunEvent(cwd, runId, { event: "stage_start", status: "running", operationId: "stage-start" });
			appendRunEvent(cwd, runId, { event: "stop", status: "stopped" });
			appendRunEvent(cwd, runId, { event: "complete", status: "completed" });
			appendFileSync(join(cwd, ".omp", "workflows", "runs", runId, "journal.jsonl"), "not-json\n");
			const status = runStatus(cwd, runId);
			expect(status.stopped).toBe(true);
			expect(status.status).toBe("stopped");
			expect(readRunEvents(cwd, runId).some(event => event.event === "journal_error")).toBe(true);
			expect(() => runStatus(cwd, "../escape")).toThrow("invalid workflow run id");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("validates typed outputs and catches gate process failures", async () => {
		expect(validateOutputs({ result: "ok", count: 2, values: [1] }, { result: { type: "string" }, count: "number", values: { type: "array" } })).toEqual([]);
		expect(validateOutputs({ result: 1 }, { result: { type: "string" } })).toEqual(["output result expected string"]);
		const report = await executeGate({ id: "check", type: "shell", executable: "just" }, "/tmp", {}, {}, async () => { throw new Error("spawn failed"); });
		expect(report.passed).toBe(false);
		expect(report.stderr).toContain("spawn failed");
	});

	test("saves and resolves V2 definitions and validates routes", () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-definition-"));
		try {
			const saved = saveWorkflowDefinition(workflow(), "project", false, cwd);
			expect(saved.created).toBe(true);
			expect(listWorkflowDefinitions(cwd, "project").workflows.map(item => item.name)).toEqual(["release"]);
			expect(resolveWorkflowDefinition("release", cwd, "project").workflow?.schemaVersion).toBe(2);
			expect(routeError({ mode: "direct", steps: [{ workflow: "missing" }, { workflow: "other" }] })).toContain("direct routes");
			expect(routeError({ mode: "chain", steps: [{ workflow: "same" }, { workflow: "same" }] })).toContain("cyclic");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("workflowz final AC closure (TASK-15.2 cycle 3)", () => {
	test("AC9: route validation rejects unknown recipes, forward result refs, and excessive depth before rendering", () => {
		expect(routeError({ mode: "direct", steps: [{ workflow: "ok" }, { workflow: "other" }] })).toContain("direct routes");
		const deep = { mode: "chain", steps: Array.from({ length: MAX_ROUTE_PLAN_DEPTH + 1 }, (_, index) => ({ workflow: `w${index}` })) };
		expect(routeError(deep)).toContain("route steps must contain 1-");
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac9-"));
		try {
			const missing = buildRoutePlan({ mode: "chain", maxDepth: 1, steps: [{ workflow: "release" }, { workflow: "release", resultRef: "never-completed" }] }, cwd);
			expect(missing.error).toBeDefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC11: buildRoutePlan returns a strict typed WorkflowRouteV1 plan without executing", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac11-"));
		try {
			const saved = saveWorkflowDefinition(workflow(), "project", false, cwd);
			expect(saved.created).toBe(true);
			const plan = buildRoutePlan({ mode: "direct", steps: [{ workflow: "release", inputs: { env: "prod" } }] }, cwd);
			expect(plan.error).toBeUndefined();
			expect(plan.plan).toMatchObject({
				version: 1,
				mode: "direct",
				approval: "required",
				maxDepth: MAX_ROUTE_PLAN_DEPTH,
			});
			expect(plan.plan?.steps[0]).toMatchObject({ workflow: "release", scope: "project" });
			expect(plan.plan?.steps[0]?.inputs?.env).toBe("prod"); // typed inputs resolved verbatim
			expect(plan.plan?.contentHash).toMatch(/^[0-9a-f]{64}$/);
			expect([...plan.plan?.gates ?? []].sort()).toEqual(["budget", "checkpoint", "llm-check", "shell-check"]);
			for (const gate of plan.plan?.steps[0]?.gates ?? []) expect(["shell", "llm", "checkpoint", "budget"]).toContain(gate.type);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC10: declared gate refs must resolve to approved versions; drafts are rejected before rendering", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac10-"));
		try {
			const draft = draftGate({ id: "lint-check", version: "1.0.0", description: "Lint gate", kind: "exec", executable: "echo", args: ["ok"], createdBy: "llm", owners: ["TASK-15"] });
			saveGateFile(draft, "project", false, cwd);
			const withRef = workflow({
				name: "with-ref",
				stages: [{ id: "build", label: "Build", tasks: [{ id: "compile", prompt: "Compile" }], gates: [{ id: "check", type: "exec", ref: "lint-check" }] }],
			});
			saveWorkflowDefinition(withRef, "project", false, cwd);
			const rejected = buildRoutePlan({ mode: "direct", steps: [{ workflow: "with-ref", inputs: { env: "prod" } }] }, cwd);
			expect(rejected.error).toContain("untrusted gate");
			const approved = approveGate(draft);
			saveGateFile(approved, "project", true, cwd);
			const accepted = buildRoutePlan({ mode: "direct", steps: [{ workflow: "with-ref", inputs: { env: "prod" } }] }, cwd);
			expect(accepted.plan?.steps[0]?.gates[0]).toMatchObject({ id: "check", ref: "lint-check", version: "1.0.0", required: true });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC13: boolean-only gate reports are rejected at the normalization boundary; evidence strings are bounded", async () => {
		expect(normalizeGateReport({ passed: true }).error).toContain("boolean-only reports are invalid");
		expect(normalizeGateReport(true as unknown as Record<string, unknown>).error).toBeDefined();
		expect(normalizeGateReport({ passed: false, checks: [{ item: "src/app.ts", ok: false, note: "TS2322" }], violations: ["src/app.ts: TS2322"], exitCode: 2, stdout: "x".repeat(9000) }).report)
			.toMatchObject({ passed: false, checks: [{ item: "src/app.ts", ok: false, note: "TS2322" }], violations: ["src/app.ts: TS2322"], exitCode: 2 });
		const bounded = normalizeGateReport({ passed: true, checks: [], violations: [], stdout: "y".repeat(9000) }).report;
		expect(bounded?.stdout?.length ?? 0).toBeLessThanOrEqual(4000);
	});
});
