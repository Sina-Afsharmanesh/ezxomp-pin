import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";

import makePi, { __emitHook, __resetHandlers, makeCtx, makeUiStub } from "./__mocks__/pi-coding-agent";
import { defaultCookState, saveCookState, loadCookState } from "../extensions/state.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

function makeRealPi() {
	const pi = makePi();
	pi.exec.mockImplementation(async (_cmd: string, args: string[], opts?: { cwd?: string }) => {
		const result = spawnSync("backlog", args, { cwd: opts?.cwd ?? workDir, encoding: "utf-8" });
		return { code: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
	});
	return pi;
}

async function freshExtension(pi: ReturnType<typeof makePi>) {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-turn-sync-"));
	execSync("git init -q .", { cwd: workDir });
	bl("init testproj --agent-instructions none");
	bl('task create "Stale task"');
	bl('task create "Active task"');
	bl('task edit TASK-2 -s "In Progress"');
	const state = defaultCookState();
	state.chain = ["capture", "plan", "implement", "verify", "review", "done"];
	state.currentStage = 0;
	state.currentTaskId = "TASK-1";
	state.taskIds = ["TASK-1", "TASK-2"];
	state.cookmode = true;
	saveCookState(workDir, state);
	const fakeDagr = path.join(workDir, "fake-dagr-ok.sh");
	writeFileSync(fakeDagr, "#!/bin/sh\nexit 0\n");
	chmodSync(fakeDagr, 0o755);
	process.env.DAGR_BIN = fakeDagr;
});

afterEach(() => {
	delete process.env.DAGR_BIN;
	rmSync(workDir, { recursive: true, force: true });
});

describe("cook turn synchronization", () => {
	it("keeps unrelated active task ownership while repainting current workflow and dagr", async () => {
		const pi = makeRealPi();
		await freshExtension(pi);
		const ui = makeUiStub();
		let title = "";
		let widgetLines: string[] = [];
		ui.setTitle.mockImplementation((value: string) => { title = value; });
		ui.setWidget.mockImplementation((_id: string, lines: string[] | undefined) => { widgetLines = lines ?? []; });
		const ctx = makeCtx({ cwd: workDir, ui, hasUI: true });

		await __emitHook("turn_start", {}, ctx);
		await vi.waitFor(() => expect(widgetLines).toEqual(expect.arrayContaining([
			expect.stringContaining("task: TASK-1"), expect.stringContaining("stage: CAPTURE"),
		])));
		expect(title).toBe("cook: capture [chef] — TASK-1");
		expect(loadCookState(workDir).currentTaskId).toBe("TASK-1");
		const activeTask = JSON.parse(bl("task TASK-2 --json")).task;
		expect(activeTask.status).toBe("In Progress");
		expect(existsSync(path.join(workDir, ".dagr", "run.json"))).toBe(true);
		const run = JSON.parse(readFileSync(path.join(workDir, ".dagr", "run.json"), "utf-8"));
		expect(run.run.title).toBe("cook: TASK-1");
	});
});
