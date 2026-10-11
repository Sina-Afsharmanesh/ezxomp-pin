import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { STATE_FILE, CHAIN_PATTERNS, MOD_ID } from "./constants.ts";
import type { CookState, StoreContext, TaskInfo } from "./types.ts";
import { getTaskJson, runBacklogCli } from "@ezxomp/backlog/extensions/index.ts";

/** OMP's string-array widget has no width callback; keep a fixed, testable cap. */
export const WIDGET_MAX_WIDTH = 160;

export function clipWidgetLine(line: string, width = WIDGET_MAX_WIDTH): string {
	const plain = line.replace(/[\u0000-\u001f\u007f]/g, " ");
	const maxWidth = Math.max(1, Math.min(WIDGET_MAX_WIDTH, Math.trunc(width)));
	const chars = Array.from(plain);
	if (chars.length <= maxWidth) return plain;
	if (maxWidth === 1) return "…";
	return `${chars.slice(0, maxWidth - 1).join("")}…`;
}

function taskKey(id: string): string {
	return id.trim().toUpperCase();
}

function isTerminalTask(task: Pick<TaskInfo, "status">): boolean {
	const status = task.status.trim().toLowerCase();
	return status === "done" || status === "archived";
}

async function getAllTasksStrict(pi: ExtensionAPI, cwd: string): Promise<TaskInfo[] | null> {
	let result: Awaited<ReturnType<typeof runBacklogCli>>;
	try {
		result = await runBacklogCli(pi, ["task", "list", "--json", "--limit", "999"], cwd);
	} catch {
		return null;
	}
	if (result.code !== 0) return null;
	try {
		const tasks = JSON.parse(result.stdout).tasks;
		if (!Array.isArray(tasks)) return null;
		return tasks.map((task: Record<string, unknown>) => ({
			...task,
			parent_task_id: (task.parent_task_id ?? task.parentTaskId) as string | undefined,
			dependencies: (task.dependencies ?? []) as string[],
			assignee: (task.assignee ?? task.assignees ?? []) as string[],
		})) as TaskInfo[];
	} catch {
		return null;
	}
}

/** Resolve the direct-child parent represented by the current task pointer. */
function widgetParentTaskId(state: CookState, tasks: TaskInfo[]): string | undefined {
	const currentId = state.currentTaskId ?? state.taskIds[0];
	if (!currentId) return undefined;
	const current = tasks.find((task) => taskKey(task.id) === taskKey(currentId));
	return current?.parent_task_id?.trim() || current?.id || currentId;
}

export interface WidgetCounts {
	ready: number;
	done: number;
	total: number;
}

export function chainNameAndDefinition(chain: string[]): { name: string; phases: typeof CHAIN_PATTERNS[string] } | undefined {
	for (const [name, phases] of Object.entries(CHAIN_PATTERNS)) {
		if (phases.length === chain.length && phases.every((phase, index) => phase.name === chain[index])) {
			return { name, phases };
		}
	}
	return undefined;
}

/** Derive direct-child ready/done counts from the shared Backlog task model. */
export function widgetCountsFor(state: CookState, tasks: TaskInfo[] | undefined): WidgetCounts {
	// undefined means the Backlog read was unavailable; [] is a successful read
	// with no tasks and must not accidentally reuse watchList as a substitute.
	if (!tasks) {
		const watched = Object.values(state.watchList ?? {});
		const done = watched.filter((task) => {
			const status = task.lastStatus.trim().toLowerCase();
			return status === "done" || status === "archived";
		}).length;
		return { ready: 0, done, total: watched.length };
	}

	const parentId = widgetParentTaskId(state, tasks);
	const parentKey = parentId ? taskKey(parentId) : undefined;
	const children = parentKey
		? tasks.filter((task) => task.parent_task_id !== undefined && taskKey(task.parent_task_id) === parentKey)
		: [];
	if (!children.length) return { ready: 0, done: 0, total: 0 };

	const terminalIds = new Set(
		tasks.filter(isTerminalTask).map((task) => taskKey(task.id)),
	);
	const done = children.filter(isTerminalTask).length;
	const ready = children.filter((task) =>
		!isTerminalTask(task) &&
		(task.dependencies ?? [])
			.filter((dependency) => !parentKey || taskKey(dependency) !== parentKey)
			.every((dependency) => terminalIds.has(taskKey(dependency))),
	).length;
	return { ready, done, total: children.length };
}

/** Compose the compact, plain-string widget contract (at most six lines). */
export function composeWidgetLines(
	state: CookState,
	counts: WidgetCounts = { ready: 0, done: 0, total: 0 },
	tasks?: TaskInfo[],
	width = WIDGET_MAX_WIDTH,
): string[] {
	if (!state.chain.length) {
		if (!state.cookmode) return [];
		const watched = Object.keys(state.watchList ?? {}).length;
		return [clipWidgetLine(`cook: COOKMODE ON (/cook off to exit)${watched ? ` | watch: ${watched}` : ""}`, width)];
	}
	const definition = chainNameAndDefinition(state.chain);
	const currentStage = Number.isFinite(state.currentStage)
		? Math.max(0, Math.min(Math.trunc(state.currentStage), state.chain.length - 1))
		: 0;
	const phase = state.chain[currentStage] ?? state.chain.at(-1) ?? "idle";
	const phaseDef = definition?.phases.find((entry) => entry.name === phase);
	const role = phaseDef?.owner ?? state.agentLog.at(-1)?.role;
	const task = widgetParentTaskId(state, tasks ?? []) ?? state.currentTaskId ?? state.taskIds[0] ?? "none";
	const modeTag = state.cookmode ? " [COOKMODE]" : "";
	const markers = state.chain.map((stage, index) => `${index < currentStage ? "✓" : index === currentStage ? "▶" : "○"} ${stage}`);
	const watchEntries = Object.values(state.watchList ?? {});
	const watchState = state.watch.enabled ? "ON" : "OFF";
	const watchCount = watchEntries.length ? ` (${watchEntries.length} task${watchEntries.length === 1 ? "" : "s"})` : "";
	const fired = state.watch.lastFiredAt ? ` | last fired: ${state.watch.lastFiredAt}` : "";
	return [
		clipWidgetLine(`cook: ${definition?.name ?? "custom"}${modeTag} | task: ${task}`, width),
		clipWidgetLine(`stage: ${phase.toUpperCase()}${role ? ` [${role}]` : ""} (${currentStage + 1}/${state.chain.length})`, width),
		clipWidgetLine(`stages: ${markers.join(" · ")}`, width),
		clipWidgetLine(`watch: ${watchState}${watchCount}${fired}`, width),
		clipWidgetLine(`subtasks: ready ${counts.ready} | done ${counts.done}/${counts.total}`, width),
	];
}

async function readWidgetTasks(pi: ExtensionAPI, cwd: string): Promise<TaskInfo[] | undefined> {
	try {
		const result = await runBacklogCli(pi, ["task", "list", "--json", "--limit", "999"], cwd);
		if (result.code !== 0) return undefined;
		const parsed = JSON.parse(result.stdout) as { tasks?: unknown };
		if (!Array.isArray(parsed.tasks)) return undefined;
		return parsed.tasks
			.filter((task): task is Record<string, unknown> => typeof task === "object" && task !== null)
			.map((task) => ({
				...task,
				parent_task_id: (task.parent_task_id ?? task.parentTaskId) as string | undefined,
				dependencies: Array.isArray(task.dependencies) ? task.dependencies as string[] : [],
				assignee: Array.isArray(task.assignee) ? task.assignee as string[] : Array.isArray(task.assignees) ? task.assignees as string[] : [],
			} as TaskInfo));
	} catch {
		return undefined;
	}
}
function statePathFor(cwd: string): string {
	return join(cwd, STATE_FILE);
}

export function defaultCookState(): CookState {
	return {
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
		convergence: {},
		councilEpisodes: {},
		complexity: {},
		pipelineVersion: undefined,
		maxParallelTasks: 1,
		adhdFrames: [],
		adhdIdeas: [],
		adhdShortlist: [],
		gateResults: {},
		cookmode: false,
		watch: {
			enabled: false,
			debounceMs: 250,
			trigger: "auto",
			lastFiredAt: null,
			watchId: null,
		},
		watchList: {},
		heartbeats: {},
	};
}

export function loadCookState(cwd: string): CookState {
	try {
		const p = statePathFor(cwd);
		if (existsSync(p)) {
			const loaded = { ...defaultCookState(), ...JSON.parse(readFileSync(p, "utf-8")) } as CookState;
			// Legacy tolerance: string claim values (pre-6.0 shape) normalize lazily; consumers
			// reading claims must handle both shapes. See extensions/journal.ts claimClaim.
			if (loaded.maxParallelTasks === undefined || loaded.maxParallelTasks === null) {
				loaded.maxParallelTasks = 1;
			}
			return loaded;
		}
	} catch {}
	return defaultCookState();
}

export function saveCookState(cwd: string, state: CookState): void {
	try {
		const p = statePathFor(cwd);
		mkdirSync(dirname(p), { recursive: true });
		writeFileSync(p, JSON.stringify(state, null, 2));
	} catch {}
}

/**
 * Terminal transition: park the chain on its final phase and clear the
 * current pointer. Idempotent — returns the same object if already there.
 */
export function completeChain(state: CookState): CookState {
	const last = state.chain.length - 1;
	if (!state.chain.length) return state;
	if (state.currentStage === last && state.currentTaskId === null) return state;
	return { ...state, currentStage: last, currentTaskId: null };
}

function advanceToTask(state: CookState, next: TaskInfo): CookState {
	const firstWork = state.chain.findIndex((stage) =>
		["implement", "explore", "review"].includes(stage),
	);
	return {
		...state,
		currentTaskId: next.id,
		currentStage: firstWork >= 0 ? firstWork : state.currentStage,
		taskIds: Array.from(new Set([...state.taskIds, next.id])),
	};
}

export async function syncFromBacklog(
	pi: ExtensionAPI,
	cwd: string,
	state: CookState,
): Promise<CookState> {
	if (!state.chain.length || !state.currentTaskId) return state;


	try {
		const task = await getTaskJson(pi, state.currentTaskId, cwd);
		// Null = unreadable/transient (CLI hiccup, missing binary): no-op.
		// Vanished-task hygiene lives in pollWatchedTasks instead.
		if (!task) return state;

		if (task.status === "In Progress") return state;
		const all = await getAllTasksStrict(pi, cwd);
		if (!all) return state;
		const byId = new Map(all.map((entry) => [entry.id.toUpperCase(), entry]));

		// Preferred: advance to a ready sibling under the done task's parent.
		const parentId = task.parent_task_id;
		if ((task.status === "Done" || task.status === "Archived") && parentId) {
			const done = new Set(
				all
					.filter((entry) => entry.status === "Done" || entry.status === "Archived")
					.map((entry) => entry.id.toUpperCase()),
			);
			const ready = all
				.filter(
					(entry) =>
						entry.parent_task_id?.toUpperCase() === parentId.toUpperCase() &&
						entry.status !== "Done" &&
						entry.status !== "Archived" &&
						entry.dependencies.every((dependency) => done.has(dependency.toUpperCase())),
				)
				.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
			if (ready.length > 0) {
				const next = ready[0];
				let statusEdit: Awaited<ReturnType<typeof runBacklogCli>>;
				try {
					statusEdit = await runBacklogCli(pi, ["task", "edit", next.id, "-s", "In Progress"], cwd);
				} catch {
					return state;
				}
				if (statusEdit.code !== 0) return state;
				return advanceToTask(state, next);
			}
			// Parent exhausted — fall through to tracked-task recovery.
		}

		const trackedActive = state.taskIds
			.map((id) => byId.get(id.toUpperCase()))
			.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && entry!.status === "In Progress");
		if (trackedActive.length === 1) {
			return advanceToTask(state, trackedActive[0]!);
		}

		if (task.status !== "Done" && task.status !== "Archived") return state;

		// Leaf / top-level task, or exhausted parent: recover the next
		// actionable task from the ones this cook session tracks. Without
		// this the widget dead-ends on IMPLEMENT forever (TASK-15.6 case).
		const pending = state.taskIds
			.map((id) => byId.get(id.toUpperCase()))
			.filter((t): t is NonNullable<typeof t> => Boolean(t) && t!.status !== "Done" && t!.status !== "Archived")
			.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

		if (pending.length > 0) {
			const next = pending[0]!;
			let statusEdit: Awaited<ReturnType<typeof runBacklogCli>>;
			try {
				statusEdit = await runBacklogCli(pi, ["task", "edit", next.id, "-s", "In Progress"], cwd);
			} catch {
				return state;
			}
			if (statusEdit.code !== 0) return state;
			return advanceToTask(state, next);
		}

		// Nothing actionable left in the session's tracked set — done.
		return completeChain(state);
	} catch {
		return state;
	}
}

/** Format the current Cook stage for terminal activity surfaces. */
export function cookActivityTitle(state: CookState): string | undefined {
	const activity = cookActivityParts(state);
	if (!activity) return undefined;
	return `cook: ${activity.stage} [${activity.role}]${activity.task ? ` — ${activity.task}` : ""}`;
}

/** Format the current Cook stage for the host working-message surface. */
export function cookActivityMessage(state: CookState): string | undefined {
	const activity = cookActivityParts(state);
	if (!activity) return undefined;
	return `Cook ${activity.stage} (${activity.role})${activity.task ? ` — ${activity.task}` : ""}`;
}

function cookActivityParts(state: CookState): { stage: string; role: string; task?: string } | undefined {
	if (!state.chain.length) return undefined;
	const stageIndex = Number.isFinite(state.currentStage)
		? Math.max(0, Math.min(Math.trunc(state.currentStage), state.chain.length - 1))
		: 0;
	const stage = state.chain[stageIndex];
	if (!stage) return undefined;
	const task = state.currentTaskId?.trim() || undefined;
	// A chain parked on its final stage with no current task is complete, not
	// active. Earlier stages without a task remain visible for diagnostics.
	if (stageIndex === state.chain.length - 1 && !task) return undefined;
	const definition = chainNameAndDefinition(state.chain);
	const role = definition?.phases[stageIndex]?.owner ?? state.agentLog.at(-1)?.role ?? "worker";
	return { stage, role, ...(task ? { task } : {}) };
}

/**
 * Create a StoreContext bound to a pi instance.
 * Replaces the closure-based store pattern from the monolithic index.ts.
 */
export function createStoreContext(pi: ExtensionAPI): StoreContext {
	const stores = new Map<string, CookState>();
	const taskSnapshots = new Map<string, TaskInfo[] | undefined>();
	let currentCwd = process.cwd();
	let lastUi: ExtensionContext["ui"] | null = null;
	let hasUI = false;
	let refreshGeneration = 0;
	let activityGeneration = 0;

	type ActivitySurface = {
		setTitle?: (title: string) => void;
		setWorkingMessage?: (message?: string) => void;
	};
	type ActivityState = {
		titleOwned: boolean;
		messageOwned: boolean;
		ownedTitle?: string;
		ownedMessage?: string;
		observedTitle?: string;
		observedMessage?: string;
	};
	const activity: ActivityState = { titleOwned: false, messageOwned: false };
	type ActivityObserver = {
		state: ActivityState;
		originalTitle?: (title: string) => void;
		originalMessage?: (message?: string) => void;
		titleWrapper?: (title: string) => void;
		messageWrapper?: (message?: string) => void;
		restore: () => void;
	};
	const observedUi = new WeakMap<object, ActivityObserver>();

	function normalizeCwd(cwd: string): string {
		return cwd.replace(/\/+$/, "") || "/";
	}

	function getStoreFor(cwd: string): CookState {
		const key = normalizeCwd(cwd);
		let s = stores.get(key);
		if (!s) {
			s = loadCookState(key);
			stores.set(key, s);
		}
		return s;
	}

	function getStore(): CookState {
		return getStoreFor(currentCwd);
	}

	function activitySurface(ui: ExtensionContext["ui"]): ActivitySurface {
		return ui as unknown as ActivitySurface;
	}

	function ensureActivityObserver(ui: ExtensionContext["ui"]): void {
		const surface = activitySurface(ui);
		const existing = observedUi.get(ui as object);
		if (existing?.state === activity) return;
		existing?.restore();
		const originalTitle = surface.setTitle;
		const originalMessage = surface.setWorkingMessage;
		let titleWrapper: ((title: string) => void) | undefined;
		let messageWrapper: ((message?: string) => void) | undefined;
		try {
			if (typeof originalTitle === "function") {
				const wrapper = (title: string) => {
					activity.observedTitle = title;
					originalTitle.call(ui, title);
				};
				surface.setTitle = wrapper;
				titleWrapper = wrapper;
			}
		} catch {
			// Partial/frozen host UI objects may not permit observation wrappers.
		}
		try {
			if (typeof originalMessage === "function") {
				const wrapper = (message?: string) => {
					activity.observedMessage = message;
					originalMessage.call(ui, message);
				};
				surface.setWorkingMessage = wrapper;
				messageWrapper = wrapper;
			}
		} catch {
			// Partial/frozen host UI objects may not permit observation wrappers.
		}
		observedUi.set(ui as object, {
			state: activity,
			originalTitle,
			originalMessage,
			titleWrapper,
			messageWrapper,
			restore: () => {
				try {
					if (titleWrapper && surface.setTitle === titleWrapper) surface.setTitle = originalTitle;
					if (messageWrapper && surface.setWorkingMessage === messageWrapper) surface.setWorkingMessage = originalMessage;
				} catch {
					// Restoration is best-effort for partial/frozen host UI objects.
				}
			},
		});
	}

	function releaseActivityObserver(ui: ExtensionContext["ui"]): void {
		const existing = observedUi.get(ui as object);
		if (!existing || existing.state !== activity) return;
		existing.restore();
		observedUi.delete(ui as object);
	}

	function ownsActivitySetter(ui: ExtensionContext["ui"], method: "setTitle" | "setWorkingMessage"): boolean {
		const observer = observedUi.get(ui as object);
		if (!observer || observer.state !== activity) return false;
		const surface = activitySurface(ui);
		if (method === "setTitle") {
			return observer.titleWrapper ? surface.setTitle === observer.titleWrapper : surface.setTitle === observer.originalTitle;
		}
		return observer.messageWrapper ? surface.setWorkingMessage === observer.messageWrapper : surface.setWorkingMessage === observer.originalMessage;
	}

	function callActivity(ui: ExtensionContext["ui"], method: "setTitle" | "setWorkingMessage", value?: string): boolean {
		try {
			if (method === "setTitle") {
				const fn = activitySurface(ui).setTitle;
				if (typeof fn !== "function") return false;
				fn.call(ui, value ?? "");
			} else {
				const fn = activitySurface(ui).setWorkingMessage;
				if (typeof fn !== "function") return false;
				fn.call(ui, value);
			}
			return true;
		} catch {
			// UI surfaces are optional and must never break Cook orchestration.
			return false;
		}
	}

	function isCurrentActivity(token: number, key: string): boolean {
		return token === activityGeneration && key === normalizeCwd(currentCwd) && hasUI && Boolean(lastUi);
	}

	function resetActivityFor(ui: ExtensionContext["ui"], token: number): void {
		if (!isCurrentActivity(token, normalizeCwd(currentCwd))) return;
		const titleStillOwned = activity.titleOwned && ownsActivitySetter(ui, "setTitle") &&
			(activity.observedTitle === undefined || activity.ownedTitle === undefined || activity.observedTitle === activity.ownedTitle);
		const messageStillOwned = activity.messageOwned && ownsActivitySetter(ui, "setWorkingMessage") &&
			(activity.observedMessage === undefined || activity.ownedMessage === undefined || activity.observedMessage === activity.ownedMessage);
		if (titleStillOwned) callActivity(ui, "setTitle", "");
		if (!isCurrentActivity(token, normalizeCwd(currentCwd))) return;
		if (messageStillOwned) callActivity(ui, "setWorkingMessage");
		if (!isCurrentActivity(token, normalizeCwd(currentCwd))) return;
		activity.titleOwned = false;
		activity.messageOwned = false;
		delete activity.ownedTitle;
		delete activity.ownedMessage;
		delete activity.observedTitle;
		delete activity.observedMessage;
		releaseActivityObserver(ui);
	}


	function refreshActivityFor(key: string, state: CookState, token: number): void {
		if (!isCurrentActivity(token, key)) return;
		const ui = lastUi;
		if (!ui) return;
		const title = cookActivityTitle(state);
		const message = cookActivityMessage(state);
		if (!title || !message) {
			resetActivityFor(ui, token);
			return;
		}
		ensureActivityObserver(ui);
		const wroteTitle = callActivity(ui, "setTitle", title);
		if (!isCurrentActivity(token, key)) return;
		const wroteMessage = callActivity(ui, "setWorkingMessage", message);
		if (!isCurrentActivity(token, key)) return;
		activity.titleOwned = wroteTitle;
		activity.messageOwned = wroteMessage;
		if (wroteTitle) activity.ownedTitle = title;
		else delete activity.ownedTitle;
		if (wroteMessage) activity.ownedMessage = message;
		else delete activity.ownedMessage;
	}

	function refreshActivity(): void {
		const token = ++activityGeneration;
		const key = normalizeCwd(currentCwd);
		if (!lastUi || !hasUI) return;
		refreshActivityFor(key, getStoreFor(key), token);
	}

	function resetActivity(): void {
		const token = ++activityGeneration;
		if (lastUi && hasUI) resetActivityFor(lastUi, token);
	}

	function setStoreFor(cwd: string, next: CookState): void {
		const key = normalizeCwd(cwd);
		stores.set(key, next);
		saveCookState(key, next);
		pi.appendEntry(MOD_ID, next);
		if (key === normalizeCwd(currentCwd)) {
			const token = ++activityGeneration;
			refreshWidget(token);
		}
	}

	function setStore(next: CookState): void {
		setStoreFor(currentCwd, next);
	}

	function renderWidget(state: CookState, tasks: TaskInfo[] | undefined): void {
		if (!lastUi || !hasUI) return;
		const ui = lastUi;
		try {
			const lines = composeWidgetLines(state, widgetCountsFor(state, tasks), tasks);
			ui.setWidget(MOD_ID, lines.length > 0 ? lines : undefined, {
				placement: "aboveEditor",
			});
		} catch {
			// UI refresh must never break a turn in a headless or partial host.
		}
	}

	function refreshWidget(activityToken?: number): void {
		const token = activityToken ?? ++activityGeneration;
		if (!lastUi || !hasUI) return;
		const key = normalizeCwd(currentCwd);
		const state = getStoreFor(key);
		const generation = ++refreshGeneration;
		const cached = taskSnapshots.get(key);
		// Paint persisted state immediately; task reads are best-effort and must
		// never delay the synchronous setStoreFor -> setWidget contract.
		renderWidget(state, cached);
		refreshActivityFor(key, state, token);
		if (!state.chain.length) return;

		void readWidgetTasks(pi, key).then((tasks) => {
			if (generation !== refreshGeneration || key !== normalizeCwd(currentCwd)) return;
			taskSnapshots.set(key, tasks);
			renderWidget(getStoreFor(key), tasks);
		}).catch(() => {
			if (generation !== refreshGeneration || key !== normalizeCwd(currentCwd)) return;
			renderWidget(getStoreFor(key), taskSnapshots.get(key));
		});
	}

	return {
		get currentCwd() { return currentCwd; },
		set currentCwd(v: string) {
			const previousKey = normalizeCwd(currentCwd);
			const nextKey = normalizeCwd(v);
			const token = ++activityGeneration;
			if (previousKey !== nextKey && lastUi && hasUI) resetActivityFor(lastUi, token);
			currentCwd = v;
			refreshGeneration++;
		},
		get lastUi() { return lastUi; },
		set lastUi(v: ExtensionContext["ui"] | null) {
			const token = ++activityGeneration;
			if (lastUi && lastUi !== v && hasUI) resetActivityFor(lastUi, token);
			lastUi = v;
			refreshGeneration++;
			if (!v) hasUI = false;
			else if (!hasUI) hasUI = true;
		},
		get hasUI() { return hasUI; },
		set hasUI(v: boolean) {
			const token = ++activityGeneration;
			if (!v && hasUI && lastUi) resetActivityFor(lastUi, token);
			hasUI = v;
			refreshGeneration++;
		},
		stores,
		normalizeCwd,
		getStoreFor,
		getStore,
		setStoreFor,
		setStore,
		refreshWidget,
		refreshActivity,
		resetActivity,
	};
}
