import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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

// TASK-34 regression: the backlog/ fs.watch callback must ignore entries that
// are internal to the cook machinery itself. state save (cook-state.json),
// cook-config.json, dotfiles (e.g. .locks), and events with an undefined
// filename must never enqueue a cook-watch sendMessage; genuine tasks/*.md
// changes must still alert with triggerTurn: true.
// RED against pre-fix watch.ts (no filename filter); GREEN with the guard.

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
				simulate: (eventType: string, filename: string | undefined) => {
					WATCH_EVENTS.push({ event: eventType, filename: filename ?? null });
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
	workDir = mkdtempSync(path.join(tmpdir(), "cook-watch-ignore-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
	pi = makePi();
	ctx = makeCtx({ cwd: workDir });
});

afterEach(() => {
	stopWatcher();
	rmSync(workDir, { recursive: true, force: true });
});

async function startWatcherWithWatchEnabled(watchId: string): Promise<{
	simulate: (event: string, name: string | undefined) => void;
}> {
	writeFileSync(
		path.join(workDir, "backlog", "cook-state.json"),
		JSON.stringify({
			watch: {
				enabled: true,
				debounceMs: 50,
				trigger: "auto",
				lastFiredAt: null,
				watchId,
			},
		}),
	);
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
	const fs = await import("node:fs");
	await __emitHook("session_start", {}, ctx);
	return (fs.watch as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
		simulate: (event: string, name: string | undefined) => void;
	};
}

describe("cook watch ignores internal state/config/dotfile churn (TASK-34)", () => {
	it("cook-state.json change does NOT enqueue pi.sendMessage", async () => {
		const watcher = await startWatcherWithWatchEnabled(
			"00000000-0000-4000-8000-000000000001",
		);
		watcher.simulate("change", "cook-state.json");
		await waitForDebounce();
		expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});

	it("dotfile entry (.locks) does NOT enqueue pi.sendMessage", async () => {
		const watcher = await startWatcherWithWatchEnabled(
			"00000000-0000-4000-8000-000000000002",
		);
		watcher.simulate("change", ".locks");
		await waitForDebounce();
		expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});

	it("fs event with undefined filename does NOT enqueue pi.sendMessage", async () => {
		const watcher = await startWatcherWithWatchEnabled(
			"00000000-0000-4000-8000-000000000003",
		);
		watcher.simulate("change", undefined);
		await waitForDebounce();
		expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});

	it("genuine tasks/*.md change still alerts with triggerTurn: true", async () => {
		const watcher = await startWatcherWithWatchEnabled(
			"00000000-0000-4000-8000-000000000004",
		);
		watcher.simulate("change", "tasks/task-34-watch-advisory-cascade.md");
		await waitForDebounce();
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: expect.stringContaining("cook-watch") }),
			expect.objectContaining({ triggerTurn: true }),
		);
	});
});
