import { watch } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { CookState, TaskInfo } from "./types.ts";
import { runBacklogCli } from "@ezxomp/backlog/extensions/index.ts";

/** How long a Done entry stays on the watch list before pruning. */
export const WATCH_DONE_TTL_MS = 24 * 60 * 60 * 1000;

let activeWatcher: { close(): void } | null = null;
let watchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Watch summaries are scoped to their project so one session cannot inject
// another project's status into the system prompt.
const lastWatchSummaries = new Map<string, string>();
let activeWatcherCwd: string | null = null;

type WatchFireHandler = (firedAt: string, watchId: string | null) => boolean | void;
type WatchStateGetter = () => CookState;
type CurrentCwdGetter = () => string;

function normalizeCwd(cwd: string): string {
	return cwd.replace(/\/+$/, "") || "/";
}

export function getLastWatchSummary(cwd: string): string {
	return lastWatchSummaries.get(normalizeCwd(cwd)) ?? "";
}

export function startWatcher(
	cwd: string,
	pi: ExtensionAPI,
	state: CookState,
	onFire?: WatchFireHandler,
	getState: WatchStateGetter = () => state,
	getCurrentCwd: CurrentCwdGetter = () => cwd,
): void {
	stopWatcher();
	const watchDir = join(cwd, "backlog");
	try {
		const watcher = watch(watchDir, {}, (_eventType, filename) => {
			const scheduledState = getState();
			if (!scheduledState.watch.enabled) return;
			// Hotfix TASK-34: state/config/dotfile churn inside backlog/ must not enqueue
			// system-sourced steering advisories (self-sustaining cascade across
			// concurrent cook sessions). Only genuine task/doc changes alert.
			if (!filename || filename === 'cook-state.json' || filename === 'cook-config.json' || filename.startsWith('.')) return;
			const scheduledWatchId = scheduledState.watch.watchId;
			const debounceMs = scheduledState.watch.debounceMs;
			if (watchDebounceTimer) {
				clearTimeout(watchDebounceTimer as Parameters<typeof clearTimeout>[0]);
			}
			watchDebounceTimer = globalThis.setTimeout(() => {
				const fireState = getState();
				if (!fireState.watch.enabled || fireState.watch.watchId !== scheduledWatchId) return;
				const firedAt = new Date().toISOString();
				if (onFire?.(firedAt, fireState.watch.watchId) === false) return;
				// A watcher can outlive the session cwd that created it. Never deliver
				// its workflow trigger to the currently active, different cwd.
				if (normalizeCwd(cwd) !== normalizeCwd(getCurrentCwd())) return;
				pi.sendMessage(
					{
						customType: `cook-watch/${fireState.watch.watchId}`,
						content: [{ type: "text", text: `Backlog file changed: ${filename}` }],
					},
					{ triggerTurn: true },
				);
			}, debounceMs);
		});
		activeWatcher = watcher;
		activeWatcherCwd = normalizeCwd(cwd);
	} catch {
		// Persisted watch settings must not make session startup fail when the
		// backlog directory is absent, unreadable, or cannot be watched.
		activeWatcher = null;
		activeWatcherCwd = null;
	}
}

export function stopWatcher(cwd?: string): void {
	if (watchDebounceTimer) {
		clearTimeout(watchDebounceTimer as Parameters<typeof clearTimeout>[0]);
	}
	watchDebounceTimer = null;
	if (activeWatcher) {
		try {
			activeWatcher.close();
		} catch {
			// A failed watcher must not abort session shutdown or cwd changes.
		}
		activeWatcher = null;
	}
	const summaryCwd = cwd ? normalizeCwd(cwd) : activeWatcherCwd;
	if (summaryCwd) {
		lastWatchSummaries.delete(summaryCwd);
	}
	if (activeWatcherCwd && activeWatcherCwd !== summaryCwd) {
		lastWatchSummaries.delete(activeWatcherCwd);
	}
	if (activeWatcherCwd) {
		activeWatcherCwd = null;
	}
}

export async function pollWatchedTasks(
	pi: ExtensionAPI,
	cwd: string,
	state: CookState,
): Promise<CookState> {
	const entries = Object.values(state.watchList);
	const summaryCwd = normalizeCwd(cwd);
	if (!entries.length) {
		lastWatchSummaries.delete(summaryCwd);
		return state;
	}

	const now = new Date();
	const nowIso = now.toISOString();
	let allTasks: TaskInfo[];
	try {
		const result = await runBacklogCli(pi, ["task", "list", "--json", "--limit", "999"], cwd);
		if (result.code !== 0) return state;
		const parsed = JSON.parse(result.stdout) as { tasks?: TaskInfo[] };
		if (!Array.isArray(parsed.tasks)) return state;
		allTasks = parsed.tasks;
	} catch {
		return state;
	}
	const taskMap = new Map(allTasks.map((t) => [t.id.toUpperCase(), t]));

	const alerts: string[] = [];
	const watchList = { ...state.watchList };
	let doneCount = 0;
	let idleCount = 0;

	for (const entry of entries) {
		const task = taskMap.get(entry.taskId);
		const prevStatus = entry.lastStatus;
		const newStatus = task?.status ?? "missing";

		// Hygiene: tasks that vanished from the backlog are noise — drop them.
		if (newStatus === "missing") {
			if (prevStatus !== "unknown" && prevStatus !== "missing") {
				alerts.push(`${entry.taskId} no longer exists in backlog — dropped from watch`);
			}
			delete watchList[entry.taskId];
			continue;
		}

		// Hygiene: Done entries age out after WATCH_DONE_TTL_MS.
		let doneAt = entry.doneAt ?? null;
		if (newStatus === "Done") {
			doneAt ??= nowIso;
			if (now.getTime() - new Date(doneAt).getTime() > WATCH_DONE_TTL_MS) {
				delete watchList[entry.taskId];
				continue;
			}
		} else {
			doneAt = null;
		}

		if (prevStatus !== "unknown" && prevStatus !== newStatus) {
			if (newStatus === "Done") {
				alerts.push(`${entry.taskId} → Done (worker completed)`);
				doneCount++;
			} else if (newStatus.toLowerCase().includes("block")) {
				alerts.push(`${entry.taskId} → Blocked`);
			} else {
				alerts.push(`${entry.taskId}: ${prevStatus} → ${newStatus}`);
			}
		} else if (newStatus === "Done" && prevStatus === "unknown") {
			alerts.push(`${entry.taskId} already Done`);
			doneCount++;
		}

		const hb = state.heartbeats[entry.taskId];
		if (hb && newStatus !== "Done" && newStatus !== "Archived") {
			const elapsedMin = Math.floor((now.getTime() - new Date(hb.startedAt).getTime()) / 60000);
			if (elapsedMin > 10 && hb.lastPingedAt) {
				const sincePing = Math.floor((now.getTime() - new Date(hb.lastPingedAt).getTime()) / 60000);
				if (sincePing > 5) {
					alerts.push(`${entry.taskId} idle ${elapsedMin}m (last ping ${sincePing}m ago)`);
					idleCount++;
				}
			}
		}

		watchList[entry.taskId] = {
			...entry,
			lastStatus: newStatus,
			lastChecked: nowIso,
			doneAt: doneAt ?? undefined,
		};
	}

	if (alerts.length) {
		lastWatchSummaries.set(summaryCwd, `WATCH: ${alerts.join("; ")}`);
	} else if (entries.length) {
		lastWatchSummaries.set(summaryCwd, `WATCH: ${entries.length} task(s) — all stable`);
	} else {
		lastWatchSummaries.delete(summaryCwd);
	}

	return { ...state, watchList };
}

export function __resetWatchState(): void {
	stopWatcher();
	activeWatcher = null;
	watchDebounceTimer = null;
	activeWatcherCwd = null;
	lastWatchSummaries.clear();
}

export function __resetAllState(): void {
	__resetWatchState();
}
