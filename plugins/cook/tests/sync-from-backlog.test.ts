import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { defaultCookState, syncFromBacklog, isReadyTask, isTerminalStatus, compareReadyTasks } from "../extensions/state.ts";
import type { CookState, TaskInfo } from "../extensions/types.ts";

let cwd: string;
beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), "cook-sync-")); });
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

function task(id: string, status: string, extra: Partial<TaskInfo> = {}): TaskInfo {
	return { id, status, title: id, dependencies: [], assignee: [], ...extra } as TaskInfo;
}

/** An editable task repository makes accidental activation observable in task status. */
function repository(tasks: TaskInfo[]): { pi: ExtensionAPI } {
	const pi = {
		exec: async (_command: string, args: string[]) => {
			if (args[1] === "edit") {
				const target = tasks.find((entry) => entry.id === args[2]);
				if (target) target.status = args[args.indexOf("-s") + 1];
				return { code: 0, stdout: "", stderr: "" };
			}
			const value = args[1] === "list" ? { tasks } : { task: tasks.find((entry) => entry.id === args[1]) };
			return { code: 0, stdout: JSON.stringify(value), stderr: "" };
		},
	} as unknown as ExtensionAPI;
	return { pi };
}

function activeState(): CookState {
	return { ...defaultCookState(), chain: ["implement", "review", "done"], currentTaskId: "TASK-1.1", taskIds: ["TASK-1", "TASK-1.1"] };
}

describe("Cook reconciliation keeps task ownership", () => {
	it.each(["To Do", "Blocked", "In Progress", "Draft", "Cancelled"])
	("retains completed pointer without activating open %s sibling", async (status) => {
		const state = activeState();
		state.claims = { "TASK-1.2": "other-lane" };
		const sibling = task("TASK-1.2", status, { parent_task_id: "TASK-1" });
		const repo = repository([task("TASK-1.1", "Done", { parent_task_id: "TASK-1" }), sibling]);
		const result = await syncFromBacklog(repo.pi, cwd, state);
		expect(result).toBe(state);
		expect(result.currentTaskId).toBe("TASK-1.1");
		expect(result.taskIds).not.toContain("TASK-1.2");
		expect(result.claims).toEqual({ "TASK-1.2": "other-lane" });
		expect(sibling.status).toBe(status);
	});

	it("never selects an already active tracked task after current task finishes", async () => {
		const state = { ...activeState(), currentTaskId: "TASK-1", taskIds: ["TASK-1", "TASK-2"] };
		const repo = repository([task("TASK-1", "Done"), task("TASK-2", "In Progress")]);
		expect(await syncFromBacklog(repo.pi, cwd, state)).toBe(state);
	});

	it("keeps a completed parent pointer while untracked child work remains open", async () => {
		const state = { ...activeState(), currentTaskId: "TASK-1", taskIds: ["TASK-1"] };
		const child = task("TASK-1.1", "To Do", { parent_task_id: "TASK-1" });
		const repo = repository([task("TASK-1", "Done"), child]);
		expect(await syncFromBacklog(repo.pi, cwd, state)).toBe(state);
		expect(child.status).toBe("To Do");
	});

	it.each(["To Do", "Blocked", "In Progress"])("does not replace a nonterminal %s current pointer", async (status) => {
		const state = activeState();
		state.taskIds.push("TASK-1.2");
		const repo = repository([task("TASK-1.1", status), task("TASK-1.2", "In Progress")]);
		expect(await syncFromBacklog(repo.pi, cwd, state)).toBe(state);
	});

	it("parks only exhausted lineage and leaves unrelated work alone", async () => {
		const state = activeState();
		const unrelated = task("TASK-2.1", "To Do", { parent_task_id: "TASK-2" });
		const repo = repository([
			task("TASK-1.1", " done ", { parent_task_id: "TASK-1" }),
			task("TASK-1.2", "CLOSED", { parent_task_id: "TASK-1" }),
			task("TASK-1.3", "Archived", { parent_task_id: "TASK-1" }),
			unrelated,
		]);
		const result = await syncFromBacklog(repo.pi, cwd, state);
		expect(result.currentTaskId).toBeNull();
		expect(result.currentStage).toBe(state.chain.length - 1);
		expect(result.taskIds).toEqual(state.taskIds);
		expect(unrelated.status).toBe("To Do");
		expect(await syncFromBacklog(repo.pi, cwd, result)).toBe(result);
	});

	it("keeps current state when Backlog cannot prove exhaustion", async () => {
		const state = activeState();
		const pi = { exec: async () => { throw new Error("CLI unavailable"); } } as unknown as ExtensionAPI;
		expect(await syncFromBacklog(pi, cwd, state)).toBe(state);
	});

	it("keeps current state when list data is corrupt after current completion", async () => {
		const state = activeState();
		const pi = { exec: async (_command: string, args: string[]) => ({ code: 0, stderr: "",
			stdout: args[1] === "list" ? "bad list" : JSON.stringify({ task: task("TASK-1.1", "Done") }),
		}) } as unknown as ExtensionAPI;
		expect(await syncFromBacklog(pi, cwd, state)).toBe(state);
	});
});

describe("shared task readiness", () => {
	it.each(["todo", " To Do ", " IN   PROGRESS "])("admits normalized %s only after dependencies finish", (status) => {
		const candidate = task("TASK-10", status, { dependencies: [" task-1 ", "TASK-2", "TASK-3"] });
		const tasks = [candidate, task("TASK-1", "Done"), task("TASK-2", "archived"), task("TASK-3", "CLOSED")];
		expect(isReadyTask(candidate, tasks, {})).toBe(true);
		tasks[1].status = "Blocked";
		expect(isReadyTask(candidate, tasks, {})).toBe(false);
	});

	it.each(["Blocked", "Draft", "Cancelled", "Done", "Closed", "Archived", "Review", ""])
	("never offers %s work even with no dependencies", (status) => {
		const candidate = task("TASK-1", status);
		expect(isReadyTask(candidate, [candidate], {})).toBe(false);
	});

	it("rejects claims case-insensitively and missing dependencies", () => {
		const candidate = task("TASK-1", "To Do");
		expect(isReadyTask(candidate, [candidate], { " task-1 ": "other-lane" })).toBe(false);
		candidate.dependencies = ["TASK-MISSING"];
		expect(isReadyTask(candidate, [candidate], {})).toBe(false);
	});

	it("orders ready work by priority then numeric ID", () => {
		const tasks = [
			task("TASK-2", "To Do"), task("TASK-10", "To Do", { priority: "high" }),
			task("TASK-1", "To Do", { priority: "low" }), task("TASK-2.10", "To Do", { priority: "high" }),
			task("TASK-2.2", "To Do", { priority: "high" }), task("TASK-1.1", "To Do", { priority: "medium" }),
		];
		expect(tasks.sort(compareReadyTasks).map((entry) => entry.id)).toEqual(["TASK-2.2", "TASK-2.10", "TASK-10", "TASK-1.1", "TASK-1", "TASK-2"]);
	});

	it("recognizes terminal statuses without treating blocked work as finished", () => {
		expect(["Done", " ARCHIVED ", "closed"].every(isTerminalStatus)).toBe(true);
		expect(["Blocked", "Cancelled", "In Progress", "To Do"].some(isTerminalStatus)).toBe(false);
	});
});
