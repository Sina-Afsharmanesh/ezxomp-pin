import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerP0Tools } from "../plugins/extensible-workflows/src/p0-tools.ts";
import {
	appendRunEvent,
	boundGateReportForJournal,
	buildRepairPrompt,
	contentHash,
	createRun,
	GATE_REPORT_INLINE_LIMIT,
	gateArtifactPointer,
	governanceFromCreated,
	readRunEvents,
	renderGovernanceSetup,
	renderWorkflowDefinition,
	resumeWorkflowRun,
	retryWorkflowRun,
	validateWorkflowDefinition,
	verifyGitState,
	type GateReport,
	type WorkflowFileV2,
} from "../plugins/extensible-workflows/src/runtime.ts";

type RegisteredTool = {
	name: string;
	execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, update: unknown, ctx: Record<string, unknown>) => Promise<{ details: unknown; isError?: true }>;
};

function toolProbe(cwd: string, options: { exec?: (command: string) => Promise<{ code: number; stdout: string; stderr: string }>; sessionManager?: Record<string, unknown> } = {}) {
	const tools = new Map<string, RegisteredTool>();
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		tools,
		api: {
			zod: schema,
			exec: options.exec ?? (async () => ({ code: 0, stdout: "", stderr: "" })),
			appendEntry: () => {},
			registerTool: (spec: RegisteredTool) => tools.set(spec.name, spec),
		},
		ctx: {
			cwd,
			hasUI: false,
			ui: { confirm: async () => false },
			...(options.sessionManager ? { sessionManager: options.sessionManager } : {}),
		},
	};
}

function workflow(overrides: Partial<WorkflowFileV2> = {}): WorkflowFileV2 {
	return {
		schemaVersion: 2,
		name: "release",
		description: "Release workflow",
		inputs: {},
		stages: [{
			id: "verify",
			label: "Verify",
			tasks: [{ id: "verifier", prompt: "Verify" }],
			gates: [{ id: "check", type: "shell", executable: "just", args: ["check"], retries: 2, repair: "Fix the failing check" }],
		}],
		...overrides,
	};
}

describe("workflowz governance and repair closure", () => {
	test("AC14: failed gate repair receives the prior GateReport content in the same session loop", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-repair-"));
		try {
			const runId = createRun(cwd, workflow().name, {});
			const code = renderWorkflowDefinition(workflow(), {}, runId);
			expect(code).toContain("buildRepairPrompt");
			expect(code).toContain("lastReport_");

			const repairPrompts: string[] = [];
			const allLabels: string[] = [];
			const failingReport = (): { details: Record<string, unknown> } => ({
				details: {
					gate: "check",
					passed: false,
					checks: [{ item: "src/app.ts", ok: false, note: "type error TS2322", tool: "tsc" }],
					violations: ["src/app.ts: TS2322"],
					exitCode: 2,
					stderr: "verbose failure evidence\n".repeat(200),
				},
			});
			const gateCalls: number[] = [];
			const tool = {
				omp_workflow_report: async () => ({ details: { status: "running" } }),
				omp_workflow_gate: async (payload: { attempt?: number }) => {
					gateCalls.push(payload.attempt ?? 0);
					return failingReport();
				},
			};
			const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
			const result = await evaluate(() => {}, async (prompt: string, options: { label?: string } = {}) => {
				allLabels.push(options.label ?? "");
				if ((options.label ?? "").endsWith(":repair")) repairPrompts.push(prompt);
				return "repaired";
			}, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 100 });

			expect(result.status).toBe("failed");
			expect(repairPrompts).toHaveLength(2);
			expect(gateCalls).toEqual([0, 1, 2]); // initial check + 2 bounded repair attempts
			for (const prompt of repairPrompts) {
				expect(prompt).toContain("src/app.ts: TS2322");
				expect(prompt).toContain("type error TS2322");
				expect(prompt).toContain("exitCode: 2");
				expect(prompt).toContain("same working session");
				expect(prompt.length).toBeLessThan(20_000);
			}
			expect(allLabels.filter(label => label.endsWith(":repair"))).toHaveLength(2);
			expect(allLabels.some(label => label === "workflow:release:verify:check:repair")).toBe(true);
			// Exhaustion preserves the LAST GateReport verbatim in the returned evidence.
			expect(result.report?.violations).toEqual(["src/app.ts: TS2322"]);
			expect(result.reason).toBe("src/app.ts: TS2322");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC14: budget probe before each retry blocks repair with budget_exhausted and zero retries spent", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-repair-budget-"));
		try {
			const runId = createRun(cwd, workflow().name, {});
			const code = renderWorkflowDefinition(workflow(), {}, runId);
			let agentRepairCalls = 0;
			let gateCalls = 0;
			const tool = {
				omp_workflow_report: async () => ({ details: { status: "running" } }),
				omp_workflow_gate: async () => { gateCalls++; return { details: { gate: "check", passed: false, checks: [], violations: ["boom"] } }; },
			};
			const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
			const result = await evaluate(() => {}, async (_prompt: string, options: { label?: string } = {}) => { if ((options.label ?? "").endsWith(":repair")) agentRepairCalls++; return "x"; }, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 0 });
			expect(result.status).toBe("budget_exhausted");
			expect(agentRepairCalls).toBe(0);
			expect(gateCalls).toBe(1);
			expect(result.reason).toContain("budget exhausted before repair attempt 1 of 2");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC14: buildRepairPrompt bounds checks/violations/output tails deterministically", () => {
		const report: GateReport = {
			gate: "g",
			passed: false,
			checks: Array.from({ length: 60 }, (_, index) => ({ item: `item-${index}`, ok: false })),
			violations: Array.from({ length: 40 }, (_, index) => `violation-${index}`),
			stdout: "s".repeat(9_000),
			evidenceTail: "e".repeat(9_000),
			exitCode: 3,
		};
		const prompt = buildRepairPrompt("Repair this", report);
		expect(prompt).toStartWith("Repair this\n\n## Failed gate report");
		const violationLines = prompt.split("\n").filter(line => /^- violation-/.test(line));
		expect(violationLines).toHaveLength(20);
		expect(prompt.length).toBeLessThan(20_000);
	});

	test("AC17: oversized GateReport evidence routes to a session artifact with bounded pointer/hash in the journal", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-overflow-"));
		try {
			const runId = createRun(cwd, "release", {});
			let saved: string | undefined;
			const sessionManager = {
				saveArtifact: async (content: string) => { saved = content; return "7"; },
				getArtifactPath: async () => "/session-artifacts/7.json",
			};
			const { api, ctx, tools } = toolProbe(cwd, { sessionManager });
			registerP0Tools(api as never);
			const gate = tools.get("omp_workflow_gate")!;
			await gate.execute("g1", {
				runId,
				workflow: "release",
				stageId: "review",
				gate: { id: "review", type: "llm", prompt: "Review" },
				inputs: {},
				results: {},
				evidence: { blob: "R".repeat(50_000) },
			}, undefined, undefined, ctx);

			const event = readRunEvents(cwd, runId).find(event => event.event === "gate") as Record<string, unknown>;
			const journalReport = event.report as Record<string, unknown>;
			expect(JSON.stringify(journalReport).length).toBeLessThan(GATE_REPORT_INLINE_LIMIT);
			expect(journalReport.evidence).toBeUndefined();
			expect(journalReport.passed).toBe(true);
			const pointer = event.artifact as { artifactId?: string; path?: string; contentHash: string; bytes: number };
			expect(pointer.artifactId).toBe("7");
			expect(pointer.path).toBe("/session-artifacts/7.json");
			expect(pointer.bytes).toBeGreaterThan(GATE_REPORT_INLINE_LIMIT);
			// The hash covers the FULL payload stored in the artifact.
			const full = JSON.parse(saved!) as import("../plugins/extensible-workflows/src/runtime.ts").GateReport;
			expect(pointer.contentHash).toBe(gateArtifactPointer(full).contentHash);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC17: overflow without a session manager still journals a bounded copy plus full-payload hash", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-overflow-bare-"));
		try {
			const runId = createRun(cwd, "release", {});
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			const gate = tools.get("omp_workflow_gate")!;
			const executed = await gate.execute("g1", {
				runId,
				workflow: "release",
				stageId: "review",
				gate: { id: "review", type: "llm", prompt: "Review" },
				inputs: {},
				results: {},
				evidence: { blob: "R".repeat(50_000) },
			}, undefined, undefined, ctx);
			expect(executed.isError).toBeUndefined();
			const event = readRunEvents(cwd, runId).find(event => event.event === "gate") as Record<string, unknown>;
			const journalReport = event.report as Record<string, unknown>;
			expect(JSON.stringify(journalReport).length).toBeLessThan(GATE_REPORT_INLINE_LIMIT);
			const pointer = event.artifact as { artifactId?: string; contentHash: string };
			expect(pointer.artifactId).toBeUndefined();
			expect(pointer.contentHash).toMatch(/^[0-9a-f]{64}$/);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC21: rendered setup embeds owner IDs, artifact kind/path, Git state, and forbidden operations — never fabricated IDs", () => {
		const definition = workflow({
			stages: [{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify {{input.env}}" }], gates: [] }],
			inputs: { env: { description: "env", required: true } },
		});
		const governed = renderWorkflowDefinition(definition, { env: "prod" }, "44444444-4444-4444-8444-444444444444", undefined, {
			governance: { ownerIds: ["TASK-15", "doc-spec"], artifactKind: "implementation", artifactPath: "src/feature.ts", gitCommit: "abc123def456", gitBranch: "task/feature", routeRef: "route-1" },
		});
		expect(governed).toContain("Backlog owners (verified IDs only): TASK-15, doc-spec");
		expect(governed).toContain("Durable artifact: kind=implementation path=src/feature.ts");
		expect(governed).toContain("commit=abc123def456");
		expect(governed).toContain("branch=task/feature");
		expect(governed).toContain("Forbidden operations: never edit Backlog task/document markdown files directly");
		expect(governed).toContain("workers never run git push or move main");
		expect(governed).toContain("native Git is authoritative");

		const bare = renderWorkflowDefinition(definition, { env: "prod" }, "44444444-4444-4444-8444-444444444444", undefined, {});
		expect(bare).toContain("Backlog owners: none recorded for this run");
		expect(bare).toContain("commit=not recorded");
		expect(bare).toContain("branch=not recorded");
		expect(bare).not.toContain("TASK-15");
		expect(renderGovernanceSetup(undefined)).toBe("");
	});

	test("AC21: recovery runs inherit the parent journal's governance provenance", () => {
		const created = { timestamp: "t", runId: "r", event: "created", ownerIds: ["TASK-9"], gitCommit: "abc123", gitBranch: "task/feature", worktreeName: "wt", routeRef: "rr" };
		const governance = governanceFromCreated(created);
		const setup = renderGovernanceSetup(governance);
		expect(setup).toContain("TASK-9");
		expect(setup).toContain("commit=abc123");
		expect(setup).toContain("branch=task/feature");
		expect(setup).toContain('mode=git worktree isolation "wt"');
		expect(setup).toContain("route=rr");
	});

	test("AC22: completion is blocked with a structured error until backlog-record+git-state evidence exists", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-boundary-"));
		try {
			const runId = createRun(cwd, "release", {}, { ownerIds: ["TASK-15"], artifactKind: "implementation", artifactPath: "src/feature.ts" });
			const { api, ctx, tools } = toolProbe(cwd, {
				exec: async command => command === "git" ? { code: 1, stdout: "", stderr: "git unavailable" } : { code: 0, stdout: "", stderr: "" },
			});
			registerP0Tools(api as never);
			const report = tools.get("omp_workflow_report")!;

			// Read-only boundary: no governance overhead.
			const started = await report.execute("r1", { runId, workflow: "release", event: "stage_start", stageId: "verify" }, undefined, undefined, ctx);
			expect(started.isError).toBeUndefined();

			// Finalization without evidence → structured block naming the boundary and missing records.
			const blocked = await report.execute("r2", { runId, workflow: "release", event: "complete", results: {}, outputs: {} }, undefined, undefined, ctx);
			expect(blocked.isError).toBe(true);
			expect(blocked.details).toMatchObject({ code: "WORKFLOW_GOVERNANCE_BLOCKED", boundary: "finalization", missing: ["backlog-record", "git-state"] });

			// Both evidence records journaled at the failed boundary.
			const boundaryGates = readRunEvents(cwd, runId).filter(event => event.event === "gate" && (event.gateId === "backlog-record" || event.gateId === "git-state"));
			expect(boundaryGates.map(event => [event.gateId, event.status, event.boundary])).toEqual([
				["backlog-record", "failed", "finalization"],
				["git-state", "failed", "finalization"],
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC22: failed stage completion journals failure without governance evidence", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-boundary-failed-stage-"));
		try {
			const runId = createRun(cwd, "release", {}, { ownerIds: ["TASK-15"] });
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			const report = tools.get("omp_workflow_report")!;
			const failed = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify", status: "failed" }, undefined, undefined, ctx);
			expect(failed.isError).toBeUndefined();
			expect(readRunEvents(cwd, runId)).toContainEqual(expect.objectContaining({ event: "stage_complete", stageId: "verify", status: "failed" }));
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC22: mutating phase boundaries pass once both evidence records succeed in the run lineage", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-boundary-pass-"));
		try {
			const runId = createRun(cwd, "release", {});
			appendRunEvent(cwd, runId, { workflow: "release", event: "gate", gateId: "backlog-record", status: "passed", report: { gate: "backlog-record", passed: true, checks: [], violations: [] } });
			appendRunEvent(cwd, runId, { workflow: "release", event: "gate", gateId: "git-state", status: "passed", report: { gate: "git-state", passed: true, checks: [], violations: [] } });
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			const report = tools.get("omp_workflow_report")!;
			const advanced = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify" }, undefined, undefined, ctx);
			expect(advanced.isError).toBeUndefined();
			const completed = await report.execute("r2", { runId, workflow: "release", event: "complete", results: {}, outputs: {} }, undefined, undefined, ctx);
			expect(completed.isError).toBeUndefined();
			expect((completed.details as Record<string, unknown>).status).toBe("completed");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC22: a broken Git state blocks finalization by name even when Backlog evidence exists", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-boundary-git-"));
		try {
			const runId = createRun(cwd, "release", {});
			appendRunEvent(cwd, runId, { workflow: "release", event: "gate", gateId: "backlog-record", status: "passed", report: { gate: "backlog-record", passed: true, checks: [], violations: [] } });
			const { api, ctx, tools } = toolProbe(cwd, {
				exec: async command => command === "git" ? { code: 128, stdout: "", stderr: "fatal: not inside a workspaces" } : { code: 0, stdout: "", stderr: "" },
			});
			registerP0Tools(api as never);
			const report = tools.get("omp_workflow_report")!;
			const blocked = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify" }, undefined, undefined, ctx);
			expect(blocked.isError).toBe(true);
			expect(blocked.details).toMatchObject({ code: "WORKFLOW_GOVERNANCE_BLOCKED", boundary: "stage_complete:verify", missing: ["git-state"] });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("boundGateReportForJournal preserves verdict metadata while collapsing evidence blobs", () => {
		const big: GateReport = {
			gate: "shell-check",
			passed: false,
			advisory: undefined,
			checks: [{ item: "f.ts", ok: false, note: "err", tool: "tsc" }],
			violations: ["v1"],
			evidenceTail: "T".repeat(50_000),
			stdout: "S".repeat(50_000),
			exitCode: 1,
			killed: false,
			signal: undefined,
			durationMs: 42,
			tool: "just",
		};
		const bounded = boundGateReportForJournal(big);
		expect(JSON.stringify(bounded).length).toBeLessThan(GATE_REPORT_INLINE_LIMIT);
		expect(bounded.passed).toBe(false);
		expect(bounded.violations).toEqual(["v1"]);
		expect(bounded.exitCode).toBe(1);
		expect(bounded.tool).toBe("just");
		expect(bounded.durationMs).toBe(42);
		expect((bounded.evidenceTail ?? "").length).toBeLessThanOrEqual(600);
		const pointer = gateArtifactPointer(big, { id: "2" });
		expect(pointer.bytes).toBeGreaterThan(GATE_REPORT_INLINE_LIMIT);
		expect(pointer.contentHash).toMatch(/^[0-9a-f]{64}$/);
	});

	test("F6: async budget.remaining is awaited — threshold gate blocks with budget_exhausted and zero retries", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-async-budget-"));
		try {
			// Threshold gate: an installed-kernel async remaining() returning 0 must
			// trip the pre-gate threshold return instead of comparing a Promise.
			const gated = workflow({
				stages: [{
					id: "verify",
					label: "Verify",
					tasks: [{ id: "verifier", prompt: "Verify" }],
					gates: [{ id: "budget", type: "budget", threshold: 10 }],
				}],
			});
			const runId = createRun(cwd, gated.name, {});
			const code = renderWorkflowDefinition(gated, {}, runId);
			expect(code).toContain("await budget.remaining()");
			let agentCalls = 0;
			let repairAgentCalls = 0;
			const tool = {
				omp_workflow_report: async () => ({ details: { status: "running" } }),
				omp_workflow_gate: async () => ({ details: { gate: "budget", passed: true, checks: [], violations: [] } }),
			};
			const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
			const result = await evaluate(() => {}, async () => { agentCalls++; return "work"; }, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: async () => 0 });
			expect(result.status).toBe("budget_exhausted");
			expect(result.reason).toBe("budget threshold reached");
			// Stage tasks legitimately ran; the budget gate blocked BEFORE any
			// downstream gate execution or repair attempt.
			expect(agentCalls).toBe(1);

			// Repair loop: an async stub of 0 must block BEFORE any repair agent runs.
			const repairing = workflow();
			const repairRunId = createRun(cwd, repairing.name, {});
			const repairCode = renderWorkflowDefinition(repairing, {}, repairRunId);
			let gateCalls = 0;
			const repairTool = {
				omp_workflow_report: async () => ({ details: { status: "running" } }),
				omp_workflow_gate: async () => { gateCalls++; return { details: { gate: "check", passed: false, checks: [], violations: ["boom"] } }; },
			};
			const evaluateRepair = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${repairCode} })();`);
			const repairResult = await evaluateRepair(() => {}, async (_prompt: string, options: { label?: string } = {}) => { if ((options.label ?? "").endsWith(":repair")) repairAgentCalls++; return "x"; }, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), repairTool, async () => "unused", { remaining: async () => 0 });
			expect(repairResult.status).toBe("budget_exhausted");
			expect(repairResult.reason).toContain("budget exhausted before repair attempt 1 of 2");
			expect(repairAgentCalls).toBe(0);
			expect(gateCalls).toBe(1);

			// executeGate resolves a Promise evidence.budgetRemaining into a number.
			const { executeGate } = await import("../plugins/extensible-workflows/src/runtime.ts");
			const report = await executeGate({ id: "budget", type: "budget", threshold: 5 }, cwd, {}, {}, async () => ({ code: 0, stdout: "", stderr: "", killed: false }), undefined, { budgetRemaining: Promise.resolve(0) });
			expect(report.passed).toBe(false);
			expect((report.evidence as { budgetRemaining?: unknown }).budgetRemaining).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("Git-state refuses detached HEAD evidence", async () => {
		const report = await verifyGitState("/repo", async (_command, args) => {
			if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
			if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
			if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "HEAD\n", stderr: "" };
			return { code: 0, stdout: "0123456789abcdef0123456789abcdef01234567\n", stderr: "" };
		});

		expect(report.passed).toBe(false);
		expect(report.checks.find(check => check.item === "git branch")).toMatchObject({ ok: false, note: "git HEAD is detached; a current branch is required" });
		expect(report.violations).toContain("git HEAD is detached; a current branch is required");
	});

	test("F5/AC21: resumed and retried runs render the parent journal's Git commit/branch and owners", () => {
		const definition: WorkflowFileV2 = {
			schemaVersion: 2,
			name: "release",
			description: "Release workflow",
			inputs: {},
			stages: [
				{ id: "plan", label: "Plan", tasks: [{ id: "planner", prompt: "Plan" }], gates: [] },
				{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify" }], gates: [] },
			],
		};
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-recovery-governance-"));
		try {
			const parentRunId = createRun(cwd, definition.name, {}, {
				contentHash: contentHash(definition),
				ownerIds: ["TASK-15.2"],
				gitCommit: "qpvutsxk",
				gitBranch: "main",
				worktreeName: "wt-isolated",
				routeRef: "route://parent",
			});
			appendRunEvent(cwd, parentRunId, { workflow: definition.name, event: "stage_start", stageId: "plan", status: "running" });
			appendRunEvent(cwd, parentRunId, { workflow: definition.name, event: "stage_complete", stageId: "plan", status: "running", results: { plan: "approved" } });

			const resumed = resumeWorkflowRun(cwd, parentRunId, definition);
			expect(resumed.error).toBeUndefined();
			expect(resumed.run?.code).toContain("Backlog owners (verified IDs only): TASK-15.2");
			expect(resumed.run?.code).toContain('mode=git worktree isolation \\"wt-isolated\\"');
			expect(resumed.run?.code).toContain("commit=qpvutsxk");
			expect(resumed.run?.code).toContain("branch=main");
			expect(resumed.run?.code).toContain("route=route://parent");
			expect(resumed.run?.code).not.toContain("commit=not recorded");

			const retried = retryWorkflowRun(cwd, parentRunId, definition);
			expect(retried.error).toBeUndefined();
			expect(retried.run?.code).toContain("Backlog owners (verified IDs only): TASK-15.2");
			expect(retried.run?.code).toContain("commit=qpvutsxk");
			expect(retried.run?.code).toContain("branch=main");
			expect(retried.run?.code).not.toContain("mode=shared workspace");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("F5 companion: workflow definitions cannot declare gates under reserved governance ids", () => {
		for (const reserved of ["backlog-record", "git-state"]) {
			const invalid = workflow({
				stages: [{
					id: "verify",
					label: "Verify",
					tasks: [{ id: "verifier", prompt: "Verify" }],
					gates: [{ id: reserved, type: "llm", prompt: "Forge evidence" }],
				}],
			});
			const rejection = validateWorkflowDefinition(invalid);
			expect(rejection).toMatchObject({ code: "WORKFLOW_GATE_RESERVED_ID" });
			expect(rejection?.message).toContain(reserved);
		}
		// Ordinary ids remain valid; the host producers keep sole ownership of evidence.
		expect(validateWorkflowDefinition(workflow())).toBeNull();
	});
});

describe("workflowz AC22 anti-forgery hardening (cycle 2b)", () => {
	test("spoof attempt: forged {id:'backlog-record'} llm gate is refused and completion stays blocked", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-antispoof-bl-"));
		try {
			const runId = createRun(cwd, "release", {}, { ownerIds: ["TASK-15"], artifactKind: "implementation", artifactPath: "src/feature.ts" });
			const { api, ctx, tools } = toolProbe(cwd, {
				exec: async command => command === "git" ? { code: 1, stdout: "", stderr: "git unavailable" } : { code: 0, stdout: "", stderr: "" },
			});
			registerP0Tools(api as never);
			const gate = tools.get("omp_workflow_gate")!;
			const report = tools.get("omp_workflow_report")!;

			// Judge comment #8/#6 vector: trivially-passing LLM gate named 'backlog-record'.
			const spoof = await gate.execute("s1", {
				runId,
				workflow: "release",
				stageId: "verify",
				gate: { id: "backlog-record", type: "llm", prompt: "fake governance" },
				inputs: {},
				results: {},
			}, undefined, undefined, ctx);
			expect(spoof.isError).toBe(true);
			expect(spoof.details).toMatchObject({ code: "WORKFLOW_GATE_RESERVED_ID", gateId: "backlog-record" });
			// Nothing was journaled under the reserved id.
			expect(readRunEvents(cwd, runId).filter(event => event.event === "gate" && event.gateId === "backlog-record")).toHaveLength(0);

			// Completion remains blocked: no authentic backlog-record evidence exists.
			const blocked = await report.execute("r1", { runId, workflow: "release", event: "complete", results: {}, outputs: {} }, undefined, undefined, ctx);
			expect(blocked.isError).toBe(true);
			expect(blocked.details).toMatchObject({ code: "WORKFLOW_GOVERNANCE_BLOCKED", boundary: "finalization" });
			expect((blocked.details as { missing: string[] }).missing).toContain("backlog-record");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("reserved-id refusal: omp_workflow_gate rejects 'git-state' and omp_workflow_report rejects reserved gate events", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-reserved-"));
		try {
			const runId = createRun(cwd, "release", {});
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			const gate = tools.get("omp_workflow_gate")!;
			const report = tools.get("omp_workflow_report")!;

			const gitSpoof = await gate.execute("s1", {
				runId,
				workflow: "release",
				stageId: "verify",
				gate: { id: "git-state", type: "shell", executable: "echo", args: ["fake"] },
				inputs: {},
				results: {},
			}, undefined, undefined, ctx);
			expect(gitSpoof.isError).toBe(true);
			expect(gitSpoof.details).toMatchObject({ code: "WORKFLOW_GATE_RESERVED_ID", gateId: "git-state" });

			const reportSpoof = await report.execute("s2", { runId, workflow: "release", event: "gate", stageId: "verify", gateId: "git-state", status: "passed" }, undefined, undefined, ctx);
			expect(reportSpoof.isError).toBe(true);
			expect(reportSpoof.details).toMatchObject({ code: "WORKFLOW_GATE_RESERVED_ID", gateId: "git-state" });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "gate")).toHaveLength(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("genuine flow: real artifact_record + repo_guard successes produce authenticated evidence and completion proceeds", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-genuine-"));
		try {
			const runId = createRun(cwd, "release", {}, { ownerIds: ["TASK-15"] });
			const { api, ctx, tools } = toolProbe(cwd, {
				exec: async command => command === "git"
					? { code: 0, stdout: "change qpvutsxk\nmain", stderr: "" }
					: { code: 0, stdout: "task ok", stderr: "" },
			});
			registerP0Tools(api as never);

			const artifactRecord = tools.get("omp_workflow_artifact_record")!;
			const recorded = await artifactRecord.execute("a1", {
				taskId: "TASK-15",
				artifactKind: "implementation",
				path: "src/feature.ts",
				acceptanceCriteria: ["AC"],
				definitionOfDone: ["DoD"],
				type: "feature",
				priority: "High",
				status: "In Progress",
				labels: ["workflowz-v2"],
				dependencies: [],
				references: [],
				documentation: [],
				modifiedFiles: ["src/feature.ts"],
				runId,
			}, undefined, undefined, ctx);
			expect(recorded.isError).toBeUndefined();

			const repoGuard = tools.get("omp_workflow_repo_guard")!;
			const guarded = await repoGuard.execute("a2", { runId }, undefined, undefined, ctx);
			expect(guarded.isError).toBeUndefined();

			// Both host-produced events carry the self-authenticating marker.
			const gates = readRunEvents(cwd, runId).filter(event => event.event === "gate");
			expect(gates.map(event => [event.gateId, event.status]).sort()).toEqual([["backlog-record", "passed"], ["git-state", "passed"]]);
			for (const event of gates) {
				const auth = event.auth as { marker: string };
				expect(auth.marker).toMatch(/^[0-9a-f]{64}:\d+$/);
			}

			// Boundary consumes the authenticated evidence without re-blocking.
			const report = tools.get("omp_workflow_report")!;
			const advanced = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify" }, undefined, undefined, ctx);
			expect(advanced.isError).toBeUndefined();
			const completed = await report.execute("r2", { runId, workflow: "release", event: "complete", results: {}, outputs: {} }, undefined, undefined, ctx);
			expect(completed.isError).toBeUndefined();
			expect((completed.details as Record<string, unknown>).status).toBe("completed");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("tamper detection: a corrupted auth marker invalidates previously accepted evidence", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-tamper-"));
		try {
			const runId = createRun(cwd, "release", {}, { ownerIds: ["TASK-15"] });
			const { api, ctx, tools } = toolProbe(cwd, {
				exec: async command => command === "git"
					? { code: 0, stdout: "change ok", stderr: "" }
					: { code: 0, stdout: "task ok", stderr: "" },
			});
			registerP0Tools(api as never);

			const artifactRecord = tools.get("omp_workflow_artifact_record")!;
			await artifactRecord.execute("a1", {
				taskId: "TASK-15",
				artifactKind: "implementation",
				path: "src/feature.ts",
				acceptanceCriteria: ["AC"],
				definitionOfDone: ["DoD"],
				type: "feature",
				priority: "High",
				status: "In Progress",
				labels: ["workflowz-v2"],
				dependencies: [],
				references: [],
				documentation: [],
				modifiedFiles: ["src/feature.ts"],
				runId,
			}, undefined, undefined, ctx);
			const repoGuard = tools.get("omp_workflow_repo_guard")!;
			await repoGuard.execute("a2", { runId }, undefined, undefined, ctx);

			// Corrupt one marker in-place: present-but-invalid markers are rejected.
			const journalPath = join(cwd, ".omp", "workflows", "runs", runId, "journal.jsonl");
			const raw = await Bun.file(journalPath).text();
			const tampered = raw.replace(/"auth":\{"marker":"[0-9a-f]{64}:\d+"\}/, '"auth":{"marker":"deadbeef:99999999"}');
			expect(tampered).not.toBe(raw);
			await Bun.write(journalPath, tampered);

			const report = tools.get("omp_workflow_report")!;
			const blocked = await report.execute("r1", { runId, workflow: "release", event: "stage_complete", stageId: "verify" }, undefined, undefined, ctx);
			expect(blocked.isError).toBe(true);
			expect(blocked.details).toMatchObject({ code: "WORKFLOW_GOVERNANCE_BLOCKED", boundary: "stage_complete:verify" });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
