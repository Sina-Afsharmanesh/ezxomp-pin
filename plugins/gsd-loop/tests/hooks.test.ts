/**
 * tests/hooks.test.ts — WU-9: loop driver hooks against a fake pi.
 *
 * AC: (1) crash-recovery with fixture state+lock; (2) before_agent_start
 * injection present iff auto-running; (3) session_stop continues on progress,
 * withholds (pauses) on no-progress across two stops; (4) shutdown persists
 * paused with reason session-shutdown + journal paused event; (5) idle
 * shutdown leaves state untouched.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import makePi, { makeCtx, type CtxStub, type PiStub } from "./__mocks__/pi-coding-agent.js";
import * as core from "../src/core.js";
import * as state from "../src/state.js";
import { onSessionStart, onSessionShutdown, onSessionStop } from "../src/index.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-hooks-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(cwd?: string, hasUI = true): { pi: PiStub; ctx: CtxStub; cwd: string } {
	const root = cwd ?? tempRoot();
	const pi = makePi();
	const ctx = makeCtx({ cwd: root, hasUI });
	core.setFacadeContext({ cwd: root, hasUI });
	return { pi, ctx, cwd: root };
}

describe("session_start crash recovery", () => {
	it("dead-pid lock + running state ⇒ paused, unit crashed, guarded notify", () => {
		const { ctx, cwd } = setup();
		// fixture: running state with in-flight unit + dead-pid lock
		const s = state.initialState();
		s.run.status = "running";
		s.queue.push({
			id: "u1", title: "One", brief: "b", briefFile: null, verifyCommand: null,
			maxRetries: null, dispatch: "inline", subagentAgent: null, status: "running",
			attempts: 1, verifyAttempts: 0, lastError: null, failureHash: null,
			startedAt: "2026-01-01T00:00:00.000Z", completedAt: null, resultSummary: null,
		});
		state.saveState(cwd, s);
		writeFileSync(path.join(state.stateDir(cwd), "loop.lock"), JSON.stringify({ ownerPid: 3999999999, sessionId: "dead", acquiredAt: "x", heartbeatAt: "x" }));

		const result = onSessionStart(makePi(), ctx);
		expect(result.note).toMatch(/crash recovery/i);
		const recovered = state.loadState(cwd)!;
		expect(recovered.run.status).toBe("paused");
		expect(recovered.queue[0].status).toBe("crashed");
		expect(existsSync(path.join(state.stateDir(cwd), "loop.lock"))).toBe(false);
		if (ctx.hasUI) expect(ctx.ui.notify).toHaveBeenCalled();
	});

	it("live lock or idle state ⇒ no recovery, no notify", () => {
		const { ctx, cwd } = setup();
		const s = state.initialState();
		state.saveState(cwd, s);
		const result = onSessionStart(makePi(), ctx);
		expect(result.note).toBeUndefined();
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		expect(state.loadState(cwd)!.run.status).toBe("idle");
	});
});

describe("before_agent_start injection", () => {
	it("injects when running+auto via the registered hook, not otherwise", async () => {
		const { pi, ctx, cwd } = setup();
		const mod = await import("../src/index.js");
		mod.default(pi);
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({});
		const handlers = (pi as unknown as { __handlers: { hooks: Map<string, ((e: unknown, c: CtxStub) => unknown)[]> } }).__handlers.hooks;
		const before = handlers.get("before_agent_start")![0];
		const result = before({ systemPrompt: ["base"] }, ctx) as { systemPrompt: string[] } | undefined;
		expect(result).toBeDefined();
		expect(result!.systemPrompt[0]).toBe("base");
		expect(result!.systemPrompt[1]).toMatch(/gsd-loop auto mode active/);
		expect(result!.systemPrompt[1]).toMatch(/gsd_loop_advance/);
		expect(result!.systemPrompt[1]).toMatch(/gsd_loop_record_result/);

		// paused → no injection
		core.doPause({});
		const paused = before({ systemPrompt: ["base"] }, ctx);
		expect(paused).toBeUndefined();
	});
});

describe("session_stop continuation bridge", () => {
	it("continues on first stop with progress, withholds (pauses) on no-progress second stop", () => {
		const { cwd } = setup();
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({});

		const ctx = makeCtx({ cwd });
		const first = onSessionStop(ctx);
		expect(first).toEqual({ continue: true, reason: "gsd-loop auto: call gsd_loop_advance" });

		// second stop with NO state change (no advance/record) → no continue, paused
		const second = onSessionStop(ctx);
		expect(second).toBeUndefined();
		const s = state.loadState(cwd)!;
		expect(s.run.status).toBe("paused");
		expect(s.run.stopReason).toMatch(/no-progress/i);
	});

	it("continues again after progress between stops", () => {
		const { cwd } = setup();
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({});
		const ctx = makeCtx({ cwd });
		expect(onSessionStop(ctx)).toBeDefined();
		// progress: advance claims u1
		core.doAdvance({});
		const again = onSessionStop(ctx);
		expect(again).toEqual({ continue: true, reason: "gsd-loop auto: call gsd_loop_advance" });
	});

	it("does not continue for non-running or step mode", () => {
		const { cwd } = setup();
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({ mode: "step" });
		const ctx = makeCtx({ cwd });
		expect(onSessionStop(ctx)).toBeUndefined();
	});
});

describe("session_shutdown", () => {
	it("running run → paused with reason session-shutdown + journal paused event", () => {
		const { cwd } = setup();
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({});
		onSessionShutdown(makeCtx({ cwd }));
		const s = state.loadState(cwd)!;
		expect(s.run.status).toBe("paused");
		expect(s.paused?.reason).toBe("session-shutdown");
		const journalDir = path.join(state.stateDir(cwd), "journal");
		const raw = readFileSync(path.join(journalDir, readdirSync(journalDir)[0]), "utf8");
		expect(raw).toContain('"paused"');
		expect(raw).toContain("session-shutdown");
	});

	it("idle run → state untouched", () => {
		const { cwd } = setup();
		onSessionShutdown(makeCtx({ cwd }));
		// no state file was ever written (idle, nothing running)
		expect(state.loadState(cwd)).toBeNull();
	});
});
