/**
 * Tests for syncFromBacklog — reconciles CookState with actual Backlog.md task status.
 *
 * Verifies that cook state auto-advances when tasks are marked Done via
 * backlog_task_edit without calling cook_* tools.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import makePi, {
	__resetHandlers,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

async function freshExtension(pi: PiStub): Promise<typeof import("../extensions/index.ts")> {
	vi.resetModules?.();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
	return mod;
}

describe("syncFromBacklog", () => {
	let workDir: string;
	let pi: PiStub;

	beforeEach(() => {
		workDir = mkdtempSync(path.join(tmpdir(), "cook-sync-"));
		mkdirSync(path.join(workDir, "backlog"), { recursive: true });
		__resetHandlers();
		pi = makePi();
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("returns state unchanged when no active chain", async () => {
		const mod = await freshExtension(pi);
		const state = mod.defaultCookState();
		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});

	it("returns state unchanged when currentTaskId is null", async () => {
		const mod = await freshExtension(pi);
		const state = { ...mod.defaultCookState(), chain: ["implement"], currentTaskId: null };
		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});

	it("returns state unchanged when task is still In Progress", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 0,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		};

		// Mock: backlog CLI returns task as In Progress
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				task: { id: "TASK-1", status: "In Progress", title: "Test" },
			}),
			stderr: "",
		});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});

	it("auto-advances to next subtask when currentTaskId is Done", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 0,
			currentTaskId: "TASK-1.1",
			taskIds: ["TASK-1", "TASK-1.1"],
		};

		// Mock: getTaskJson returns Done task
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				task: {
					id: "TASK-1.1",
					status: "Done",
					title: "Subtask 1",
					parent_task_id: "TASK-1",
				},
			}),
			stderr: "",
		});

		// Mock: getAllTasks (readyChildren) returns next ready subtask
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				tasks: [
					{
						id: "TASK-1.2",
						status: "To Do",
						title: "Subtask 2",
						parent_task_id: "TASK-1",
						dependencies: [],
					},
				],
			}),
			stderr: "",
		});

		// Mock: mark next task In Progress
		pi.exec.mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });

		const result = await mod.syncFromBacklog(pi, workDir, state);

		expect(result.currentTaskId).toBe("TASK-1.2");
		expect(result.taskIds).toContain("TASK-1.2");
		expect(result.chain).toEqual(state.chain);
	});

	it("does not advance when activating the next subtask fails", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review"],
			currentTaskId: "TASK-1.1",
			taskIds: ["TASK-1.1", "TASK-1.2"],
		};
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ task: { id: "TASK-1.1", status: "Done", parent_task_id: "TASK-1" } }),
			stderr: "",
		});
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [
				{ id: "TASK-1.1", status: "Done", parent_task_id: "TASK-1", dependencies: [] },
				{ id: "TASK-1.2", status: "To Do", parent_task_id: "TASK-1", dependencies: [] },
			] }),
			stderr: "",
		});
		pi.exec.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "status denied" });
		expect(await mod.syncFromBacklog(pi, workDir, state)).toEqual(state);
	});

	it("completes the chain when all subtasks are Done", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 0,
			currentTaskId: "TASK-1.1",
			taskIds: ["TASK-1", "TASK-1.1"],
		};

		// Mock: getTaskJson returns Done task
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				task: {
					id: "TASK-1.1",
					status: "Done",
					title: "Subtask 1",
					parent_task_id: "TASK-1",
				},
			}),
			stderr: "",
		});

		// Mock: getAllTasks returns empty (all subtasks done)
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [] }),
			stderr: "",
		});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result.currentStage).toBe(state.chain.length - 1);
		expect(result.currentTaskId).toBeNull();
	});

	it("clears a completed task pointer when already on the final stage", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement", "review"],
			currentStage: 1,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		};

		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				task: { id: "TASK-1", status: "Done", title: "Task" },
			}),
			stderr: "",
		});
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({ tasks: [] }),
			stderr: "",
		});

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).not.toBe(state);
		expect(result.currentStage).toBe(1);
		expect(result.currentTaskId).toBeNull();
	});

	it("is best-effort: returns state on CLI error", async () => {
		const mod = await freshExtension(pi);
		const state = {
			...mod.defaultCookState(),
			chain: ["implement"],
			currentStage: 0,
			currentTaskId: "TASK-1",
			taskIds: ["TASK-1"],
		};

		// Mock: CLI throws
		pi.exec.mockRejectedValueOnce(new Error("CLI not found"));

		const result = await mod.syncFromBacklog(pi, workDir, state);
		expect(result).toBe(state);
	});
});
