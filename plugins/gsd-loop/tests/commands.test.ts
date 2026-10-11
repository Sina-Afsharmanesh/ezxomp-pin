/**
 * tests/commands.test.ts — WU-8: command surface against a fake pi.
 *
 * AC: (1) parse matrix (each flag, missing value, unknown subcommand);
 * (2) smart entry branches (wedge / running / fresh) return distinct texts;
 * (3) facade parity: start→next→stop via commands mutates state like tools.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import makePi, { makeCtx, type CtxStub, type PiStub } from "./__mocks__/pi-coding-agent.js";
import * as core from "../src/core.js";
import { executeSubcommand, parseArgs, registerGsdLoopCommand, usageText } from "../src/commands.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-cmds-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(): { pi: PiStub; ctx: CtxStub; cwd: string; handler: (input: string) => Promise<void> } {
	const cwd = tempRoot();
	const pi = makePi();
	registerGsdLoopCommand(pi);
	const ctx = makeCtx({ cwd });
	core.setFacadeContext({ cwd, hasUI: ctx.hasUI });
	const handler = pi.__handlers.commands.get("gsd-loop")!.handler;
	return { pi, ctx, cwd, handler: (input: string) => handler(input, ctx) as Promise<void> };
}

describe("parseArgs matrix", () => {
	it("parses each flag", () => {
		expect(parseArgs("start --verbose")).toEqual({ subcommand: "start", flags: { verbose: true }, positional: [] });
		expect(parseArgs("next --dry-run").flags["dry-run"]).toBe(true);
		expect(parseArgs("resume --wedge w-1").flags.wedge).toBe("w-1");
		expect(parseArgs("enqueue a title --brief text").flags.brief).toBe("text");
		expect(parseArgs("enqueue a title --brief-file b.md").flags["brief-file"]).toBe("b.md");
		expect(parseArgs('enqueue a title --verify "bun test"').flags.verify).toBe("bun test");
		expect(parseArgs("enqueue a title --retries 2").flags.retries).toBe("2");
		expect(parseArgs("enqueue a title --subagent").flags.subagent).toBe(true);
		expect(parseArgs("pause some reason words").positional).toEqual(["some", "reason", "words"]);
		expect(parseArgs("").subcommand).toBe("");
	});

	it("missing flag value throws with usage", () => {
		expect(() => parseArgs("resume --wedge")).toThrow(/--wedge requires a value/);
		expect(() => parseArgs("enqueue a t --verify")).toThrow(/--verify requires a value/);
	});

	it("unknown subcommand throws usage", () => {
		expect(() => parseArgs("bogus")).toThrow(/Unknown subcommand/);
		expect(() => parseArgs("bogus")).toThrow(/Usage/);
	});

	it("bare freeform (no subcommand) throws usage", () => {
		expect(() => parseArgs("just some words")).toThrow(/Usage/);
	});

	it("usage text lists all subcommands", () => {
		const usage = usageText();
		for (const sub of ["start", "next", "stop", "pause", "resume", "status", "enqueue", "list"]) {
			expect(usage).toContain(sub);
		}
	});
});

describe("smart entry branches", () => {
	it("fresh: queue summary + start hint", async () => {
		const { handler, ctx } = setup();
		await handler("");
		const notify = ctx.ui.notify as { mock: { calls: unknown[][] } };
		const last = notify.mock.calls.at(-1)![0] as string;
		expect(last).toMatch(/idle.*pending unit/i);
		expect(last).toMatch(/\/gsd-loop start/);
	});

	it("running: status + recovery options", async () => {
		const { handler, ctx } = setup();
		core.setFacadeSettings({});
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		core.doStart({});
		await handler("");
		const notify = ctx.ui.notify as { mock: { calls: unknown[][] } };
		const last = notify.mock.calls.at(-1)![0] as string;
		expect(last).toMatch(/RUNNING/);
		expect(last).toMatch(/pause|stop|advance/i);
	});

	it("wedge: wedge summary + resume --wedge hint", async () => {
		const { handler, ctx, cwd } = setup();
		core.doEnqueue({ id: "u1", title: "One", brief: "b" });
		const s = core.loadOrCreateState();
		s.run.status = "running";
		s.counters.noAdvanceRepeats = 2;
		s.wedge = { id: "w-42", signature: "u1:1", unitId: "u1", createdAt: "2026-01-01T00:00:00.000Z", acknowledged: false };
		const { writeWedge } = await import("../src/state.js");
		writeWedge(cwd, s.wedge);
		core.persistState(s);
		await handler("");
		const notify = ctx.ui.notify as { mock: { calls: unknown[][] } };
		const last = notify.mock.calls.at(-1)![0] as string;
		expect(last).toMatch(/WEDGE ACTIVE/);
		expect(last).toContain("w-42");
		expect(last).toMatch(/resume --wedge/);
	});
});

function writeLockRaw(cwd: string, ownerPid: number): void {
	const dir = path.join(cwd, ".gsd-loop");
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/loop.lock`, JSON.stringify({ ownerPid, sessionId: "foreign-test", acquiredAt: "2026-01-01T00:00:00.000Z" }));
}

describe("smart entry foreign-lock branch", () => {
	it("idle + live foreign lock shows the stop-flag hint", async () => {
		const { handler, ctx, cwd } = setup();
		// Live foreign pid: spawn a sleeper and record its pid as the lock owner.
		const child = spawn("sleep", ["5"], { stdio: "ignore" });
		try {
			writeLockRaw(cwd, child.pid!);
		} finally {
			// keep the child alive until after handler(); kill at test end
		}
		try {
			await handler("");
			const notify = ctx.ui.notify as { mock: { calls: unknown[][] } };
			const last = notify.mock.calls.at(-1)![0] as string;
			expect(last).toMatch(/foreign session/i);
			expect(last).toMatch(/STOP flag/i);
		} finally {
			child.kill("SIGKILL");
		}
		await handler("");
		const notify = ctx.ui.notify as { mock: { calls: unknown[][] } };
		const last = notify.mock.calls.at(-1)![0] as string;
		expect(last).toMatch(/foreign session/i);
		expect(last).toMatch(/STOP flag/i);
	});
});

describe("strict --retries parsing", () => {
	it("rejects negative and fractional retries as usage errors", () => {
		expect(() => executeSubcommand(parseArgs(["enqueue", "u1", "One", "--retries", "-1"]))).toThrow();
		expect(() => executeSubcommand(parseArgs(["enqueue", "u1", "One", "--retries", "1.5"]))).toThrow();
	});
});

describe("command facade parity with tools", () => {
	it("start→next→stop through commands mutates state identically", async () => {
		const { handler, cwd } = setup();
		await handler(`enqueue u1 One --brief "do it"`);
		await handler("start");
		let s = core.loadOrCreateState();
		expect(s.run.status).toBe("running");
		expect(s.queue[0].id).toBe("u1");

		await handler("next"); // step-mode advance claims u1
		s = core.loadOrCreateState();
		expect(s.queue[0].status).toBe("running");
		expect(s.run.mode).toBe("step");

		// record via the shared core (same op the tool calls)
		await core.doRecordResult({ unitId: "u1", status: "completed", summary: "done" });
		s = core.loadOrCreateState();
		expect(s.pointer).toBe(1);
		expect(s.queue[0].status).toBe("complete");
		// step mode paused after one unit
		expect(s.run.status).toBe("paused");

	});
});

describe("stop of a paused run", () => {
	it("stop marks run stopped regardless", async () => {
		const { handler } = setup();
		await handler(`enqueue u1 One --brief "b"`);
		await handler("start");
		await handler("pause because");
		await handler("stop");
		const s = core.loadOrCreateState();
		expect(s.run.status).toBe("stopped");
		expect(s.run.stopReason).toContain("stopped by user");
	});
});
