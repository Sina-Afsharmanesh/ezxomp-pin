/**
 * omp-backlog-cook — Backlog.md cookbook workflow plugin for OMP.
 *
 * Port of ~/.commandcode/mods/backlog-cook.ts (ModApi/@commandcode/harness) to
 * the OMP ExtensionAPI surface. Drives the cook multi-agent workflow through
 * OMP's NATIVE task tool: cook agents ship as .omp/agents/*.md and are
 * dispatched via `task` with `agent: "cook-<role>"`.
 *
 * This file is the wiring entry point only. All logic lives in submodules:
 * - types.ts         — interfaces + StoreContext
 * - constants.ts     — MOD_ID, ROLES, CHAIN_PATTERNS, COOK_PROTOCOL, etc.
 * - state.ts          — CookState persistence, StoreContext, syncFromBacklog
 * - config.ts         — ModelConfig, model wizard
 * - watch.ts          — file watcher, watch list polling
 * - prompts.ts        — system prompts, cook protocol, chain proposal
 * - agents.ts         — installCookAgents
 * - cook-tools.ts     — registerCookTools (all cook_* tools + /cook command)
 *
 * Backlog tools (backlog_*), the Backlog.md CLI helpers, and the artifact
 * quality-standards instructions live in @ezxomp/backlog.
 */

import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { HEARTBEAT_INTERVALS } from "./constants.ts";
import { defaultCookState, loadCookState, saveCookState, syncFromBacklog, createStoreContext, chainNameAndDefinition } from "./state.ts";
import { loadModelConfig } from "./config.ts";
import { syncWatcher, stopWatcher, pollWatchedTasks, __resetWatchState, __resetAllState, getLastWatchSummary } from "./watch.ts";
import { withCookLock } from "./coordination.ts";
import { cookmodePrompt, getSystemPromptForStage } from "./prompts.ts";
import {
	getTaskJson,
	getAllTasks,
	runBacklogCli,
} from "@ezxomp/backlog/extensions/index.ts";

import { registerCookTools } from "./cook-tools.ts";
import { registerCookAutocompleteProvider } from "./autocomplete.ts";

// Re-export public API for test compatibility
export { defaultCookState, loadCookState, saveCookState, syncFromBacklog } from "./state.ts";
export { __resetWatchState, __resetAllState } from "./watch.ts";

import { join } from "node:path";
import { ompHome, syncCookAgents } from "./agents.ts";

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	// Notifications are the supported feedback path in headless/RPC modes;
	// tolerate hosts that omit optional UI methods.
	if (typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

export default function (pi: ExtensionAPI): void {
	stopWatcher();
	pi.registerFlag("maxReviewCycles", {
		type: "string",
		default: "3",
		description: "Max review→rework cycles",
	});

	const sc = createStoreContext(pi);
	const cookTools = registerCookTools(pi, sc);

	// ── Hooks (events) ───────────────────────────────────────────────────────
	pi.on("turn_start", async (_event, ctx) => {
		return withCookLock(ctx.cwd, async () => {
		sc.currentCwd = ctx.cwd;
		sc.hasUI = ctx.hasUI;
		sc.lastUi = ctx.hasUI ? ctx.ui : null;
		registerCookAutocompleteProvider(ctx);
		const key = sc.normalizeCwd(sc.currentCwd);
		const reloaded = loadCookState(sc.currentCwd);
		let state = reloaded;
		sc.stores.set(key, state);

		if (state.chain?.length && state.currentTaskId) {
			try {
				const synced = await syncFromBacklog(pi, sc.currentCwd, state);
				if (synced !== state) {
					state = synced;
					sc.setStoreFor(sc.currentCwd, state);
				}
			} catch (err) {
				notify(
					ctx,
					`Cook: backlog sync failed — ${err instanceof Error ? err.message : String(err)}`,
					"warning",
				);
			}
		}

		if (Object.keys(state.watchList ?? {}).length) {
			try {
				state = await pollWatchedTasks(pi, sc.currentCwd, state);
				sc.setStoreFor(sc.currentCwd, state);
			} catch (err) {
				notify(
					ctx,
					`Cook: watched-task poll failed — ${err instanceof Error ? err.message : String(err)}`,
					"warning",
				);
			}
		}
		state = loadCookState(ctx.cwd);
		sc.stores.set(key, state);
		sc.refreshWidget();
		if (state.chain.length) await cookTools.refreshDagr(ctx);
		}).catch((error) => notify(ctx, `Cook reconciliation failed (fail-closed): ${error instanceof Error ? error.message : String(error)}`, "error"));
	});

	pi.on("before_agent_start", (event) => {
		const s = sc.getStoreFor(sc.currentCwd);
		const extras: string[] = [];

		if (s.cookmode) extras.push(cookmodePrompt());

		if (s.chain.length) {
			const phase = s.chain[s.currentStage];
			if (phase) {
				const chainDef = chainNameAndDefinition(s.chain)?.phases;
				const phaseDef = chainDef?.find((p) => p.name === phase);
				const role = phaseDef?.owner ?? "worker";
				const prompt = getSystemPromptForStage(phase, role);
				const task = s.currentTaskId ? `\nTask: ${s.currentTaskId}` : "";
				// Artifact quality standards are NOT re-appended here: they ship
				// once via @ezxomp/backlog's default instruction overlay.
				extras.push(prompt + task);
			}
		}

		const lastWatchSummary = getLastWatchSummary(sc.currentCwd);
		if (lastWatchSummary) {
			extras.push(lastWatchSummary);
		}
		if (!extras.length) return undefined;
		return { systemPrompt: [...event.systemPrompt, ...extras] };
	});

	pi.on("tool_call", async (event) => {
		const s = sc.getStoreFor(sc.currentCwd);
		if (!s.chain.length) return undefined;

		if (
			event.toolName === "backlog_task_edit" &&
			event.input.status === "Done"
		) {
			const taskId = String(event.input.task_id);
			const task = await getTaskJson(pi, taskId, sc.currentCwd);
			if (task) {
				const all = await getAllTasks(pi, sc.currentCwd);
				const openChildren = all.filter(
					(t) =>
						t.parent_task_id &&
						t.parent_task_id.toLowerCase() === taskId.toLowerCase() &&
						t.status !== "Done" &&
						t.status !== "Archived",
				);
				if (openChildren.length > 0) {
					return {
						block: true,
						reason: `Cannot mark parent Done: ${openChildren.length} sub-ticket(s) still open (${openChildren.map((c) => c.id).join(", ")}). Finish them first via cook_next.`,
					};
				}
				const unchecked = (task.acceptanceCriteria ?? []).filter(
					(ac) => !ac.checked,
				);
				if (unchecked.length > 0)
					return {
						block: true,
						reason: `Cannot Done: ${unchecked.length} AC unchecked.`,
					};
				const inp = event.input as { final_summary?: unknown; append_final_summary?: unknown };
				const summaryVal = inp.final_summary ?? inp.append_final_summary;
				const summaryStr = typeof summaryVal === "string" ? summaryVal : "";
				const hasSummary = task.finalSummary?.trim() || summaryStr.trim();
				if (!hasSummary)
					return {
						block: true,
						reason: "Cannot Done: final summary required (--final-summary).",
					};
			}
		}
		if (
			event.toolName === "backlog_task_edit" &&
			event.input.status === "Done"
		) {
			// Cast through `any` because the upstream tool-input union does not
			// discriminate `backlog_task_edit` from `BashToolInput`; the
			// toolName discriminator above proves we're in the right shape.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const editInput: any = event.input;
			const taskId = String(editInput.task_id).toUpperCase();
			if (s.heartbeats[taskId]) {
				const heartbeats = { ...s.heartbeats };
				delete heartbeats[taskId];
				sc.setStore({ ...s, heartbeats });
			}
		}
		const phase = s.chain[s.currentStage];
		if (event.toolName === "cook_dispatch_worker" && phase !== "implement") {
			return { block: true, reason: `Worker blocked in "${phase}".` };
		}
		if (event.toolName === "cook_dispatch_judge" && phase !== "review") {
			return { block: true, reason: `Judge blocked in "${phase}".` };
		}

		if (event.toolName.startsWith("cook_dispatch_")) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const dispatchInput: any = event.input;
			const taskId = String(dispatchInput.task_id ?? s.currentTaskId ?? "");
			if (taskId) {
				const key = taskId.toUpperCase();
				const now = new Date().toISOString();
				const heartbeats = { ...s.heartbeats };
				heartbeats[key] = {
					taskId: key,
					startedAt: now,
					lastPingedAt: null,
					intervals: HEARTBEAT_INTERVALS,
					nextIntervalIdx: 0,
				};
				const watchList = { ...s.watchList };
				if (!watchList[key]) {
					watchList[key] = { taskId: key, since: now, lastStatus: "unknown", lastChecked: null };
				}
				sc.setStore({ ...s, heartbeats, watchList });
			}
		}
		return undefined;
	});

	pi.on("tool_result", async (event) => {
		const s = sc.getStoreFor(sc.currentCwd);
		if (!s.currentTaskId) return undefined;

		if (event.toolName === "cook_dispatch_worker") {
			const task = await getTaskJson(pi, s.currentTaskId, sc.currentCwd);
			if (task && !task.implementationNotes?.trim()) {
				const note =
					"WARNING: No implementation notes. Append via backlog_task_edit --append-notes.";
				return {
					content: [...event.content, { type: "text", text: note }],
				};
			}
		}

		if (event.toolName === "cook_dispatch_judge") {
			const resultText = event.content
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("");
			const findings = resultText
				.split("\n")
				.filter((l) => /^\[(blocking|follow-up)\]/i.test(l.trim()));
			for (const f of findings) {
				try {
					await runBacklogCli(
						pi,
						["task", "edit", s.currentTaskId, "--comment", f.trim()],
						sc.currentCwd,
					);
				} catch {
					// Tool-result hooks must not reject the OMP event loop.
				}
			}
		}

		if (event.toolName.startsWith("cook_dispatch_")) {
			const summary = event.content
				.map((c) => (c.type === "text" ? c.text : ""))
				.join("")
				.slice(0, 2000);
			if (summary.trim()) {
				try {
					await runBacklogCli(
						pi,
						[
							"task",
							"edit",
							s.currentTaskId,
							"--append-notes",
							`## ${s.chain[s.currentStage]} completed\n${summary}\n`,
						],
						sc.currentCwd,
					);
				} catch {
					// Tool-result hooks must not reject the OMP event loop.
				}
			}
		}

		const heartbeats = { ...s.heartbeats };
		let heartbeatsChanged = false;
		const now = Date.now();
		const heartbeatNotes: string[] = [];
		for (const hb of Object.values(heartbeats)) {
			if (hb.nextIntervalIdx >= hb.intervals.length) continue;
			const elapsedMin = Math.floor((now - new Date(hb.startedAt).getTime()) / 60000);
			const nextInterval = hb.intervals[hb.nextIntervalIdx];
			if (elapsedMin >= nextInterval) {
				heartbeatNotes.push(
					`HEARTBEAT: ${hb.taskId} running ${elapsedMin}m. Send: hub.send('Main', 'Progress: <1 line>').`,
				);
				heartbeats[hb.taskId] = {
					...hb,
					lastPingedAt: new Date(now).toISOString(),
					nextIntervalIdx: hb.nextIntervalIdx + 1,
				};
				heartbeatsChanged = true;
			}
		}
		if (heartbeatsChanged) {
			sc.setStore({ ...s, heartbeats });
		}
		if (heartbeatNotes.length) {
			return {
				content: [
					...event.content,
					...heartbeatNotes.map((t) => ({ type: "text" as const, text: t })),
				],
			};
		}
		return undefined;
	});

	pi.on("session_stop", () => {
		stopWatcher(sc.currentCwd);
		// Session stop may be followed by a new cwd/session. Release Cook's
		// terminal signals before the host reuses either surface.
		sc.resetActivity();
		const s = sc.getStoreFor(sc.currentCwd);
		if (!s.chain.length) return undefined;
		if (s.currentStage < s.chain.length - 1) {
			return { continue: true, reason: `Next: ${s.chain[s.currentStage + 1]}` };
		}
		return undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		sc.currentCwd = ctx.cwd;
		sc.hasUI = ctx.hasUI;
		sc.lastUi = ctx.hasUI ? ctx.ui : null;
		registerCookAutocompleteProvider(ctx);
		const config = loadModelConfig(sc.currentCwd);
		try {
			sc.stores.set(sc.normalizeCwd(sc.currentCwd), loadCookState(sc.currentCwd));
		} catch (error) {
			notify(ctx, `Cook startup blocked by state corruption: ${error instanceof Error ? error.message : String(error)}`, "error");
			return;
		}
		// Auto-sync shipped agent profiles: fresh OMP installs get all ten
		// cook-* profiles without running /cook install; plugin updates
		// re-sync stale frontmatter (version+hash marker check, cheap when
		// current). Project scope first (session-local), then personal so
		// other projects also gain the profiles. Failures are non-fatal —
		// dispatch tools self-verify and report the blocker.
		const syncScope = async (scope: "project" | "personal"): Promise<void> => {
			const result = await syncCookAgents(sc.currentCwd, scope);
			if (result === "installed") {
				notify(ctx,
					scope === "project"
						? "Cook: installed 10 agent profiles to .omp/agents/."
						: `Cook: refreshed agent profiles in ${join(ompHome(), "agents")}.`,
					"info",
				);
			}
		};
		// Per-scope isolation: a project-scope failure (permissions, disk)
		// must not abort the personal-scope sync. Awaited so the first
		// task-spawn after session_start reads post-sync profiles (TASK-39 F3).
		const failures: string[] = [];
		for (const scope of ["project", "personal"] as const) {
			try {
				await syncScope(scope);
			} catch (err) {
				failures.push(`${scope}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		if (failures.length > 0) {
			notify(ctx, `Cook: agent profile sync failed — ${failures.join("; ")}. Run cook_install.`, "warning");
		}
		if (!Object.values(config).some((v) => v !== null)) {
			notify(ctx, "No cook config. Run /cook config.", "info");
		}
		if (sc.getStore().cookmode) {
			notify(ctx, "Cookmode is ON. /cook off to exit.", "info");
		}
		syncWatcher(pi, sc, ctx.cwd);
		sc.refreshWidget();
	});

	pi.on("session_shutdown", () => {
		stopWatcher(sc.currentCwd);
		sc.resetActivity();
	});

	// ── Tools ───────────────────────────────────────────────────────────────

	// backlog_* tools are registered by @ezxomp/backlog's own extension entry
	// when it is installed; re-registering them here would shadow the shared
	// suite in a co-install. Cook only consumes helpers/standards/types.
}
