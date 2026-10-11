import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	acquireLock,
	appendJournal,
	checkStopFlag,
	clearStopFlag,
	initialState,
	loadState,
	releaseLock,
	readJournal,
	readWedge,
	saveState,
	setStopFlag,
	stateDir,
	acknowledgeWedge,
	writeCrashNote,
	writeWedge,
} from "../src/state.js";
import { makeUnit } from "./helpers.js";

const dirs: string[] = [];

function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-state-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("state round-trip", () => {
	it("save/load preserves counters and queue", () => {
		const cwd = tempRoot();
		const state = initialState();
		state.queue.push(makeUnit({ id: "a" }), makeUnit({ id: "b", title: "two" }));
		state.pointer = 1;
		state.counters.iterations = 7;
		state.counters.consecutiveErrors = 2;
		state.counters.recentErrorMessages = ["boom"];
		saveState(cwd, state);
		const loaded = loadState(cwd);
		expect(loaded).not.toBeNull();
		expect(loaded!.version).toBe(1);
		expect(loaded!.queue.map((u) => u.id)).toEqual(["a", "b"]);
		expect(loaded!.pointer).toBe(1);
		expect(loaded!.counters.iterations).toBe(7);
		expect(loaded!.counters.consecutiveErrors).toBe(2);
		expect(loaded!.counters.recentErrorMessages).toEqual(["boom"]);
	});

	it("interrupted write (leftover tmp) never corrupts the main file", () => {
		const cwd = tempRoot();
		const state = initialState();
		state.counters.iterations = 3;
		saveState(cwd, state);
		// simulate crash mid-save: pre-create a stray tmp file with garbage
		writeFileSync(path.join(stateDir(cwd), `state.json.999.tmp`), "{corrupt", "utf8");
		const loaded = loadState(cwd);
		expect(loaded!.counters.iterations).toBe(3);
		// a new save still wins
		state.counters.iterations = 4;
		saveState(cwd, state);
		expect(loadState(cwd)!.counters.iterations).toBe(4);
	});

	it("schema version !== 1 refuses to load", () => {
		const cwd = tempRoot();
		mkdirSync(path.join(stateDir(cwd)), { recursive: true });
		writeFileSync(path.join(stateDir(cwd), "state.json"), JSON.stringify({ version: 2 }), "utf8");
		expect(() => loadState(cwd)).toThrow(/schema version mismatch/);
	});
});

describe("journal", () => {
	it("appends exactly one valid-JSON line per call with monotonic seq per flowId", () => {
		const cwd = tempRoot();
		appendJournal(cwd, { flowId: "f1", seq: 1, eventType: "run-start" });
		appendJournal(cwd, { flowId: "f1", seq: 2, eventType: "unit-start", unitId: "a" });
		appendJournal(cwd, { flowId: "f1", seq: 3, eventType: "unit-complete", unitId: "a" });
		const lines = readJournal(cwd);
		expect(lines).toHaveLength(3);
		expect(lines.map((l) => l.seq)).toEqual([1, 2, 3]);
		expect(lines[1].unitId).toBe("a");
		for (const line of lines) expect(line.flowId).toBe("f1");
	});
});

describe("activity log", () => {
	it("sanitizes traversal unitIds into safe filenames", async () => {
		const { writeActivityLog } = await import("../src/state.js");
		const cwd = tempRoot();
		writeActivityLog(cwd, "../../evil", 1, "pwn");
		const activityDir = path.join(stateDir(cwd), "activity");
		const files = readdirSync(activityDir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^1-_/);
		expect(files[0]).not.toContain("..");
	});
});

describe("lock semantics", () => {
	it("acquired → second acquire same-pid OK, foreign-live pid refused, dead-pid reclaimed", async () => {
		const cwd = tempRoot();
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s1" })).toBe(true);
		// same pid: re-entrant
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s1" })).toBe(true);
		releaseLock(cwd);
		// foreign live pid holds the lock → refused
		const child = spawn("sleep", ["2"], { stdio: "ignore" });
		expect(acquireLock(cwd, { ownerPid: child.pid!, sessionId: "holder" })).toBe(true);
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s3" })).toBe(false); // live foreign
		child.kill("SIGKILL");
		await new Promise<void>((r) => child.once("exit", () => r()));
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s4" })).toBe(true); // reclaimed
	});

	it("corrupt lock file is reclaimed", () => {
		const cwd = tempRoot();
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s" })).toBe(true);
		writeFileSync(path.join(stateDir(cwd), "loop.lock"), "not json", "utf8");
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "s2" })).toBe(true);
	});

	it("release removes the lock", () => {
		const cwd = tempRoot();
		acquireLock(cwd, { ownerPid: process.pid, sessionId: "s" });
		releaseLock(cwd);
		expect(acquireLock(cwd, { ownerPid: process.pid, sessionId: "other" })).toBe(true);
	});
});

function waitPidGone(pid: number): void {
	for (let i = 0; i < 100; i++) {
		try {
			process.kill(pid, 0);
		} catch {
			return;
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
	}
}

describe("STOP flag / wedge / crash notes", () => {
	it("STOP flag set/check/clear", () => {
		const cwd = tempRoot();
		expect(checkStopFlag(cwd)).toBe(false);
		setStopFlag(cwd);
		expect(checkStopFlag(cwd)).toBe(true);
		clearStopFlag(cwd);
		expect(checkStopFlag(cwd)).toBe(false);
	});

	it("wedge write/read/ack", () => {
		const cwd = tempRoot();
		const wedge = {
			id: "w1",
			signature: "u1:2",
			unitId: "u1",
			createdAt: "2026-01-01T00:00:00.000Z",
			acknowledged: false,
		};
		expect(readWedge(cwd)).toBeNull();
		writeWedge(cwd, wedge);
		expect(readWedge(cwd)!.signature).toBe("u1:2");
		expect(acknowledgeWedge(cwd, "wrong")).toBe(false);
		expect(acknowledgeWedge(cwd, "w1")).toBe(true);
		expect(readWedge(cwd)!.acknowledged).toBe(true);
	});
});

describe("cwd isolation", () => {
	it("two different cwd roots are fully isolated", () => {
		const a = tempRoot();
		const b = tempRoot();
		const stateA = initialState();
		stateA.counters.iterations = 11;
		saveState(a, stateA);
		const stateB = initialState();
		stateB.counters.iterations = 22;
		saveState(b, stateB);
		expect(loadState(a)!.counters.iterations).toBe(11);
		expect(loadState(b)!.counters.iterations).toBe(22);
		acquireLock(a, { ownerPid: process.pid, sessionId: "a" });
		// b's lock area untouched
		expect(existsSync(path.join(stateDir(b), "loop.lock"))).toBe(false);
		releaseLock(a);
		expect(existsSync(path.join(stateDir(a), "loop.lock"))).toBe(false);
	});

	it("crash note written under activity/", () => {
		const cwd = tempRoot();
		writeCrashNote(cwd, {
			createdAt: "2026-01-01T00:00:00.000Z",
			errorType: "error-ladder",
			errorMessage: "boom",
			unitId: "u1",
		});
		const activityDir = path.join(stateDir(cwd), "activity");
		const crashFiles = readdirSync(activityDir);
		expect(crashFiles.some((f) => f.startsWith("crash-"))).toBe(true);
	});
});
