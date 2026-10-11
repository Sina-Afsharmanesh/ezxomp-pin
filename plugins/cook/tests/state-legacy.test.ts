import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultCookState, loadCookState, saveCookState } from "../extensions/state.ts";
import { STATE_FILE } from "../extensions/constants.ts";

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "cook-legacy-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

const LEGACY_STATE = {
	chain: ["implement", "review"],
	currentStage: 0,
	currentTaskId: "TASK-9",
	taskIds: ["TASK-9"],
	milestoneId: null,
	specDocId: null,
	reviewCycles: { "TASK-9": 1 },
	maxReviewCycles: 3,
	lastFindings: {},
	agentLog: [],
	claims: { "TASK-2": "old-lane" },
	adhdFrames: [],
	adhdIdeas: [],
	adhdShortlist: [],
	gateResults: {},
	cookmode: false,
	watch: { enabled: false, debounceMs: 250, trigger: "auto", lastFiredAt: null, watchId: null },
	watchList: {},
	heartbeats: {},
};

describe("legacy CookState tolerance", () => {
	it("loads a legacy state file (old shape, string claims, no new fields) unchanged", () => {
		mkdirSync(join(cwd, "backlog"), { recursive: true });
		writeFileSync(join(cwd, STATE_FILE), JSON.stringify(LEGACY_STATE));
		const loaded = loadCookState(cwd);
		expect(loaded.chain).toEqual(LEGACY_STATE.chain);
		expect(loaded.currentTaskId).toBe("TASK-9");
		// legacy string claim tolerated on read
		expect(loaded.claims["TASK-2"]).toBe("old-lane");
		// absent new fields get legacy defaults
		expect(loaded.maxParallelTasks).toBe(1);
		expect(loaded.convergence).toEqual({});
		expect(loaded.complexity).toEqual({});
		expect(loaded.pipelineVersion).toBeUndefined();
	});

	it("round-trips a new-shape state byte-stably on claims", () => {
		const st = defaultCookState();
		st.chain = ["implement"];
		st.claims = { "TASK-3": { by: "lane-1", at: "2026-08-28T00:00:00Z" } };
		st.maxParallelTasks = 3;
		saveCookState(cwd, st);
		const loaded = loadCookState(cwd);
		expect(loaded.claims["TASK-3"]).toEqual({ by: "lane-1", at: "2026-08-28T00:00:00Z" });
		expect(loaded.maxParallelTasks).toBe(3);
	});

	it("defaultCookState carries new defaults", () => {
		const st = defaultCookState();
		expect(st.maxParallelTasks).toBe(1);
		expect(st.convergence).toEqual({});
		expect(st.complexity).toEqual({});
	});
});
