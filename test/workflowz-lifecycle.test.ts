import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendRunEvent,
	contentHash,
	createRun,
	readRunEvents,
	resumeWorkflowRun,
	retryWorkflowRun,
	saveWorkflowDefinition,
	stopRun,
	type WorkflowFileV2,
} from "../plugins/extensible-workflows/src/runtime.ts";
import { registerP0Tools } from "../plugins/extensible-workflows/src/p0-tools.ts";

type ProbeSchema = {
	isOptional: boolean;
	shape?: Record<string, ProbeSchema>;
	optional: () => ProbeSchema;
	default: (_value: unknown) => ProbeSchema;
};

function probeSchema(isOptional = false): ProbeSchema {
	return {
		isOptional,
		optional: () => probeSchema(true),
		default: () => probeSchema(isOptional),
	};
}

function recoveryToolSchemas(): Map<string, ProbeSchema> {
	const tools = new Map<string, ProbeSchema>();
	const zod = {
		string: () => probeSchema(),
		boolean: () => probeSchema(),
		number: () => probeSchema(),
		unknown: () => probeSchema(),
		record: () => probeSchema(),
		array: () => probeSchema(),
		enum: () => probeSchema(),
		object: (shape: Record<string, ProbeSchema>) => ({ ...probeSchema(), shape }),
	};
	registerP0Tools({
		zod,
		registerTool: (spec: { name: string; parameters: ProbeSchema }) => tools.set(spec.name, spec.parameters),
	} as never);
	return tools;
}

const workflow: WorkflowFileV2 = {
	schemaVersion: 2,
	name: "release",
	description: "Release the staged change",
	inputs: { environment: { description: "Target environment", required: true } },
	stages: [
		{ id: "plan", label: "Plan", tasks: [{ id: "planner", prompt: "Plan {{input.environment}}" }], gates: [] },
		{ id: "verify", label: "Verify", tasks: [{ id: "verifier", prompt: "Verify {{result.plan}}" }], gates: [] },
	],
};

function completedRun(): { cwd: string; runId: string } {
	const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
	const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) });
	appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_start", stageId: "plan", status: "running" });
	appendRunEvent(cwd, runId, {
		workflow: workflow.name,
		event: "stage_complete",
		stageId: "plan",
		status: "running",
		results: { plan: "approved" },
	});
	return { cwd, runId };
}

describe("workflowz lifecycle", () => {
	test("seeds only completed stage results into a resumed run", () => {
		const { cwd, runId } = completedRun();
		try {
			const resumed = resumeWorkflowRun(cwd, runId, workflow);
			expect(resumed.error).toBeUndefined();
			expect(resumed.run).toMatchObject({
				parentRunId: runId,
				workflow: workflow.name,
				inputs: { environment: "staging" },
				results: { plan: "approved" },
				skippedStages: ["plan"],
			});
			expect(resumed.run?.runId).not.toBe(runId);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("starts retry with the original inputs and no seeded results", () => {
		const { cwd, runId } = completedRun();
		try {
			const retried = retryWorkflowRun(cwd, runId, workflow);
			expect(retried.error).toBeUndefined();
			expect(retried.run).toMatchObject({
				parentRunId: runId,
				workflow: workflow.name,
				inputs: { environment: "staging" },
				results: {},
				skippedStages: [],
			});
			expect(retried.run?.runId).not.toBe(runId);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("refuses a malformed journal instead of inventing results", () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) });
		appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_complete", stageId: "plan", status: "running", results: { plan: "approved" } });
		try {
			const resumed = resumeWorkflowRun(cwd, runId, workflow);
			expect((resumed.error?.details as { code?: string })?.code).toBe("WORKFLOW_RESUME_REFUSED");
			expect(resumed.run).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("session snapshot data cannot substitute for journal proof", () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) });
		try {
			// A fake in-memory "snapshot" of a completed stage must not satisfy resume — journal has no evidence.
			const resumed = resumeWorkflowRun(cwd, runId, workflow);
			expect(resumed.error).toBeDefined();
			expect(resumed.run).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
	test("refuses a journal with an event before its created record", () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) });
		const journal = join(cwd, ".omp", "workflows", "runs", runId, "journal.jsonl");
		const created = readFileSync(journal, "utf8");
		writeFileSync(journal, `${JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", runId, workflow: workflow.name, event: "stage_start", stageId: "plan", status: "running" })}\n${created}`);
		try {
			const resumed = resumeWorkflowRun(cwd, runId, workflow);
			expect((resumed.error?.details as { code?: string })?.code).toBe("WORKFLOW_RESUME_REFUSED");
			expect(resumed.run).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("requires workflow in registered recovery schemas", () => {
		const schemas = recoveryToolSchemas();
		for (const toolName of ["omp_workflow_resume", "omp_workflow_retry"]) {
			const workflowParameter = schemas.get(toolName)?.shape?.workflow;
			expect(workflowParameter).toBeDefined();
			expect(workflowParameter?.isOptional).toBe(false);
		}
	});
});

type RecoveryTool = {
	name: string;
	execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, update: unknown, ctx: Record<string, unknown>) => Promise<{ details: unknown; isError?: true }>;
};

function recoveryToolExecutors(): Map<string, RecoveryTool> {
	const tools = new Map<string, RecoveryTool>();
	const zod = {
		string: () => probeSchema(),
		boolean: () => probeSchema(),
		number: () => probeSchema(),
		unknown: () => probeSchema(),
		record: () => probeSchema(),
		array: () => probeSchema(),
		enum: () => probeSchema(),
		object: (shape: Record<string, ProbeSchema>) => ({ ...probeSchema(), shape }),
	};
	registerP0Tools({
		zod,
		exec: async () => ({ code: 0, stdout: "", stderr: "" }),
		appendEntry: () => {},
		registerTool: (spec: RecoveryTool) => tools.set(spec.name, spec),
	} as never);
	return tools;
}

function registeredRecoveryTool(tools: Map<string, RecoveryTool>, name: string): RecoveryTool {
	const tool = tools.get(name);
	if (!tool) throw new Error(`expected ${name} to register`);
	return tool;
}

function persistRecoveryWorkflow(cwd: string): void {
	const saved = saveWorkflowDefinition(workflow, "project", false, cwd);
	if (saved.error) throw new Error(saved.error.details.message);
}

const recoveryProvenance = {
	ownerIds: ["TASK-15.1", "TASK-15.1.3"],
	gitCommit: "commit-derived-lineage",
	gitBranch: "branch-derived-lineage",
	worktreeName: "derived-lineage-isolation",
	routeRef: "route://derived-lineage",
	previewRef: "preview://derived-lineage",
};

function provenancedCompletedRun(cwd: string): string {
	const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow), ...recoveryProvenance });
	appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_start", stageId: "plan", status: "running" });
	appendRunEvent(cwd, runId, {
		workflow: workflow.name,
		event: "stage_complete",
		stageId: "plan",
		status: "running",
		results: { plan: "approved" },
	});
	return runId;
}

function createdEvent(cwd: string, runId: string) {
	const event = readRunEvents(cwd, runId)[0];
	if (event?.event !== "created") throw new Error(`expected created journal record for ${runId}`);
	return event;
}

function resultRunId(details: unknown): string {
	if (typeof details !== "object" || details === null) throw new Error("recovery tool returned no details");
	const runId = (details as { runId?: unknown }).runId;
	if (typeof runId !== "string") throw new Error("recovery tool returned no child run ID");
	return runId;
}

describe("workflowz recovery provenance through tools", () => {
	test("returns and journals full provenance for a resumed run", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		try {
			persistRecoveryWorkflow(cwd);
			const parentRunId = provenancedCompletedRun(cwd);
			const resume = registeredRecoveryTool(recoveryToolExecutors(), "omp_workflow_resume");
			const resumed = await resume.execute("resume", { runId: parentRunId, workflow: workflow.name }, undefined, undefined, { cwd, hasUI: false });
			expect(resumed.isError).toBeUndefined();
			const runId = resultRunId(resumed.details);
			expect(runId).not.toBe(parentRunId);
			expect(createdEvent(cwd, runId)).toMatchObject({ parentRunId, mode: "resume", ...recoveryProvenance });
			expect(resumed).toMatchObject({
				details: {
					parentRunId,
					runId,
					workflow: workflow.name,
					inputs: { environment: "staging" },
					seededResults: { plan: "approved" },
					skippedStages: ["plan"],
					...recoveryProvenance,
				},
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("returns and journals full provenance for a retried run without seeded results", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		try {
			persistRecoveryWorkflow(cwd);
			const parentRunId = provenancedCompletedRun(cwd);
			const retry = registeredRecoveryTool(recoveryToolExecutors(), "omp_workflow_retry");
			const retried = await retry.execute("retry", { runId: parentRunId, workflow: workflow.name }, undefined, undefined, { cwd, hasUI: false });
			expect(retried.isError).toBeUndefined();
			const runId = resultRunId(retried.details);
			expect(runId).not.toBe(parentRunId);
			const events = readRunEvents(cwd, runId);
			expect(createdEvent(cwd, runId)).toMatchObject({ parentRunId, mode: "retry", ...recoveryProvenance });
			const retriedEvent = events.find(event => event.event === "retried");
			expect(retriedEvent).toMatchObject({ parentRunId });
			expect(retriedEvent).not.toHaveProperty("seededResults");
			expect(retried).toMatchObject({
				details: {
					parentRunId,
					runId,
					workflow: workflow.name,
					inputs: { environment: "staging" },
					...recoveryProvenance,
				},
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("refuses malformed stopped terminal incompatible and snapshot-only sources through the resume tool", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-lifecycle-"));
		try {
			persistRecoveryWorkflow(cwd);
			const resume = registeredRecoveryTool(recoveryToolExecutors(), "omp_workflow_resume");
			const sources: Array<() => string> = [
				() => {
					const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) });
					appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_complete", stageId: "plan", status: "running", results: { plan: "approved" } });
					return runId;
				},
				() => {
					const runId = provenancedCompletedRun(cwd);
					stopRun(cwd, runId);
					return runId;
				},
				() => {
					const runId = provenancedCompletedRun(cwd);
					appendRunEvent(cwd, runId, { workflow: workflow.name, event: "complete", status: "completed" });
					return runId;
				},
				() => {
					const runId = createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: "incompatible-content" });
					appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_start", stageId: "plan", status: "running" });
					appendRunEvent(cwd, runId, { workflow: workflow.name, event: "stage_complete", stageId: "plan", status: "running", results: { plan: "approved" } });
					return runId;
				},
				() => createRun(cwd, workflow.name, { environment: "staging" }, { contentHash: contentHash(workflow) }),
			];
			for (const source of sources) {
				const rejected = await resume.execute("resume", { runId: source(), workflow: workflow.name }, undefined, undefined, { cwd, hasUI: false });
				expect(rejected).toMatchObject({ isError: true, details: { code: "WORKFLOW_RESUME_REFUSED" } });
			}
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
