/**
 * Reconciliation preserves ownership: completed tasks remain explicitly
 * selectable through cook_next while an open sibling or tracked task exists.
 * Exhausted lineages park the workflow; transient reads leave state intact.
 */
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import makePi, {
	__resetHandlers,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

async function freshExtension(pi: PiStub) {
	vi.resetModules?.();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
	return mod;
}

describe("syncFromBacklog durability", () => {
	let workDir: string;
	let pi: PiStub;

	beforeEach(() => {
		workDir = mkdtempSync(path.join(tmpdir(), "cook-durability-"));
		mkdirSync(path.join(workDir, "backlog"), { recursive: true });
		__resetHandlers();
		pi = makePi();
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("retains completed top-level pointer until explicit next selects tracked work", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review", "done"],
			currentStage: 0,
			currentTaskId: "TASK-A",
			taskIds: ["TASK-A", "TASK-B"],
		};

		pi.exec
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({ task: { id: "TASK-A", status: "Done", title: "A" } }),
				stderr: "",
			})
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					tasks: [
						{ id: "TASK-A", status: "Done", title: "A" },
						{ id: "TASK-B", status: "To Do", title: "B" },
					],
				}),
				stderr: "",
			});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
		expect(result.currentTaskId).toBe("TASK-A");
		expect(result.currentStage).toBe(0);
	});

	it("completes the chain when every tracked task is Done", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review", "done"],
			currentStage: 0,
			currentTaskId: "TASK-A",
			taskIds: ["TASK-A"],
		};

		pi.exec
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({ task: { id: "TASK-A", status: "Done", title: "A" } }),
				stderr: "",
			})
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({ tasks: [{ id: "TASK-A", status: "Done", title: "A" }] }),
				stderr: "",
			});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result.currentStage).toBe(2);
		expect(result.currentTaskId).toBeNull();
	});

	it("treats unreadable task as transient no-op (CLI hiccup safety)", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review", "done"],
			currentStage: 0,
			currentTaskId: "TASK-GONE",
			taskIds: ["TASK-GONE"],
		};

		pi.exec.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "not found" });

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});

	it("completion is idempotent once the pointer is clear — no CLI churn at final phase", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review", "done"],
			currentStage: 2,
			currentTaskId: null,
			taskIds: ["TASK-A"],
		};

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});

	it("retains completed child pointer while sibling remains pending", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review", "done"],
			currentStage: 0,
			currentTaskId: "TASK-1.1",
			taskIds: ["TASK-1", "TASK-1.1", "TASK-1.2"],
		};

		pi.exec
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					task: { id: "TASK-1.1", status: "Done", title: "child", parent_task_id: "TASK-1" },
				}),
				stderr: "",
			})
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					tasks: [
						{ id: "TASK-1.1", status: "Done", title: "c1", parent_task_id: "TASK-1" },
						{ id: "TASK-1.2", status: "To Do", title: "c2", parent_task_id: "TASK-1" },
					],
				}),
				stderr: "",
			});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
		expect(result.currentTaskId).toBe("TASK-1.1");
	});
});

describe("pollWatchedTasks hygiene", () => {
	let workDir: string;
	let pi: PiStub;

	beforeEach(() => {
		workDir = mkdtempSync(path.join(tmpdir(), "cook-watch-hygiene-"));
		mkdirSync(path.join(workDir, "backlog"), { recursive: true });
		__resetHandlers();
		pi = makePi();
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	async function freshWatch() {
		vi.resetModules?.();
		return await import("../extensions/watch.ts");
	}

	it("drops missing tasks immediately", async () => {
		const watch = await freshWatch();
		const { defaultCookState } = await import("../extensions/state.ts");
		const nowIso = new Date().toISOString();
		const state = {
			...defaultCookState(),
			watchList: {
				"TASK-KEEP": { taskId: "TASK-KEEP", since: nowIso, lastStatus: "To Do", lastChecked: nowIso },
				"TASK-GONE": { taskId: "TASK-GONE", since: nowIso, lastStatus: "missing", lastChecked: nowIso },
			},
		};

		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [{ id: "TASK-KEEP", status: "In Progress", title: "K" }] }),
			stderr: "",
		});

		const result = await watch.pollWatchedTasks(pi, workDir, state);
		expect(Object.keys(result.watchList)).toEqual(["TASK-KEEP"]);
	});

	it("stamps doneAt on Done transition and drops after TTL", async () => {
		const watch = await freshWatch();
		const { defaultCookState } = await import("../extensions/state.ts");
		const now = Date.now();
		const state = {
			...defaultCookState(),
			watchList: {
				"TASK-FRESH": { taskId: "TASK-FRESH", since: "", lastStatus: "To Do", lastChecked: "" },
				"TASK-OLD": {
					taskId: "TASK-OLD",
					since: "",
					lastStatus: "Done",
					lastChecked: "",
					doneAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
				},
			},
		};

		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				tasks: [
					{ id: "TASK-FRESH", status: "Done", title: "F" },
					{ id: "TASK-OLD", status: "Done", title: "O" },
				],
			}),
			stderr: "",
		});

		const result = await watch.pollWatchedTasks(pi, workDir, state);
		expect(Object.keys(result.watchList)).toEqual(["TASK-FRESH"]);
		expect(result.watchList["TASK-FRESH"].doneAt).toBeTruthy();
	});

	it("keeps watch summaries isolated by project cwd", async () => {
		const watch = await freshWatch();
		const { defaultCookState } = await import("../extensions/state.ts");
		const otherDir = mkdtempSync(path.join(tmpdir(), "cook-watch-other-"));
		const nowIso = new Date().toISOString();
		const state = {
			...defaultCookState(),
			watchList: {
				"TASK-A": { taskId: "TASK-A", since: nowIso, lastStatus: "To Do", lastChecked: nowIso },
			},
		};
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [{ id: "TASK-A", status: "Done", title: "A" }] }),
			stderr: "",
		});
		try {
			await watch.pollWatchedTasks(pi, workDir, state);
			expect(watch.getLastWatchSummary(workDir)).toContain("TASK-A");
			expect(watch.getLastWatchSummary(otherDir)).toBe("");
		} finally {
			rmSync(otherDir, { recursive: true, force: true });
		}
	});
});
