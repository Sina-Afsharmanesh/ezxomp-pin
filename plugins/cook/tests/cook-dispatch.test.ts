/**
 * Dispatch contract tests for cook_dispatch_* tools.
 *
 * Regression root cause (2026-08-27 solutessera-ade session): the dispatch
 * tools returned a prose instruction ("spawn via the native task tool") with
 * no verification. When the orchestrator's session lacked the task tool
 * (evo allowlist snapshot gap), the agent burned ~40 turns improvising with
 * `omp agents unpack` / `omp -p` workarounds instead of failing fast.
 *
 * Contract now: the tool checks the live tool surface for `task`; present →
 * structured dispatch payload; absent → isError + remediation that forbids
 * CLI improvisation.
 *
 * Dynamic import in freshExtension is intentional: it exercises the plugin
 * module-loading boundary per test, matching the established pattern in
 * cook-durability.test.ts (vi.resetModules + per-test registration state).
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { profileForStage } from "../extensions/constants.ts";
import makePi, {
	__getToolHandler,
	__resetHandlers,
	makeCtx,
	type CtxStub,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

type ToolLister = (opts?: unknown) => Promise<{ name: string }[]>;

interface DispatchResult {
	content: { text: string }[];
	isError?: boolean;
}

function seedToolSurface(pi: PiStub, tools: { name: string }[]): void {
	// The cook mock PiStub predates getAllTools on the real ExtensionAPI; seed
	// it directly so dispatchPayload's live-surface probe observes it.
	(pi as unknown as Record<string, unknown>).getAllTools = vi.fn(async () => [...tools]);
}

function seedActiveSurface(pi: PiStub, active: string[]): void {
	// getActiveTools reflects the session's active set (post --tools / tools:
	// profile filtering) — dispatchPayload prefers it over getAllTools.
	(pi as unknown as Record<string, unknown>).getActiveTools = vi.fn(async () => [...active]);
}

async function freshExtension(pi: PiStub) {
	vi.resetModules?.();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
	return mod;
}

async function runDispatch(
	pi: PiStub,
	ctx: CtxStub,
	role: string,
	params: Record<string, unknown>,
): Promise<DispatchResult> {
	const handler = __getToolHandler(`cook_dispatch_${role}`);
	return (await handler.execute(
		"id",
		params,
		new AbortController().signal,
		null,
		ctx,
	)) as DispatchResult;
}

const ROLES = ["planner", "scout", "researcher", "worker", "validator", "judge"] as const;
type Role = (typeof ROLES)[number];

/** Minimal valid params per dispatch tool (task_id required except scout). */
const PARAMS: Record<Role, Record<string, unknown>> = {
	planner: { task_id: "TASK-X" },
	scout: { query: "find auth flow", task_id: "TASK-X" },
	researcher: { task_id: "TASK-X", problem: "why slow" },
	worker: { task_id: "TASK-X" },
	validator: { task_id: "TASK-X" },
	judge: { task_id: "TASK-X" },
};

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "cook-dispatch-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
	__resetHandlers();
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("cook dispatch — task-tool availability contract", () => {
	let pi: PiStub;
	let ctx: CtxStub;

	beforeEach(() => {
		pi = makePi();
		ctx = makeCtx({ cwd: workDir, hasUI: true });
	});

	it("emits a structured dispatch payload when task is registered", async () => {
		// getAllTools reports the native task tool — the healthy session shape.
		seedToolSurface(pi, [{ name: "task" }, { name: "hub" }, { name: "eval" }]);

		await freshExtension(pi);

		for (const role of ROLES) {
			const result = await runDispatch(pi, ctx, role, PARAMS[role]);

			expect(result.isError).toBeFalsy();
			const text = result.content[0]?.text ?? "";
			expect(text).toContain(`task({ agent: "cook-${role}"`);
			expect(text).toContain("Brief (verbatim):");
		}
	});

	it("fails fast with remediation when task is absent from the tool surface", async () => {
		// The failing session shape: MCP-only toolset, no task/hub/eval.
		seedToolSurface(pi, [{ name: "mcp__backlog_task_list" }, { name: "cook_start" }]);

		await freshExtension(pi);

		for (const role of ROLES) {
			const result = await runDispatch(pi, ctx, role, PARAMS[role]);

			expect(result.isError).toBe(true);
			const text = result.content[0]?.text ?? "";
			expect(text).toContain("BLOCKED");
			expect(text).toContain("task` tool is NOT");
			// Forbids the exact improvisation loop from the regression session.
			expect(text).toContain("do NOT improvise");
			expect(text).toContain("omp agents unpack");
			// Preserves the fresh-context rule instead of inviting inline work.
			expect(text).toContain(`do not simulate the cook-${role} inline`);
		}
	});

	it("degrades to payload (not block) when the tool surface cannot be read", async () => {
		// getAllTools missing entirely — legacy host; do not dead-end dispatch.
		const bare = makePi();
		await freshExtension(bare);
		// Remove the method AFTER extension load so the probe takes the catch path.
		delete (bare as unknown as Record<string, unknown>).getAllTools;

		const handler = __getToolHandler("cook_dispatch_worker");
		const result = (await handler.execute(
			"id",
			{ task_id: "TASK-X" },
			new AbortController().signal,
			null,
			ctx,
		)) as DispatchResult;

		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain('task({ agent: "cook-worker"');
	});

	it("blocks when task is registered but inactive (active surface wins)", async () => {
		// Judge blocking finding: registered ≠ active. A --tools profile can
		// exclude task while it stays registered; the dispatch must still fail.
		seedToolSurface(pi, [{ name: "task" }, { name: "hub" }]);
		seedActiveSurface(pi, ["hub", "mcp__backlog_task_list"]); // task inactive

		await freshExtension(pi);

		const result = await runDispatch(pi, ctx, "worker", { task_id: "TASK-X" });

		expect(result.isError).toBe(true);
		const text = result.content[0]?.text ?? "";
		expect(text).toContain("BLOCKED");
		expect(text).toContain("active tool surface");
	});

	it("blocks when the active surface reads back empty (defined [] is known)", async () => {
		// Judge re-review finding: a defined-but-empty getActiveTools() result
		// is a readable surface with no task — must block, not fall back.
		seedToolSurface(pi, [{ name: "task" }]);
		seedActiveSurface(pi, []);

		await freshExtension(pi);

		const result = await runDispatch(pi, ctx, "worker", { task_id: "TASK-X" });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("BLOCKED");
	});
});

describe("upstream-derived stage profile dispatch", () => {
	it("maps conditional audit and refute stages to distinct profiles", async () => {
		expect(profileForStage("audit")).toBe("cook-audit");
		expect(profileForStage("refute")).toBe("cook-refute");
		expect(profileForStage("unsupported")).toBeUndefined();

		const pi = makePi();
		const ctx = makeCtx({ cwd: workDir, hasUI: true });
		seedToolSurface(pi, [{ name: "task" }, { name: "hub" }]);
		await freshExtension(pi);

		const audit = await __getToolHandler("cook_dispatch_audit").execute(
			"id", { task_id: "TASK-X", scan: "scanner clean" }, new AbortController().signal, null, ctx,
		) as DispatchResult;
		expect(audit.isError).toBeFalsy();
		expect(audit.content[0]?.text).toContain('task({ agent: "cook-audit"');
		expect(audit.content[0]?.text).toContain("scanner clean");

		const refute = await __getToolHandler("cook_dispatch_refute").execute(
			"id", { task_id: "TASK-X", finding: { source: "judge", file: "src/a.ts", line: 1, what: "guard" } }, new AbortController().signal, null, ctx,
		) as DispatchResult;
		expect(refute.isError).toBeFalsy();
		expect(refute.content[0]?.text).toContain('task({ agent: "cook-refute"');
	});

	it("fails fast for audit when native task is inactive", async () => {
		const pi = makePi();
		const ctx = makeCtx({ cwd: workDir, hasUI: true });
		seedToolSurface(pi, [{ name: "task" }, { name: "hub" }]);
		seedActiveSurface(pi, ["hub"]);
		await freshExtension(pi);
		const result = await __getToolHandler("cook_dispatch_audit").execute(
			"id", { task_id: "TASK-X" }, new AbortController().signal, null, ctx,
		) as DispatchResult;
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("active tool surface");
	});
});
