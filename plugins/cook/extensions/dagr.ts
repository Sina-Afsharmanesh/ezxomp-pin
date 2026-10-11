import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * herdr-dagr projection (plan Part 2.5). Cook is the dagr producer: this
 * module projects Backlog tasks + cook state + journal tails into a dagr
 * contract v3 run document and publishes it via the producer discipline:
 * run.json.tmp -> dagr check --strict --json -> atomic rename.
 *
 * The pane is a VIEW, never a gate: any failure (no validator, check
 * findings) disables the projection silently. Absence of the pane is legal.
 */

// fallow-ignore-next-line unused-export
export const DAGR_PLUGIN_BIN =
	"/home/eag1/.config/herdr/plugins/github/herdr-dagr-bd0ed2fe5515/target/release/dagr";

export interface DagrTaskInput {
	id: string;
	title: string;
	status: string;
	kind?: string;
	labels?: string[];
	parent?: string | null;
	dependencies?: string[];
	assignee?: string | null;
}

export interface DagrAttemptInput {
	pane?: string;
	agent?: string;
	taskId: string;
	n: number;
	causeType: "initial" | "sent_back" | "gate_failed" | "followup" | "superseded";
	by?: string;
	reason?: string;
	ref?: string;
	priorAttempt?: string;
	actor?: string;
	state: "queued" | "working" | "done" | "failed" | "rejected" | "settled_unverified" | "lost";
	startedAt?: string;
	endedAt?: string;
	evidence?: "verified" | "reported" | "heuristic" | "asserted";
	liveness?: { lastOutputAt?: string; queuedInput?: number };
}

export interface DagrEventInput {
	at: string;
	type: "attempt_started" | "attempt_settled" | "promoted" | "directive" | "message_resolved" | "note";
	task?: string;
	attempt?: string;
	actor?: string;
	detail?: string;
}

export interface DagrProjectionInput {
	runId: string;
	runTitle: string;
	startedAt: string;
	orchestrator?: { pane?: string; agent?: string };
	attemptPane?: string;
	tasks: DagrTaskInput[];
	attempts: DagrAttemptInput[];
	events: DagrEventInput[];
}

const TASK_STATE_MAP: Record<string, string> = {
	"todo": "queued",
	"in progress": "working",
	"review": "review",
	"blocked": "blocked",
	"done": "done",
	"archived": "done",
};

// fallow-ignore-next-line complexity
function resolveDagrBin(): string | null {
	if (process.env.DAGR_BIN) return process.env.DAGR_BIN;
	const onPath = spawnSync("sh", ["-c", "command -v dagr"], { encoding: "utf-8" });
	if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
	if (existsSync(DAGR_PLUGIN_BIN)) return DAGR_PLUGIN_BIN;
	return null;
}

function backlogStatusToDagrState(status: string): string {
	return TASK_STATE_MAP[status.trim().toLowerCase()] ?? "queued";
}

export interface DagrLifecycleSources {
	runId: string; runTitle: string; startedAt: string;
	orchestrator?: { pane?: string; agent?: string }; attemptPane?: string;
	tasks: DagrTaskInput[]; claims: Record<string, { by: string; at: string } | string>;
	agentLog: Array<{ taskId: string; stage: string; role: string; model?: string; timestamp: string }>;
	journalByTask: Record<string, Array<{ seq: number; at: string; event: string; stage?: string; hash?: string; note?: string }>>;
}

export function buildDagrProjectionInput(source: DagrLifecycleSources): DagrProjectionInput {
	const attempts: DagrAttemptInput[] = [], events: DagrEventInput[] = [];
	const used = new Map<string, { intents: Set<number>; terminals: Set<number> }>();
	for (const entry of source.agentLog) {
		const taskKey = entry.taskId.toUpperCase();
		const prior = attempts.filter((a) => a.taskId.toUpperCase() === taskKey).length;
		const journal = [...(source.journalByTask[taskKey] ?? source.journalByTask[entry.taskId] ?? [])].sort((a, b) => a.seq - b.seq);
		const pair = used.get(taskKey) ?? { intents: new Set(), terminals: new Set() }; used.set(taskKey, pair);
		const ii = journal.findIndex((j, i) => j.event === "intent" && j.stage === entry.stage && j.at <= entry.timestamp && !pair.intents.has(i));
		if (ii >= 0) pair.intents.add(ii);
		const ni = ii < 0 ? -1 : journal.findIndex((j, i) => i > ii && j.event === "intent" && j.stage === entry.stage);
		const ti = journal.findIndex((j, i) => ii >= 0 && !pair.terminals.has(i) && (j.event === "record" || j.event === "gate") && j.stage === entry.stage && j.at >= entry.timestamp && j.seq > journal[ii].seq && (ni < 0 || i < ni));
		const terminal = ti < 0 ? undefined : journal[ti]; if (ti >= 0) pair.terminals.add(ti);
		const validGate = terminal?.event === "gate" && !!terminal.stage?.trim() && !!terminal.hash?.trim() && (terminal.note === "green" || terminal.note === "red");
		let recordResult: { outcome?: string; evidence?: string; receipt?: string } | undefined;
		if (terminal?.event === "record") {
			try {
				recordResult = JSON.parse(terminal.note ?? "") as typeof recordResult;
			} catch {
				recordResult = undefined;
			}
		}
		const recordEvidence =
			recordResult?.evidence === "verified" ||
			recordResult?.evidence === "reported" ||
			recordResult?.evidence === "heuristic" ||
			recordResult?.evidence === "asserted"
				? recordResult.evidence
				: undefined;
		const state: DagrAttemptInput["state"] =
			!terminal
				? "working"
				: terminal.event === "gate"
					? validGate && terminal.note === "green"
						? "done"
						: "failed"
					: recordResult?.outcome === "failed" || recordResult?.outcome === "blocked"
						? "failed"
						: "done";
		const evidence: NonNullable<DagrAttemptInput["evidence"]> =
			validGate
				? "verified"
				: recordEvidence
					? recordEvidence
					: terminal
						? "reported"
						: "asserted";
		const receipt = validGate ? terminal?.hash : recordResult?.receipt;
		const id = `${taskKey}·a${prior + 1}`;
		attempts.push({
			taskId: taskKey,
			n: prior + 1,
			causeType: prior ? "followup" : "initial",
			...(prior ? { priorAttempt: `${taskKey}·a${prior}` } : {}),
			actor: entry.role,
			state,
			startedAt: entry.timestamp,
			...(terminal ? { endedAt: terminal.at } : {}),
			evidence,
			...(state === "working"
				? {
						...(source.attemptPane ? { pane: source.attemptPane } : { agent: `cook-${entry.role}` }),
						liveness: { lastOutputAt: journal[ii]?.at ?? entry.timestamp, queuedInput: 0 },
					}
				: {}),
			...(receipt ? { ref: receipt } : {}),
		});
		events.push({ at: entry.timestamp, type: "attempt_started", task: taskKey, attempt: id, actor: entry.role });
		if (terminal) {
			events.push({
				at: terminal.at,
				type: "attempt_settled",
				task: taskKey,
				attempt: id,
				actor: entry.role,
				detail: receipt ? `${state} receipt ${receipt}` : `${state} reported`,
			});
		}
	}
	for (const task of source.tasks) {
		const claimKey = Object.keys(source.claims).find((key) => key.toUpperCase() === task.id.toUpperCase());
		const claim = claimKey ? source.claims[claimKey] : undefined;
		if (claim && !attempts.some((a) => a.taskId === task.id)) {
			const c = typeof claim === "string" ? { by: claim, at: source.startedAt } : claim;
			const latest = (source.journalByTask[task.id] ?? []).reduce<string | undefined>((v, e) => !v || e.at > v ? e.at : v, undefined);
			attempts.push({ taskId: task.id, n: 1, causeType: "initial", actor: c.by, state: "working", startedAt: c.at, ...(source.attemptPane ? { pane: source.attemptPane } : { agent: c.by }), liveness: { lastOutputAt: latest ?? c.at, queuedInput: 0 }, evidence: "asserted" });
		}
	}
	return { runId: source.runId, runTitle: source.runTitle, startedAt: source.startedAt, orchestrator: source.orchestrator, tasks: source.tasks, attempts, events };
}

/** Pure projection: inputs -> contract v3 document. */
// fallow-ignore-next-line unused-export
export function buildRunDoc(input: DagrProjectionInput): Record<string, unknown> {
	const canonicalTaskId = (id: string): string => id.trim().toUpperCase();
	const canonicalAttemptId = (id: string): string => {
		const separator = id.indexOf("·");
		return separator < 0
			? canonicalTaskId(id)
			: `${canonicalTaskId(id.slice(0, separator))}${id.slice(separator)}`;
	};
	const tasks = input.tasks.map((task) => ({
		...task,
		id: canonicalTaskId(task.id),
		...(task.parent ? { parent: canonicalTaskId(task.parent) } : {}),
		...(task.dependencies ? { dependencies: task.dependencies.map(canonicalTaskId) } : {}),
	}));
	const attempts = input.attempts.map((attempt) => ({
		...attempt,
		taskId: canonicalTaskId(attempt.taskId),
		...(attempt.priorAttempt ? { priorAttempt: canonicalAttemptId(attempt.priorAttempt) } : {}),
	}));
	const events = input.events.map((event) => ({
		...event,
		...(event.task ? { task: canonicalTaskId(event.task) } : {}),
		...(event.attempt ? { attempt: canonicalAttemptId(event.attempt) } : {}),
	}));
	const projects = Array.from(
		new Set(tasks.map((task) => task.parent).filter((parent): parent is string => Boolean(parent))),
	).map((id) => ({
		id,
		title: tasks.find((task) => task.id === id)?.title ?? id,
	}));
	return {
		dagr: 3,
		run: {
			id: input.runId,
			title: input.runTitle,
			started_at: input.startedAt,
			...(input.orchestrator?.pane || input.orchestrator?.agent
				? { orchestrator: { ...(input.orchestrator.pane ? { pane: input.orchestrator.pane } : {}), ...(input.orchestrator.agent ? { agent: input.orchestrator.agent } : {}) } }
				: {}),
		},
		generated_at: new Date().toISOString(),
		...(projects.length ? { projects } : {}),
		tasks: tasks.map((t) => {
			const own = attempts.filter((a) => a.taskId === t.id);
			// E150: a done task must show the attempt that settled it. When the
			// producer has no attempt record (e.g. tasks done outside cook),
			// assert a minimal settled_unverified attempt rather than a bare done.
			const status = t.status.trim().toLowerCase();
			const synthetic: DagrAttemptInput[] =
				own.length === 0 && (status === "done" || status === "archived")
					? [{
							taskId: t.id,
							n: 1,
							causeType: "initial" as const,
							state: "settled_unverified" as const,
							evidence: "asserted" as const,
						}]
					: [];
			return {
				id: t.id,
				title: t.title,
				kind:
					t.kind ??
					(t.labels?.includes("docs")
						? "docs"
						: t.labels?.includes("research")
							? "research"
							: t.labels?.includes("test")
								? "test"
								: "impl"),
				...(t.assignee ? { owner: t.assignee } : {}),
				...(t.parent ? { project: t.parent } : {}),
				state: TASK_STATE_MAP[status] ?? "queued",
				...(t.dependencies?.length ? { deps: t.dependencies } : {}),
				attempts: [...own, ...synthetic].map((a) => ({
					id: `${t.id}·a${a.n}`,
					n: a.n,
					cause:
						a.n === 1
							? { type: a.causeType }
							: { type: a.causeType, ...(a.by ? { by: a.by } : {}), ...(a.reason ? { reason: a.reason } : {}), ...(a.priorAttempt ? { ref: a.priorAttempt } : {}) },
					...(a.actor ? { actor: a.actor } : {}),
					...(a.state === "working" && (a.pane || a.agent) ? { locator: { ...(a.pane ? { pane: a.pane } : {}), ...(a.agent ? { agent: a.agent } : {}) } } : {}),
					...(a.state === "working" ? { liveness: { prompt_acknowledged: true, ...(a.liveness?.lastOutputAt ? { last_output_at: a.liveness.lastOutputAt } : {}), queued_input: a.liveness?.queuedInput ?? 0 } } : {}),
					state: a.state,
					...(a.startedAt ? { started_at: a.startedAt } : {}),
					...(a.endedAt ? { ended_at: a.endedAt } : {}),
					...(a.state === "done" || a.state === "failed" || a.state === "rejected" || a.state === "settled_unverified"
						? { outcome: { result: a.state, evidence: a.evidence ?? "asserted", ...(a.ref ? { receipt: a.ref } : {}) } }
						: {}),
				})),
			};
		}),
		events: events.map((e) => ({
			at: e.at,
			type: e.type,
			...(e.task ? { task: e.task } : {}),
			...(e.attempt ? { attempt: e.attempt } : {}),
			...(e.actor ? { actor: e.actor } : {}),
			...(e.detail ? { detail: e.detail } : {}),
		})),
	};
}

export interface PublishResult {
	published: boolean;
	path?: string;
	reason?: string;
}

/**
 * Publish via the producer loop: write run.json.tmp, dagr check --strict,
 * atomic rename on clean. Any failure disables silently (never throws into
 * cook — the pane is a view, never a gate).
 */
// fallow-ignore-next-line complexity
// fallow-ignore-next-line unused-export
export function publishRunDoc(cwd: string, doc: Record<string, unknown>): PublishResult {
	const bin = resolveDagrBin();
	if (!bin) return { published: false, reason: "no dagr validator" };
	const dir = join(cwd, ".dagr");
	const tmp = join(dir, "run.json.tmp");
	const finalPath = join(dir, "run.json");
	try {
		require("node:fs").mkdirSync(dir, { recursive: true });
		require("node:fs").writeFileSync(tmp, JSON.stringify(doc, null, 2));
		const check = spawnSync(bin, ["check", tmp, "--strict", "--json"], { encoding: "utf-8" });
		if (check.status !== 0) {
			return { published: false, reason: `dagr check exit ${check.status}: ${(check.stdout || check.stderr || "").slice(0, 400)}` };
		}
		require("node:fs").renameSync(tmp, finalPath);
		return { published: true, path: finalPath };
	} catch (e) {
		return { published: false, reason: String(e).slice(0, 400) };
	} finally {
		if (existsSync(tmp)) {
			try {
				unlinkSync(tmp);
			} catch {
				// Best-effort diagnostic cleanup; the projection remains non-gating.
			}
		}
	}
}

/**
 * Convenience: project and publish in one call. Best-effort by contract.
 */
export function projectDagr(cwd: string, input: DagrProjectionInput): PublishResult {
	return publishRunDoc(cwd, buildRunDoc(input));
}
