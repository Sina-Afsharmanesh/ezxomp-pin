import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// These tests assert the shape of the persisted CookState watch slice.
// They exercise the extension's defaultCookState + loadCookState + saveCookState
// via direct import of those functions (the extension must export them for
// testability) and via round-tripping through backlog/cook-state.json.

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "cook-watch-state-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("CookState watch slice", () => {
	it("defaultCookState() initialises a watch block with expected defaults", async () => {
		const mod = await import("../extensions/index.ts");
		expect(typeof mod.defaultCookState).toBe("function");
		const s = mod.defaultCookState();
		expect(s).toHaveProperty("watch");
		expect(s.watch).toEqual({
			enabled: false,
			debounceMs: 250,
			trigger: "auto",
			lastFiredAt: null,
			watchId: null,
		});
	});

	it("loadCookState of legacy JSON without watch field yields default watch", async () => {
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
		};
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify(legacy),
		);
		const s = mod.loadCookState(workDir);
		expect(s.watch.enabled).toBe(false);
		expect(s.watch.debounceMs).toBe(250);
		expect(s.watch.trigger).toBe("auto");
		expect(s.watch.watchId).toBeNull();
	});

	it("loadCookState preserves explicitly set watch fields", async () => {
		const mod = await import("../extensions/index.ts");
		const custom = {
			watch: {
				enabled: true,
				debounceMs: 1000,
				trigger: "manual",
				lastFiredAt: "2026-08-18T00:00:00Z",
				watchId: "00000000-0000-4000-8000-000000000001",
			},
		};
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify(custom),
		);
		const s = mod.loadCookState(workDir);
		expect(s.watch.enabled).toBe(true);
		expect(s.watch.debounceMs).toBe(1000);
		expect(s.watch.trigger).toBe("manual");
		expect(s.watch.lastFiredAt).toBe("2026-08-18T00:00:00Z");
		expect(s.watch.watchId).toBe("00000000-0000-4000-8000-000000000001");
	});

	it("saveCookState persists watch and loadCookState round-trips it", async () => {
		const mod = await import("../extensions/index.ts");
		const s = mod.defaultCookState();
		s.watch.enabled = true;
		s.watch.debounceMs = 500;
		s.watch.watchId = "00000000-0000-4000-8000-000000000002";
		mod.saveCookState(workDir, s);
		const reloaded = mod.loadCookState(workDir);
		expect(reloaded.watch).toEqual(s.watch);
	});
});
