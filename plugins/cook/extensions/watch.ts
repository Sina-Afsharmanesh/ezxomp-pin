import { readdirSync, watch, type FSWatcher } from "node:fs";
import { join, relative } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { CookState, StoreContext, TaskInfo } from "./types.ts";
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

function isIgnoredWatchPath(filename: string): boolean {
	return filename.split(/[\\/]/).some((part) =>
		part.startsWith(".") || part === "cook-state.json" || part === "cook-config.json" || part === "config.yml",
	);
}

/** Linux needs one native watcher per directory; never follow links out of backlog. */
function watchDirectoryTree(root: string, onChange: (filename: string) => void): { close(): void } {
	const watchers = new Map<string, FSWatcher>();
	let closed = false;
	const closeDirectory = (directory: string, watcher: FSWatcher): void => {
		try {
			watcher.close();
		} catch {
			// Already-failed watchers must not prevent the remaining resources closing.
		}
		if (watchers.get(directory) === watcher) watchers.delete(directory);
	};
	const close = (): void => {
		closed = true;
		for (const [directory, watcher] of watchers) closeDirectory(directory, watcher);
	};
	const reconcile = (): void => {
		const directories = new Set<string>();
		const visit = (directory: string): void => {
			try {
				if (!watchers.has(directory)) {
					const watcher = watch(directory, {}, (eventType, filename) => {
						if (closed || !filename) return;
						const changedPath = relative(root, join(directory, filename.toString()));
						if (isIgnoredWatchPath(changedPath)) return;
						if (eventType === "rename") {
							const changedDirectory = join(directory, filename.toString());
							for (const [watchedDirectory, watched] of watchers) {
								if (watchedDirectory === changedDirectory || watchedDirectory.startsWith(`${changedDirectory}/`)) {
									closeDirectory(watchedDirectory, watched);
								}
							}
							reconcile();
						}
						onChange(changedPath);
					});
					watchers.set(directory, watcher);
					watcher.on?.("error", () => {
						closeDirectory(directory, watcher);
					});
				}
				const entries = readdirSync(directory, { withFileTypes: true });
				directories.add(directory);
				for (const entry of entries) {
					if (entry.isDirectory() && !isIgnoredWatchPath(entry.name)) visit(join(directory, entry.name));
				}
			} catch {
				// Missing or unreadable directories must not abort startup or event delivery.
			}
		};
		visit(root);
		for (const [directory, watcher] of watchers) {
			if (!directories.has(directory)) {
				closeDirectory(directory, watcher);
			}
		}
	};
	reconcile();
	return { close };
}

/** Synchronize native resources with the current project's persisted watch settings. */
export function syncWatcher(pi: ExtensionAPI, sc: StoreContext, cwd: string): void {
	const ownerCwd = sc.normalizeCwd(cwd);
	if (ownerCwd !== sc.normalizeCwd(sc.currentCwd)) return;
	const state = sc.getStoreFor(ownerCwd);
	if (!state.watch.enabled) {
		stopWatcher(ownerCwd);
		return;
	}
	startWatcher(
		ownerCwd,
		pi,
		state,
		(firedAt, firedWatchId) => {
			const current = sc.getStoreFor(ownerCwd);
			if (!current.watch.enabled || current.watch.watchId !== firedWatchId) return false;
			try {
				sc.setStoreFor(ownerCwd, { ...current, watch: { ...current.watch, lastFiredAt: firedAt } });
			} catch {
				if (ownerCwd === sc.normalizeCwd(sc.currentCwd)) {
					pi.sendMessage(
						{ customType: "cook-watch-error", content: [{ type: "text", text: "Cook watch could not persist its timestamp; watch trigger skipped." }] },
						{ triggerTurn: false },
					);
				}
				return false;
			}
			return ownerCwd === sc.normalizeCwd(sc.currentCwd);
		},
		() => sc.getStoreFor(ownerCwd),
		() => sc.normalizeCwd(sc.currentCwd),
	);
}

function startWatcher(
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
		const watcher = watchDirectoryTree(watchDir, (filename) => {
			const scheduledState = getState();
			if (!scheduledState.watch.enabled) return;
			// Only task/doc changes alert; state/config/dotfile churn is filtered by the tree.
			const scheduledWatchId = scheduledState.watch.watchId;
			const debounceMs = scheduledState.watch.debounceMs;
			if (watchDebounceTimer) {
				clearTimeout(watchDebounceTimer as Parameters<typeof clearTimeout>[0]);
			}
			watchDebounceTimer = globalThis.setTimeout(() => {
				watchDebounceTimer = null;
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
					{ triggerTurn: fireState.watch.trigger === "auto" },
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
