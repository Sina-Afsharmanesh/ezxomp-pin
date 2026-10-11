import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, {
	__resetHandlers,
	__emitHook,
	makeCtx,
	type PiStub,
	type CtxStub,
} from "./__mocks__/pi-coding-agent";
import { stopWatcher } from "../extensions/watch.ts";

// Drives the watcher end-to-end: session_start with watch.enabled=true
// installs fs.watch on <cwd>/backlog; backlog file event fires pi.sendMessage
// with { triggerTurn: true }; session_stop closes the watcher.

let workDir: string;
let pi: PiStub;
let ctx: CtxStub;

function waitForDebounce(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 100));
}

const WATCH_EVENTS: Array<{ event: string; filename: string | null }> = [];
const WATCHER_CLOSE = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
	const actual = (importOriginal
		? await importOriginal()
		: process.getBuiltinModule("node:fs")) as typeof import("node:fs");
	return {
		...actual,
		watch: vi.fn((target: unknown, opts: unknown, listener?: unknown) => {
			return {
				close: WATCHER_CLOSE,
				simulate: (eventType: string, filename: string) => {
					WATCH_EVENTS.push({ event: eventType, filename });
					if (typeof listener === "function") {
						listener(eventType, filename);
					}
				},
				__target: target,
				__opts: opts,
			};
		}),
	};
});

beforeEach(async () => {
	__resetHandlers();
	// Bun does not implement vi.resetModules; reset module-level watcher state explicitly.
	const resetWatchState = await import("../extensions/watch.ts");
	resetWatchState.__resetWatchState();
	const fs = await import("node:fs");
	(fs.watch as ReturnType<typeof vi.fn>).mockClear();
	WATCH_EVENTS.length = 0;
	WATCHER_CLOSE.mockClear();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-watch-fs-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
	pi = makePi();
	ctx = makeCtx({ cwd: workDir });
});

afterEach(() => {
	stopWatcher();
	rmSync(workDir, { recursive: true, force: true });
});

function seedWatchState(cwd: string, watchId: string, chain: string[] = [], enabled = true): void {
	writeFileSync(
		path.join(cwd, "backlog", "cook-state.json"),
		JSON.stringify({
			chain,
			watch: {
				enabled,
				debounceMs: 50,
				trigger: "auto",
				lastFiredAt: null,
				watchId: enabled ? watchId : null,
			},
		}),
	);
}

function readPersistedWatch(cwd: string): { enabled: boolean; lastFiredAt: string | null; watchId: string | null } {
	const state = JSON.parse(readFileSync(path.join(cwd, "backlog", "cook-state.json"), "utf8")) as {
		watch: { enabled: boolean; lastFiredAt: string | null; watchId: string | null };
	};
	return state.watch;
}

function watcherFrom(fs: typeof import("node:fs")): { simulate: (event: string, name: string | undefined) => void } {
	return (fs.watch as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
		simulate: (event: string, name: string | undefined) => void;
	};
}


describe("cook watch fs scheduler", () => {
	it("session_start survives an unavailable persisted watch directory", async () => {
		const watchId = "00000000-0000-4000-8000-0000000000a9";
		seedWatchState(workDir, watchId);
		const fs = await import("node:fs");
		(fs.watch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
			throw new Error("watch directory unavailable");
		});
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);

		await expect(__emitHook("session_start", {}, ctx)).resolves.toBeDefined();
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("session_start with watch.enabled=true installs fs.watch on backlog/", async () => {
		// Pre-seed cook-state.json with watch enabled.
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify({
				watch: {
					enabled: true,
					debounceMs: 50,
					trigger: "auto",
					lastFiredAt: null,
					watchId: "00000000-0000-4000-8000-0000000000aa",
				},
			}),
		);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		expect(fs.watch).toHaveBeenCalled();
		const target = (fs.watch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		expect(target).toBe(path.join(workDir, "backlog"));
	});

	it("accepted debounced fire persists an ISO timestamp before one sendMessage", async () => {
		const watchId = "00000000-0000-4000-8000-0000000000ab";
		seedWatchState(workDir, watchId);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		const persistedAtSend = vi.fn(() => {
			const { lastFiredAt } = readPersistedWatch(workDir);
			expect(lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
			expect(Date.parse(lastFiredAt!)).not.toBeNaN();
		});
		pi.sendMessage.mockImplementation(persistedAtSend);
		watcherFrom(fs).simulate("change", "task-1.md");
		await waitForDebounce();
		expect(persistedAtSend).toHaveBeenCalledTimes(1);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: `cook-watch/${watchId}` }),
			expect.objectContaining({ triggerTurn: true }),
		);
		expect(readPersistedWatch(workDir).lastFiredAt).toBeTruthy();
		expect(pi.appendEntry).toHaveBeenCalledTimes(1);
	});

	it("debounce collapses a burst to one timestamp write and one sendMessage", async () => {
		const watchId = "00000000-0000-4000-8000-0000000000ac";
		seedWatchState(workDir, watchId);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		const watcher = watcherFrom(fs);
		watcher.simulate("change", "task-1.md");
		watcher.simulate("change", "task-2.md");
		watcher.simulate("change", "task-3.md");
		await waitForDebounce();
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: `cook-watch/${watchId}` }),
			expect.objectContaining({ triggerTurn: true }),
		);
		const { lastFiredAt } = readPersistedWatch(workDir);
		expect(lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
		expect(pi.appendEntry).toHaveBeenCalledTimes(1);
	});

	it("suppresses a queued event after the live watch is disabled", async () => {
		const watchId = "00000000-0000-4000-8000-0000000000ae";
		seedWatchState(workDir, watchId, ["implement"]);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		watcherFrom(fs).simulate("change", "task-1.md");
		seedWatchState(workDir, watchId, ["implement"], false);
		await __emitHook("turn_start", {}, ctx);
		const writesAfterDisable = pi.appendEntry.mock.calls.length;
		await waitForDebounce();
		expect(pi.sendMessage).not.toHaveBeenCalled();
		expect(pi.appendEntry).toHaveBeenCalledTimes(writesAfterDisable);
		expect(readPersistedWatch(workDir)).toMatchObject({ enabled: false, lastFiredAt: null, watchId: null });
	});

	it("suppresses a queued event after the live watch ID is replaced", async () => {
		const oldWatchId = "00000000-0000-4000-8000-0000000000af";
		const newWatchId = "00000000-0000-4000-8000-0000000000b2";
		seedWatchState(workDir, oldWatchId, ["implement"]);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		watcherFrom(fs).simulate("change", "task-1.md");
		seedWatchState(workDir, newWatchId, ["implement"]);
		await __emitHook("turn_start", {}, ctx);
		expect(readPersistedWatch(workDir).watchId).toBe(newWatchId);
		const writesAfterReplacement = pi.appendEntry.mock.calls.length;
		await waitForDebounce();
		expect(pi.sendMessage).not.toHaveBeenCalled();
		expect(pi.appendEntry).toHaveBeenCalledTimes(writesAfterReplacement);
		expect(readPersistedWatch(workDir).lastFiredAt).toBeNull();
	});

	it("persists to the watcher cwd without repainting or triggering a switched cwd", async () => {
		const watcherId = "00000000-0000-4000-8000-0000000000b0";
		const otherCwd = mkdtempSync(path.join(tmpdir(), "cook-watch-other-"));
		mkdirSync(path.join(otherCwd, "backlog"), { recursive: true });
		try {
			seedWatchState(workDir, watcherId);
			seedWatchState(otherCwd, "00000000-0000-4000-8000-0000000000b1");
			const mod = await import("../extensions/index.ts");
			mod.default(pi as never);
			const fs = await import("node:fs");
			await __emitHook("session_start", {}, ctx);
			watcherFrom(fs).simulate("change", "task-1.md");
			const otherCtx = makeCtx({ cwd: otherCwd });
			await __emitHook("turn_start", {}, otherCtx);
			const repaintCount = otherCtx.ui.setWidget.mock.calls.length;
			await waitForDebounce();
			expect(readPersistedWatch(workDir).lastFiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
			expect(readPersistedWatch(otherCwd).lastFiredAt).toBeNull();
			expect(pi.sendMessage).not.toHaveBeenCalled();
			expect(otherCtx.ui.setWidget).toHaveBeenCalledTimes(repaintCount);
		} finally {
			rmSync(otherCwd, { recursive: true, force: true });
		}
	});

	it("session_stop closes the watcher exactly once", async () => {
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify({
				watch: {
					enabled: true,
					debounceMs: 100,
					trigger: "auto",
					lastFiredAt: null,
					watchId: "00000000-0000-4000-8000-0000000000ad",
				},
			}),
		);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		await __emitHook("session_start", {}, ctx);
		await __emitHook("session_stop", {}, ctx);
		expect(WATCHER_CLOSE).toHaveBeenCalledTimes(1);
	});

	it("does not emit sendMessage when watch.enabled=false", async () => {
		writeFileSync(
			path.join(workDir, "backlog", "cook-state.json"),
			JSON.stringify({
				watch: {
					enabled: false,
					debounceMs: 50,
					trigger: "auto",
					lastFiredAt: null,
					watchId: null,
				},
			}),
		);
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const fs = await import("node:fs");
		await __emitHook("session_start", {}, ctx);
		// If a watcher was created (it should not be), simulate anyway.
		const calls = (fs.watch as ReturnType<typeof vi.fn>).mock.calls;
		if (calls.length > 0) {
			const watcher = (fs.watch as ReturnType<typeof vi.fn>).mock.results[0]
				?.value as { simulate: (e: string, n: string) => void };
			watcher.simulate("change", "task-1.md");
			await waitForDebounce();
		}
		expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});
});
