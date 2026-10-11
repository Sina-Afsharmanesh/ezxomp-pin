/**
 * @ezxomp/backlog — Backlog.md integration plugin for OMP.
 *
 * Registers the full backlog_* tool suite (tools.ts), shared task helpers
 * (helpers.ts), and injects the canonical Backlog.md workflow instructions
 * as the DEFAULT system-prompt overlay before every agent start — this is
 * the default instruction source for general model work, independent of any
 * workflow plugin. Workflow plugins (e.g. cook) consume registerBacklogTools,
 * the helpers, and BACKLOG_QUALITY_STANDARDS via cross-package imports.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { defaultOverlay } from "./instructions.ts";
import { registerBacklogTools } from "./tools.ts";

export { runBacklogCli, getTaskJson, getAllTasks, computeReadySet, readyChildren } from "./helpers.ts";
export type { TaskInfo, BacklogToolsContext } from "./types.ts";
export {
	BACKLOG_OVERVIEW,
	BACKLOG_TASK_CREATION,
	BACKLOG_TASK_EXECUTION,
	BACKLOG_TASK_FINALIZATION,
	BACKLOG_QUALITY_STANDARDS,
	defaultOverlay,
} from "./instructions.ts";

export default function (pi: ExtensionAPI): void {
	// Default instruction source: injected unconditionally on every agent
	// start, appended after the host prompt so project/user rules keep
	// precedence while Backlog workflow guidance is always present.
	pi.on("before_agent_start", (event) => {
		return { systemPrompt: [...event.systemPrompt, defaultOverlay()] };
	});

	registerBacklogTools(pi, { currentCwd: process.cwd() });
}
