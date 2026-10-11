import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __emitHook, __getToolHandler, __resetHandlers, makeCtx, makeUiStub } from "./__mocks__/pi-coding-agent";
import { createStoreContext, defaultCookState } from "../extensions/state.ts";

let workDir: string;
let otherDir: string;

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-activity-"));
	otherDir = mkdtempSync(path.join(tmpdir(), "cook-activity-other-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
	mkdirSync(path.join(otherDir, "backlog"), { recursive: true });
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
	rmSync(otherDir, { recursive: true, force: true });
});

function activeState(taskId: string | null = "TASK-32.4") {
	const state = defaultCookState();
	state.chain = ["implement", "review"];
	state.currentStage = 0;
	state.currentTaskId = taskId;
	return state;
}

describe("Cook terminal activity", () => {
	it("writes the active stage, role, and task to both host surfaces", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		sc.currentCwd = workDir;
		sc.hasUI = true;
		sc.lastUi = ui as never;

		sc.setStoreFor(workDir, activeState());

		expect(title).toHaveBeenLastCalledWith("cook: implement [worker] — TASK-32.4");
		expect(working).toHaveBeenLastCalledWith("Cook implement (worker) — TASK-32.4");
	});

	it("keeps an active stage visible when the task identifier is missing and clears on completion", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		sc.currentCwd = workDir;
		sc.hasUI = true;
		sc.lastUi = ui as never;

		sc.setStoreFor(workDir, activeState(null));
		expect(title).toHaveBeenLastCalledWith("cook: implement [worker]");
		expect(working).toHaveBeenLastCalledWith("Cook implement (worker)");
		expect(title.mock.calls.flat()).not.toContain("undefined");
		expect(working.mock.calls.flat()).not.toContain("undefined");

		title.mockClear();
		working.mockClear();
		sc.setStoreFor(workDir, { ...activeState(null), currentStage: 1 });
		expect(title).toHaveBeenCalledWith("");
		expect(working).toHaveBeenCalledWith(undefined);
	});

	it("resets only the current UI and rejects stale cwd updates", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		sc.currentCwd = workDir;
		sc.hasUI = true;
		sc.lastUi = ui as never;
		sc.setStoreFor(workDir, activeState());

		title.mockClear();
		working.mockClear();
		sc.currentCwd = otherDir;
		expect(title).toHaveBeenLastCalledWith("");
		expect(working).toHaveBeenLastCalledWith(undefined);

		title.mockClear();
		working.mockClear();
		sc.setStoreFor(workDir, { ...activeState(), currentTaskId: "TASK-OLD" });
		expect(title).not.toHaveBeenCalled();
		expect(working).not.toHaveBeenCalled();
	});

	it("restores host setters and preserves host replacements during cleanup", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		const originalTitle = ui.setTitle;
		const originalWorking = ui.setWorkingMessage;
		const title = originalTitle;
		const working = originalWorking;
		sc.currentCwd = workDir;
		sc.hasUI = true;
		sc.lastUi = ui as never;

		sc.setStoreFor(workDir, activeState());
		expect(ui.setTitle).not.toBe(originalTitle);
		expect(ui.setWorkingMessage).not.toBe(originalWorking);
		const hostTitleCalls: string[] = [];
		const hostWorkingCalls: Array<string | undefined> = [];
		const hostTitle = (value: string) => { hostTitleCalls.push(value); };
		const hostWorking = (value?: string) => { hostWorkingCalls.push(value); };
		const hostSurface = ui as unknown as { setTitle: (title: string) => void; setWorkingMessage: (message?: string) => void };
		hostSurface.setTitle = hostTitle;
		hostSurface.setWorkingMessage = hostWorking;

		sc.setStoreFor(workDir, defaultCookState());
		expect(hostTitleCalls).toEqual([]);
		expect(hostWorkingCalls).toEqual([]);
		expect(title).toHaveBeenLastCalledWith("cook: implement [worker] — TASK-32.4");
		expect(working).toHaveBeenLastCalledWith("Cook implement (worker) — TASK-32.4");
		expect(hostSurface.setTitle).toBe(hostTitle);
		expect(hostSurface.setWorkingMessage).toBe(hostWorking);
	});

	it("clears activity when the active chain is cancelled", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		const ctx = makeCtx({ cwd: workDir, ui, hasUI: true });
		await __emitHook("session_start", {}, ctx);
		pi.exec.mockResolvedValue({ code: 0, stdout: JSON.stringify({ task: { id: "TASK-32.4", title: "Activity" } }), stderr: "" });
		await __getToolHandler("cook_start").execute?.("call-1", { task_id: "TASK-32.4", chain_name: "implement" }, new AbortController().signal, undefined, ctx);
		title.mockClear();
		working.mockClear();
		ui.select.mockResolvedValue("✓ Confirm stop");

		await __getToolHandler("cook_stop").execute?.("call-2", {}, new AbortController().signal, undefined, ctx);
		expect(title).toHaveBeenCalledWith("");
		expect(working).toHaveBeenCalledWith(undefined);
	});

	it("does not call optional activity methods in headless contexts", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		sc.currentCwd = workDir;
		sc.hasUI = false;
		sc.lastUi = null;

		sc.setStoreFor(workDir, activeState());

		expect(title).not.toHaveBeenCalled();
		expect(working).not.toHaveBeenCalled();
	});

	it("clears activity on session shutdown", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const ui = makeUiStub();
		const title = ui.setTitle;
		const working = ui.setWorkingMessage;
		const ctx = makeCtx({ cwd: workDir, ui, hasUI: true });
		await __emitHook("session_start", {}, ctx);
		pi.exec.mockResolvedValue({ code: 0, stdout: JSON.stringify({ task: { id: "TASK-32.4", title: "Activity" } }), stderr: "" });

		const start = __getToolHandler("cook_start");
		await start.execute?.("call-1", { task_id: "TASK-32.4", chain_name: "implement" }, new AbortController().signal, undefined, ctx);
		const record = __getToolHandler("cook_record_result");
		await record.execute?.(
			"call-result",
			{ task_id: "TASK-32.4", stage: "implement", outcome: "success", evidence: "verified", receipt: "worker-complete" },
			new AbortController().signal,
			undefined,
			ctx,
		);
		const advance = __getToolHandler("cook_advance");
		await advance.execute?.("call-2", {}, new AbortController().signal, undefined, ctx);
		expect(title).toHaveBeenLastCalledWith("cook: review [judge] — TASK-32.4");
		expect(working).toHaveBeenLastCalledWith("Cook review (judge) — TASK-32.4");
		title.mockClear();
		working.mockClear();

		await __emitHook("session_shutdown", {}, ctx);
		expect(title).toHaveBeenCalledWith("");
		expect(working).toHaveBeenCalledWith(undefined);
	});
});
