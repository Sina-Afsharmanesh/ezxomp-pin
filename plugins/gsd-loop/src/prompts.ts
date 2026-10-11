/**
 * src/prompts.ts — prompt templates (WU-10).
 *
 * autoOperatingInstruction: ≤20-line loop contract + honesty rules.
 * unitExecutionEnvelope: brief + verify command + required record call.
 * nextActionLine: NEXT:/PAUSED:/STOPPED: envelopes (cook style).
 */
import type { AdvanceResult } from "./kernel.js";
import type { GsdLoopState } from "./state.js";
import type { Unit } from "./units.js";

/** Auto-mode operating instruction: 3-step turn contract + guard honesty. */
export function autoOperatingInstruction(state: GsdLoopState): string {
	const done = state.queue.filter((u) => u.status === "complete" || u.status === "failed" || u.status === "crashed" || u.status === "skipped").length;
	return [
		"## gsd-loop auto mode active",
		"",
		`Run ${state.run.id} is RUNNING in auto mode (${done}/${state.queue.length} units settled). Each turn, follow this exact contract:`,
		"1. Call `gsd_loop_advance` — it runs the guard pipeline and returns the next unit to execute, or a terminal stop.",
		"2. Execute the returned unit brief (dispatch via the native `task` tool if the unit says `dispatch: \"subagent\"`).",
		"3. Call `gsd_loop_record_result` with the unitId and honest outcome, then repeat from step 1.",
		"Repeat until `gsd_loop_advance` returns a terminal stop.",
		"",
		"Honesty rules (load-bearing): report `errorClass` honestly — `rate-limit` for 429-style failures, `infrastructure` for provider outages, `model-policy` for refusals.",
		"Never call `record_result status:completed` for work you did not do; if the unit declares a verify command, verify first, then reconcile — only mark complete on pass.",
	].join("\n");
}

/** Unit execution envelope: brief verbatim + verify command + required record call. */
export function unitExecutionEnvelope(unit: Unit, state: GsdLoopState, brief?: string): string {
	const lines: string[] = [];
	lines.push(`UNIT: ${unit.id} — ${unit.title}`);
	lines.push(`Dispatch: ${unit.dispatch}${unit.subagentAgent ? ` (agent: ${unit.subagentAgent})` : ""}${unit.dispatch === "subagent" ? " — dispatch via the native task tool with the brief verbatim" : ""}`);
	lines.push("");
	lines.push("Brief (verbatim):");
	lines.push(brief ?? unit.brief ?? "(no brief)");
	if (unit.verifyCommand) {
		lines.push("");
		lines.push(`Verify command: \`${unit.verifyCommand}\` — verify first, then reconcile; only mark complete on pass (retries: ${unit.maxRetries ?? "settings default"}).`);
	}
	lines.push("");
	lines.push(`When done (or failed), call \`gsd_loop_record_result\` with unitId: "${unit.id}", status, summary, and errorClass if failed. Run ${state.run.id}.`);
	return lines.join("\n");
}

/** NEXT:/PAUSED:/STOPPED: envelope lines (cook style). */
export function nextActionLine(result: AdvanceResult): string {
	if (result.kind === "run") {
		return `NEXT: ${result.unit.id} — ${result.unit.title}`;
	}
	if (result.kind === "pause") {
		return `PAUSED: ${result.reason} — /gsd-loop resume to continue`;
	}
	const hint = result.recoveryHint ? `\nRecovery: ${result.recoveryHint}` : "";
	return `STOPPED: ${result.reason}${hint}`;
}
