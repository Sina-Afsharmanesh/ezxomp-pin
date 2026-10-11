import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Settings, settings } from "../plugins/extensible-workflows/node_modules/@oh-my-pi/pi-coding-agent";
type SettingsTestModule = { resetSettingsForTest(): void };
const { resetSettingsForTest } = await import(new URL("../plugins/extensible-workflows/node_modules/@oh-my-pi/pi-coding-agent/src/config/settings.ts", import.meta.url).href) as SettingsTestModule;
import extensibleWorkflows from "../plugins/extensible-workflows/src/index.ts";
import {
	aggregateRunStatistics,
	appendRunEvent,
	applyWorkflowActivity,
	createRun,
	journalMirrorRefs,
	probeAdapterHealth,
	reconstructRunMirrors,
	saveWorkflowDefinition,
	type WorkflowFileV2,
} from "../plugins/extensible-workflows/src/runtime.ts";

function tempCwd(): string {
	return mkdtempSync(join(tmpdir(), "workflowz-observability-"));
}

function definition(name: string, templated = false): WorkflowFileV2 {
	return {
		schemaVersion: 2,
		name,
		description: `Description for ${name}`,
		inputs: templated ? { value: { description: "Value", required: false } } : {},
		stages: [{
			id: "verify",
			label: "Verify",
			tasks: [{ id: "worker", prompt: "Verify" }],
			gates: templated ? [{ id: "template", type: "exec", executable: "echo", args: ["{{input.value}}"] }] : [],
		}],
	};
}

function extensionProbe(): { api: unknown; handlers: Map<string, Function>; entries: Array<{ type: string; data: unknown }> } {
	const handlers = new Map<string, Function>();
	const entries: Array<{ type: string; data: unknown }> = [];
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		handlers,
		entries,
		api: {
			zod: schema,
			registerTool: () => {},
			registerCommand: () => {},
			appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
			on: (event: string, handler: Function) => handlers.set(event, handler),
		},
	};
}

describe("workflowz observability", () => {
	test("filters session mirrors and lets journal references and status win", async () => {
		const cwd = tempCwd();
		const runId = createRun(cwd, "release", {}, { routeRef: "route://journal" });
		appendRunEvent(cwd, runId, { event: "checkpoint", workflow: "release", status: "approved", artifactRefs: ["artifact://one", "artifact://one", "artifact://two"] });
		const snapshot = {
			type: "custom",
			customType: "ezxomp.workflowz.mirror",
			data: { runId, workflow: "release", status: "completed", routeRef: "route://snapshot", journalRef: "journal://snapshot", artifactRefs: ["artifact://snapshot"] },
		};
		try {
			const mirrors = reconstructRunMirrors([{ type: "custom", customType: "other", data: snapshot.data }, snapshot, { type: "custom", customType: "ezxomp.workflowz.mirror", data: {} }]);
			expect(mirrors).toMatchObject([{ runId, workflow: "release", status: "completed", routeRef: "route://snapshot", journalRef: "journal://snapshot", artifactRefs: ["artifact://snapshot"] }]);
			expect(journalMirrorRefs(cwd, runId)).toMatchObject({ routeRef: "route://journal", artifactRefs: ["artifact://one", "artifact://two"] });

			const authoritative = journalMirrorRefs(cwd, runId);
			expect(authoritative).not.toMatchObject({ routeRef: "route://snapshot", artifactRefs: ["artifact://snapshot"] });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("clears only workflow-owned activity for every terminal status", () => {
		for (const terminal of ["completed", "failed", "cancelled", "stopped", "budget_exhausted"]) {
			const calls: Array<[string, string | undefined]> = [];
			const state = { titleOwned: false, messageOwned: false };
			const ui = { setTitle: (value: string) => calls.push(["title", value]), setWorkingMessage: (value?: string) => calls.push(["message", value]) };
			applyWorkflowActivity(ui, state, "12345678-run", "release", "active", "verify");
			applyWorkflowActivity(ui, state, "12345678-run", "release", terminal);
			expect(calls).toMatchObject([["title", "workflowz: release (12345678) — active"], ["message", "workflowz: release — active (verify)"], ["title", ""], ["message", undefined]]);
			expect(state).toEqual({ titleOwned: false, messageOwned: false });
		}
		const unrelatedCalls: Array<[string, string | undefined]> = [];
		applyWorkflowActivity({ setTitle: value => unrelatedCalls.push(["title", value]), setWorkingMessage: value => unrelatedCalls.push(["message", value]) }, { titleOwned: false, messageOwned: false }, "12345678-run", "release", "completed");
		expect(unrelatedCalls).toHaveLength(0);
	});

	test("gates notices by mode and caps catalog entries with counts", async () => {
		const cwd = tempCwd();
		const prefix = `notice-${Date.now()}`;
		for (let index = 0; index < 13; index++) {
			const saved = saveWorkflowDefinition(definition(`${prefix}-${index}`, index === 0), "project", false, cwd);
			if (!saved.path) throw new Error("fixture workflow was not saved");
		}
		createRun(cwd, `${prefix}-0`, {});
		const { api, handlers } = extensionProbe();
		extensibleWorkflows(api as never);
		const beforeAgentStart = handlers.get("before_agent_start")!;
		const ctx = { cwd, hasUI: false, ui: {}, sessionManager: { getBranch: () => [] } };
		const initialize = async (enabled: boolean, workflow: string) => {
			resetSettingsForTest();
			await Settings.init({ inMemory: true, cwd, overrides: { "magicKeywords.enabled": enabled, "magicKeywords.workflow": workflow } });
		};
		try {
			await initialize(false, "workflowz");
			expect(await beforeAgentStart({ prompt: "Please use workflowz now.", systemPrompt: ["base"] }, ctx)).toBeUndefined();
			await initialize(true, "other");
			expect(await beforeAgentStart({ prompt: "Please use workflowz now.", systemPrompt: ["base"] }, ctx)).toBeUndefined();
			await initialize(true, "workflowz");
			expect(settings.get("magicKeywords.enabled")).toBe(true);
			expect(String(settings.get("magicKeywords.workflow"))).toBe("workflowz");
			const result = await beforeAgentStart({ prompt: "Please use workflowz now.", systemPrompt: ["base"] }, ctx) as { systemPrompt: string[] };
			const notice = result.systemPrompt.at(-1)!;
			expect(notice).toContain("Template gates: 1");
			expect(notice).toContain("Active runs: 1");
			expect(notice.match(/^- /gm)).toHaveLength(12);
		} finally {
			resetSettingsForTest();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("probes only allowlisted adapter versions and reports missing prerequisites", async () => {
		const cwd = tempCwd();
		const calls: Array<{ command: string; args: string[] }> = [];
		const health = await probeAdapterHealth(cwd, async (command, args) => {
			calls.push({ command, args });
			if (command === "fallow") return { code: 0, stdout: "fallow 1.0", stderr: "", killed: false };
			if (command === "oxlint") return { code: 0, stdout: "oxlint 2.0", stderr: "", killed: false };
			if (command === "rust-analyzer") return { code: 0, stdout: "rust-analyzer 3.0", stderr: "", killed: false };
			if (command === "node") return { code: 0, stdout: "node 22", stderr: "", killed: false };
			return { code: 127, stdout: "", stderr: "missing", killed: false };
		});
		try {
			const allowed = new Set(["fallow", "vp", "oxlint", "rust-analyzer", "gopls", "pyright-langserver", "typescript-language-server", "frontmatter", "node", "rustc", "go", "python3", "tsc"]);
			expect(calls.every(call => allowed.has(call.command) && call.args.every(arg => arg === "--version" || arg === "version"))).toBe(true);
			expect(health).toMatchObject({ fallow: { detected: true }, linter: { detected: true, kind: "oxlint" }, lsp: { detected: true, kind: "rust-analyzer" }, mutated: false });
			expect(health.missingPrerequisites).toEqual(expect.arrayContaining(["rustc", "go", "python3", "tsc"]));
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("classifies direct and chain routes plus gate, missing-tool, and checkpoint outcomes", () => {
		const cwd = tempCwd();
		const direct = createRun(cwd, "direct", {}, { routeRef: "route://direct", routeMode: "direct" });
		appendRunEvent(cwd, direct, { event: "completed", workflow: "direct", status: "completed" });
		const chain = createRun(cwd, "chain", {}, { routeRef: "route://chain", routeMode: "chain" });
		appendRunEvent(cwd, chain, { event: "completed", workflow: "chain", status: "completed" });
		const gateFailure = createRun(cwd, "gate", {});
		appendRunEvent(cwd, gateFailure, { event: "gate", workflow: "gate", stageId: "verify", gateId: "lint", status: "failed", report: { violations: ["lint failed"] } });
		appendRunEvent(cwd, gateFailure, { event: "failed", workflow: "gate", status: "failed" });
		const missingTool = createRun(cwd, "missing", {});
		appendRunEvent(cwd, missingTool, { event: "gate", workflow: "missing", stageId: "verify", gateId: "tool", status: "failed", report: { violations: ["command not found"], exitCode: 127 } });
		appendRunEvent(cwd, missingTool, { event: "failed", workflow: "missing", status: "failed" });
		const checkpoints = createRun(cwd, "checkpoints", {});
		appendRunEvent(cwd, checkpoints, { event: "checkpoint", workflow: "checkpoints", status: "approved" });
		appendRunEvent(cwd, checkpoints, { event: "checkpoint", workflow: "checkpoints", status: "rejected" });
		appendRunEvent(cwd, checkpoints, { event: "completed", workflow: "checkpoints", status: "completed" });
		try {
			expect(aggregateRunStatistics(cwd, [direct, chain, gateFailure, missingTool, checkpoints])).toEqual({ total: 5, routePlans: 2, chainCompletions: 1, gateFailures: 1, missingToolFailures: 1, checkpointOutcomes: { approved: 1, rejected: 1 } });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
