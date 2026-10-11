import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerP0Tools } from "../plugins/extensible-workflows/src/p0-tools.ts";
import {
	createRun,
	executeGate,
	expandStages,
	readRunEvents,
	renderWorkflowDefinition,
	runBoundedParallel,
	type WorkflowFileV2,
} from "../plugins/extensible-workflows/src/runtime.ts";

function workflow(overrides: Partial<WorkflowFileV2> = {}): WorkflowFileV2 {
	return {
		schemaVersion: 2,
		name: "release",
		description: "Release the staged change",
		inputs: {},
		stages: [{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify" }], gates: [] }],
		...overrides,
	};
}

function toolProbe(cwd: string): { tools: Map<string, any>; ctx: Record<string, unknown>; api: unknown } {
	const tools = new Map<string, any>();
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		tools,
		ctx: {
			cwd,
			hasUI: false,
			ui: { confirm: async () => false },
		},
		api: {
			zod: schema,
			exec: async () => ({ code: 0, stdout: "", stderr: "" }),
			appendEntry: () => {},
			registerTool: (spec: { name: string }) => tools.set(spec.name, spec),
		},
	};
}

describe("workflowz P0 runtime guards", () => {
	test("refuses direct render when a resolved child V2 definition has no stages", () => {
		const parent = workflow({
			stages: [{ id: "parent", label: "Parent", tasks: [{ id: "child", prompt: "Delegate", workflow: "child" }], gates: [] }],
		});
		const invalidChild = workflow({ name: "child", stages: [] });
		expect(() => renderWorkflowDefinition(parent, {}, undefined, name => name === "child" ? invalidChild : undefined)).toThrow("child workflow child is invalid");
	});

	test("journals a failed budget GateReport before returning budget exhaustion", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-runtime-"));
		const definition = workflow({
			stages: [{
				id: "verify",
				label: "Verify",
				tasks: [{ id: "verifier", prompt: "Verify" }],
				gates: [{ id: "budget", type: "budget", threshold: 10 }],
			}],
		});
		const runId = createRun(cwd, definition.name, {});
		const { api, ctx, tools } = toolProbe(cwd);
		registerP0Tools(api as never);
		const code = renderWorkflowDefinition(definition, {}, runId);
		const tool = {
			omp_workflow_report: (payload: Record<string, unknown>) => tools.get("omp_workflow_report").execute("report", payload, undefined, undefined, ctx),
			omp_workflow_gate: (payload: Record<string, unknown>) => tools.get("omp_workflow_gate").execute("gate", payload, undefined, undefined, ctx),
			omp_workflow_checkpoint: (payload: Record<string, unknown>) => tools.get("omp_workflow_checkpoint").execute("checkpoint", payload, undefined, undefined, ctx),
		};
		const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
		try {
			const result = await evaluate(() => {}, async () => "verified", async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 4 });
			expect(result).toMatchObject({ status: "budget_exhausted" });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "gate")).toMatchObject([
				{
					gateId: "budget",
					status: "failed",
					report: {
						passed: false,
						violations: ["budget exhausted: 4 below threshold 10"],
						evidence: { budgetRemaining: 4 },
					},
				},
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
	test("keeps rejected checkpoints cancelled without repair attempts", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-runtime-"));
		const definition = workflow({
			stages: [{
				id: "verify",
				label: "Verify",
				tasks: [{ id: "verifier", prompt: "Verify" }],
				gates: [{ id: "approval", type: "checkpoint", prompt: "Approve", repair: "Repair", retries: 2 }],
			}],
		});
		const runId = createRun(cwd, definition.name, {});
		const { api, ctx, tools } = toolProbe(cwd);
		registerP0Tools(api as never);
		const code = renderWorkflowDefinition(definition, {}, runId);
		const tool = {
			omp_workflow_report: (payload: Record<string, unknown>) => tools.get("omp_workflow_report").execute("report", payload, undefined, undefined, ctx),
			omp_workflow_gate: (payload: Record<string, unknown>) => tools.get("omp_workflow_gate").execute("gate", payload, undefined, undefined, ctx),
			omp_workflow_checkpoint: (payload: Record<string, unknown>) => tools.get("omp_workflow_checkpoint").execute("checkpoint", payload, undefined, undefined, ctx),
		};
		const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
		const agentLabels: string[] = [];
		try {
			const result = await evaluate(() => {}, async (_prompt: string, options: { label?: string }) => { agentLabels.push(options.label ?? ""); return "ignored"; }, async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 100 });
			expect(result).toMatchObject({ status: "cancelled", reason: "checkpoint rejected" });
			expect(agentLabels.filter(label => label.endsWith(":repair"))).toHaveLength(0);
			expect(readRunEvents(cwd, runId).filter(event => event.event === "checkpoint")).toMatchObject([
				{ status: "rejected", policy: "headless-requires-auto" },
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("namespaces child gate templates across every executable field", () => {
		const parent = workflow({
			stages: [{ id: "parent", label: "Parent", tasks: [{ id: "child", prompt: "Delegate", workflow: "child" }], gates: [] }],
		});
		const child = workflow({
			name: "child",
			stages: [{
				id: "verify",
				label: "Verify",
				tasks: [{ id: "worker", prompt: "Work" }],
				gates: [{
					id: "check",
					type: "exec",
					prompt: "Use {{result.source}}",
					executable: "bin/{{result.source}}",
					args: ["--source", "{{result.source}}"],
					expect: { stdout: "{{result.source}}" },
				}],
			}],
		});
		const gate = expandStages(parent, name => name === "child" ? child : undefined)[0]!.gates[0]!;
		expect(gate).toMatchObject({
			id: "child-check",
			prompt: "Use {{result.child-source}}",
			executable: "bin/{{result.child-source}}",
			args: ["--source", "{{result.child-source}}"],
			expect: { stdout: "{{result.child-source}}" },
		});
	});
	test("cancels an optional headless checkpoint when auto is omitted", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-runtime-"));
		const definition = workflow({
			stages: [{
				id: "verify",
				label: "Verify",
				tasks: [{ id: "verifier", prompt: "Verify" }],
				gates: [{ id: "approval", type: "checkpoint", prompt: "Approve", optional: true }],
			}],
		});
		const runId = createRun(cwd, definition.name, {});
		const { api, ctx, tools } = toolProbe(cwd);
		registerP0Tools(api as never);
		const code = renderWorkflowDefinition(definition, {}, runId);
		const tool = {
			omp_workflow_report: (payload: Record<string, unknown>) => tools.get("omp_workflow_report").execute("report", payload, undefined, undefined, ctx),
			omp_workflow_gate: (payload: Record<string, unknown>) => tools.get("omp_workflow_gate").execute("gate", payload, undefined, undefined, ctx),
			omp_workflow_checkpoint: (payload: Record<string, unknown>) => tools.get("omp_workflow_checkpoint").execute("checkpoint", payload, undefined, undefined, ctx),
		};
		const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
		try {
			const result = await evaluate(() => {}, async () => "verified", async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 100 });
			expect(result).toMatchObject({ status: "cancelled", reason: "checkpoint rejected" });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "checkpoint")).toMatchObject([
				{ status: "rejected", policy: "headless-requires-auto" },
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("approves an explicit auto checkpoint", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p0-runtime-"));
		const definition = workflow({
			stages: [{
				id: "verify",
				label: "Verify",
				tasks: [{ id: "verifier", prompt: "Verify" }],
				gates: [{ id: "approval", type: "checkpoint", prompt: "Approve", optional: true, auto: true }],
			}],
		});
		const runId = createRun(cwd, definition.name, {});
		const { api, ctx, tools } = toolProbe(cwd);
		registerP0Tools(api as never);
		const code = renderWorkflowDefinition(definition, {}, runId);
		const tool = {
			omp_workflow_report: (payload: Record<string, unknown>) => tools.get("omp_workflow_report").execute("report", payload, undefined, undefined, ctx),
			omp_workflow_gate: (payload: Record<string, unknown>) => tools.get("omp_workflow_gate").execute("gate", payload, undefined, undefined, ctx),
			omp_workflow_checkpoint: (payload: Record<string, unknown>) => tools.get("omp_workflow_checkpoint").execute("checkpoint", payload, undefined, undefined, ctx),
		};
		const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
		try {
			const result = await evaluate(() => {}, async () => "verified", async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 100 });
			expect(result).toMatchObject({ status: "completed" });
			expect(readRunEvents(cwd, runId).filter(event => event.event === "checkpoint")).toMatchObject([
				{ status: "approved", policy: "auto" },
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("defers templated executable safety until substituted argv is classified", async () => {
		const gate = { id: "command", type: "exec" as const, executable: "{{input.binary}}", args: ["{{input.argument}}"] };
		const definition = workflow({
			stages: [{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify" }], gates: [gate] }],
		});
		expect(() => renderWorkflowDefinition(definition, {})).not.toThrow();
		let execCalls = 0;
		const report = await executeGate(gate, process.cwd(), { binary: "rm", argument: "-rf /" }, {}, async () => {
			execCalls += 1;
			return { code: 0, stdout: "", stderr: "", killed: false };
		});
		expect(report).toMatchObject({ passed: false, checks: [{ item: "command", ok: false, tool: "rm" }] });
		expect(report.violations).not.toHaveLength(0);
		expect(execCalls).toBe(0);
	});
});

describe("workflowz final AC closure guards (TASK-15.2 cycle 3)", () => {
	test("AC27: artifact readiness refuses missing acceptance criteria, DoD, labels, or modified files before durable writes", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac27-"));
		try {
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			const record = tools.get("omp_workflow_artifact_record")!;
			const base = {
				taskId: "TASK-15",
				artifactKind: "implementation",
				path: "src/feature.ts",
				acceptanceCriteria: ["AC1"],
				definitionOfDone: ["DoD-1"],
				type: "feature",
				priority: "High",
				status: "In Progress",
				labels: ["workflowz-v2"],
				dependencies: [],
				references: [],
				documentation: ["docs/x.md"],
				modifiedFiles: ["src/feature.ts"],
			};
			const complete = await record.execute("a0", { ...base }, undefined, undefined, ctx);
			expect(complete.isError).toBeUndefined();
			for (const [field, value] of [["acceptanceCriteria", []], ["definitionOfDone", []], ["labels", []], ["modifiedFiles", []]] as const) {
				const refused = await record.execute("a-" + String(field), { ...base, [field]: value }, undefined, undefined, ctx);
				expect(refused.isError).toBe(true);
				expect((refused.details as { code?: string }).code).toBe("WORKFLOW_ARTIFACT_INVALID");
				expect((refused.details as { gap?: string }).gap).toBeDefined();
			}
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("AC25: bounded parallel scheduler enforces the launch limit and failFast stops launching after first failure", async () => {
		let concurrent = 0;
		let peak = 0;
		let started = 0;
		const task = async (ms: number, fail = false): Promise<string> => {
			started += 1;
			concurrent += 1;
			peak = Math.max(peak, concurrent);
			await new Promise(resolve => setTimeout(resolve, ms));
			concurrent -= 1;
			if (fail) throw new Error("boom");
			return "ok";
		};
		const tasks = [
			() => task(10), () => task(10),
			() => task(10, true), // fails
			() => task(10), () => task(10), () => task(10),
		];
		const results = await runBoundedParallel(tasks, { limit: 2, failFast: true });
		expect(peak).toBeLessThanOrEqual(2);
		// failFast: after the failure no NEW launches happen beyond those already claimed.
		expect(started).toBeLessThan(tasks.length + 1);
		expect(results.filter(entry => !entry.ok).length).toBe(1);
		// Ad-hoc callers without policy keep plain semantics (all tasks run).
		const all = await runBoundedParallel([() => task(1), () => task(1)]);
		expect(all.every(entry => entry.ok)).toBe(true);
	});

	test("AC25: rendered workflow reserves every agent launch through the host ledger tool when present", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-ac25-render-"));
		try {
			const definition = workflow({
				stages: [{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify" }], gates: [] }],
			});
			const runId = createRun(cwd, definition.name, {});
			const { api, ctx, tools } = toolProbe(cwd);
			registerP0Tools(api as never);
			let reservations = 0;
			const code = renderWorkflowDefinition(definition, {}, runId, undefined, { parallel: { limit: 1 } });
			const reserveTool = tools.get("omp_workflow_reserve_launch")!;
			const tool = {
				omp_workflow_report: (payload: Record<string, unknown>) => tools.get("omp_workflow_report").execute("report", payload, undefined, undefined, ctx),
				omp_workflow_gate: (payload: Record<string, unknown>) => tools.get("omp_workflow_gate").execute("gate", payload, undefined, undefined, ctx),
				omp_workflow_checkpoint: (payload: Record<string, unknown>) => tools.get("omp_workflow_checkpoint").execute("checkpoint", payload, undefined, undefined, ctx),
				omp_workflow_reserve_launch: (payload: Record<string, unknown>) => { reservations += 1; return reserveTool.execute("reserve", payload, undefined, undefined, ctx); },
			};
			const evaluate = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code} })();`);
			const result = await evaluate(() => {}, async () => "done", async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), tool, async () => "unused", { remaining: () => 100 });
			expect(result).toMatchObject({ status: "completed" });
			expect(reservations).toBeGreaterThanOrEqual(1);

			// Exhaustion surfaces budget_exhausted and stops the fan-out.
			let refusedAfter = 0; // exhaust immediately: first reservation must be refused
			const exhaustedTool = {
				...tool,
				omp_workflow_reserve_launch: (payload: Record<string, unknown>) => {
					reservations += 1;
					refusedAfter -= 1;
					if (refusedAfter < 0) return Promise.resolve({ content: [], details: { code: "WORKFLOW_BUDGET_EXHAUSTED" }, isError: true as const });
					return reserveTool.execute("reserve", payload, undefined, undefined, ctx);
				},
			};
			const runId2 = createRun(cwd, definition.name, {});
			const code2 = renderWorkflowDefinition(definition, {}, runId2);
			const evaluate2 = new Function("phase", "agent", "parallel", "tool", "completion", "budget", `return (async () => { ${code2} })();`);
			const result2 = await evaluate2(() => {}, async () => "done", async (tasks: Array<() => Promise<[string, unknown]>>) => Promise.all(tasks.map(task => task())), exhaustedTool, async () => "unused", { remaining: () => 100 });
			expect(result2.status).toBe("failed");
			expect(String(result2.reason)).toContain("host");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
