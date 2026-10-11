import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { TaskInfo } from "./types.ts";

export async function runBacklogCli(
	pi: ExtensionAPI,
	args: string[],
	cwd: string,
) {
	return pi.exec("backlog", args, { cwd });
}

export async function getTaskJson(
	pi: ExtensionAPI,
	taskId: string,
	cwd: string,
): Promise<TaskInfo | null> {
	try {
		const result = await runBacklogCli(pi, ["task", taskId, "--json"], cwd);
		if (result.code !== 0) return null;
		const raw = JSON.parse(result.stdout).task ?? JSON.parse(result.stdout);
		const r = raw as Record<string, unknown>;
		return {
			...r,
			parent_task_id: (r.parent_task_id ?? r.parentTaskId) as string | undefined,
			dependencies: (r.dependencies ?? []) as string[],
			assignee: (r.assignee ?? r.assignees ?? []) as string[],
		} as TaskInfo;
	} catch {
		return null;
	}
}

export async function getAllTasks(
	pi: ExtensionAPI,
	cwd: string,
): Promise<TaskInfo[]> {
	try {
		const result = await runBacklogCli(
			pi,
			["task", "list", "--json", "--limit", "999"],
			cwd,
		);
		if (result.code !== 0) return [];
		const raw = JSON.parse(result.stdout).tasks ?? [];
		return raw.map((t: Record<string, unknown>) => ({
			...t,
			parent_task_id: (t.parent_task_id ?? t.parentTaskId) as string | undefined,
			dependencies: (t.dependencies ?? []) as string[],
			assignee: (t.assignee ?? t.assignees ?? []) as string[],
		}));
	} catch {
		return [];
	}
}

export function computeReadySet(tasks: TaskInfo[]): string[] {
	const doneIds = new Set(
		tasks.filter((t) => t.status === "Done").map((t) => t.id.toLowerCase()),
	);
	return tasks
		.filter(
			(t) =>
				t.status !== "Done" &&
				t.status !== "Archived" &&
				t.dependencies.every((dep) => doneIds.has(dep.toLowerCase())),
		)
		.map((t) => t.id);
}

export async function readyChildren(
	pi: ExtensionAPI,
	parentId: string,
	cwd: string,
): Promise<TaskInfo[]> {
	const all = await getAllTasks(pi, cwd);
	const done = new Set(
		all.filter((t) => t.status === "Done").map((t) => t.id.toLowerCase()),
	);
	const parent = parentId.toLowerCase();
	return all
		.filter(
			(t) =>
				t.parent_task_id &&
				t.parent_task_id.toLowerCase() === parent &&
				t.status !== "Done" &&
				t.status !== "Archived" &&
				t.dependencies
					.filter((d) => d.toLowerCase() !== parent)
					.every((d) => done.has(d.toLowerCase())),
		)
		.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
