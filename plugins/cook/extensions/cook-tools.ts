// OMP's marketplace install does not run npm/bun install — peer/runtime
// packages like @oh-my-pi/omptype are not on the plugin's module resolution
// path. OMP ships the original typebox package in the host's plugin
// node_modules, so import the JSON-Schema builder from there instead.
import { Type } from "typebox";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { TSchema } from "@oh-my-pi/pi-ai";
import { CHAIN_PATTERNS, ROLES } from "./constants.ts";
import type { Role } from "./constants.ts";
import type { AdhdIdea, StoreContext, TaskInfo, TypedFinding } from "./types.ts";
import { getTaskJson, getAllTasks, computeReadySet, readyChildren, runBacklogCli } from "@ezxomp/backlog/extensions/index.ts";
import { describeModel, formatModelForContext, listModels, loadModelConfig, resolveCookConfig, saveModelConfig, runModelConfigWizard, validateModelSelection } from "./config.ts";
import { proposeChain, formatChainProposal, cookKickoffMessage } from "./prompts.ts";
import { installCookAgents, ompHome } from "./agents.ts";
import { defaultCookState, chainNameAndDefinition, widgetCountsFor } from "./state.ts";
import { appendIntent, appendRecord, appendGate, appendExternal, readJournal } from "./journal.ts";
import { projectDagr, buildDagrProjectionInput } from "./dagr.ts";
import { CookDagOverlay, cookToolRenderers, type CookDagOverlayResult } from "./renderers.ts";

const dagrQueues = new Map<string, Promise<void>>();

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	// Notifications remain useful in headless/RPC contexts, but partial hosts
	// may omit the optional UI method entirely.
	if (typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

async function runBacklogCliSafe(
	pi: ExtensionAPI,
	args: string[],
	cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		return await runBacklogCli(pi, args, cwd);
	} catch (error) {
		return {
			code: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function loadTasksStrict(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ tasks: TaskInfo[] } | { error: string }> {
	const result = await runBacklogCliSafe(pi, ["task", "list", "--json", "--limit", "999"], cwd);
	if (result.code !== 0) return { error: result.stderr || result.stdout || "backlog task list failed" };
	try {
		const raw = JSON.parse(result.stdout).tasks;
		if (!Array.isArray(raw)) return { error: "backlog task list returned no tasks array" };
		return {
			tasks: raw.map((task: Record<string, unknown>) => ({
				...task,
				parent_task_id: (task.parent_task_id ?? task.parentTaskId) as string | undefined,
				dependencies: (task.dependencies ?? []) as string[],
				assignee: (task.assignee ?? task.assignees ?? []) as string[],
			})) as TaskInfo[],
		};
	} catch (error) {
		return { error: `invalid backlog task list JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
}

// fallow-ignore-next-line complexity
export function registerCookTools(pi: ExtensionAPI, sc: StoreContext): { refreshDagr: (ctx: ExtensionContext) => Promise<void> } {
	/**
	 * Build the dispatch payload a cook_dispatch_* tool hands back to the
	 * orchestrator. Durable contract, not prose to re-interpret: the exact
	 * tool-call shape is stated once, the brief is a verbatim prompt, and the
	 * result-recording duty is explicit. When the host's task tool is missing
	 * (evo snapshot gaps, stripped sessions) the caller gets a remediation
	 * error instead of an unactionable instruction.
	 */
	const dispatchPayload = async (
		ctx: ExtensionContext,
		role: string,
		taskId: string,
		extra: string,
		stageOverride?: string,
	): Promise<{ ok: true; text: string; stage?: string } | { ok: false; text: string }> => {
		bindContext(ctx);
		taskId = taskId.trim().toUpperCase();
		// Probe the ACTIVE surface first (getActiveTools) — a tool can be
		// registered but excluded from the active set via --tools / a tools:
		// profile, and a registered-but-inactive `task` cannot execute. Fall
		// back to the registered surface (getAllTools) only on legacy hosts
		// that lack the active API.
		let toolNames: string[] = [];
		let surfaceKind: "active" | "registered" = "registered";
		// A defined result (even empty []) is a readable surface; only an
		// absent/undefined/throwing API leaves surfaceKnown false and takes
		// the payload fallback.
		let surfaceKnown = false;
		try {
			const surface = pi as unknown as {
				getActiveTools?: () => Promise<string[]>;
				getAllTools?: () => Promise<{ name: string }[]>;
			};
			const active = surface.getActiveTools ? await surface.getActiveTools() : undefined;
			if (Array.isArray(active)) {
				toolNames = active;
				surfaceKind = "active";
				surfaceKnown = true;
			} else {
				const all = surface.getAllTools ? await surface.getAllTools() : undefined;
				if (Array.isArray(all)) {
					toolNames = all.map((t) => t.name);
					surfaceKnown = true;
				}
			}
		} catch {
			toolNames = [];
		}
		const hasTask = toolNames.includes("task");
		if (surfaceKnown && !hasTask) {
			return {
				ok: false,
				text:
					`BLOCKED — OMP's native \`task\` tool is NOT in this session's ${surfaceKind} tool surface ` +
					`(checked ${toolNames.length} tools). Dispatching is impossible; ` +
					`do NOT improvise with the omp CLI or \`omp agents unpack\` — those install ` +
					`agent profiles but cannot spawn anything.\n` +
					`Remediation:\n` +
					`  1. If evo mode is ON: run /evo off then /evo on — evo's protected floor ` +
					`(task, hub, eval, read) re-unions into the active set.\n` +
					`  2. Otherwise the session was launched with tools stripped; restart the ` +
					`session without --no-tools or a restricting tools: profile.\n` +
					`  3. Last resort: report the blocker to the operator and stop — do not ` +
					`simulate the ${role} inline (builder/judge must be fresh contexts).`,
			};
		}
		let record = taskId
			? `Record all results on task ${taskId} via backlog_task_edit.`
			: `Record findings on the parent task via backlog_task_edit once assigned.`;
		let dispatchStage: string | undefined;
		if (taskId) {
			const roleName = role.replace(/^cook-/, "");
			const cs = sc.getStoreFor(ctx.cwd);
			const journal = readJournal(ctx.cwd, taskId);
			const sequence = (journal[journal.length - 1]?.seq ?? -1) + 1;
			const stage = `${stageOverride ?? `dispatch:${roleName}`}:${sequence}`;
			dispatchStage = stage;
			let timestamp: string;
			try { timestamp = appendIntent(ctx.cwd, taskId, stage, "dispatch payload").at; }
			catch (error) { return { ok: false, text: `journal intent failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }; }
			sc.setStore({ ...cs, agentLog: [...cs.agentLog, { taskId, stage, role: roleName, model: loadModelConfig(ctx.cwd)[roleName as Role] ?? "(current)", timestamp }] });
			record = `Record the specialist outcome with cook_record_result and dispatch_stage="${stage}".`;
			await pushDagr(ctx);
		}
		return {
			ok: true,
			...(dispatchStage ? { stage: dispatchStage } : {}),
			text:
				`DISPATCH (execute now — this is the exact call):\n` +
				`  task({ agent: "${role}", task: <brief below> })\n\n` +
				`Rules: no model parameter (the agent's frontmatter selects it); wait for ` +
				`the result; do not do the ${role}'s work yourself. If the work mutates ` +
				`the repo, give the agent its own git worktree on branch task/<slug> ` +
				`from main, per the project's docs/parallel-agents.md (single source of ` +
				`truth: worktree per task, branch + immutable HEAD OID as deliverable, ` +
				`workers never push or move main).\n\n` +
				`Brief (verbatim):\n${extra}\n\n` +
				record,
		};
	};
	const bindContext = (ctx: ExtensionContext): void => {
		sc.currentCwd = ctx.cwd;
		sc.hasUI = ctx.hasUI;
		sc.lastUi = ctx.hasUI ? ctx.ui : null;
	};

	/**
	 * herdr-dagr projection (plan Part 2.5): best-effort pane update after any
	 * store-mutating commit. Failures disable silently: the pane is a view,
	 * never a gate.
	 */
	const cwdTag = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]+/g, "-").slice(-40);
	async function publishDagr(ctx: ExtensionContext): Promise<void> {
		try {
			const cs = sc.getStoreFor(ctx.cwd);
			const loaded = await loadTasksStrict(pi, ctx.cwd);
			if ("error" in loaded) return;
			const all = loaded.tasks;
			const herdrPane = process.env.HERDR_PANE_ID?.trim();
			const input = buildDagrProjectionInput({
				runId: "cook-" + cwdTag(ctx.cwd),
				runTitle: cs.currentTaskId ? "cook: " + cs.currentTaskId : "cook session",
				startedAt: cs.agentLog[0]?.timestamp ?? new Date().toISOString(),
				orchestrator: herdrPane ? { pane: herdrPane } : { agent: "cook-" + cwdTag(ctx.cwd) },
				...(herdrPane ? { attemptPane: herdrPane } : {}),
				tasks: all.map((tk) => ({
					id: tk.id.toUpperCase(),
					title: tk.title,
					status: tk.status,
					parent: tk.parent_task_id?.toUpperCase() ?? null,
					kind: (tk as unknown as { type?: string; kind?: string }).kind ??
						(tk as unknown as { type?: string }).type,
					labels: (tk as unknown as { labels?: string[] }).labels ?? [],
					dependencies: ((tk as unknown as { dependencies?: string[] }).dependencies ?? []).map((dependency) => dependency.toUpperCase()),
					assignee: Array.isArray(tk.assignee) ? tk.assignee.join(",") : (tk.assignee ?? null),
				})),
				claims: cs.claims,
				agentLog: cs.agentLog,
				journalByTask: Object.fromEntries(all.map((task) => [task.id.toUpperCase(), readJournal(ctx.cwd, task.id)])),
			});
			await projectDagr(ctx.cwd, input);
		} catch {
			// pane is best-effort
		}
	};
	async function pushDagr(ctx: ExtensionContext): Promise<void> {
		const key = resolve(ctx.cwd);
		const prior = dagrQueues.get(key) ?? Promise.resolve();
		const next = prior.catch(() => undefined).then(() => publishDagr(ctx));
		dagrQueues.set(key, next);
		try {
			await next;
		} finally {
			if (dagrQueues.get(key) === next) dagrQueues.delete(key);
		}
	}


	// ── jeff 6.0 sync: judgment machinery helpers ────────────────────────────

	/**
	 * AC integrity (post-6.0 hardening): a pass verdict with unchecked AC is
	 * rejected. Returns an error string when the verdict must be refused.
	 */
// fallow-ignore-next-line complexity
	const checkAcIntegrity = async (
		taskId: string,
		cwd: string,
		verdict: string,
	): Promise<string | null> => {
		if (verdict.trim().toLowerCase() !== "pass") return null;
		try {
			const task = await getTaskJson(pi, taskId, cwd);
			const ac: { checked?: boolean }[] = (task as unknown as { acceptanceCriteria?: { checked?: boolean }[] }).acceptanceCriteria ?? [];
			if (ac.length && ac.some((a) => !a.checked)) {
				return (
					"REJECTED: pass verdict but " +
					ac.filter((a) => !a.checked).length + "/" + ac.length +
					" acceptance criteria are unchecked. Verify each AC with objective evidence (backlog_task_edit --check-ac only after verification), then re-record."
				);
			}
		} catch (error) {
			return `REJECTED: acceptance-criteria state is unreadable; cannot prove pass integrity (${error instanceof Error ? error.message : String(error)}).`;
		}
		return null;
	};

	/**
	 * Red gate (post-6.0 hardening): judge is never dispatched on a red gate.
	 * Returns an error string when the gate is red.
	 */
	const checkGateGreen = (taskId: string): string | null => {
		const cs = sc.getStore();
		const gates = cs.gateResults?.[taskId] ?? [];
		const last = gates[gates.length - 1];
		const journalGate = [...readJournal(sc.currentCwd, taskId)]
			.reverse()
			.find((entry) => entry.event === "gate" && entry.stage === "verify");
		const isRed = last?.passed === false || journalGate?.note === "red";
		if (isRed) {
			return (
				"BLOCKED: the full-suite gate is RED for " + taskId +
				". No judgment is dispatched on a red gate. Route the validator failure as a typed kickback to the worker ({source:'validator', kickTo:'implement'}), repair, and re-run the gate first."
			);
		}
		return null;
	};

	/** Shared journal-append wrapper: fail-closed errors surfaced as tool errors. */
	const journalAppend = (
		cwd: string,
		taskId: string,
		kind: "claim" | "release" | "refute" | "intent" | "external",
		detail: string,
	): string | null => {
		try {
			if (kind === "refute") appendIntent(cwd, taskId, "refute", detail);
			else if (kind === "claim") appendIntent(cwd, taskId, "claim", detail);
			else if (kind === "release") appendRecord(cwd, taskId, "release", detail);
			else if (kind === "intent") appendIntent(cwd, taskId, detail);
			else appendExternal(cwd, taskId, detail);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	};


	/**
	 * Evidence-scaled escalation (slate item 5): at cap, one bonus cycle iff
	 * bonusGranted unset AND every surviving blocker confined AND strictly
	 * shrinking. Otherwise convene the council (3 blind + 1 synthesis).
	 */
// fallow-ignore-next-line complexity
	const resolveCapEscalation = async (
		taskId: string,
		findings: { source: string; file: string; line: number; what: string; kickTo?: string }[],
		cwd: string,
	): Promise<"bonus" | "council"> => {
		const cs = sc.getStoreFor(cwd);
		const stage = cs.convergence?.[taskId]?.["judge"] ?? { cycles: 0 };
		const allConfined = findings.length > 0 && findings.every((f) => f.kickTo === "implement");
		const prevCount = cs.lastFindings?.[taskId]?.length ?? Number.MAX_SAFE_INTEGER;
		if (!stage.bonusGranted && allConfined && findings.length < prevCount) {
			sc.setStoreFor(cwd, {
				...cs,
				convergence: {
					...cs.convergence,
					[taskId]: { ...(cs.convergence?.[taskId] ?? {}), judge: { cycles: stage.cycles, bonusGranted: true } },
				},
			});
			return "bonus";
		}
		return "council";
	};

	/**
	 * Scoped repair (slate item 4): judge kickback with typed findings, all
	 * kickTo=implement, fix files nonempty subset of the finding files, no
	 * council pending => reset only the judge (retain the validator pass).
	 * The gate always re-runs (validator re-dispatch is unconditional).
	 */
// fallow-ignore-next-line complexity
	const resolveRepairScope = (
		taskId: string,
		findings: { kickTo?: string; file?: string }[] | undefined,
		fixFiles: string[] | undefined,
		cwd: string,
	): "scoped" | "full" => {
		const cs = sc.getStoreFor(cwd);
		if (!findings?.length || !fixFiles?.length) return "full";
		if (!findings.every((f) => f.kickTo === "implement")) return "full";
		const findingFiles = new Set(findings.map((f) => f.file).filter(Boolean));
		const confined = fixFiles.every((f) => findingFiles.has(f));
		if (!confined) return "full";
		if (cs.councilEpisodes?.[taskId]?.status !== undefined && cs.councilEpisodes[taskId]?.status !== "completed")
			return "full";
		return "scoped";
	};



	pi.registerTool<TSchema>({
		name: "cook_config",
		label: "cook_config",
		description:
			"Show/change model assignments for cook roles (planner/scout/researcher/worker/validator/judge).",
		parameters: Type.Object({
			role: Type.Optional(
				Type.Union([
					Type.Literal("planner"),
					Type.Literal("scout"),
					Type.Literal("researcher"),
					Type.Literal("worker"),
					Type.Literal("validator"),
					Type.Literal("judge"),
					Type.Literal("all"),
				]),
			),
			model: Type.Optional(Type.String()),
			scope: Type.Optional(
				Type.Union([Type.Literal("project"), Type.Literal("personal"), Type.Literal("global")]),
			),
		}) as unknown as TSchema,
		async execute(_id, params: { role?: "planner" | "scout" | "researcher" | "worker" | "validator" | "judge" | "all"; model?: string; scope?: "project" | "personal" | "global" }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const role = params.role as string | undefined;
			const model = params.model as string | undefined;
			if (!role) {
				const resolved = resolveCookConfig(ctx.cwd, params.scope);
				const lines = ROLES.map((r) => {
					const source = resolved.sources[r];
					const scopeTag = source ? ` [scope: ${source.scope}]` : " [scope: default (inherits session model)]";
					return `  ${r}: ${formatModelForContext(ctx, resolved.config[r])}${scopeTag}`;
				});
				return {
					content: [
						{
							type: "text",
							text: `Config (write scope: ${resolved.writeScope} → ${resolved.writeDirectory}):\n${lines.join("\n")}\n\nRun /cook config to pick from available models.`,
						},
					],
				};
			}
			if (role === "all") {
				const interactive = ctx.hasUI && typeof ctx.ui?.select === "function";
				const resolvedBefore = resolveCookConfig(ctx.cwd);
				const c = await runModelConfigWizard(ctx, ctx.cwd, params.scope);
				const writeScope = params.scope ?? resolvedBefore.writeScope;
				const writeDirectory = params.scope ? resolveCookConfig(ctx.cwd, params.scope).writeDirectory : resolvedBefore.writeDirectory;
				return {
					content: [
						{
							type: "text",
							text: `${interactive ? "Saved" : "No changes (interactive UI unavailable)"} (write scope: ${writeScope} → ${writeDirectory}):\n${ROLES.map((r) => `  ${r}: ${formatModelForContext(ctx, c[r])}`).join("\n")}`,
						},
					],
				};
			}
			const c = loadModelConfig(ctx.cwd, params.scope);
			if (model) {
				const validation = validateModelSelection(ctx, model);
				if (!validation.valid) {
					return {
						content: [{ type: "text", text: `Invalid model for ${role}: ${validation.reason ?? "unknown value"}. Use provider/id or a unique model id.` }],
						isError: true,
					};
				}
				c[role as Role] = validation.value;
			} else {
				if (!ctx.hasUI || typeof ctx.ui?.select !== "function") {
					return {
						content: [{ type: "text", text: `No interactive UI available to choose a model for ${role}. Pass the model parameter explicitly.` }],
						isError: true,
					};
				}
				// Live picker for this single role: family-grouped labels, inherit option
				const models = listModels(ctx);
				if (!models.length)
					return {
						content: [{ type: "text", text: "Could not load model list." }],
						isError: true,
					};
				const resolved = resolveCookConfig(ctx.cwd, params.scope);
				const writeDirectory = params.scope ? resolved.writeDirectory : resolveCookConfig(ctx.cwd).writeDirectory;
				const pick = await ctx.ui.select(
					`Model for ${role}  (current: ${describeModel(c[role as Role])})  [scope: ${params.scope ?? "project"} → ${writeDirectory}]`,
					[
						"\u21ba Inherit session model",
						...(c[role as Role] ? [`\u2713 Keep current (${describeModel(c[role as Role])})`] : []),
						...models.map((m) => m.label),
					],
				);
				if (pick && !pick.startsWith("\u21ba") && !pick.startsWith("\u2713")) {
					const chosen = models.find((m) => m.label === pick);
					if (chosen) {
						const sameId = models.filter((m) => m.id === chosen.id).length;
						c[role as Role] = sameId > 1 ? chosen.selection : chosen.id;
					}
				} else if (pick?.startsWith("\u21ba")) {
					c[role as Role] = null;
				}
			}
			const saved = saveModelConfig(ctx.cwd, c, params.scope);
			return {
				content: [
					{
						type: "text",
						text: `Set ${role} to: ${formatModelForContext(ctx, c[role as Role])} (write scope: ${saved.scope} → ${saved.directory})`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_propose",
		label: "cook_propose",
		description: "Propose a workflow chain for a task.",
		parameters: Type.Object({
			task_id: Type.String({ description: "Backlog task ID" }),
			intent: Type.Optional(Type.String()),
			chain_name: Type.Optional(
				Type.Union([
					Type.Literal("scout"),
					Type.Literal("plan"),
					Type.Literal("implement"),
					Type.Literal("review"),
					Type.Literal("full"),
				]),
			),
		}) as unknown as TSchema,
		async execute(_id, params: { task_id: string; intent?: string; chain_name?: "scout" | "plan" | "implement" | "review" | "full" }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const task = await getTaskJson(pi, params.task_id, ctx.cwd);
			if (!task)
				return {
					content: [{ type: "text", text: "Task not found" }],
					isError: true,
				};
			const cn = params.chain_name;
			const proposed =
				cn && CHAIN_PATTERNS[cn]
					? { chain: CHAIN_PATTERNS[cn], reason: `User selected ${cn}.` }
					: proposeChain(task, params.intent ?? "");
			return {
				content: [
					{
						type: "text",
						text: formatChainProposal(proposed.chain, proposed.reason),
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_start",
		label: "cook_start",
		description: "Start an approved workflow chain for a task.",
		parameters: Type.Object({
			task_id: Type.String(),
			chain_name: Type.Union([
				Type.Literal("scout"),
				Type.Literal("plan"),
				Type.Literal("implement"),
				Type.Literal("review"),
				Type.Literal("full"),
			]),
		}) as unknown as TSchema,
		async execute(_id, params: { task_id: string; chain_name: "scout" | "plan" | "implement" | "review" | "full" }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cn = params.chain_name;
			if (!CHAIN_PATTERNS[cn])
				return {
					content: [{ type: "text", text: `Unknown chain: ${cn}` }],
					isError: true,
				};
			const chain = CHAIN_PATTERNS[cn];
			const task = await getTaskJson(pi, params.task_id, ctx.cwd);
			if (!task)
				return {
					content: [{ type: "text", text: `Cannot start cook: task ${params.task_id} does not exist or is unreadable.` }],
					isError: true,
				};
			if (cn === "full") {
				const milestone = await runBacklogCliSafe(
					pi,
					["milestone", "add", `Workflow: ${task.title}`],
					ctx.cwd,
				);
				if (milestone.code !== 0)
					return {
						content: [{ type: "text", text: `Cannot start cook: milestone creation failed: ${milestone.stderr || milestone.stdout}` }],
						isError: true,
					};
			}
			const statusEdit = await runBacklogCliSafe(
				pi,
				["task", "edit", task.id, "-s", "In Progress"],
				ctx.cwd,
			);
			if (statusEdit.code !== 0)
				return {
					content: [{ type: "text", text: `Cannot start cook: task activation failed: ${statusEdit.stderr || statusEdit.stdout}` }],
					isError: true,
				};
			sc.setStore({
				...defaultCookState(),
				chain: chain.map((p) => p.name),
				currentStage: 0,
				currentTaskId: task.id.toUpperCase(),
				taskIds: [task.id.toUpperCase()],
				maxReviewCycles: Number(pi.getFlag("maxReviewCycles") ?? 3),
			});
			await pushDagr(ctx);
			return {
				content: [
					{
						type: "text",
						text: `Started ${cn} for ${task.id}\nChain:\n${chain.map((p, i) => `  ${i + 1}. ${p.name} (${p.owner})`).join("\n")}\n\nFirst: ${chain[0].name}`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_status",
		label: "cook_status",
		description: "Show the current cook workflow state.",
		parameters: Type.Object({}) as unknown as TSchema,
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return {
					content: [{ type: "text", text: "No active workflow. /cook start" }],
				};
			const phase = cs.chain[cs.currentStage];
			const config = loadModelConfig(ctx.cwd);
			const def = chainNameAndDefinition(cs.chain)?.phases.find((p) => p.name === phase);
			const lines = [
				`Chain: ${cs.chain.join(" → ")}`,
				`Stage: ${cs.currentStage + 1}/${cs.chain.length} — ${phase}`,
				`Task: ${cs.currentTaskId ?? "none"}`,
				`Role: ${def?.owner ?? "?"}`,
				`Model: ${config[def?.owner as Role] ?? "(current)"}`,
			];
			if (cs.currentTaskId && cs.reviewCycles[cs.currentTaskId]) {
				lines.push(
					`Cycles: ${cs.reviewCycles[cs.currentTaskId]}/${cs.maxReviewCycles}`,
				);
			}
			return { content: [{ type: "text", text: lines.join("\n") }] };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_advance",
		label: "cook_advance",
		description: "Advance to the next phase of the active workflow chain.",
		parameters: Type.Object({}) as unknown as TSchema,
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return {
					content: [{ type: "text", text: "No workflow" }],
					isError: true,
				};
			if (cs.currentStage >= cs.chain.length - 1)
				return {
					content: [{ type: "text", text: "At final stage" }],
					isError: true,
				};
			if (cs.currentTaskId) {
				const stage = cs.chain[cs.currentStage];
				const journal = readJournal(ctx.cwd, cs.currentTaskId);
				const roleForStage: Record<string, string> = {
					plan: "planner",
					explore: "researcher",
					implement: "worker",
					verify: "validator",
					review: "judge",
					audit: "audit",
					refute: "refute",
				};
				const stageDispatches = cs.agentLog.filter(
					(entry) =>
						entry.taskId.toUpperCase() === cs.currentTaskId?.toUpperCase() &&
						entry.role === roleForStage[stage],
				);
				const pendingDispatch = stageDispatches.find((entry) => {
					const intent = [...journal]
						.reverse()
						.find((journalEntry) => journalEntry.event === "intent" && journalEntry.stage === entry.stage);
					return (
						!!intent &&
						!journal.some(
							(journalEntry) =>
								journalEntry.seq > intent.seq &&
								journalEntry.stage === entry.stage &&
								(journalEntry.event === "record" || journalEntry.event === "gate"),
						)
					);
				});
				if (pendingDispatch)
					return {
						content: [{ type: "text", text: `Cannot advance: dispatch "${pendingDispatch.stage}" has no durable completion record.` }],
						isError: true,
					};
				for (const dispatch of stageDispatches) {
					const intent = [...journal]
						.reverse()
						.find((entry) => entry.event === "intent" && entry.stage === dispatch.stage);
					const dispatchTerminal = [...journal]
						.reverse()
						.find(
							(entry) =>
								!!intent &&
								entry.seq > intent.seq &&
								entry.stage === dispatch.stage &&
								(entry.event === "record" || entry.event === "gate"),
						);
					if (dispatchTerminal?.event === "gate" && dispatchTerminal.note !== "green")
						return { content: [{ type: "text", text: `Cannot advance: dispatch "${dispatch.stage}" has a red gate.` }], isError: true };
					if (dispatchTerminal?.event === "record") {
						let dispatchOutcome: unknown;
						try {
							dispatchOutcome = JSON.parse(dispatchTerminal.note ?? "").outcome;
						} catch {
							dispatchOutcome = undefined;
						}
						if (dispatchOutcome !== "success")
							return {
								content: [{ type: "text", text: `Cannot advance: dispatch "${dispatch.stage}" result is ${String(dispatchOutcome ?? "malformed")}, not success.` }],
								isError: true,
							};
					}
				}
				const latestDispatch = [...cs.agentLog]
					.reverse()
					.find(
						(entry) =>
							entry.taskId.toUpperCase() === cs.currentTaskId?.toUpperCase() &&
							entry.role === roleForStage[stage],
					);
				const intentStages = new Set([stage, ...(latestDispatch ? [latestDispatch.stage] : [])]);
				const latestIntent = [...journal]
					.reverse()
					.find((entry) => entry.event === "intent" && !!entry.stage && intentStages.has(entry.stage));
				const terminal = [...journal].reverse().find((entry) =>
					(entry.event === "record" || entry.event === "gate") &&
					!!entry.stage &&
					intentStages.has(entry.stage) &&
					(!latestIntent || entry.seq > latestIntent.seq),
				);
				if (!terminal)
					return { content: [{ type: "text", text: `Cannot advance: stage "${stage}" has no durable completion record.` }], isError: true };
				if (terminal.event === "gate" && terminal.note !== "green")
					return { content: [{ type: "text", text: `Cannot advance: stage "${stage}" has a red gate.` }], isError: true };
				if (terminal.event === "record") {
					let outcome: unknown;
					try {
						outcome = JSON.parse(terminal.note ?? "").outcome;
					} catch {
						outcome = undefined;
					}
					if (outcome !== "success")
						return { content: [{ type: "text", text: `Cannot advance: stage "${stage}" result is ${String(outcome ?? "malformed")}, not success.` }], isError: true };
				}
			}
			sc.setStore({ ...cs, currentStage: cs.currentStage + 1 });
			await pushDagr(ctx);
			return {
				content: [
					{
						type: "text",
						text: `Advanced: ${cs.chain[cs.currentStage]} → ${cs.chain[cs.currentStage + 1]}`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_adhd_diverge",
		label: "cook_adhd_diverge",
		description: "Spawn isolated frames for divergent ideation.",
		parameters: Type.Object({
			problem: Type.String(),
			frames: Type.Optional(Type.Array(Type.String())),
			num_ideas: Type.Optional(Type.Number()),
		}) as unknown as TSchema,
		async execute(_id, params: { problem: string; frames?: string[]; num_ideas?: number }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const frames = params.frames ?? [
				"economic",
				"security",
				"performance",
				"ux",
				"maintainability",
			];
			const cs = sc.getStore();
			sc.setStore({ ...cs, adhdFrames: frames });
			return {
				content: [
					{
						type: "text",
						text: `[ADHD: DIVERGE]\nProblem: ${params.problem}\nFrames: ${frames.join(", ")}\n\nFor each frame, generate ideas in ISOLATION. No shared context. Return JSON per frame.`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_adhd_focus",
		label: "cook_adhd_focus",
		description: "Critic pass: score, cluster, prune, deepen.",
		parameters: Type.Object({
			ideas: Type.Array(
				Type.Object({
					frame: Type.String(),
					idea: Type.String(),
					novelty: Type.Number(),
					viability: Type.Number(),
					fit: Type.Number(),
					traps: Type.Array(Type.String()),
				}),
			),
			top_k: Type.Optional(Type.Number()),
		}) as unknown as TSchema,
		async execute(_id, params: { ideas: { frame: string; idea: string; novelty: number; viability: number; fit: number; traps: string[] }[]; top_k?: number }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const ideas = params.ideas as AdhdIdea[];
			const k = params.top_k ?? 3;
			const scored = ideas
				.map((i) => ({ ...i, total: i.novelty + i.viability + i.fit }))
				.sort((a, b) => b.total - a.total);
			const short = scored.slice(0, k);
			const cs = sc.getStore();
			sc.setStore({ ...cs, adhdIdeas: ideas, adhdShortlist: short });
			return {
				content: [
					{
						type: "text",
						text: `[ADHD: FOCUS]\nEvaluated: ${ideas.length}\nShortlist:\n${short.map((i, n) => `  ${n + 1}. ${i.idea} [${i.frame}] ${i.total}`).join("\n")}\n\nTraps: ${
							ideas
								.filter((i) => i.traps.length)
								.map((i) => i.idea)
								.join(", ") || "none"
						}`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_planner",
		label: "cook_dispatch_planner",
		description:
			"Dispatch the exploratory planner (cook-planner) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
			context: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		...cookToolRenderers("planner"),
		async execute(_id, params: { task_id: string; context?: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id as string;
			if (!taskId || taskId.trim() === '') {
				return {
					content: [{ type: 'text', text: 'task_id is required. Usage: cook_dispatch_planner({task_id: "TASK-X"})' }],
					isError: true,
				};
			}
			const brief = [
				`PLANNER → ${params.task_id}`,
				"1. Explore wide and deep (spawn a cook-scout subagent for unknowns)",
				"2. ADHD for approach selection on design decisions",
				`3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="${params.task_id}" and subtasks[] — each independently shippable, with depends_on edges for multi-step work`,
				"4. Author tests, prove RED",
				"5. Record parent plan via backlog_task_edit --plan; notes via --append-notes",
				"Return PlannerEnvelope.",
				params.context ? `\nContext: ${params.context}` : "",
			].join("\n");
			const payload = await dispatchPayload(ctx, "cook-planner", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_scout",
		label: "cook_dispatch_scout",
		description: "Dispatch a pure searcher. It returns facts with sources, no judgment.",
		parameters: Type.Object({
			query: Type.String(),
			scope: Type.Optional(Type.String()),
			task_id: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		...cookToolRenderers("scout"),
		async execute(_id, params: { query: string; scope?: string; task_id?: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id?.trim() || sc.getStore().currentTaskId;
			if (!taskId)
				return {
					content: [{ type: "text", text: "Cannot dispatch scout without an active cook task; start a workflow first." }],
					isError: true,
				};
			const brief =
				`SCOUT → ${params.query}\n1. Search codebase, docs, web\n2. Facts, not opinions\n3. Evidence only — no judgment` +
				(params.scope ? `\nScope: ${params.scope}` : "");
			const payload = await dispatchPayload(ctx, "cook-scout", taskId, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_researcher",
		label: "cook_dispatch_researcher",
		description:
			"Dispatch the researcher with ADHD (cook-researcher) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
			problem: Type.String(),
			frames: Type.Optional(Type.Array(Type.String())),
		}) as unknown as TSchema,
		...cookToolRenderers("researcher"),
		async execute(_id, params: { task_id: string; problem: string; frames?: string[] }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id as string;
			if (!taskId || taskId.trim() === '') {
				return {
					content: [{ type: 'text', text: 'task_id is required. Usage: cook_dispatch_researcher({task_id: "TASK-X", problem: "..."})' }],
					isError: true,
				};
			}
			const brief = [
				`RESEARCHER → ${params.task_id}`,
				`Problem: ${params.problem}`,
				`ADHD: ${(params.frames ?? ["economic", "security", "performance", "ux"]).join(", ")}`,
				"1. Diverge: isolated frames",
				"2. Focus: score, cluster, prune",
				'3. Record findings: backlog_doc_create with type="research" (REQUIRED)',
				"Return ResearcherEnvelope.",
			].join("\n");
			const payload = await dispatchPayload(ctx, "cook-researcher", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_worker",
		label: "cook_dispatch_worker",
		description:
			"Dispatch the implementer (cook-worker) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
			plan: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		...cookToolRenderers("worker"),
		async execute(_id, params: { task_id: string; plan?: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id as string;
			if (!taskId || taskId.trim() === '') {
				return {
					content: [{ type: 'text', text: 'task_id is required. Usage: cook_dispatch_worker({task_id: "TASK-X"})' }],
					isError: true,
				};
			}
			const brief = [
				`WORKER → ${params.task_id}`,
				"1. Read spec + failing tests",
				"2. Minimal change to pass AC",
				"3. May NOT author/weaken tests",
				"4. --append-notes, --check-ac",
				"Return WorkerEnvelope.",
				params.plan ? `\nPlan: ${params.plan}` : "",
			].join("\n");
			const payload = await dispatchPayload(ctx, "cook-worker", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_validator",
		label: "cook_dispatch_validator",
		description:
			"Dispatch the verifier (cook-validator) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		...cookToolRenderers("validator"),
		async execute(_id, params: { task_id: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id as string;
			if (!taskId || taskId.trim() === '') {
				return {
					content: [{ type: 'text', text: 'task_id is required. Usage: cook_dispatch_validator({task_id: "TASK-X"})' }],
					isError: true,
				};
			}
			const brief = `VALIDATOR → ${params.task_id}\n1. Full test suite (the gate ALWAYS re-runs after any repair)\n2. Check AC — verify each with objective evidence\n3. Record gate evidence (hash, green, clean) via cook_journal gate\n4. --append-notes\nOn failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.`;
			try { appendIntent(ctx.cwd, params.task_id, "verify", "gate run"); }
			catch (error) {
				return { content: [{ type: "text", text: `journal intent failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }], isError: true };
			}
			const payload = await dispatchPayload(ctx, "cook-validator", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_dispatch_judge",
		label: "cook_dispatch_judge",
		description:
			"Dispatch the independent reviewer (cook-judge) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		...cookToolRenderers("judge"),
		async execute(_id, params: { task_id: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id as string;
			if (!taskId || taskId.trim() === '') {
				return {
					content: [{ type: 'text', text: 'task_id is required. Usage: cook_dispatch_judge({task_id: "TASK-X"})' }],
					isError: true,
				};
			}
			// Red gate: never judge on a red gate (post-6.0 hardening).
			const canonicalTaskId = taskId.trim().toUpperCase();
			const gateBlock = checkGateGreen(canonicalTaskId);
			if (gateBlock)
				return { content: [{ type: "text", text: gateBlock }], isError: true };

			// Dual review (slate dispatch): complexity=complex fans two decorrelated judges.
			const cs = sc.getStore();
			const complex = cs.complexity?.[canonicalTaskId] === "complex";
			if (complex) {
				const briefA = `JUDGE (dual review A: correctness + test integrity) → ${params.task_id}\n1. Independent — did NOT write code\n2. Emphasis: correctness-vs-acceptance-criteria + test integrity.\n3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}\n4. Return ReviewerEnvelope.`;
				const briefB = `JUDGE (dual review B: standards + boundary safety) → ${params.task_id}\n1. Independent — did NOT write code; decorrelated from the correctness reviewer.\n2. Emphasis: standards, simplification, boundary safety.\n3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}\n4. Return ReviewerEnvelope.`;
				const pa = await dispatchPayload(ctx, "cook-judge", params.task_id, briefA);
				const pb = await dispatchPayload(ctx, "cook-judge", params.task_id, briefB);
				return {
					content: [{ type: "text", text: pa.text + "\n\n" + pb.text + "\n\nDual review: pass requires BOTH. Record each reviewer independently with cook_record_result and its emitted dispatch_stage; only then union blockers and dedupe keeping the stricter class." }],
					isError: !pa.ok || !pb.ok,
				};
			}

			const brief = `JUDGE → ${params.task_id}\n1. Independent — did NOT write code\n2. Judge vs AC + standards\n3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}\n4. file:line + reason + fix\nReturn ReviewerEnvelope.`;
			const payload = await dispatchPayload(ctx, "cook-judge", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_decompose",
		label: "cook_decompose",
		description:
			'Decompose a parent task into atomic sub-tickets with dependencies. Creates each child with -p <parent>, then wires dependencies. depends_on entries are indices into the subtasks array (e.g. "0") or real task IDs.',
		parameters: Type.Object({
			parent_task_id: Type.String(),
			subtasks: Type.Array(
				Type.Object({
					title: Type.String(),
					description: Type.Optional(Type.String()),
					acceptance_criteria: Type.Optional(Type.Array(Type.String())),
					priority: Type.Optional(Type.String()),
					depends_on: Type.Optional(Type.Array(Type.String())),
				}),
			),
		}) as unknown as TSchema,
		async execute(_id, params: { parent_task_id: string; subtasks: { title: string; description?: string; acceptance_criteria?: string[]; priority?: string; depends_on?: string[] }[] }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const parentId = typeof params.parent_task_id === "string" ? params.parent_task_id.trim() : "";
			if (!parentId) {
				return {
					content: [{ type: 'text', text: 'parent_task_id is required. Usage: cook_decompose({parent_task_id: "TASK-X", subtasks: [...]})' }],
					isError: true,
				};
			}
			const subtasks = params.subtasks;
			if (!Array.isArray(subtasks) || !subtasks.length)
				return {
					content: [{ type: "text", text: "No subtasks provided." }],
					isError: true,
				};
			if (
				subtasks.some(
					(subtask) =>
						!subtask ||
						typeof subtask.title !== "string" ||
						!subtask.title.trim() ||
						(subtask.depends_on !== undefined &&
							(!Array.isArray(subtask.depends_on) ||
								subtask.depends_on.some((dependency) => typeof dependency !== "string" || !dependency.trim()))),
				)
			)
				return { content: [{ type: "text", text: "Each subtask requires a non-empty title and valid depends_on strings." }], isError: true };
			const loaded = await loadTasksStrict(pi, ctx.cwd);
			if ("error" in loaded)
				return { content: [{ type: "text", text: `Cannot validate decomposition: ${loaded.error}` }], isError: true };
			const knownTaskIds = new Set(loaded.tasks.map((task) => task.id.toUpperCase()));
			if (!knownTaskIds.has(parentId.toUpperCase()))
				return { content: [{ type: "text", text: `Parent task ${parentId} does not exist.` }], isError: true };
			let indexEdges: number[][];
			try {
				indexEdges = subtasks.map((subtask, index) =>
					(subtask.depends_on ?? []).flatMap((dependency) => {
						if (!/^\d+$/.test(dependency)) {
							if (!knownTaskIds.has(dependency.toUpperCase()))
								throw new Error(`Subtask ${index} references unknown dependency ${dependency}.`);
							return [];
						}
						const dependencyIndex = Number(dependency);
						if (dependencyIndex < 0 || dependencyIndex >= subtasks.length)
							throw new Error(`Subtask ${index} references out-of-range dependency index ${dependency}.`);
						if (dependencyIndex === index)
							throw new Error(`Subtask ${index} cannot depend on itself.`);
						return [dependencyIndex];
					}),
				);
			} catch (error) {
				return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
			}
			const visiting = new Set<number>();
			const visited = new Set<number>();
			const hasCycle = (index: number): boolean => {
				if (visiting.has(index)) return true;
				if (visited.has(index)) return false;
				visiting.add(index);
				if (indexEdges[index]!.some(hasCycle)) return true;
				visiting.delete(index);
				visited.add(index);
				return false;
			};
			if (subtasks.some((_subtask, index) => hasCycle(index)))
				return { content: [{ type: "text", text: "Subtask dependency graph contains a cycle." }], isError: true };

			// Pass 1: create children linked to the parent
			const createdIds: string[] = [];
			for (const st of subtasks) {
				const args = ["task", "create", st.title, "-p", parentId];
				if (st.description) args.push("-d", st.description);
				if (st.priority) args.push("--priority", st.priority);
				if (st.acceptance_criteria)
					for (const ac of st.acceptance_criteria) args.push("--ac", ac);
				const r = await runBacklogCliSafe(pi, args, ctx.cwd);
				if (r.code !== 0)
					return {
						content: [
							{
								type: "text",
								text: `Failed to create "${st.title}" (created: ${createdIds.join(", ") || "none"}): ${r.stderr || r.stdout}`,
							},
						],
						isError: true,
					};
				const m = r.stdout.match(/[A-Za-z]+-\d+(?:\.\d+)?/);
				if (!m)
					return {
						content: [
							{
								type: "text",
								text: `Could not parse created task ID for "${st.title}" (created: ${createdIds.join(", ") || "none"}): ${r.stdout}`,
							},
						],
						isError: true,
					};
				createdIds.push(m[0]);
			}

			// Pass 2: wire dependencies (index → created id, or literal task id)
			const edges: string[] = [];
			for (let i = 0; i < subtasks.length; i++) {
				const deps: string[] = subtasks[i].depends_on ?? [];
				const resolved = deps
					.map((d: string) => (/^\d+$/.test(d) ? (createdIds[Number(d)] ?? d) : d))
					.filter((d: string) => d !== createdIds[i]);
				if (resolved.length) {
					const dependencyResult = await runBacklogCliSafe(
						pi,
						["task", "edit", createdIds[i], "--dep", resolved.join(",")],
						ctx.cwd,
					);
					if (dependencyResult.code !== 0)
						return { content: [{ type: "text", text: `Dependency wiring failed for ${createdIds[i]} (created: ${createdIds.join(", ")}): ${dependencyResult.stderr || dependencyResult.stdout}` }], isError: true };
					edges.push(`${createdIds[i]} ← ${resolved.join(",")}`);
				}
			}

			// Record decomposition on the parent
			const parentResult = await runBacklogCliSafe(
				pi,
				[
					"task",
					"edit",
					parentId,
					"--append-notes",
					`## Decomposed into ${createdIds.length} sub-tickets\n${createdIds.map((id, i) => `- ${id}: ${subtasks[i].title}`).join("\n")}\n${edges.length ? `Dependencies:\n${edges.map((e) => `- ${e}`).join("\n")}` : ""}\n`,
				],
				ctx.cwd,
			);
			if (parentResult.code !== 0)
				return { content: [{ type: "text", text: `Parent note update failed after creating ${createdIds.join(", ")}: ${parentResult.stderr || parentResult.stdout}` }], isError: true };

			// Track children in the store
			const cs = sc.getStore();
			sc.setStore({
				...cs,
				taskIds: Array.from(new Set([...cs.taskIds, parentId, ...createdIds])),
			});
			await pushDagr(ctx);

			return {
				content: [
					{
						type: "text",
						text: `DECOMPOSED ${parentId} → ${createdIds.length} sub-tickets:\n${createdIds.map((id, i) => `  ${id}: ${subtasks[i].title}`).join("\n")}\n${edges.length ? `\nDependency edges:\n${edges.map((e) => `  ${e}`).join("\n")}` : ""}\n\nNext: run cook_next to claim the first ready sub-ticket.`,
					},
				],
			};
		},
	});

	type CookNextResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
	const claimNext = async (ctx: ExtensionContext): Promise<CookNextResult> => {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return {
					content: [
						{ type: "text", text: "No active workflow. Run cook_start first." },
					],
					isError: true,
				};

			// Reject when parent task not in state
			if (!cs.currentTaskId || !cs.taskIds.includes(cs.currentTaskId)) {
				return {
					content: [
						{ type: "text", text: "No valid parent task in state. Ensure cook_decompose or cook_start has been called with a valid task." },
					],
					isError: true,
				};
			}

			const loaded = await loadTasksStrict(pi, ctx.cwd);
			if ("error" in loaded)
				return {
					content: [{ type: "text", text: `Cannot select the next sub-ticket: ${loaded.error}` }],
					isError: true,
				};
			// Parent = current task if it has children, else current task's own parent.
			const cur = loaded.tasks.find(
				(task) => task.id.toUpperCase() === cs.currentTaskId?.toUpperCase(),
			);
			if (!cur)
				return {
					content: [{ type: "text", text: `Current task ${cs.currentTaskId} is missing from the Backlog task list.` }],
					isError: true,
				};
			const parentId = cur?.parent_task_id ?? cs.currentTaskId;
			if (!parentId)
				return {
					content: [{ type: "text", text: "No current task to iterate from." }],
					isError: true,
				};

			const done = new Set(
				loaded.tasks
					.filter((task) => task.status === "Done" || task.status === "Archived")
					.map((task) => task.id.toUpperCase()),
			);
			const claimed = new Set(Object.keys(cs.claims).map((taskId) => taskId.toUpperCase()));
			const children = loaded.tasks.filter(
				(task) => task.parent_task_id?.toUpperCase() === parentId.toUpperCase(),
			);
			const ready = children
				.filter(
					(task) =>
						task.status !== "Done" &&
						task.status !== "Archived" &&
						!claimed.has(task.id.toUpperCase()) &&
						task.dependencies.every((dependency) => done.has(dependency.toUpperCase())),
				)
				.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
			if (!ready.length) {
				const open = children.filter(
					(task) => task.status !== "Done" && task.status !== "Archived",
				);
				if (open.length) {
					return {
						content: [
							{
								type: "text",
								text: `No ready sub-tickets (${open.length} blocked on dependencies: ${open.map((o) => o.id).join(", ")}). Resolve blockers or review the dependency edges.`,
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: `ALL_SUBTICKETS_DONE: every sub-ticket of ${parentId} is Done. Close the parent: check its AC, write --final-summary, then set status Done.`,
						},
					],
				};
			}

			const next = ready[0];
			const claimKey = next.id.toUpperCase();
			const activeClaims = Object.keys(cs.claims).length;
			if (activeClaims >= (cs.maxParallelTasks ?? 1))
				return { content: [{ type: "text", text: `Refused: ${activeClaims}/${cs.maxParallelTasks ?? 1} claims already active (maxParallelTasks).` }], isError: true };
			const claim = { by: "main", at: new Date().toISOString() };
			try {
				appendIntent(ctx.cwd, next.id, "claim", "claimed by " + claim.by);
			} catch (error) {
				return {
					content: [{ type: "text", text: `Claim journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
					isError: true,
				};
			}
			const statusEdit = await runBacklogCliSafe(
				pi,
				["task", "edit", next.id, "-s", "In Progress"],
				ctx.cwd,
			);
			if (statusEdit.code !== 0)
				return {
					content: [{ type: "text", text: `Claim activation failed after intent: ${statusEdit.stderr || statusEdit.stdout}` }],
					isError: true,
				};

			// Reset chain to the first working phase (skip capture/plan) and move pointer
			const firstWork = cs.chain.findIndex((s) =>
				["implement", "explore", "review"].includes(s),
			);
			sc.setStore({
				...cs,
				currentTaskId: next.id,
				currentStage: firstWork >= 0 ? firstWork : cs.currentStage,
				taskIds: Array.from(new Set([...cs.taskIds, next.id])),
				claims: { ...cs.claims, [claimKey]: claim },
			});
			await pushDagr(ctx);

			const remaining = ready.length - 1;
			return {
				content: [
					{
						type: "text",
						text: `NEXT: ${next.id} — ${next.title}\nStatus: In Progress | ${remaining} more ready after this.\nDependencies: ${next.dependencies.length ? next.dependencies.join(", ") : "none"}\nChain reset to: ${cs.chain[firstWork >= 0 ? firstWork : cs.currentStage]}\nDispatch the worker via the native task tool (agent: "cook-worker") for this sub-ticket.`,
					},
				],
			};
	};
	pi.registerTool<TSchema>({
		name: "cook_next",
		label: "cook_next",
		description:
			"Claim the next ready sub-ticket (dependencies satisfied) under the current parent and reset the chain to its first working phase. Returns null-state when all children are done.",
		parameters: Type.Object({}) as unknown as TSchema,
		...cookToolRenderers("next"),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			return claimNext(ctx);

		},
	});
	pi.registerTool<TSchema>({
		name: "cook_install",
		label: "cook_install",
		description:
			"Install cook agent profiles to the project or user agents directory so OMP discovers them on the next turn.",
		parameters: Type.Object({
			scope: Type.Union([Type.Literal("project"), Type.Literal("personal")]),
		}) as unknown as TSchema,
		async execute(_id, params: { scope: "project" | "personal" }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const scope = params.scope ?? "personal";
			const installed = await installCookAgents(ctx.cwd, scope);
			const loc = scope === "project" ? ".omp/agents/" : `${ompHome()}/agents/`;
			return {
				content: [
					{
						type: "text",
						text: `Installed ${installed.length} agents to ${loc}:\n${installed.map((a) => `  • ${a}`).join("\n")}\n\nAgents are active on the next turn (or run /reload-plugins).`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_validate",
		label: "cook_validate",
		description: "Validate cook workflow invariants.",
		parameters: Type.Object({
			task_id: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		async execute(_id, params: { task_id?: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return { content: [{ type: "text", text: "No state." }] };
			const issues: string[] = [];
			for (const tid of (params.task_id ? [params.task_id] : cs.taskIds).map((id) => id.trim().toUpperCase())) {
				const p = cs.agentLog.find(
					(e) => e.taskId === tid && e.role === "planner",
				);
				const w = cs.agentLog.find(
					(e) => e.taskId === tid && e.role === "worker",
				);
				if (p && w && p.model === w.model)
					issues.push(`[${tid}] INV-1: planner=worker model`);
				const j = cs.agentLog.find(
					(e) => e.taskId === tid && e.role === "judge",
				);
				if (w && j && w.model === j.model)
					issues.push(`[${tid}] INV-2: worker=judge model`);
				// Escalation bound (slate item 5): kickbacks per source may exceed cap
				// by at most one, only when bonusGranted is recorded.
				const stage = cs.convergence?.[tid]?.["judge"];
				if ((cs.reviewCycles[tid] ?? 0) > cs.maxReviewCycles + (stage?.bonusGranted ? 1 : 0))
					issues.push(`[${tid}] Convergence cap exceeded`);
				if (stage?.bonusGranted && (cs.reviewCycles[tid] ?? 0) > cs.maxReviewCycles + 1)
					issues.push(`[${tid}] INV-7: bonus cycle exceeded cap+1 bound`);
				if (stage?.bonusGranted && !(cs.lastFindings[tid] ?? []).every((f) => (f as unknown as { kickTo?: string }).kickTo === "implement"))
					issues.push(`[${tid}] INV-7: bonusGranted without confined findings evidence`);

				// INV-12 retention invariant (slate item 4): a retained (archived)
				// judgment identity that is live again is valid only when the typed
				// contract exists, the recorded fix stayed within the finding-file
				// union, and the retained verdict was pass. Unproven retention
				// (fail-closed) forces the full-reset practice.
				const lastFindings = cs.lastFindings[tid] ?? [];
				const typed = lastFindings.filter((f) => typeof f === "object" && f !== null);
				if (typed.length > 0) {
					const retained = cs.gateResults[tid]?.some((g) => g.passed);
					const repairJournal = readJournal(ctx?.cwd ?? sc.currentCwd, tid);
					const latestFailure = [...repairJournal].reverse().find((entry) => {
							if (entry.event !== "record" || !entry.note) return false;
							try {
							const parsed = JSON.parse(entry.note) as { outcome?: unknown; finding?: unknown };
							return (parsed.outcome === "failed" || parsed.outcome === "blocked") && !!parsed.finding;
							} catch {
								return false;
							}
						});
					const latestRepair = latestFailure
						? [...repairJournal]
						.reverse()
						.find((entry) => {
								if (entry.seq <= latestFailure.seq || entry.event !== "record" || !entry.note) return false;
							try {
								const parsed = JSON.parse(entry.note) as { outcome?: unknown };
								return parsed.outcome === "success" && entry.stage === "implement";
							} catch {
								return false;
							}
							})
						: undefined;
					let modifiedFiles: string[] | undefined;
					let latestFailureFile: string | undefined;
					if (latestFailure?.note) {
						try {
							const finding = (JSON.parse(latestFailure.note) as { finding?: { file?: unknown } }).finding;
							if (typeof finding?.file === "string" && finding.file.trim())
								latestFailureFile = finding.file.trim();
						} catch {
							latestFailureFile = undefined;
						}
					}
					if (latestRepair?.note) {
						try {
							const candidate = (JSON.parse(latestRepair.note) as { modifiedFiles?: unknown }).modifiedFiles;
							if (
								Array.isArray(candidate) &&
								candidate.length > 0 &&
								candidate.every((file) => typeof file === "string" && file.trim().length > 0)
							) {
								modifiedFiles = candidate as string[];
							}
						} catch {
							modifiedFiles = undefined;
						}
					}
					const fixConfined =
						!!latestFailureFile &&
						!!modifiedFiles?.includes(latestFailureFile) &&
						resolveRepairScope(tid, typed as { kickTo?: string; file?: string }[], modifiedFiles, ctx?.cwd ?? sc.currentCwd) === "scoped";
					if (retained && !fixConfined)
						issues.push(`[${tid}] INV-12: retained judgment without proven file-confined fix`);
					if (retained && typed.some((f) => (f as unknown as { kickTo?: string }).kickTo !== "implement"))
						issues.push(`[${tid}] INV-12: retention with unconfined kickTo`);
				}

				// AC integrity (post-6.0 hardening): report pass-with-unchecked-AC
				const acIssue = await checkAcIntegrity(tid, ctx?.cwd ?? sc.currentCwd, "pass");
				if (acIssue) issues.push(`[${tid}] AC integrity: ${acIssue}`);
			}
			void resolveCapEscalation;
			void resolveRepairScope;
			return {
				content: [
					{
						type: "text",
						text: issues.length
							? `Issues:\n${issues.map((i) => `  - ${i}`).join("\n")}`
							: "All pass.",
					},
				],
				...(issues.length ? { isError: true } : {}),
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_reset",
		label: "cook_reset",
		description:
			"Clear cook state (chain, stage, taskId, cookmode) for the current repo. Resets to defaultCookState().",
		parameters: Type.Object({
			cwd: Type.Optional(
				Type.String({ description: "Repo root to reset; defaults to ctx.cwd" }),
			),
		}) as unknown as TSchema,
		async execute(_id, params: { cwd?: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const target = params.cwd ?? ctx.cwd;
			sc.setStoreFor(target, defaultCookState());
						return {
				content: [
					{
						type: "text",
						text: `Cook state reset for ${sc.normalizeCwd(target)}.`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_stop",
		label: "cook_stop",
		description:
			"Stop active chain: clear chain + stage + taskId but preserve cookmode flag.",
		parameters: Type.Object({}) as unknown as TSchema,
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return {
					content: [{ type: "text", text: "No active chain to stop." }],
					isError: true,
				};
			if (!ctx.hasUI || typeof ctx.ui?.select !== "function") {
				return {
					content: [{ type: "text", text: "Stop requires an interactive UI confirmation; no changes made." }],
				};
			}
			const confirm = await ctx.ui.select(
				`Stop chain "${cs.chain.join(" → ")}" for task ${cs.currentTaskId ?? "?"}?`,
				["✓ Confirm stop", "Cancel"],
			);
			if (!confirm || confirm === "Cancel") {
				return {
					content: [{ type: "text", text: "Stop cancelled." }],
				};
			}
			sc.setStore({ ...cs, chain: [], currentStage: 0, currentTaskId: null });
						return {
				content: [
					{
						type: "text",
						text: `Chain stopped. Cookmode ${cs.cookmode ? "remains ON" : "was off"}.`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_rewind",
		label: "cook_rewind",
		description:
			"Rewind chain to an earlier stage. Accepts a stage name (string) or 0-indexed number.",
		parameters: Type.Object({
			stage: Type.Union([
				Type.String({ description: "Stage name (e.g. 'scout') or 0-indexed number" }),
				Type.Number({ description: "0-indexed stage number" }),
			]),
		}) as unknown as TSchema,
		async execute(_id, params: { stage: string | number }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			if (!cs.chain.length)
				return {
					content: [{ type: "text", text: "No active chain." }],
					isError: true,
				};
			let targetIndex: number;
			if (typeof params.stage === "number") {
				targetIndex = params.stage;
			} else {
				const found = cs.chain.indexOf(params.stage);
				if (found === -1)
					return {
						content: [
							{
								type: "text",
								text: `Stage "${params.stage}" not in chain: ${cs.chain.join(", ")}`,
							},
						],
						isError: true,
					};
				targetIndex = found;
			}
			if (targetIndex < 0 || targetIndex >= cs.chain.length)
				return {
					content: [
						{
							type: "text",
							text: `Index ${targetIndex} out of range (chain length: ${cs.chain.length}).`,
						},
					],
					isError: true,
				};
			sc.setStore({ ...cs, currentStage: targetIndex });
			await pushDagr(ctx);
			return {
				content: [
					{
						type: "text",
						text: `Rewound to stage ${targetIndex}: ${cs.chain[targetIndex]}`,
					},
				],
			};
		},
	});
	pi.registerTool<TSchema>({
		name: "cook_watch",
		label: "cook_watch",
		description:
			"Manage cook monitoring: start/stop file watcher, add/remove tasks to watch list, list watched tasks, or query status. The watch list auto-polls Backlog.md at turn_start and surfaces status changes (done, blocked, idle workers) via widget + system prompt.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("start"),
				Type.Literal("stop"),
				Type.Literal("status"),
				Type.Literal("add_tasks"),
				Type.Literal("remove_tasks"),
				Type.Literal("list_tasks"),
			]),
			debounceMs: Type.Optional(Type.Number()),
			trigger: Type.Optional(
				Type.Union([Type.Literal("auto"), Type.Literal("manual")]),
			),
			tasks: Type.Optional(Type.Array(Type.String())),
		}) as unknown as TSchema,
		async execute(_id, params: { action: "start" | "stop" | "status" | "add_tasks" | "remove_tasks" | "list_tasks"; debounceMs?: number; trigger?: "auto" | "manual"; tasks?: string[] }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const action = params.action as string;

			if (action === "start") {
				if (!cs.chain.length)
					return {
						content: [
							{
								type: "text",
								text: "No active workflow chain. Run cook_start first.",
							},
						],
						isError: true,
					};
				const debounceMs = (params.debounceMs as number) ?? 250;
				const trigger = (params.trigger as "auto" | "manual") ?? "auto";
				const watchId = crypto.randomUUID();
				sc.setStore({
					...cs,
					watch: {
						enabled: true,
						debounceMs,
						trigger,
						lastFiredAt: null,
						watchId,
					},
				});
								return {
					content: [
						{
							type: "text",
							text: `Watch ON (${watchId}) — debounce: ${debounceMs}ms, trigger: ${trigger}`,
						},
					],
				};
			}

			if (action === "stop") {
				sc.setStore({
					...cs,
					watch: {
						...cs.watch,
						enabled: false,
						watchId: null,
					},
				});
								return {
					content: [{ type: "text", text: "Watch OFF" }],
				};
			}


			if (action === "add_tasks") {
				const taskIds = (params.tasks as string[]) ?? [];
				if (!taskIds.length) {
					return {
						content: [{ type: "text", text: "No task IDs provided. Usage: cook_watch({action: 'add_tasks', tasks: ['TASK-X']})" }],
						isError: true,
					};
				}
				const now = new Date().toISOString();
				const watchList = { ...cs.watchList };
				const added: string[] = [];
				for (const tid of taskIds) {
					const key = tid.toUpperCase();
					if (!watchList[key]) {
						watchList[key] = { taskId: key, since: now, lastStatus: "unknown", lastChecked: null };
						added.push(key);
					}
				}
				sc.setStore({ ...cs, watchList });
								return {
					content: [{ type: "text", text: added.length ? `Watching ${added.length} task(s): ${added.join(", ")}` : "All tasks already watched." }],
				};
			}

			if (action === "remove_tasks") {
				const taskIds = (params.tasks as string[]) ?? [];
				if (!taskIds.length) {
					return {
						content: [{ type: "text", text: "No task IDs provided. Usage: cook_watch({action: 'remove_tasks', tasks: ['TASK-X']})" }],
						isError: true,
					};
				}
				const watchList = { ...cs.watchList };
				const removed: string[] = [];
				for (const tid of taskIds) {
					const key = tid.toUpperCase();
					if (watchList[key]) {
						delete watchList[key];
						removed.push(key);
					}
				}
				sc.setStore({ ...cs, watchList });
								return {
					content: [{ type: "text", text: removed.length ? `Stopped watching ${removed.length} task(s): ${removed.join(", ")}` : "None of the tasks were being watched." }],
				};
			}

			if (action === "list_tasks") {
				const entries = Object.values(cs.watchList);
				if (!entries.length) {
					return { content: [{ type: "text", text: "No tasks in watch list." }] };
				}
				const lines = entries.map((t) => `  ${t.taskId}: ${t.lastStatus} (since ${t.since}${t.lastChecked ? `, checked ${t.lastChecked}` : ""})`);
				return { content: [{ type: "text", text: `Watching ${entries.length} task(s):\n${lines.join("\n")}` }] };
			}

			// status
			const w = cs.watch;
			return {
				content: [
					{
						type: "text",
						text: `Watch: ${w.enabled ? "enabled" : "disabled"} — debounce: ${w.debounceMs}ms, trigger: ${w.trigger}${w.lastFiredAt ? `, last fired: ${w.lastFiredAt}` : ""}`,
					},
				],
			};
		},
	});


	// ── jeff 6.0 sync: parallel DAG drain + journal + snapshot ───────────────

	const isTerminalStatus = (status: string): boolean =>
		["done", "archived", "closed"].includes(status.trim().toLowerCase());

	pi.registerTool<TSchema>({
		name: "cook_ready",
		label: "cook_ready",
		description:
			"Print the ready set as text lines {id | title | priority | deps}. Ready = todo/In Progress, unclaimed, all deps satisfied. Order: priority, then id.",
		parameters: Type.Object({}) as unknown as TSchema,
		...cookToolRenderers("ready"),
		// fallow-ignore-next-line complexity
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const loaded = await loadTasksStrict(pi, ctx.cwd);
			if ("error" in loaded)
				return {
					content: [{ type: "text", text: `Cannot compute ready set: ${loaded.error}` }],
					isError: true,
				};
			const tasks = loaded.tasks;
			const taskById = new Map(tasks.map((t) => [t.id.toUpperCase(), t]));
			const claimed = new Set(Object.keys(cs.claims).map((taskId) => taskId.toUpperCase()));
			const ready = tasks.filter((task) => {
				const status = task.status.trim().toLowerCase();
				if (status !== "todo" && status !== "in progress") return false;
				if (claimed.has(task.id.toUpperCase())) return false;
				const deps = (task as unknown as { dependencies?: string[] }).dependencies ?? [];
				return deps.every((dep) => {
					const depTask = taskById.get(dep.trim().toUpperCase());
					return depTask ? isTerminalStatus(depTask.status) : false;
				});
			});
			// fallow-ignore-next-line complexity
			ready.sort((a, b) => {
				const pa = (a.priority ?? "").toLowerCase();
				const pb = (b.priority ?? "").toLowerCase();
				if (pa !== pb) return pa < pb ? -1 : 1;
				return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
			});
			if (!ready.length)
				return { content: [{ type: "text", text: "Ready set is empty." }] };
			return {
				content: [
					{
						type: "text",
						text: ready.map((t) => t.id + " | " + t.title + " | " + (t.priority ?? "-") + " | " + (((t as unknown as { dependencies?: string[] }).dependencies ?? []).join(",") || "-")).join("\n"),
					},
				],
			};
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_claim",
		label: "cook_claim",
		description:
			"Atomically claim a task for a drain lane. Refuses terminal/blocked/claimed tasks (error names the holder). Enforces maxParallelTasks. Journals a claim intent.",
		parameters: Type.Object({
			task_id: Type.String(),
			by: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		...cookToolRenderers("claim"),
		// fallow-ignore-next-line complexity
		async execute(_id, params: { task_id: string; by?: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const taskId = params.task_id.trim().toUpperCase();
			const loaded = await loadTasksStrict(pi, ctx.cwd);
			if ("error" in loaded)
				return { content: [{ type: "text", text: `Cannot verify claim readiness: ${loaded.error}` }], isError: true };
			const taskById = new Map(loaded.tasks.map((entry) => [entry.id.toUpperCase(), entry]));
			const task = taskById.get(taskId.toUpperCase());
			if (!task)
				return { content: [{ type: "text", text: "Task " + taskId + " not found." }], isError: true };
			if (isTerminalStatus(task.status))
				return { content: [{ type: "text", text: "Refused: " + task.id + " is terminal (" + task.status + ")." }], isError: true };
			if (task.status.trim().toLowerCase() === "blocked")
				return { content: [{ type: "text", text: "Refused: " + task.id + " is blocked." }], isError: true };
			const dependencies = task.dependencies ?? [];
			const unready = dependencies.find((dependency) => {
				const dependencyTask = taskById.get(dependency.toUpperCase());
				return !dependencyTask || !isTerminalStatus(dependencyTask.status);
			});
			if (unready)
				return { content: [{ type: "text", text: `Refused: ${task.id} dependency ${unready} is missing or non-terminal.` }], isError: true };
			const existingKey = Object.keys(cs.claims).find((key) => key.toUpperCase() === task.id.toUpperCase());
			const existing = existingKey ? cs.claims[existingKey] : undefined;
			if (existing) {
				const holder = typeof existing === "string" ? existing : existing.by;
				return { content: [{ type: "text", text: "Refused: " + task.id + " is already claimed by " + holder + "." }], isError: true };
			}
			const activeClaims = Object.keys(cs.claims).length;
			if (activeClaims >= (cs.maxParallelTasks ?? 1)) {
				return {
					content: [{ type: "text", text: "Refused: " + activeClaims + "/" + (cs.maxParallelTasks ?? 1) + " claims already active (maxParallelTasks). Release one or raise the cap." }],
					isError: true,
				};
			}
			const claim = { by: params.by?.trim() || "main", at: new Date().toISOString() };
			try {
				appendIntent(ctx.cwd, task.id, "claim", "claimed by " + claim.by);
			} catch (error) {
				return {
					content: [{ type: "text", text: `Claim journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
					isError: true,
				};
			}
			const statusEdit = await runBacklogCliSafe(pi, ["task", "edit", task.id, "-s", "In Progress"], ctx.cwd);
			if (statusEdit.code !== 0)
				return {
					content: [{ type: "text", text: `Claim activation failed after intent: ${statusEdit.stderr || statusEdit.stdout}` }],
					isError: true,
				};
			sc.setStore({ ...cs, claims: { ...cs.claims, [task.id.toUpperCase()]: claim } });
			await pushDagr(ctx);
			return {
				content: [{ type: "text", text: "Claimed " + task.id + " by " + claim.by + " at " + claim.at + " (" + (activeClaims + 1) + "/" + (cs.maxParallelTasks ?? 1) + " lanes active). Journal intent written. Open the lane now." }],
			};
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_release",
		label: "cook_release",
		description: "Release a task claim. Errors if the task is unclaimed.",
		parameters: Type.Object({ task_id: Type.String() }) as unknown as TSchema,
		...cookToolRenderers("release"),
		// fallow-ignore-next-line complexity
		async execute(_id, params: { task_id: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const taskId = params.task_id.trim().toUpperCase();
			const claimKey = Object.keys(cs.claims).find((key) => key.toUpperCase() === taskId.toUpperCase());
			if (!claimKey)
				return { content: [{ type: "text", text: "Error: " + taskId + " is not claimed." }], isError: true };
			try {
				appendRecord(ctx.cwd, taskId, "release", "claim released");
			} catch (error) {
				return {
					content: [{ type: "text", text: `Release journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
					isError: true,
				};
			}
			const { [claimKey]: _removed, ...rest } = cs.claims;
			sc.setStore({ ...cs, claims: rest });
			await pushDagr(ctx);
			return { content: [{ type: "text", text: "Released " + taskId + "." }] };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_claims",
		label: "cook_claims",
		description: "List active task claims with age.",
		parameters: Type.Object({}) as unknown as TSchema,
		...cookToolRenderers("claims"),
		// fallow-ignore-next-line complexity
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const ids = Object.keys(cs.claims);
			if (!ids.length)
				return { content: [{ type: "text", text: "No active claims." }] };
			const now = Date.now();
			const lines = ids.map((id) => {
				const c = cs.claims[id];
				const by = typeof c === "string" ? c : c.by;
				const at = typeof c === "string" ? null : c.at;
				const ageMin = at ? Math.round((now - Date.parse(at)) / 60000) : null;
				return id + " | by " + by + (ageMin !== null ? " | " + ageMin + "m ago" : "");
			});
			return { content: [{ type: "text", text: lines.join("\n") }] };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_snapshot",
		label: "cook_snapshot",
		description:
			"Versioned, additive, read-only machine projection of cook + Backlog state (schemaVersion 1). Never mutates state. External consumers gate on schemaVersion.",
		parameters: Type.Object({}) as unknown as TSchema,
		...cookToolRenderers("snapshot"),
		// fallow-ignore-next-line complexity
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const cs = sc.getStore();
			const tasks = await getAllTasks(pi, ctx.cwd);
			const doc = {
				schemaVersion: 1,
				generatedAt: new Date().toISOString(),
				maxParallelTasks: cs.maxParallelTasks ?? 1,
				// fallow-ignore-next-line complexity
				tasks: tasks.map((t) => {
					const claim = cs.claims[t.id];
					const convergence = cs.convergence?.[t.id];
					const complexity = cs.complexity?.[t.id];
					return {
						id: t.id,
						title: t.title,
						status: t.status,
						stage: t.id === cs.currentTaskId ? cs.chain[cs.currentStage] : undefined,
						...(claim ? { claim } : {}),
						...(convergence && Object.keys(convergence).length ? { convergence } : {}),
						...(complexity ? { complexity } : {}),
					};
				}),
			};
			return { content: [{ type: "text", text: JSON.stringify(doc, null, 2) }] };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_record_result",
		label: "cook_record_result",
		description:
			"Record one typed specialist result durably, then route a negative result to its declared recovery stage.",
		parameters: Type.Object({
			task_id: Type.String(),
			stage: Type.String(),
			outcome: Type.Union([
				Type.Literal("success"),
				Type.Literal("failed"),
				Type.Literal("blocked"),
			]),
			evidence: Type.Union([
				Type.Literal("verified"),
				Type.Literal("reported"),
				Type.Literal("heuristic"),
				Type.Literal("asserted"),
			]),
			receipt: Type.String(),
			dispatch_stage: Type.Optional(Type.String()),
			modified_files: Type.Optional(Type.Array(Type.String())),
			finding: Type.Optional(Type.Object({
				source: Type.Union([
					Type.Literal("judge"),
					Type.Literal("validator"),
					Type.Literal("audit"),
					Type.Literal("refute"),
				]),
				file: Type.String(),
				line: Type.Number(),
				what: Type.String(),
				kickTo: Type.Union([
					Type.Literal("plan"),
					Type.Literal("implement"),
					Type.Literal("verify"),
				]),
			})),
		}) as unknown as TSchema,
		...cookToolRenderers("record"),
		async execute(
			_id,
			params: {
				task_id: string;
				stage: string;
				outcome: "success" | "failed" | "blocked";
				evidence: "verified" | "reported" | "heuristic" | "asserted";
				receipt: string;
				dispatch_stage?: string;
				modified_files?: string[];
				finding?: {
					source: "judge" | "validator" | "audit" | "refute";
					file: string;
					line: number;
					what: string;
					kickTo: "plan" | "implement" | "verify";
				};
			},
			_signal,
			_onUpdate,
			ctx,
		) {
			bindContext(ctx);
			const taskId = typeof params.task_id === "string" ? params.task_id.trim().toUpperCase() : "";
			const stage = typeof params.stage === "string" ? params.stage.trim() : "";
			const evidence = typeof params.evidence === "string" ? params.evidence.trim() : "";
			const receipt = typeof params.receipt === "string" ? params.receipt.trim() : "";
			const requestedDispatchStage =
				typeof params.dispatch_stage === "string" ? params.dispatch_stage.trim() : "";
			if (params.dispatch_stage !== undefined && !requestedDispatchStage)
				return { content: [{ type: "text", text: "dispatch_stage must be a non-empty dispatch identity." }], isError: true };
			if (
				!taskId ||
				!stage ||
				!receipt ||
				!["success", "failed", "blocked"].includes(params.outcome) ||
				!["verified", "reported", "heuristic", "asserted"].includes(evidence)
			)
				return { content: [{ type: "text", text: "task_id, stage, evidence, and receipt are required." }], isError: true };
			if (
				params.modified_files !== undefined &&
				(!Array.isArray(params.modified_files) ||
					params.modified_files.length === 0 ||
					params.modified_files.some((file) => typeof file !== "string" || !file.trim()))
			)
				return { content: [{ type: "text", text: "modified_files must be a non-empty array of non-empty paths." }], isError: true };
			const modifiedFiles = params.modified_files?.map((file) => file.trim());
			if (
				params.finding !== undefined &&
				(!params.finding ||
					typeof params.finding !== "object" ||
					!["judge", "validator", "audit", "refute"].includes(params.finding.source) ||
					typeof params.finding.file !== "string" ||
					!params.finding.file.trim() ||
					typeof params.finding.what !== "string" ||
					!params.finding.what.trim() ||
					!Number.isInteger(params.finding.line) ||
					params.finding.line < 1 ||
					!["plan", "implement", "verify"].includes(params.finding.kickTo))
			)
				return { content: [{ type: "text", text: "finding must contain a valid source, file, positive integer line, what, and kickTo." }], isError: true };
			if (params.outcome !== "success" && !params.finding)
				return { content: [{ type: "text", text: "A failed or blocked result requires a typed finding with kickTo." }], isError: true };
			const cs = sc.getStoreFor(ctx.cwd);
			if (!cs.chain.includes(stage) && stage !== "audit" && stage !== "refute")
				return { content: [{ type: "text", text: `Result stage "${stage}" is not in the active chain.` }], isError: true };
			if (
				params.finding &&
				((params.finding.source === "validator" && stage !== "verify") ||
					(params.finding.source === "judge" && stage !== "review") ||
					(params.finding.source === "audit" && stage !== "audit") ||
					(params.finding.source === "refute" && stage !== "refute"))
			)
				return { content: [{ type: "text", text: `Finding source ${params.finding.source} cannot record against stage ${stage}.` }], isError: true };
			const recoveryIndex =
				params.outcome !== "success" && params.finding
					? cs.chain.indexOf(params.finding.kickTo)
					: -1;
			if (params.outcome !== "success" && params.finding && recoveryIndex < 0)
				return {
					content: [{ type: "text", text: `Recovery stage "${params.finding.kickTo}" is not in the active chain; result was not recorded.` }],
					isError: true,
				};

			const resultNote = JSON.stringify({
				outcome: params.outcome,
				evidence,
				receipt,
				...(modifiedFiles?.length ? { modifiedFiles } : {}),
				...(params.finding ? { finding: params.finding } : {}),
			});
			const roleForResultStage: Record<string, string> = {
				plan: "planner",
				explore: "researcher",
				implement: "worker",
				verify: "validator",
				review: "judge",
				audit: "audit",
				refute: "refute",
			};
			const expectedRole = roleForResultStage[stage];
			const dispatchCandidates = sc.getStoreFor(ctx.cwd).agentLog.filter(
				(entry) =>
					entry.taskId.toUpperCase() === taskId &&
					(!expectedRole || entry.role === expectedRole),
			);
			const existingJournal = readJournal(ctx.cwd, taskId);
			const latestDispatch = requestedDispatchStage
				? dispatchCandidates.find((entry) => entry.stage === requestedDispatchStage)
				: dispatchCandidates.find(
					(entry) =>
						!existingJournal.some(
							(journalEntry) =>
								journalEntry.stage === entry.stage &&
								(journalEntry.event === "record" || journalEntry.event === "gate"),
						),
				);
			if (requestedDispatchStage && !latestDispatch)
				return { content: [{ type: "text", text: `dispatch_stage "${requestedDispatchStage}" does not match this task and result role.` }], isError: true };
			try {
				appendRecord(ctx.cwd, taskId, stage, resultNote);
				if (latestDispatch && latestDispatch.stage !== stage)
					appendRecord(ctx.cwd, taskId, latestDispatch.stage, resultNote);
			} catch (error) {
				return {
					content: [{ type: "text", text: `Result journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
					isError: true,
				};
			}
			const postResultJournal = readJournal(ctx.cwd, taskId);
			const pendingRoleDispatch = dispatchCandidates.some(
				(dispatch) =>
					!postResultJournal.some(
						(entry) =>
							entry.stage === dispatch.stage &&
							(entry.event === "record" || entry.event === "gate"),
					),
			);

			// Keep convergence bookkeeping alongside the durable record.  A
			// negative judge/validator result is a rework cycle, while findings
			// are additive so a scoped repair cannot discard a sibling blocker
			// reported by the other reviewer.
			const finding = params.finding;
			let nextState = sc.getStoreFor(ctx.cwd);
			let capEscalation: "bonus" | "council" | undefined;
			if (finding && params.outcome !== "success") {
				const previousFindings = nextState.lastFindings[taskId] ?? [];
				const latestCycleBoundary =
					[...existingJournal]
						.reverse()
						.find((entry) => {
							if (entry.event !== "record" || entry.stage !== "implement" || !entry.note) return false;
							try {
								return (JSON.parse(entry.note) as { outcome?: string }).outcome === "success";
							} catch {
								return false;
							}
						})?.seq ?? -1;
				const sameSourceAlreadyRecorded = existingJournal.some((entry) => {
					if (entry.seq <= latestCycleBoundary || entry.event !== "record" || !entry.note) return false;
					try {
						return (JSON.parse(entry.note) as { finding?: { source?: string } }).finding?.source === finding.source;
					} catch {
						return false;
					}
				});
				const retainedFindings = sameSourceAlreadyRecorded
					? previousFindings
					: previousFindings.filter((prior) => prior.source !== finding.source);
				const survivingFindings = [
					...retainedFindings.filter(
						(prior) =>
							!(
								prior.source === finding.source &&
								prior.file === finding.file &&
								prior.line === finding.line
							),
					),
					finding,
				];
				const priorCycles = nextState.reviewCycles[taskId] ?? 0;
				let escalation: "bonus" | "council" | undefined;
				if (!pendingRoleDispatch && finding.source === "judge" && priorCycles >= nextState.maxReviewCycles) {
					escalation = await resolveCapEscalation(taskId, survivingFindings, ctx.cwd);
					capEscalation = escalation;
					nextState = sc.getStoreFor(ctx.cwd);
				}
				const source = finding.source;
				const sourceStage = nextState.convergence?.[taskId]?.[source] ?? { cycles: 0 };
				// A council escalation is terminal at the configured cap; only
				// the single, explicitly granted bonus may consume cap+1.
				const consumesCycle =
					!pendingRoleDispatch &&
					(priorCycles < nextState.maxReviewCycles || escalation === "bonus");
				const cycles = priorCycles + (consumesCycle ? 1 : 0);
				const sourceCycles = sourceStage.cycles + (consumesCycle ? 1 : 0);
				nextState = {
					...nextState,
					reviewCycles: { ...nextState.reviewCycles, [taskId]: cycles },
					lastFindings: {
						...nextState.lastFindings,
						[taskId]: survivingFindings,
					},
					convergence: {
						...nextState.convergence,
						[taskId]: {
							...(nextState.convergence?.[taskId] ?? {}),
							[source]: {
								cycles: sourceCycles,
								...(sourceStage.bonusGranted ? { bonusGranted: true } : {}),
							},
						},
					},
				};
				sc.setStoreFor(ctx.cwd, nextState);
			} else if (params.outcome === "success" && stage === "implement") {
				const repairFindings = nextState.lastFindings[taskId] ?? [];
				if (repairFindings.length > 0) {
					const latestFailed = [...readJournal(ctx.cwd, taskId)]
						.reverse()
						.map((entry) => {
							try {
								return entry.note ? JSON.parse(entry.note) as { outcome?: string; finding?: TypedFinding } : {};
							} catch {
								return {};
							}
						})
						.find((record) => record.outcome === "failed" || record.outcome === "blocked");
					const scope =
						latestFailed?.finding?.file &&
						modifiedFiles?.includes(latestFailed.finding.file)
							? resolveRepairScope(taskId, repairFindings, modifiedFiles, ctx.cwd)
							: "full";
					if (scope === "full") {
						nextState = {
							...nextState,
							lastFindings: {
								...nextState.lastFindings,
								[taskId]: latestFailed?.finding ? [latestFailed.finding] : repairFindings,
							},
							gateResults: { ...nextState.gateResults, [taskId]: [] },
						};
						sc.setStoreFor(ctx.cwd, nextState);
					}
				}
			}

			let next = stage;
			if (params.outcome !== "success" && params.finding) {
				if (pendingRoleDispatch) {
					await pushDagr(ctx);
					return {
						content: [{ type: "text", text: `Recorded ${params.finding.source} result for ${taskId}; parallel sibling dispatches remain pending. Recovery has not started.` }],
					};
				}
				const reachedCouncil = capEscalation === "council";
				if (reachedCouncil) {
					const councilState = sc.getStoreFor(ctx.cwd);
					try {
						appendIntent(
							ctx.cwd,
							taskId,
							stage,
							"Convergence cap reached; dispatch integrity, security, and pragmatist cook-council inquiries, then cook-council-synthesis.",
						);
					} catch (error) {
						return {
							content: [{ type: "text", text: `Council journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
							isError: true,
						};
					}
					sc.setStoreFor(ctx.cwd, {
						...councilState,
						councilEpisodes: {
							...councilState.councilEpisodes,
							[taskId]: { status: "pending", finding: params.finding },
						},
					});
					await pushDagr(ctx);
					return {
						content: [{
							type: "text",
							text: `Council escalation pending for ${taskId}: call cook_dispatch_council with this typed finding, then cook_dispatch_council_synthesis and cook_record_council. Recovery did not advance.`,
						}],
						isError: true,
					};
				}
				next = params.finding.kickTo;
				try {
					appendIntent(
						ctx.cwd,
						taskId,
						next,
						`Fresh ${next} result required after ${params.finding.source} finding at ${stage}.`,
					);
				} catch (error) {
					return {
						content: [{ type: "text", text: `Recovery journal failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }],
						isError: true,
					};
				}
				sc.setStoreFor(ctx.cwd, { ...sc.getStoreFor(ctx.cwd), currentStage: recoveryIndex });
			}
			await pushDagr(ctx);
			return {
				content: [{
					type: "text",
					text: `Recorded ${params.outcome} result for ${taskId} at ${stage}. Next: ${next}`,
				}],
			};
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_journal",
		label: "cook_journal",
		description:
			"Append a journal event (intent | external) for a task. record/gate events are auto-appended by the dispatch/validate paths. Write the intent BEFORE every specialist dispatch and external side effect.",
		parameters: Type.Object({
			task_id: Type.String(),
			event: Type.Union([Type.Literal("intent"), Type.Literal("external"), Type.Literal("gate")]),
			stage: Type.Optional(Type.String()),
			note: Type.Optional(Type.String()),
			hash: Type.Optional(Type.String()),
			green: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		...cookToolRenderers("journal"),
		// fallow-ignore-next-line complexity
		async execute(_id, params: { task_id: string; event: "intent" | "external" | "gate"; stage?: string; note?: string; hash?: string; green?: boolean }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			try {
				if (params.event === "gate") {
					if (!params.stage?.trim() || !params.hash?.trim() || typeof params.green !== "boolean")
						return { content: [{ type: "text", text: "Journal gate requires non-empty stage/hash and boolean green." }], isError: true };
					const journalTaskId = params.task_id.trim().toUpperCase();
					const entry = appendGate(ctx.cwd, journalTaskId, params.stage, params.hash, params.green);
					const latestValidator = [...sc.getStore().agentLog]
						.reverse()
						.find(
							(log) =>
								log.taskId.toUpperCase() === journalTaskId &&
								log.role === "validator",
						);
					if (latestValidator && latestValidator.stage !== params.stage) {
						appendGate(
							ctx.cwd,
							journalTaskId,
							latestValidator.stage,
							params.hash,
							params.green,
						);
					}
					const cs = sc.getStore();
					const gate = {
						checks: [{ item: params.stage, ok: params.green, note: params.note ?? params.hash }],
						passed: params.green,
					};
					sc.setStore({
						...cs,
						gateResults: {
							...cs.gateResults,
							[journalTaskId]: [...(cs.gateResults[journalTaskId] ?? []), gate],
						},
					});
					await pushDagr(ctx);
					return { content: [{ type: "text", text: "Journaled gate seq=" + entry.seq + " stage=" + params.stage + "." }] };
				}
				const journalTaskId = params.task_id.trim().toUpperCase();
				const entry = params.event === "intent"
					? appendIntent(ctx.cwd, journalTaskId, params.stage ?? "external", params.note)
					: appendExternal(ctx.cwd, journalTaskId, params.note ?? "");
				await pushDagr(ctx);
				return { content: [{ type: "text", text: "Journaled " + params.event + " seq=" + entry.seq + (params.stage ? " stage=" + params.stage : "") + "." }] };
			} catch (e) {
				return { content: [{ type: "text", text: "Journal append failed (fail-closed): " + (e instanceof Error ? e.message : String(e)) }], isError: true };
			}
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_dispatch_refute",
		label: "cook_dispatch_refute",
		description:
			"Dispatch one fresh source-bound refute specialist for exactly one finding (cook-refute). Dispatch all refutes concurrently as separate calls when more than one blocking finding survives.",
		parameters: Type.Object({
			task_id: Type.String(),
			finding: Type.Object({
				source: Type.String(),
				file: Type.String(),
				line: Type.Number(),
				what: Type.String(),
			}),
		}) as unknown as TSchema,
		...cookToolRenderers("refute"),
		// fallow-ignore-next-line complexity
		async execute(_id, params: { task_id: string; finding: { source: string; file: string; line: number; what: string } }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const f = params.finding;
			const refuteErr = journalAppend(ctx.cwd, params.task_id, "refute", f.source + ": " + f.file + ":" + f.line);
			if (refuteErr)
				return { content: [{ type: "text", text: "Journal intent failed (fail-closed): " + refuteErr }], isError: true };
			const brief =
				"REFUTE (source-bound, single finding) -> " + params.task_id + "\n" +
				"You are bound to EXACTLY this finding; you are blind to all others.\n" +
				"Finding: source=" + f.source + " file=" + f.file + ":" + f.line + "\n  what: " + f.what + "\n\n" +
				"1. Re-read the exact source location and its context.\n" +
				"2. Refute or confirm with evidence (file:line).\n" +
				'3. Return strict JSON: {"verdict":"upheld"|"refuted","evidence":"<file:line + what>","note":"<optional>"}\n' +
				"Do not judge anything beyond this finding.";
			const payload = await dispatchPayload(ctx, "cook-refute", params.task_id, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_dispatch_audit",
		label: "cook_dispatch_audit",
		description: "Dispatch the conditional independent security auditor (cook-audit) via the native task tool.",
		parameters: Type.Object({
			task_id: Type.String(),
			scan: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		...cookToolRenderers("audit"),
		async execute(_id, params: { task_id: string; scan?: string }, _signal, _onUpdate, ctx) {
			const taskId = params.task_id.trim().toUpperCase();
			if (!taskId) {
				return {
					content: [{ type: "text", text: 'task_id is required. Usage: cook_dispatch_audit({task_id: "TASK-X"})' }],
					isError: true,
				};
			}
			const brief = [
				"AUDIT → " + taskId,
				"1. Consume supplied scanner evidence first; audit reachability and exploit paths independently.",
				"2. Inspect injection, path traversal, unsafe deserialization, secrets, dependencies, and privilege/data boundaries.",
				"3. Classify findings as BLOCKING or FOLLOW-UP with {source,file,line,what,kickTo}.",
				"4. Return an evidence-bearing pass or needs-work result; do not edit code or tests.",
				params.scan ? "\nScanner evidence: " + params.scan : "",
			].join("\n");
			const payload = await dispatchPayload(ctx, "cook-audit", taskId, brief);
			return { content: [{ type: "text", text: payload.text }], isError: !payload.ok };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_dispatch_council",
		label: "cook_dispatch_council",
		description: "Dispatch the three mutually blind convergence-council inquiry lanes as one parallel native task batch.",
		parameters: Type.Object({ task_id: Type.String() }) as unknown as TSchema,
		async execute(_id, params: { task_id: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const taskId = params.task_id.trim().toUpperCase();
			const episode = sc.getStoreFor(ctx.cwd).councilEpisodes?.[taskId];
			if (!taskId || episode?.status !== "pending")
				return { content: [{ type: "text", text: "A pending council episode is required." }], isError: true };
			const lanes = ["integrity", "security", "pragmatist"] as const;
			const briefs = lanes.map(
				(lane) =>
					`COUNCIL INQUIRY (${lane}) → ${taskId}\nInvestigate exactly this finding from the ${lane} lane, blind to other council inquiries:\n${JSON.stringify(episode.finding)}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes.`,
			);
			const inquiryStages: string[] = [];
			for (const [index] of lanes.entries()) {
				const payload = await dispatchPayload(
					ctx,
					"cook-council",
					taskId,
					briefs[index]!,
					`dispatch:council:${lanes[index]}`,
				);
				if (!payload.ok)
					return { content: [{ type: "text", text: payload.text }], isError: true };
				if (payload.stage) inquiryStages.push(payload.stage);
			}
			const cs = sc.getStoreFor(ctx.cwd);
			sc.setStoreFor(ctx.cwd, {
				...cs,
				councilEpisodes: {
					...cs.councilEpisodes,
					[taskId]: { ...episode, status: "inquiries-dispatched", inquiryStages },
				},
			});
			await pushDagr(ctx);
			return {
				content: [{
					type: "text",
					text:
						"PARALLEL COUNCIL BATCH (execute this exact native call, then call cook_dispatch_council_synthesis):\n" +
						`task(${JSON.stringify({
							context: `# Goal\nRun three mutually blind council inquiries for ${taskId}.\n# Constraints\nRead-only; no cross-lane coordination.\n# Contract\nReturn one evidence-bearing vote per lane.`,
							tasks: lanes.map((lane, index) => ({
								name: `Council${lane[0]!.toUpperCase()}${lane.slice(1)}`,
								agent: "cook-council",
								task: briefs[index],
							})),
						})})`,
				}],
			};
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_dispatch_council_synthesis",
		label: "cook_dispatch_council_synthesis",
		description: "Dispatch the council synthesis specialist after three mutually blind inquiry votes.",
		parameters: Type.Object({
			task_id: Type.String(),
			votes: Type.Array(Type.String(), { minItems: 3, maxItems: 3 }),
		}) as unknown as TSchema,
		async execute(_id, params: { task_id: string; votes: string[] }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const taskId = params.task_id.trim().toUpperCase();
			const episode = sc.getStoreFor(ctx.cwd).councilEpisodes?.[taskId];
			if (
				episode?.status !== "inquiries-dispatched" ||
				!Array.isArray(params.votes) ||
				params.votes.length !== 3 ||
				params.votes.some((vote) => typeof vote !== "string" || !vote.trim())
			)
				return { content: [{ type: "text", text: "Exactly three non-empty inquiry votes are required after council dispatch." }], isError: true };
			if (episode.votes && episode.votes.some((vote, index) => vote !== params.votes[index]?.trim()))
				return { content: [{ type: "text", text: "Council votes differ from the already recorded inquiry receipts." }], isError: true };
			try {
				if (!episode.votes) {
					for (const [index, vote] of params.votes.entries()) {
						appendRecord(
							ctx.cwd,
							taskId,
							episode.inquiryStages?.[index] ?? `dispatch:council:${["integrity", "security", "pragmatist"][index]}`,
							JSON.stringify({ outcome: "success", lane: ["integrity", "security", "pragmatist"][index], vote: vote.trim() }),
						);
					}
					const voteState = sc.getStoreFor(ctx.cwd);
					sc.setStoreFor(ctx.cwd, {
						...voteState,
						councilEpisodes: {
							...voteState.councilEpisodes,
							[taskId]: { ...episode, votes: params.votes.map((vote) => vote.trim()) },
						},
					});
				}
			} catch (error) {
				return { content: [{ type: "text", text: `Council vote record failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }], isError: true };
			}
			const payload = await dispatchPayload(
				ctx,
				"cook-council-synthesis",
				taskId,
				`COUNCIL SYNTHESIS → ${taskId}\nFinding: ${JSON.stringify(episode.finding)}\nSelect one typed recovery route (plan, implement, or verify) for the exact finding union. Preserve source lineage and explain the evidence threshold.\nVotes:\n${params.votes.map((vote, index) => `${index + 1}. ${vote}`).join("\n")}`,
			);
			if (!payload.ok)
				return { content: [{ type: "text", text: payload.text }], isError: true };
			const cs = sc.getStoreFor(ctx.cwd);
			sc.setStoreFor(ctx.cwd, {
				...cs,
				councilEpisodes: {
					...cs.councilEpisodes,
					[taskId]: {
						...episode,
						status: "synthesis-dispatched",
						votes: params.votes.map((vote) => vote.trim()),
						...(payload.stage ? { synthesisStage: payload.stage } : {}),
					},
				},
			});
			await pushDagr(ctx);
			return { content: [{ type: "text", text: payload.text }] };
		},
	});

	pi.registerTool<TSchema>({
		name: "cook_record_council",
		label: "cook_record_council",
		description: "Record council synthesis and apply its single typed recovery route.",
		parameters: Type.Object({
			task_id: Type.String(),
			route: Type.Union([Type.Literal("plan"), Type.Literal("implement"), Type.Literal("verify")]),
			receipt: Type.String(),
		}) as unknown as TSchema,
		async execute(_id, params: { task_id: string; route: "plan" | "implement" | "verify"; receipt: string }, _signal, _onUpdate, ctx) {
			bindContext(ctx);
			const taskId = params.task_id.trim().toUpperCase();
			const receipt = params.receipt.trim();
			const cs = sc.getStoreFor(ctx.cwd);
			const episode = cs.councilEpisodes?.[taskId];
			const routeIndex = cs.chain.indexOf(params.route);
			if (!taskId || !receipt || episode?.status !== "synthesis-dispatched" || routeIndex < 0)
				return { content: [{ type: "text", text: "A synthesized pending council and an active recovery route are required." }], isError: true };
			try {
				appendRecord(ctx.cwd, taskId, "council:synthesis", JSON.stringify({ outcome: "success", route: params.route, receipt }));
				const synthesisDispatch = [...cs.agentLog]
					.reverse()
					.find((entry) => entry.taskId.toUpperCase() === taskId.toUpperCase() && entry.role === "council-synthesis");
				if (synthesisDispatch)
					appendRecord(ctx.cwd, taskId, synthesisDispatch.stage, JSON.stringify({ outcome: "success", route: params.route, receipt }));
				appendIntent(ctx.cwd, taskId, params.route, `Fresh ${params.route} result required after council synthesis.`);
			} catch (error) {
				return { content: [{ type: "text", text: `Council record failed (fail-closed): ${error instanceof Error ? error.message : String(error)}` }], isError: true };
			}
			sc.setStoreFor(ctx.cwd, {
				...cs,
				currentStage: routeIndex,
				councilEpisodes: {
					...cs.councilEpisodes,
					[taskId]: { ...episode, status: "completed" },
				},
			});
			await pushDagr(ctx);
			return { content: [{ type: "text", text: `Council completed; ${taskId} routed to ${params.route}.` }] };
		},
	});

pi.registerCommand("cook", {
		description:
			"Cook workflow. /cook enters cookmode; /cook start|stop|status controls watch mode; /cook <desc> starts a workflow; /cook off exits cookmode.",
		async handler(input, ctx) {
			bindContext(ctx);
			const arg: string = typeof input === "string" ? input.trim() : "";

			// Bare /cook → toggle cookmode on (skill-style: the host agent becomes
			// the cook orchestrator for subsequent turns until /cook off).
			if (!arg) {
				const s = sc.getStore();
				if (s.cookmode) {
					notify(ctx,
						"Cookmode is already on. Run /cook off to exit, or /cook <description> to start a workflow.",
						"info",
					);
					return;
				}
				sc.setStore({ ...s, cookmode: true });
				notify(ctx,
					"Cookmode ON. The host agent will drive the cook workflow for your next message. Run /cook off to exit.",
					"info",
				);
				return;
			}

			const sub = arg.split(" ")[0].toLowerCase();

			switch (sub) {
				case "off": {
					const s = sc.getStore();
					if (!s.cookmode) {
						notify(ctx, "Cookmode is already off.", "info");
						return;
					}
					sc.setStore({ ...s, cookmode: false });
					notify(ctx,
						"Cookmode OFF. Normal host-agent behavior restored.",
						"info",
					);
					return;
				}
				case "on": {
					const s = sc.getStore();
					if (s.cookmode) {
						notify(ctx, "Cookmode is already on.", "info");
						return;
					}
					sc.setStore({ ...s, cookmode: true });
					notify(ctx, "Cookmode ON. Run /cook off to exit.", "info");
					return;
				}
				case "config": {
					const scopeArg = arg.split(/\s+/)[1]?.toLowerCase();
					const requestedScope =
						scopeArg === "personal" || scopeArg === "global" || scopeArg === "project"
							? (scopeArg as "project" | "personal" | "global")
							: undefined;
					if (!ctx.hasUI || typeof ctx.ui?.select !== "function") {
						const headless = resolveCookConfig(ctx.cwd, requestedScope);
						notify(ctx,
							`Cook config (write scope: ${headless.writeScope} → ${headless.writeDirectory}; interactive save unavailable):\n${ROLES.map((r) => {
								const source = headless.sources[r];
								return `  ${r}: ${formatModelForContext(ctx, headless.config[r])} [scope: ${source?.scope ?? "default"}]`;
							}).join("\n")}`,
							"info",
						);
						return;
					}
					const c = await runModelConfigWizard(ctx, ctx.cwd, requestedScope);
					const after = resolveCookConfig(ctx.cwd, requestedScope);
					notify(ctx,
						`Updated config (write scope: ${after.writeScope} → ${after.writeDirectory}):\n${ROLES.map((r) => {
							const source = after.sources[r];
							return `  ${r}: ${formatModelForContext(ctx, c[r])} [scope: ${source?.scope ?? "default"}]`;
						}).join("\n")}`,
						"info",
					);
					return;
				}
				case "install": {
					const scope = arg.replace(/^install\s*/, "").trim() as
						| "project"
						| "personal";
					const installed = await installCookAgents(
						ctx.cwd,
						scope === "project" ? "project" : "personal",
					);
					const loc =
						scope === "project" ? ".omp/agents/" : `${ompHome()}/agents/`;
					notify(ctx,
						`Installed ${installed.length} agents to ${loc}:\n${installed.map((a) => `  • ${a}`).join("\n")}\nActive on next turn or /reload-plugins.`,
						"info",
					);
					return;
				}
				case "status": {
					const s = sc.getStore();
					const watchState = s.watch?.enabled
						? `Watch is ON (trigger: ${s.watch.trigger}). /cook stop to disable.`
						: "Watch is OFF. /cook start to enable.";
					const custom = (ctx.ui as unknown as { custom?: unknown }).custom;
					if (!ctx.hasUI || typeof custom !== "function") {
						notify(ctx,
							`Cookmode: ${s.cookmode ? "ON" : "OFF"}.\n${watchState}`,
							"info",
						);
						return;
					}
					let tasks;
					try {
						tasks = await getAllTasks(pi, ctx.cwd);
					} catch {
						tasks = undefined;
					}
					try {
						const result = await ctx.ui.custom<CookDagOverlayResult | undefined>((tui, _theme, keybindings, done) =>
							new CookDagOverlay({
								state: s,
								tasks,
								counts: tasks ? widgetCountsFor(s, tasks) : undefined,
								onClaim: () => claimNext(ctx),
							}, tui, keybindings, done),
							{
								overlay: true,
								overlayOptions: {
									anchor: "bottom-center",
									width: "100%",
									maxHeight: "80%",
									margin: { top: 1, bottom: 1, left: 1, right: 1 },
								},
							});
						if (result?.action === "error") notify(ctx, `Cook status claim failed: ${result.error}`, "error");
					} catch (error) {
						notify(ctx, `Cook status overlay unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning");
					}
					return;
				}
				case "propose":
				case "validate":
				case "ready":
				case "all": {
					// These are tool-driven; nudge the agent to run the matching tool.
					pi.sendUserMessage(`Run the cook_${sub} tool now.`);
					return;
				}
				case "start": {
					const description = arg.substring(5).trim();
					if (!description) {
						// No description → start watch; requires an active chain.
						const s = sc.getStore();
						if (!s.chain.length) {
							notify(ctx,
								"No workflow chain to watch. Run cook_start to begin a workflow first.",
								"info",
							);
							return;
						}
						sc.setStore({ ...s, watch: { ...s.watch, enabled: true } });
						notify(ctx,
							"Watch started. File changes will trigger the cook workflow.",
							"info",
						);
						return;
					}
					pi.sendUserMessage(cookKickoffMessage(description));
					return;
				}
				case "stop": {
					const s = sc.getStore();
					if (!s.watch?.enabled) {
						notify(ctx, "Watch is already off.", "info");
						return;
					}
					sc.setStore({ ...s, watch: { ...s.watch, enabled: false } });
					notify(ctx,
						"Watch stopped. File changes will no longer trigger the cook workflow.",
						"info",
					);
					return;
				}
				default: {
					// Not a subcommand — treat the whole arg as a workflow description and
					// kick off the cook loop as a real turn via sendUserMessage. This is
					// the skill-equivalent path: the host agent receives the protocol +
					// the order and drives the brigade itself.
					pi.sendUserMessage(cookKickoffMessage(arg));
					return;
				}
			}
		},
	});
	return { refreshDagr: pushDagr };
}
