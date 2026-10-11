import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import makePi, {
	__resetHandlers,
	__emitHook,
	__getToolHandler,
	makeCtx,
} from "./__mocks__/pi-coding-agent";

let workDir: string;

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-heartbeat-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("CookState heartbeat slice", () => {
	it("defaultCookState() initialises heartbeats as empty record", async () => {
		const mod = await import("../extensions/index.ts");
		const s = mod.defaultCookState();
		expect(s).toHaveProperty("heartbeats");
		expect(s.heartbeats).toEqual({});
	});

	it("defaultCookState() initialises watchList as empty record", async () => {
		const mod = await import("../extensions/index.ts");
		const s = mod.defaultCookState();
		expect(s).toHaveProperty("watchList");
		expect(s.watchList).toEqual({});
	});

	it("loadCookState of legacy JSON without heartbeats yields default", async () => {
		const mod = await import("../extensions/index.ts");
		const legacy = {
			chain: [],
			currentStage: 0,
			currentTaskId: null,
			taskIds: [],
			milestoneId: null,
			specDocId: null,
			reviewCycles: {},
			maxReviewCycles: 3,
			lastFindings: {},
			agentLog: [],
			claims: {},
			adhdFrames: [],
			adhdIdeas: [],
			adhdShortlist: [],
			gateResults: {},
			cookmode: false,
			watch: {
				enabled: false,
				debounceMs: 250,
				trigger: "auto",
				lastFiredAt: null,
				watchId: null,
			},
		};
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify(legacy),
		);
		const s = mod.loadCookState(workDir);
		expect(s.heartbeats).toEqual({});
		expect(s.watchList).toEqual({});
	});

	it("saveCookState persists heartbeats and loadCookState round-trips it", async () => {
		const mod = await import("../extensions/index.ts");
		const s = mod.defaultCookState();
		s.heartbeats["TASK-600"] = {
			taskId: "TASK-600",
			startedAt: "2026-08-19T00:00:00Z",
			lastPingedAt: null,
			intervals: [5, 15, 25, 30, 45, 60, 75, 90],
			nextIntervalIdx: 0,
		};
		mod.saveCookState(workDir, s);
		const reloaded = mod.loadCookState(workDir);
		expect(reloaded.heartbeats).toEqual(s.heartbeats);
	});
});

describe("heartbeat recording on dispatch", () => {
	it("tool_call for cook_dispatch_worker records heartbeat + adds to watchList", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);

		// Set up a chain so dispatch isn't blocked by phase gating
		const s = mod.defaultCookState();
		s.chain = ["plan", "implement", "review"];
		s.currentStage = 1; // implement phase
		s.currentTaskId = "TASK-700";
		mod.saveCookState(workDir, s);

		const ctx = makeCtx({ cwd: workDir });
		await __emitHook("turn_start", {}, ctx);

		// Fire tool_call for dispatch
		await __emitHook("tool_call", {
			toolName: "cook_dispatch_worker",
			input: { task_id: "TASK-700" },
		}, ctx);

		const state = mod.loadCookState(workDir);
		expect(state.heartbeats["TASK-700"]).toBeDefined();
		expect(state.heartbeats["TASK-700"].startedAt).toBeTruthy();
		expect(state.heartbeats["TASK-700"].nextIntervalIdx).toBe(0);
		expect(state.watchList["TASK-700"]).toBeDefined();
	});
});

describe("heartbeat interval check in tool_result", () => {
	it("does not fire heartbeat note when elapsed < first interval", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);

		const s = mod.defaultCookState();
		s.chain = ["plan", "implement", "review"];
		s.currentStage = 1;
		s.currentTaskId = "TASK-800";
		s.heartbeats["TASK-800"] = {
			taskId: "TASK-800",
			startedAt: new Date().toISOString(), // just now
			lastPingedAt: null,
			intervals: [5, 15, 25, 30, 45, 60, 75, 90],
			nextIntervalIdx: 0,
		};
		mod.saveCookState(workDir, s);

		const ctx = makeCtx({ cwd: workDir });
		await __emitHook("turn_start", {}, ctx);

		const results = await __emitHook("tool_result", {
			toolName: "some_other_tool",
			content: [{ type: "text", text: "ok" }],
		}, ctx);

		// Should return undefined (no heartbeat note)
		const lastResult = results[results.length - 1];
		expect(lastResult).toBeUndefined();
	});

	it("fires heartbeat note when elapsed >= next interval", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);

		// Set heartbeat start to 6 minutes ago (past first interval of 5)
		const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
		const s = mod.defaultCookState();
		s.chain = ["plan", "implement", "review"];
		s.currentStage = 1;
		s.currentTaskId = "TASK-801";
		s.heartbeats["TASK-801"] = {
			taskId: "TASK-801",
			startedAt: sixMinAgo,
			lastPingedAt: null,
			intervals: [5, 15, 25, 30, 45, 60, 75, 90],
			nextIntervalIdx: 0,
		};
		mod.saveCookState(workDir, s);

		const ctx = makeCtx({ cwd: workDir });
		await __emitHook("turn_start", {}, ctx);

		const results = await __emitHook("tool_result", {
			toolName: "some_other_tool",
			content: [{ type: "text", text: "ok" }],
		}, ctx);

		const lastResult = results[results.length - 1] as
			| { content: Array<{ type: string; text: string }> }
			| undefined;
		expect(lastResult).toBeDefined();
		expect(lastResult!.content.length).toBeGreaterThan(1);
		const noteText = lastResult!.content.map((c) => c.text).join(" ");
		expect(noteText).toContain("HEARTBEAT");
		expect(noteText).toContain("TASK-801");
	});

	it("advances nextIntervalIdx after firing", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);

		const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
		const s = mod.defaultCookState();
		s.chain = ["plan", "implement", "review"];
		s.currentStage = 1;
		s.currentTaskId = "TASK-802";
		s.heartbeats["TASK-802"] = {
			taskId: "TASK-802",
			startedAt: sixMinAgo,
			lastPingedAt: null,
			intervals: [5, 15, 25, 30, 45, 60, 75, 90],
			nextIntervalIdx: 0,
		};
		mod.saveCookState(workDir, s);

		const ctx = makeCtx({ cwd: workDir });
		await __emitHook("turn_start", {}, ctx);
		await __emitHook("tool_result", {
			toolName: "some_tool",
			content: [{ type: "text", text: "ok" }],
		}, ctx);

		const state = mod.loadCookState(workDir);
		expect(state.heartbeats["TASK-802"].nextIntervalIdx).toBe(1);
		expect(state.heartbeats["TASK-802"].lastPingedAt).toBeTruthy();
	});
});
