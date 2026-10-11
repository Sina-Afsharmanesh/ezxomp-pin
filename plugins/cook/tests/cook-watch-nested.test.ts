import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, type FSWatcher } from "node:fs";
import type * as NodeFs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, { __resetHandlers, makeCtx, type PiStub } from "./__mocks__/pi-coding-agent";
import { createStoreContext, defaultCookState } from "../extensions/state.ts";
import { __resetWatchState, stopWatcher, syncWatcher } from "../extensions/watch.ts";
import { registerCookTools } from "../extensions/cook-tools.ts";
import type { CookState, StoreContext } from "../extensions/types.ts";

const nativeWatchers = vi.hoisted(() => new Map<string, {
	watcher: FSWatcher;
	listener: (event: string, filename: string | null) => void;
	closed: boolean;
	onEvent?: () => void;
}>());

// Keep real Linux event delivery; record resource closure and expose a deterministic
// event boundary for timer/cwd tests without depending on scheduler delays.
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof NodeFs>();
	return {
		...actual,
		watch: (target: string, options: object, listener: (event: string, filename: string | null) => void) => {
			const resource = {
				watcher: undefined as unknown as FSWatcher,
				listener,
				closed: false,
				onEvent: undefined as (() => void) | undefined,
			};
			resource.watcher = actual.watch(target, options, (event, filename) => {
				listener(event, filename?.toString() ?? null);
				resource.onEvent?.();
			});
			resource.watcher.on("close", () => { resource.closed = true; });
			nativeWatchers.set(target, resource);
			return resource.watcher;
		},
	};
});

let cwd: string;
let sc: StoreContext;
let pi: PiStub;

function watchState(trigger: "auto" | "manual" = "auto"): CookState {
	return {
		...defaultCookState(),
		watch: { enabled: true, debounceMs: 10, trigger, lastFiredAt: null, watchId: "nested-watch" },
	};
}

function persistedWatch(ownerCwd = cwd): CookState["watch"] {
	return JSON.parse(readFileSync(path.join(ownerCwd, "backlog", "cook-state.json"), "utf8")).watch;
}

async function waitForNotification(filename: string): Promise<void> {
	await vi.waitFor(() => {
		expect(pi.sendMessage.mock.calls.some(([message]) =>
			JSON.stringify(message).includes(`Backlog file changed: ${filename}`),
		)).toBe(true);
	}, { timeout: 3000 });
}

beforeEach(() => {
	__resetHandlers();
	__resetWatchState();
	nativeWatchers.clear();
	cwd = mkdtempSync(path.join(tmpdir(), "cook-watch-nested-"));
	mkdirSync(path.join(cwd, "backlog", "tasks", "existing"), { recursive: true });
	mkdirSync(path.join(cwd, "backlog", "docs", "existing"), { recursive: true });
	pi = makePi();
	sc = createStoreContext(pi as never);
	sc.currentCwd = cwd;
	sc.setStoreFor(cwd, watchState());
});

afterEach(() => {
	stopWatcher();
	vi.useRealTimers();
	rmSync(cwd, { recursive: true, force: true });
});

describe("cook nested native watcher", () => {
	it("registered cook_watch starts monitoring immediately and stop cancels a queued nested edit", async () => {
		const initial = defaultCookState();
		sc.setStoreFor(cwd, { ...initial, chain: ["implement"] });
		const filename = "tasks/existing/TASK-1.md";
		const file = path.join(cwd, "backlog", filename);
		writeFileSync(file, "before start");
		registerCookTools(pi as never, sc);
		const execute = pi.__handlers.tools.get("cook_watch")!.execute!;
		const ctx = makeCtx({ cwd, hasUI: false });
		const signal = new AbortController().signal;
		expect(persistedWatch().enabled).toBe(false);
		const started = await execute("start", { action: "start", debounceMs: 10, trigger: "auto" }, signal, undefined, ctx);
		expect(started).not.toMatchObject({ isError: true });
		writeFileSync(file, "after registered start");
		await waitForNotification(filename);
		const firedAt = persistedWatch().lastFiredAt;
		expect(firedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
		expect(pi.sendMessage.mock.calls.at(-1)?.[1]).toEqual({ triggerTurn: true });
		pi.sendMessage.mockClear();
		vi.useFakeTimers();
		const resource = nativeWatchers.get(path.join(cwd, "backlog", "tasks", "existing"))!;
		const queued = new Promise<void>((resolve) => { resource.onEvent = resolve; });
		writeFileSync(file, "queued before stop");
		await queued;
		const stopped = await execute("stop", { action: "stop" }, signal, undefined, ctx);
		expect(stopped).not.toMatchObject({ isError: true });
		vi.runAllTimers();
		expect(persistedWatch()).toMatchObject({ enabled: false, watchId: null, lastFiredAt: firedAt });
		expect(pi.sendMessage.mock.calls).toEqual([]);
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect([...nativeWatchers.values()].every((watcher) => watcher.closed)).toBe(true);
		});
	});

	it.each(["tasks", "docs"])("notifies and persists timestamp for actual nested %s content edits", async (directory) => {
		const filename = `${directory}/existing/record.md`;
		const file = path.join(cwd, "backlog", filename);
		writeFileSync(file, "before");
		syncWatcher(pi as never, sc, cwd);
		writeFileSync(file, "after");
		await waitForNotification(filename);
		expect(persistedWatch().lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
		expect(pi.sendMessage.mock.calls.at(-1)?.[1]).toEqual({ triggerTurn: true });
	});

	it("discovers new nested directories before subsequent document edits", async () => {
		syncWatcher(pi as never, sc, cwd);
		mkdirSync(path.join(cwd, "backlog", "docs", "new", "nested"), { recursive: true });
		await waitForNotification("docs/new");
		pi.sendMessage.mockClear();
		const filename = "docs/new/nested/guide.md";
		writeFileSync(path.join(cwd, "backlog", filename), "new doc");
		await waitForNotification(filename);
		pi.sendMessage.mockClear();
		writeFileSync(path.join(cwd, "backlog", filename), "edited doc");
		await waitForNotification(filename);
	});

	it("manual mode notifies without requesting an agent turn", async () => {
		sc.setStoreFor(cwd, watchState("manual"));
		syncWatcher(pi as never, sc, cwd);
		const filename = "tasks/existing/manual.md";
		writeFileSync(path.join(cwd, "backlog", filename), "manual edit");
		await waitForNotification(filename);
		expect(pi.sendMessage.mock.calls.at(-1)?.[1]).toEqual({ triggerTurn: false });
		expect(persistedWatch().lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
	});

	it("explicit stop closes every native directory watcher and cancels a queued actual edit", async () => {
		syncWatcher(pi as never, sc, cwd);
		const resource = nativeWatchers.get(path.join(cwd, "backlog", "tasks", "existing"))!;
		vi.useFakeTimers();
		const event = new Promise<void>((resolve) => { resource.onEvent = resolve; });
		writeFileSync(path.join(cwd, "backlog", "tasks", "existing", "queued.md"), "queued edit");
		await event;
		stopWatcher(cwd);
		vi.runAllTimers();
		expect(pi.sendMessage.mock.calls).toEqual([]);
		expect(persistedWatch().lastFiredAt).toBeNull();
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect([...nativeWatchers.values()].every((watcher) => watcher.closed)).toBe(true);
		});
	});

	it("disabled synchronization cancels pending work and releases resources immediately", async () => {
		syncWatcher(pi as never, sc, cwd);
		vi.useFakeTimers();
		nativeWatchers.get(path.join(cwd, "backlog", "tasks", "existing"))!.listener("change", "task.md");
		const state = sc.getStoreFor(cwd);
		sc.setStoreFor(cwd, { ...state, watch: { ...state.watch, enabled: false } });
		syncWatcher(pi as never, sc, cwd);
		vi.runAllTimers();
		expect(pi.sendMessage.mock.calls).toEqual([]);
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect([...nativeWatchers.values()].every((watcher) => watcher.closed)).toBe(true);
		});
	});

	it("persists queued fire only for owner cwd and does not notify a switched project", () => {
		syncWatcher(pi as never, sc, cwd);
		vi.useFakeTimers();
		nativeWatchers.get(path.join(cwd, "backlog", "tasks", "existing"))!.listener("change", "task.md");
		const otherCwd = path.join(cwd, "other-project");
		mkdirSync(path.join(otherCwd, "backlog"), { recursive: true });
		sc.currentCwd = otherCwd;
		sc.setStoreFor(otherCwd, watchState());
		// A delayed operation for the old cwd must not close or replace native resources.
		syncWatcher(pi as never, sc, cwd);
		vi.runAllTimers();
		expect(persistedWatch(cwd).lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
		expect(persistedWatch(otherCwd).lastFiredAt).toBeNull();
		expect(pi.sendMessage.mock.calls).toEqual([]);
	});

	it("failed timestamp persistence reports failure without requesting a turn or reporting success", () => {
		syncWatcher(pi as never, sc, cwd);
		vi.useFakeTimers();
		const persist = vi.spyOn(sc, "setStoreFor").mockImplementation(() => { throw new Error("lock busy"); });
		try {
			nativeWatchers.get(path.join(cwd, "backlog", "tasks", "existing"))!.listener("change", "task.md");
			vi.runAllTimers();
			expect(persistedWatch().lastFiredAt).toBeNull();
			expect(pi.sendMessage.mock.calls).toHaveLength(1);
			expect(pi.sendMessage.mock.calls[0]?.[0]).toMatchObject({ customType: "cook-watch-error" });
			expect(pi.sendMessage.mock.calls[0]?.[1]).toEqual({ triggerTurn: false });
		} finally {
			persist.mockRestore();
		}
	});

	it("ignores nested dotfiles and state/config churn without creating a feedback loop", () => {
		syncWatcher(pi as never, sc, cwd);
		vi.useFakeTimers();
		const listener = nativeWatchers.get(path.join(cwd, "backlog", "docs", "existing"))!.listener;
		for (const filename of [".draft.md", ".locks/task.md", "cook-state.json", "cook-config.json", "config.yml"]) {
			listener("change", filename);
		}
		vi.runAllTimers();
		expect(pi.sendMessage.mock.calls).toEqual([]);
		expect(persistedWatch().lastFiredAt).toBeNull();
	});
});
