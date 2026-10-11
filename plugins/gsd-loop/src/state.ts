/**
 * src/state.ts — .gsd-loop/ persistence (WU-3).
 *
 * Per-cwd state root `<ctx.cwd>/.gsd-loop/`: state.json (tmp+rename atomic),
 * journal/YYYY-MM-DD.jsonl, activity/, loop.lock, STOP, wedge.json, crash notes.
 * Schema version 1 — version mismatch refuses, never silently migrates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Unit } from "./units.js";

export const STATE_SCHEMA_VERSION = 1;

export type RunStatus = "idle" | "running" | "paused" | "stopped" | "complete" | "wedged";

export interface RunSnapshot {
	id: string;
	status: RunStatus;
	mode: "auto" | "step";
	verbose: boolean;
	startedAt: string | null;
	stoppedAt: string | null;
	stopReason: string | null;
}

export interface PausedMetadata {
	pausedAt: string;
	reason: string;
	unitInFlight: string | null;
}

export interface WedgeRecord {
	id: string;
	signature: string;
	unitId: string;
	createdAt: string;
	acknowledged: boolean;
}

export interface GsdLoopState {
	version: typeof STATE_SCHEMA_VERSION;
	run: RunSnapshot;
	queue: Unit[];
	pointer: number;
	counters: {
		iterations: number;
		consecutiveErrors: number;
		consecutiveCooldowns: number;
		consecutiveFinalizeTimeouts: number;
		lastDispatchKey: string | null;
		noAdvanceRepeats: number;
		recentErrorMessages: string[];
	};
	paused: PausedMetadata | null;
	wedge: WedgeRecord | null;
}

export const STATE_DIR = ".gsd-loop";

export function stateDir(cwd: string): string {
	return path.join(cwd, STATE_DIR);
}

function stateFile(cwd: string): string {
	return path.join(stateDir(cwd), "state.json");
}

/** Fresh v1 state for a new run (not persisted until saveState). */
export function initialState(): GsdLoopState {
	return {
		version: STATE_SCHEMA_VERSION,
		run: {
			id: randomUUID(),
			status: "idle",
			mode: "auto",
			verbose: false,
			startedAt: null,
			stoppedAt: null,
			stopReason: null,
		},
		queue: [],
		pointer: 0,
		counters: {
			iterations: 0,
			consecutiveErrors: 0,
			consecutiveCooldowns: 0,
			consecutiveFinalizeTimeouts: 0,
			lastDispatchKey: null,
			noAdvanceRepeats: 0,
			recentErrorMessages: [],
		},
		paused: null,
		wedge: null,
	};
}

function ensureDir(cwd: string): string {
	const dir = stateDir(cwd);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function parseState(raw: string): GsdLoopState {
	const parsed = JSON.parse(raw) as GsdLoopState;
	if (parsed?.version !== STATE_SCHEMA_VERSION) {
		throw new Error(
			`state: schema version mismatch (expected ${STATE_SCHEMA_VERSION}, got ${String(parsed?.version)}) — refusing to load; migrate manually.`,
		);
	}
	return parsed;
}

export function loadState(cwd: string): GsdLoopState | null {
	const file = stateFile(cwd);
	if (!fs.existsSync(file)) return null;
	return parseState(fs.readFileSync(file, "utf8"));
}

/** Atomic tmp+rename write. A leftover tmp file never corrupts the main file. */
export function saveState(cwd: string, state: GsdLoopState): void {
	ensureDir(cwd);
	const tmp = `${stateFile(cwd)}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(state, null, "\t"), "utf8");
	fs.renameSync(tmp, stateFile(cwd));
}

export function journalFile(cwd: string, now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return path.join(stateDir(cwd), "journal", `${y}-${m}-${d}.jsonl`);
}

export interface JournalEvent {
	flowId: string;
	seq: number;
	eventType: string;
	unitId?: string;
	data?: unknown;
	ts?: string;
}

/** Append exactly one JSON line per call. */
export function appendJournal(cwd: string, event: JournalEvent): void {
	const file = journalFile(cwd);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
	fs.appendFileSync(file, line, "utf8");
}

/** Read all journal lines across dates, oldest first. */
export function readJournal(cwd: string): JournalEvent[] {
	const dir = path.join(stateDir(cwd), "journal");
	if (!fs.existsSync(dir)) return [];
	const out: JournalEvent[] = [];
	for (const file of fs.readdirSync(dir).sort()) {
		const raw = fs.readFileSync(path.join(dir, file), "utf8");
		for (const line of raw.split("\n")) {
			if (line.trim()) out.push(JSON.parse(line) as JournalEvent);
		}
	}
	return out;
}

export interface LockInfo {
	ownerPid: number;
	sessionId: string;
	acquiredAt: string;
	heartbeatAt: string;
}

function lockFile(cwd: string): string {
	return path.join(stateDir(cwd), "loop.lock");
}

function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, owned by other user
	}
}

/**
 * wx-equivalent exclusive create; existing lock with a live foreign pid is
 * refused; dead-pid lock is reclaimed. EPERM from O_EXCL races is tolerated
 * as "someone else got there first".
 */
export function acquireLock(
	cwd: string,
	owner: { ownerPid: number; sessionId: string },
): boolean {
	ensureDir(cwd);
	const file = lockFile(cwd);
	if (fs.existsSync(file)) {
		let existing: LockInfo;
		try {
			existing = JSON.parse(fs.readFileSync(file, "utf8")) as LockInfo;
		} catch {
			fs.unlinkSync(file); // corrupt lock = stale
			return tryCreate(file, owner);
		}
		if (existing.ownerPid === owner.ownerPid) return true; // same-pid re-entrancy
		if (pidAlive(existing.ownerPid)) return false;
		fs.unlinkSync(file); // stale
	}
	return tryCreate(file, owner);
}

function tryCreate(file: string, owner: { ownerPid: number; sessionId: string }): boolean {
	const now = new Date().toISOString();
	const info: LockInfo = {
		ownerPid: owner.ownerPid,
		sessionId: owner.sessionId,
		acquiredAt: now,
		heartbeatAt: now,
	};
	try {
		fs.writeFileSync(file, JSON.stringify(info), { flag: "wx" });
		return true;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
		throw e;
	}
}

export function heartbeatLock(cwd: string): void {
	const file = lockFile(cwd);
	if (!fs.existsSync(file)) return;
	const info = JSON.parse(fs.readFileSync(file, "utf8")) as LockInfo;
	info.heartbeatAt = new Date().toISOString();
	fs.writeFileSync(file, JSON.stringify(info), "utf8");
}

export function readLock(cwd: string): LockInfo | null {
	const file = lockFile(cwd);
	if (!fs.existsSync(file)) return null;
	return JSON.parse(fs.readFileSync(file, "utf8")) as LockInfo;
}

export function releaseLock(cwd: string): void {
	const file = lockFile(cwd);
	if (fs.existsSync(file)) fs.unlinkSync(file);
}

function flagFile(cwd: string): string {
	return path.join(stateDir(cwd), "STOP");
}

export function setStopFlag(cwd: string): void {
	ensureDir(cwd);
	fs.writeFileSync(flagFile(cwd), new Date().toISOString(), "utf8");
}

export function checkStopFlag(cwd: string): boolean {
	return fs.existsSync(flagFile(cwd));
}

export function clearStopFlag(cwd: string): void {
	const file = flagFile(cwd);
	if (fs.existsSync(file)) fs.unlinkSync(file);
}

function wedgeFile(cwd: string): string {
	return path.join(stateDir(cwd), "wedge.json");
}

export function readWedge(cwd: string): WedgeRecord | null {
	const file = wedgeFile(cwd);
	if (!fs.existsSync(file)) return null;
	return JSON.parse(fs.readFileSync(file, "utf8")) as WedgeRecord;
}

export function writeWedge(cwd: string, wedge: WedgeRecord): void {
	ensureDir(cwd);
	fs.writeFileSync(wedgeFile(cwd), JSON.stringify(wedge, null, "\t"), "utf8");
}

/** Acknowledge by id; true when the wedge existed and matched. */
export function acknowledgeWedge(cwd: string, wedgeId: string): boolean {
	const wedge = readWedge(cwd);
	if (!wedge || wedge.id !== wedgeId) return false;
	wedge.acknowledged = true;
	writeWedge(cwd, wedge);
	return true;
}

/** Append-only human-readable activity log line. */
export function appendActivity(cwd: string, line: string): void {
	ensureDir(cwd);
	const file = path.join(stateDir(cwd), "activity", "log.txt");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, "utf8");
}

export function writeCrashNote(
	cwd: string,
	note: {
		createdAt: string;
		errorType: "infrastructure" | "cooldown-exhausted" | "iteration-exhausted" | "error-ladder";
		errorMessage: string;
		unitId: string | null;
	},
): void {
	ensureDir(cwd);
	const hash = createHash("sha256")
		.update(`${note.createdAt}:${note.errorType}:${note.unitId ?? ""}`)
		.digest("hex")
		.slice(0, 8);
	const file = path.join(stateDir(cwd), "activity", `crash-${hash}.json`);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(note, null, "\t"), "utf8");
}


/** Per-unit activity log: activity/<seq>-<unitId>.log */
export function writeActivityLog(
	cwd: string,
	unitId: string | null,
	seq: number,
	summary: string,
): void {
	ensureDir(cwd);
	// Sanitize: unitId is model-controlled; forbid path separators/segments.
	const safeUnit = (unitId ?? "none")
		.replace(/[^A-Za-z0-9._-]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/^[._-]+/, "_");
	const file = path.join(stateDir(cwd), "activity", `${seq}-${safeUnit}.log`);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.appendFileSync(file, `${new Date().toISOString()} ${summary}\n`, "utf8");
}
