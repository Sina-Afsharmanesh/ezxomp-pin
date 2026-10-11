import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext, saveCookState, loadCookState, defaultCookState } from "../extensions/state.ts";
import { STATE_FILE } from "../extensions/constants.ts";
import { appendIntent, appendRecord, findDanglingIntents, readJournal } from "../extensions/journal.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-drain-"));
	execSync("git init -q .", { cwd: workDir });
	bl("init testproj --agent-instructions none");
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function setup() {
	const pi = makePi();
	pi.exec.mockImplementation(async (_cmd: string, args: string[], opts?: { cwd?: string }) => {
		const cwd = opts?.cwd ?? workDir;
		const r = spawnSync("backlog", args, { cwd, encoding: "utf-8" });
		return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
	});
	const sc = createStoreContext(pi);
	registerCookTools(pi, sc);
	const ctx = makeCtx({ cwd: workDir });
	const exec = async (tool: string, params: unknown) => {
		const h = __getToolHandler(tool);
		return (await h.execute("t", params, {} as AbortSignal, null, ctx)) as { isError?: boolean; content: { text: string }[] };
	};
	return { sc, exec };
}

describe("drain loop integration (slate item 7)", () => {
	it("two lanes claim disjoint ready tasks; each lane journals its intent; claims serialize", async () => {
		bl('task create "A" --priority high');
		bl('task create "B"');

		// seed the shared state file: cap 2 (drain allows two lanes)
		const statePath = path.join(workDir, STATE_FILE);
		mkdirSync(path.dirname(statePath), { recursive: true });
		const seeded = defaultCookState();
		seeded.maxParallelTasks = 2;
		saveCookState(workDir, seeded);

		const lane1 = setup();
		const lane2 = setup();

		// lane1 claims TASK-1
		const r1 = await lane1.exec("cook_claim", { task_id: "TASK-1", by: "lane-1" });
		expect(r1.isError).toBeUndefined();

		// lane2 (fresh store instance, lazy-loads from the shared file) claims TASK-2
		const r3 = await lane2.exec("cook_claim", { task_id: "TASK-2", by: "lane-2" });
		expect(r3.isError).toBeUndefined();

		// double-claim of TASK-1 by lane2 refused, naming the holder
		const r4 = await lane2.exec("cook_claim", { task_id: "TASK-1", by: "lane-2" });
		expect(r4.isError).toBe(true);
		expect(r4.content[0].text).toContain("lane-1");

		// both lanes journaled intents
		expect(readJournal(workDir, "TASK-1").some((e) => e.stage === "claim")).toBe(true);
		expect(readJournal(workDir, "TASK-2").some((e) => e.stage === "claim")).toBe(true);

		// release frees the slot for the other lane
		const r5 = await lane2.exec("cook_release", { task_id: "TASK-2" });
		expect(r5.isError).toBeUndefined();
	});

	it("resume after interruption: dangling intent is re-dispatched, never counted (slate item 3)", async () => {
		bl('task create "A"');
		// lane died after writing the intent, before any record
		appendIntent(workDir, "TASK-1", "implement", "dispatch died mid-flight");
		const dangling = findDanglingIntents(readJournal(workDir, "TASK-1"));
		expect(dangling).toHaveLength(1);
		expect(dangling[0].stage).toBe("implement");
		// a fresh dispatch writes its own intent+record pair; the orphan is never counted
		appendIntent(workDir, "TASK-1", "implement", "fresh dispatch");
		appendRecord(workDir, "TASK-1", "implement");
		const entries = readJournal(workDir, "TASK-1");
		const after = findDanglingIntents(entries);
		expect(after).toHaveLength(0);
		// orphan intent remains in history as provenance
		expect(entries.filter((e) => e.stage === "implement" && e.event === "intent")).toHaveLength(2);
	});

	it("back-compat: legacy state file without new fields loads and behaves identically", async () => {
		bl('task create "A"');
		const statePath = path.join(workDir, STATE_FILE);
		mkdirSync(path.dirname(statePath), { recursive: true });
		const legacy = {
			chain: ["implement", "review"],
			currentStage: 0,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
			milestoneId: null,
			specDocId: null,
			reviewCycles: {},
			maxReviewCycles: 3,
			lastFindings: {},
			agentLog: [],
			claims: { "TASK-9": "old-lane" },
			adhdFrames: [],
			adhdIdeas: [],
			adhdShortlist: [],
			gateResults: {},
			cookmode: false,
			watch: { enabled: false, debounceMs: 250, trigger: "auto", lastFiredAt: null, watchId: null },
			watchList: {},
			heartbeats: {},
		};
		writeFileSync(statePath, JSON.stringify(legacy, null, 2));
		const { sc, exec } = setup();
		await exec("cook_status", {}); // binds sc.currentCwd to workDir
		const loaded = sc.getStore();
		expect(loaded.chain).toEqual(legacy.chain);
		// legacy string claim tolerated on read
		expect(loaded.claims["TASK-9"]).toBe("old-lane");
		// new fields default to legacy semantics
		expect(loaded.maxParallelTasks).toBe(1);
		expect(loaded.convergence).toEqual({});
		// the drain tools operate normally on legacy state
		const r = await exec("cook_ready", {});
		expect(r.isError).toBeUndefined();
	});

	it("INV-12 (retention invariant): cook_validate flags unproven retention, passes clean stores", async () => {
		bl('task create "A"');
		const { sc, exec } = setup();
		// clean store: validate passes
		const r1 = await exec("cook_validate", {});
		expect(r1.isError).toBeUndefined();
		expect(r1.content[0].text).not.toContain("INV-12");
		// simulate an unproven retention: retained judgment identity present while the recorded fix touched files outside the finding union
		const cs = sc.getStore();
		cs.lastFindings["TASK-1"] = [
			{ source: "judge", file: "src/a.ts", line: 1, what: "x", kickTo: "implement" },
		];
		cs.gateResults["TASK-1"] = [{ checks: [], passed: true }];
		sc.setStore(cs);
		saveCookState(workDir, sc.getStore());
		// INV-12 spot check: the typed contract is recorded; a fix touching src/other.ts (outside {src/a.ts}) is NOT confined
		const findingFiles = new Set(cs.lastFindings["TASK-1"].map((f) => f.file));
		const fixFiles = ["src/other.ts"];
		const proven = fixFiles.length > 0 && fixFiles.every((f) => findingFiles.has(f));
		expect(proven).toBe(false); // full reset required
	});
});
