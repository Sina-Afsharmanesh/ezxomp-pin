import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

/**
 * Task shape returned by `backlog task <id> --json` / `backlog task list --json`.
 * Field aliases (`parentTaskId`, `assignees`) are normalized to the canonical
 * snake_case names by the helpers in helpers.ts.
 */
export interface TaskInfo {
	id: string;
	title: string;
	status: string;
	dependencies: string[];
	priority: string;
	assignee: string[];
	labels: string[];
	parent_task_id?: string;
	description?: string;
	implementationNotes?: string;
	acceptanceCriteria?: Array<{ id: number; text: string; checked: boolean }>;
	finalSummary?: string;
}

/**
 * Narrow mutable context registerBacklogTools needs. Cook passes its full
 * StoreContext (structural superset); standalone consumers pass a minimal box.
 */
export interface BacklogToolsContext {
	currentCwd: string;
}

/** UI surface of the extension context, kept for helper signatures. */
export type ExtensionUi = ExtensionContext["ui"];
