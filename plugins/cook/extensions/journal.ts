import { join } from "node:path";
import { canonicalCookRoot, readCookFile, withCookLockSync, writeCookFileAtomic } from "./coordination.ts";

/**
 * Cook write-ahead intent journal (upstream jeff 6.0 slate item 3, adapted).
 *
 * Per-task append-only JSONL: backlog/.cook-journal/<TASKID>.jsonl
 * Closed event vocabulary: intent | record | gate | external.
 * Seq is monotonic per task under the canonical project lock. State and
 * journal writes share ownership; atomic durable replacement prevents partial
 * appends. Unreadable or malformed history fails closed, never resets lineage.
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
	return join(canonicalCookRoot(cwd), JOURNAL_DIR, `${id}.jsonl`);
}

/** Append one durable entry under the same project lock as state mutations. */
function append(cwd: string, taskId: string, entry: Omit<JournalEntry, "seq" | "at">): JournalEntry {
	return withCookLockSync(cwd, () => {
		const entries = readJournal(cwd, taskId);
		const full: JournalEntry = {
			seq: entries.length ? entries[entries.length - 1].seq + 1 : 0,
			at: new Date().toISOString(),
			...entry,
		};
		writeCookFileAtomic(journalPath(cwd, taskId), [...entries, full].map((row) => JSON.stringify(row)).join("\n") + "\n");
		return full;
	});
}

/** Corrupt coordination history must be repaired explicitly, never skipped. */
export function readJournal(cwd: string, taskId: string): JournalEntry[] {
	const path = journalPath(cwd, taskId);
	const content = readCookFile(path, "journal");
	if (content === undefined) return [];
	const entries: JournalEntry[] = [];
	if (!content || !content.endsWith("\n")) {
		throw new Error(`Invalid Cook journal: ${path}; final line is incomplete`);
	}
	const lines = content.split("\n");
	lines.pop();
	for (const [index, line] of lines.entries()) {
		try {
			const entry: JournalEntry = JSON.parse(line);
			if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
				!Number.isSafeInteger(entry.seq) || entry.seq < 0 ||
				(entry.seq <= (entries.at(-1)?.seq ?? -1)) ||
				typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at)) ||
				!["intent", "record", "gate", "external"].includes(entry.event) ||
				[entry.stage, entry.note, entry.hash].some((value) => value !== undefined && typeof value !== "string")) {
				throw new Error("invalid event or sequence");
			}
			entries.push(entry);
		} catch (error) {
			throw new Error(`Invalid Cook journal: ${path}:${index + 1}; restore valid history before continuing`, { cause: error });
		}
	}
	return entries;
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
