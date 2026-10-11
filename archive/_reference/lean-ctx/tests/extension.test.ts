/**
 * TASK-15.1: Failing tests for conditional tool_call hook in omp-lean-ctx.
 *
 * These tests define the DESIRED conditional blocking behavior.
 * They are expected to FAIL against the current extension code (RED phase).
 *
 * Desired behavior:
 * - In "tui" mode: tool_call SHOULD block native read/grep/glob (redirect to ctx_*).
 * - In "print"/"rpc"/"json" modes: tool_call should NOT block native tools
 *   if no ctx_* tool has been observed to succeed.
 * - After a ctx_* tool_result success, blocking becomes active (tools confirmed working).
 * - Context briefing should only inject when mode supports it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import makePi, {
	__emitHook,
	__resetHandlers,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

// Dynamically import extension per test to reset module-level `detectedMode` state.
// Exception to no-dynamic-import: test boundary — resetting module singleton state.
async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

describe("lean-ctx extension: conditional tool_call hook", () => {
	let pi: PiStub;

	beforeEach(() => {
		__resetHandlers();
		pi = makePi();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Test 1: In "print" mode (subagent), native tools should NOT be blocked ──
	//
	// When OMP runs as a subagent (mode = 'print'), lean-ctx MCP tools may not
	// be available. Blocking native read/grep/glob here leaves the agent with
	// NO working tools — a hard failure.
	//
	// Current behavior: blocks unconditionally → this test FAILS.
	it("tool_call hook should NOT block native tools when mode is 'print' and no ctx_* observed", async () => {
		await freshExtension(pi);

		const printCtx = makeCtx({ mode: "print", hasUI: false });
		await __emitHook("session_start", {}, printCtx);

		const results = await __emitHook(
			"tool_call",
			{ toolName: "read", input: { path: "/some/file.ts" } },
			printCtx,
		);

		const blockResult = results.find((r) => r !== undefined) as
			| { block?: boolean }
			| undefined;

		// DESIRED: in print mode without ctx_* confirmed, don't block
		expect(blockResult?.block).toBeFalsy();
	});

	// ── Test 2: In "tui" mode (main agent), native tools SHOULD be blocked ──
	//
	// The TUI is the interactive context where lean-ctx MCP tools are connected
	// and available, so redirecting native tools to ctx_* is appropriate.
	//
	// Current behavior: always blocks → this test PASSES (matches current behavior).
	it("tool_call hook SHOULD block native tools when mode is 'tui'", async () => {
  // Isolate from HOST evo state: without this, the suite fails on any machine
  // running with evo-mode main:true (~/.omp/agent/config.yml), since
  // isEvoMainActive() reads the real config when OMP_HOME is unset.
  const tmpHome = makeEvoConfig(false);
  process.env.OMP_HOME = tmpHome;

  try {
		await freshExtension(pi);

		const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
		await __emitHook("session_start", {}, tuiCtx);

		const results = await __emitHook(
			"tool_call",
			{ toolName: "read", input: { path: "/some/file.ts" } },
			tuiCtx,
		);

		const blockResult = results.find((r) => r !== undefined) as
			| { block?: boolean; reason?: string }
			| undefined;

		// DESIRED: in tui mode, block native tools with redirect
		expect(blockResult?.block).toBe(true);
		expect(blockResult?.reason).toContain("ctx_read");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
	});

	// ── Test 3: After a ctx_* tool succeeds in "print" mode, blocking SHOULD activate ──
	//
	// If the extension observes a successful ctx_read/ctx_search/ctx_glob result,
	// the lean-ctx MCP server is connected and tools work.  Blocking native reads
	// is then appropriate even in print mode.
	//
	// Current behavior: no such tracking exists → this test FAILS.
	it("tool_call hook should enable blocking in 'print' mode after ctx_* tool succeeds", async () => {
  // Isolate from HOST evo state: without this, the suite fails on any machine
  // running with evo-mode main:true (~/.omp/agent/config.yml), since
  // isEvoMainActive() reads the real config when OMP_HOME is unset.
  const tmpHome = makeEvoConfig(false);
  process.env.OMP_HOME = tmpHome;

  try {
		await freshExtension(pi);

		const printCtx = makeCtx({ mode: "print", hasUI: false });
		await __emitHook("session_start", {}, printCtx);

		// Before ctx_* success: native read should NOT be blocked.
		const resultsBefore = await __emitHook(
			"tool_call",
			{ toolName: "read", input: { path: "/some/file.ts" } },
			printCtx,
		);
		const blockBefore = resultsBefore.find((r) => r !== undefined) as
			| { block?: boolean }
			| undefined;
		expect(blockBefore?.block).toBeFalsy();

		// Simulate: a ctx_read call succeeded via tool_result.
		await __emitHook(
			"tool_result",
			{
				toolName: "ctx_read",
				input: { path: "/some/file.ts" },
				content: [{ type: "text", text: "file contents" }],
				isError: false,
			},
			printCtx,
		);

		// After ctx_* success: native read SHOULD be blocked.
		const resultsAfter = await __emitHook(
			"tool_call",
			{ toolName: "read", input: { path: "/some/file.ts" } },
			printCtx,
		);
		const blockAfter = resultsAfter.find((r) => r !== undefined) as
			| { block?: boolean; reason?: string }
			| undefined;

		// DESIRED: after ctx_* success confirmation, block native tools even in print mode
		expect(blockAfter?.block).toBe(true);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
	});

	// ── Test 4a: Context briefing should NOT inject in "print" mode ──
	//
	// Subagents don't need the lean-ctx briefing; it's an extra token cost in
	// headless mode where agent steering is not relevant.
	//
	// Current behavior: skips briefing when mode !== "tui" → this test PASSES.
	it("context briefing should NOT inject developer messages in 'print' mode", async () => {
		await freshExtension(pi);

		const printCtx = makeCtx({ mode: "print", hasUI: false });
		await __emitHook("session_start", {}, printCtx);

		const contextResults = await __emitHook(
			"context",
			{
				messages: [
					{ role: "user", content: "hello", timestamp: Date.now() },
				],
			},
			printCtx,
		);

		const injection = contextResults.find((r) => r !== undefined) as
			| { messages?: unknown[] }
			| undefined;

		// Should not inject any messages in print mode
		expect(injection?.messages).toBeUndefined();
	});

	// ── Test 4b: Context briefing SHOULD inject in "tui" mode ──
	//
	// The TUI is the interactive context where the briefing has value.
	// This documents the existing correct behavior.
	it("context briefing SHOULD inject developer messages in 'tui' mode", async () => {
		await freshExtension(pi);

		const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
		await __emitHook("session_start", {}, tuiCtx);

		const contextResults = await __emitHook(
			"context",
			{
				messages: [
					{ role: "user", content: "hello", timestamp: Date.now() },
				],
			},
			tuiCtx,
		);

		const injection = contextResults.find((r) => r !== undefined) as
			| { messages?: Array<{ role: string; content: string }> }
			| undefined;

		// Should inject briefing in tui mode
		expect(injection?.messages).toBeDefined();
		expect(injection?.messages?.length).toBeGreaterThan(1);
		const briefing = injection?.messages?.find(
			(m) => m.role === "developer",
		);
		expect(briefing?.content).toContain("[lean-ctx: session active]");
	});

// ── URI bypass: protocol URIs should never be blocked ──
it("tool_call should NOT block read on skill:// URIs", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "read", input: { path: "skill://test-t3-app" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBeFalsy();
});

it("tool_call should NOT block read on agent:// URIs", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "read", input: { path: "agent://Task15Planner" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBeFalsy();
});

it("tool_call should NOT block read on memory:// URIs", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "read", input: { path: "memory://abc123" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBeFalsy();
});

it("tool_call SHOULD still block read on filesystem paths in tui mode", async () => {
  // Isolate from HOST evo state: without this, the suite fails on any machine
  // running with evo-mode main:true (~/.omp/agent/config.yml), since
  // isEvoMainActive() reads the real config when OMP_HOME is unset.
  const tmpHome = makeEvoConfig(false);
  process.env.OMP_HOME = tmpHome;

  try {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "read", input: { path: "/root/.omp/some-file.ts" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBe(true);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
});

// ── ctx_read protocol URI redirect: ctx_read cannot resolve OMP URIs ──
it("tool_call should block ctx_read on skill:// URIs and redirect to native read", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "ctx_read", input: { path: "skill://cook" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean; reason?: string } | undefined;
  expect(blockResult?.block).toBe(true);
  expect(blockResult?.reason).toContain("protocol URI");
  expect(blockResult?.reason).toContain("native read");
});

it("tool_call should block ctx_read on agent:// URIs", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "ctx_read", input: { path: "agent://some-agent" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBe(true);
});

it("tool_call should NOT block ctx_read on filesystem paths", async () => {
  await freshExtension(pi);
  const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
  await __emitHook("session_start", {}, tuiCtx);
  const results = await __emitHook("tool_call", { toolName: "ctx_read", input: { path: "/home/user/project/src/file.ts" } }, tuiCtx);
  const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
  expect(blockResult?.block).toBeFalsy();
});

// ── evo-mode deferral: when evo-mode main is active, lean-ctx should NOT block ──
// evo-mode manages the tool set via setActiveTools() and has its own redirects.
// lean-ctx defers to avoid double-blocking with conflicting messages.

/** Create a temp OMP_HOME with evo-mode config set to the given main/sub values. */
function makeEvoConfig(evoMain: boolean, evoSub: boolean = true): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-lean-ctx-test-"));
  const agentDir = path.join(tmpDir, "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  const configYml = `evo-mode:\n  main: ${evoMain}\n  sub: ${evoSub}\n`;
  fs.writeFileSync(path.join(agentDir, "config.yml"), configYml);
  return tmpDir;
}

it("tool_call should NOT block native read when evo-mode main is active", async () => {
  const tmpHome = makeEvoConfig(true);
  process.env.OMP_HOME = tmpHome;

  try {
    await freshExtension(pi);
    const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, tuiCtx);
    const results = await __emitHook("tool_call", { toolName: "read", input: { path: "/some/file.ts" } }, tuiCtx);
    const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
    // lean-ctx defers to evo — should NOT block
    expect(blockResult?.block).toBeFalsy();
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
});

it("tool_call SHOULD block native read when evo-mode main is inactive", async () => {
  const tmpHome = makeEvoConfig(false);
  process.env.OMP_HOME = tmpHome;

  try {
    await freshExtension(pi);
    const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, tuiCtx);
    const results = await __emitHook("tool_call", { toolName: "read", input: { path: "/some/file.ts" } }, tuiCtx);
    const blockResult = results.find((r) => r !== undefined) as { block?: boolean; reason?: string } | undefined;
    // evo off — lean-ctx handles the redirect
    expect(blockResult?.block).toBe(true);
    expect(blockResult?.reason).toContain("ctx_read");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
});

it("tool_call should NOT block grep when evo-mode main is active", async () => {
  const tmpHome = makeEvoConfig(true);
  process.env.OMP_HOME = tmpHome;

  try {
    await freshExtension(pi);
    const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, tuiCtx);
    const results = await __emitHook("tool_call", { toolName: "grep", input: { pattern: "TODO" } }, tuiCtx);
    const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
    expect(blockResult?.block).toBeFalsy();
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
});

it("evo deferral should NOT affect protocol URIs (still pass through)", async () => {
  const tmpHome = makeEvoConfig(true);
  process.env.OMP_HOME = tmpHome;

  try {
    await freshExtension(pi);
    const tuiCtx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, tuiCtx);
    // Protocol URIs already return undefined before the evo check — verify unchanged
    const results = await __emitHook("tool_call", { toolName: "read", input: { path: "skill://some-skill" } }, tuiCtx);
    const blockResult = results.find((r) => r !== undefined) as { block?: boolean } | undefined;
    expect(blockResult?.block).toBeFalsy();
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.OMP_HOME;
  }
});

});
