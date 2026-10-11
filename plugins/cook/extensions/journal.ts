import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Cook write-ahead intent journal (upstream jeff 6.0 slate item 3, adapted).
 *
 * Per-task append-only JSONL: backlog/.cook-journal/<TASKID>.jsonl
 * Closed event vocabulary: intent | record | gate | external.
 * Seq is monotonic per task under the caller's serialization discipline
 * (cook state mutations are single-threaded per session; journal appends
 * read the tail to derive the next seq, writes fail-closed, reads fail-open).
 *
 * Resume semantics (COOK_PROTOCOL): a dangling intent (no later matching
 * record for the same stage) means the dispatch may have died: dispatch a
 * fresh specialist and never count the orphan against cycle consumption.
 * A dangling external intent means: query the external system first and
 * repeat the side effect only when it is genuinely absent.
 */

// fallow-ignore-next-line unused-export
export const JOURNAL_DIR = "backlog/.cook-journal";

export type JournalEvent = "intent" | "record" | "gate" | "external";

export interface JournalEntry {
	seq: number;
	at: string;
	event: JournalEvent;
	stage?: string;
	note?: string;
	hash?: string;
}

function journalPath(cwd: string, taskId: string): string {
	const id = taskId.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "-");
	return `${cwd}/${JOURNAL_DIR}/${id}.jsonl`;
}

/** Append one entry; seq derived from tail. Fails closed (throws). */
function append(cwd: string, taskId: string, entry: Omit<JournalEntry, "seq" | "at">): JournalEntry {
	const p = journalPath(cwd, taskId);
	mkdirSync(dirname(p), { recursive: true });
	const tail = readTail(cwd, taskId);
	const full: JournalEntry = {
		seq: tail.length ? tail[tail.length - 1].seq + 1 : 0,
		at: new Date().toISOString(),
		...entry,
	};
	appendFileSync(p, JSON.stringify(full) + "\n");
	return full;
}

/** Read the full journal; malformed lines are skipped with a warning. */
// fallow-ignore-next-line complexity
export function readJournal(cwd: string, taskId: string): JournalEntry[] {
	const p = journalPath(cwd, taskId);
	if (!existsSync(p)) return [];
	const entries: JournalEntry[] = [];
	const lines = readFileSync(p, "utf-8").split("\n");
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as JournalEntry;
			if (typeof parsed.seq === "number" && typeof parsed.event === "string") {
				entries.push(parsed);
			} else {
				console.warn(`[cook-journal] skipping malformed entry (missing seq/event) in ${p}`);
			}
		} catch {
			console.warn(`[cook-journal] skipping unparseable line in ${p}`);
		}
	}
	return entries.sort((a, b) => a.seq - b.seq);
}

/** Alias kept for contract naming; same as readJournal. */
// fallow-ignore-next-line unused-export
export const readTail = readJournal;


export function appendIntent(cwd: string, taskId: string, stage: string, note?: string): JournalEntry {
	return append(cwd, taskId, { event: "intent", stage, note });
}

export function appendRecord(cwd: string, taskId: string, stage: string, note?: string): JournalEntry {
	return append(cwd, taskId, { event: "record", stage, note });
}

export function appendGate(cwd: string, taskId: string, hash: string, green: boolean): JournalEntry;
export function appendGate(cwd: string, taskId: string, stage: string, hash: string, green: boolean): JournalEntry;
export function appendGate(cwd: string, taskId: string, stageOrHash: string, hashOrGreen: string | boolean, explicitGreen?: boolean): JournalEntry {
	const stage = typeof explicitGreen === "boolean" ? stageOrHash : "verify";
	const rawHash = typeof explicitGreen === "boolean" ? hashOrGreen : stageOrHash;
	const green = typeof explicitGreen === "boolean" ? explicitGreen : hashOrGreen;
	if (!stage.trim()) throw new Error("gate stage is required");
	if (typeof rawHash !== "string" || !rawHash.trim()) throw new Error("gate hash is required");
	if (typeof green !== "boolean") throw new Error("gate green must be boolean");
	return append(cwd, taskId, { event: "gate", stage: stage.trim(), hash: rawHash.trim(), note: green ? "green" : "red" });
}

export function appendExternal(cwd: string, taskId: string, note: string): JournalEntry {
	return append(cwd, taskId, { event: "external", note });
}

/**
 * Dangling-intent detection: an intent whose stage has no later record event.
 * Returns the dangling intents (usually zero or one).
 */
// fallow-ignore-next-line complexity
// fallow-ignore-next-line unused-export
export function findDanglingIntents(entries: JournalEntry[]): JournalEntry[] {
	const dangling: JournalEntry[] = [];
	const seenRecords = new Set<string>();
	for (const e of [...entries].reverse()) {
		if ((e.event === "record" || e.event === "gate") && e.stage) seenRecords.add(e.stage);
		if (e.event === "intent" && e.stage && !seenRecords.has(e.stage)) {
			dangling.push(e);
		}
	}
	return dangling;
}
