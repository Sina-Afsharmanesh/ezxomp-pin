import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	AutocompleteItem,
	AutocompleteProvider,
} from "@oh-my-pi/pi-tui";
import { Text } from "@oh-my-pi/pi-tui";
import type {
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import type { TSchema } from "@oh-my-pi/pi-ai";
import { containsWorkflow } from "@oh-my-pi/pi-coding-agent/modes/workflow";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hostCenteredOverlay } from "@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts";
import {
	MAX_RUN_STRIP_LINES,
	RUN_POLL_MS,
	WorkflowLibraryOverlay,
	WorkflowRoutePreviewOverlay,
	WorkflowRunOverlay,
	backingLabel,
	buildRunSnapshot,
	buildRunSummary,
	listGateCatalog,
	listRunSummaries,
	parseRouteRequest,
	routePreviewLines,
	runStripLines,
	workflowStatusLine,
	type RoutePreviewModel,
	type RunSnapshot,
} from "./workflow-overlay.js";
import { registerP0Tools } from "./p0-tools.js";
import {
	builtinTemplates,
	gateContentHash,
	globalGatesDir,
	projectGatesDir,
	validateGateFile,
	type GateFileV1,
} from "./templates.js";
import {
	listWorkflowDefinitions,
	resolveDefinitionInputs,
	resolveWorkflowDefinition,
	renderWorkflowDefinition,
	saveWorkflowDefinition,
	createRun,
	contentHash,
	countActiveRuns,
	countTemplateGates,
	governanceFromCreated,
	buildRoutePlan,
	readRunEvents,
	journalMirrorRefs,
	buildRunMirror,
	reconstructRunMirrors,
	reconstructCheckpointsFromBranch,
	reserveRunLaunch,
	DEFAULT_RUN_BUDGET,
	type WorkflowBudgetConfig,
	runStatus,
	applyWorkflowActivity,
	workflowActivityState,
	type EffectiveScope,
	aggregateRunStatistics,
	isTerminalRunStatus,
	isWorkflowV2,
	stopRun,
	type RunMirror,
	type WorkflowDefinition,
} from "./runtime.js";

const MAX_CATALOG_ENTRIES = 12;
const MAX_CATALOG_NOTICE_BYTES = 8 * 1024;
/** Runtime tools the catalog notice depends on; without them the rendered
 *  workflows cannot execute, so injecting a notice would mislead the agent. */
const REQUIRED_RUNTIME_TOOLS = ["eval", "task"] as const;
// kiss: mirrors runtime.ts RUN_ID_RE (private there); runtime.ts is outside this ticket's ownership.
const WORKFLOW_RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Whether getAllTools() evidences every required runtime tool. Hosts without
 *  the method (legacy probes) are given the pre-hardening behavior. */
function hasRequiredRuntimeTools(pi: ExtensionAPI): boolean {
	if (typeof pi.getAllTools !== "function") return true;
	const available = new Set(pi.getAllTools().map(tool => tool.name));
	return REQUIRED_RUNTIME_TOOLS.every(name => available.has(name));
}

/** UTF-8 byte length of a notice line block, capped at MAX bytes: drop whole
 *  trailing entries first, then boundary-safe truncate (never splits a char). */
export function capNoticeBytes(lines: string[], maxBytes: number): string {
	let text = lines.join("\n");
	while (text.length > 0 && Buffer.byteLength(text, "utf8") > maxBytes && lines.length > 2) {
		lines = lines.slice(0, -1);
		text = lines.join("\n");
	}
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	const bytes = Buffer.from(text, "utf8");
	// Cut at the last complete UTF-8 code point that fits: never emit a
	// replacement char, never drop a complete trailing character.
	const limit = Math.min(maxBytes, bytes.length);
	// Walk back to the lead byte of the character containing the cut point.
	let start = limit - 1;
	while (start > 0 && (bytes[start]! & 0xc0) === 0x80) start--;
	let end = limit;
	if ((bytes[start]! & 0xc0) !== 0x80) {
		const lead = bytes[start]!;
		const need = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4;
		if (start + need > limit) end = start; // incomplete final sequence: drop it
	} else {
		end = 0; // malformed input begins mid-sequence: emit nothing rather than mojibake
	}
	return bytes.subarray(0, end).toString("utf8");
}

type WorkflowScope = "global" | "project";

export interface WorkflowLibraryDependencies {
	list?: typeof listWorkflowDefinitions;
	resolve?: typeof resolveWorkflowDefinition;
	listWorkflows?: (cwd: string, scope: EffectiveScope) => { scope: EffectiveScope; workflows: Array<{ name: string; description: string; scope: "global" | "project"; path: string; schemaVersion?: number }>; diagnostics: Array<{ path: string; code?: string; message: string }> };
	resolveWorkflow?: (name: string, cwd: string, scope: EffectiveScope) => { workflow?: WorkflowDefinition; path?: string; scope?: "global" | "project"; error?: { details: { message: string } } };
}

/** Journal-derived Runs-tab data for the library overlay. The journal is the
 *  execution authority; session snapshots never substitute for it. */
function runsTabData(cwd: string): { runs: ReturnType<typeof listRunSummaries>; statistics: ReturnType<typeof aggregateRunStatistics> } {
	const summaries = listRunSummaries(cwd);
	const statistics = aggregateRunStatistics(cwd, summaries.map(summary => summary.runId));
	return { runs: summaries, statistics };
}

/** Launch a recipe by name through the documented sendUserMessage seam. The
 *  agent receives the same /workflows request a user could type; no tool runs
 *  and nothing executes without the normal turn-level approvals. */
function launchRecipe(ctx: ExtensionContext, pi: ExtensionAPI | undefined, name: string): void {
	const prompt = name.trim().length === 0 ? "" : /^\s*(run|chain)\b/.test(name) ? `/workflows ${name}` : `/workflows run ${name}`;
	try {
		if (typeof pi?.sendUserMessage === "function") {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			ctx.ui.notify(`Launching workflow — sent "${prompt}" to the agent`, "info");
		} else {
			ctx.ui.notify(`Launch is not wired on this host; run ${prompt} manually.`, "warning");
		}
	} catch {
		// launch delivery must never break the overlay
	}
}

export async function openWorkflowLibrary(ctx: ExtensionCommandContext, dependencies: WorkflowLibraryDependencies = {}, pi?: ExtensionAPI): Promise<void> {
	const legacyList = dependencies.listWorkflows?.(ctx.cwd, "effective");
	const result = legacyList ? { scope: legacyList.scope, workflows: legacyList.workflows.map(workflow => ({ ...workflow, schemaVersion: workflow.schemaVersion ?? 1 })), diagnostics: legacyList.diagnostics.map(diagnostic => ({ path: diagnostic.path, code: diagnostic.code ?? "WORKFLOW_INVALID", message: diagnostic.message })) } : (dependencies.list ?? listWorkflowDefinitions)(ctx.cwd, "effective");
	const resolveWorkflow = dependencies.resolve ?? dependencies.resolveWorkflow ?? resolveWorkflowDefinition;
	if (!ctx.hasUI) {
		const lines = result.workflows.length === 0
			? ["Saved Workflow Recipes:", "  (none)"]
			: ["Saved Workflow Recipes:", ...result.workflows.map(workflow => `  ${workflow.name} [${workflow.scope}] — ${workflow.description}`)];
		const { statistics } = runsTabData(ctx.cwd);
		lines.push(
			"",
			`Total runs: ${statistics.total}`,
			`Route plans: ${statistics.routePlans}`,
			`Chain completions: ${statistics.chainCompletions}`,
			`Gate failures: ${statistics.gateFailures}`,
			`Missing-tool failures: ${statistics.missingToolFailures}`,
			`Approved checkpoints: ${statistics.checkpointOutcomes.approved}`,
			`Rejected checkpoints: ${statistics.checkpointOutcomes.rejected}`,
		);
		if (result.diagnostics.length > 0) {
			lines.push("", "Diagnostics:", ...result.diagnostics.map(diagnostic => `  ${diagnostic.path}: ${diagnostic.message}`));
		}
		ctx.ui.notify(lines.join("\n"), "info");
		return;
	}
	const tabData = runsTabData(ctx.cwd);
	await hostCenteredOverlay(ctx, (tui, _theme, done) => new WorkflowLibraryOverlay({
		result,
		resolveWorkflow: name => {
			const resolved = resolveWorkflow(name, ctx.cwd, "effective");
			if (resolved.error) return { error: { details: { message: resolved.error.details.message } } };
			return resolved.workflow ? { workflow: resolved.workflow } : {};
		},
		templates: builtinTemplates,
		gates: listGateCatalog(ctx.cwd),
		runs: tabData.runs,
		statistics: tabData.statistics,
		onLaunch: name => launchRecipe(ctx, pi, name),
	}, tui, () => done(undefined)));
}

function okResult(content: string, details: unknown) {
	return { content: [{ type: "text" as const, text: content }], details };
}

function errorResult(content: string, details: unknown) {
	return { content: [{ type: "text" as const, text: content }], isError: true, details };
}

function buildCatalogNotice(cwd: string): string {
	const result = listWorkflowDefinitions(cwd, "effective");
	if (result.workflows.length === 0) return "";
	const entries = result.workflows.slice(0, MAX_CATALOG_ENTRIES).map(workflow => `- ${workflow.name}: ${workflow.description}`);
	const templateGates = result.workflows.reduce((sum, meta) => {
		const resolved = resolveWorkflowDefinition(meta.name, cwd, "effective");
		return sum + (resolved.workflow ? countTemplateGates(resolved.workflow) : 0);
	}, 0);
	const activeRuns = countActiveRuns(cwd);
	const counts = [`Template gates: ${templateGates}`, `Active runs: ${activeRuns}`];
	return capNoticeBytes([
		"Workflow recipes are available through the workflowz extension.",
		"Use the workflow tools or /workflow-library to inspect a recipe before rendering it.",
		...counts,
		...entries,
	], MAX_CATALOG_NOTICE_BYTES);
}


// ── /workflows argument completion: quote-aware full-prefix grammar ─────────

/** Split a typed prefix into the preserved base and the trailing partial token.
 *  Whitespace outside quotes ends a token; a prefix ending in unquoted space
 *  completes a token (empty partial). Entered text is never dropped. */
function splitCompletionToken(prefix: string): { base: string; partial: string } {
	let inQuote: string | null = null;
	let tokenStart = 0;
	for (let index = 0; index < prefix.length; index++) {
		const char = prefix[index]!;
		if (inQuote) {
			if (char === inQuote) inQuote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			inQuote = char;
			continue;
		}
		if (/\s/.test(char)) {
			tokenStart = index + 1;
		}
	}
	if (tokenStart >= prefix.length) return { base: prefix, partial: "" };
	return { base: prefix.slice(0, tokenStart), partial: prefix.slice(tokenStart) };
}

/** Render a completed token: quote only when the value contains whitespace. */
function renderCompletionToken(value: string): string {
	return /\s/.test(value) ? `"${value}"` : value;
}

interface CompletionCandidate {
	value: string;
	label: string;
	description?: string;
	hint?: string;
}

function completionItem(prefixBase: string, candidate: CompletionCandidate): AutocompleteItem {
	const item: AutocompleteItem = { value: `${prefixBase}${candidate.value} `, label: candidate.label };
	if (candidate.description !== undefined) item.description = candidate.description;
	if (candidate.hint !== undefined) item.hint = candidate.hint;
	return item;
}

function listRecipeNames(cwd: string): Array<{ name: string; description: string }> {
	return listWorkflowDefinitions(cwd, "effective").workflows.map(workflow => ({ name: workflow.name, description: workflow.description }));
}

function listRunIds(cwd: string): string[] {
	const root = join(cwd, ".omp", "workflows", "runs");
	if (!existsSync(root)) return [];
	try {
		return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && WORKFLOW_RUN_ID_RE.test(entry.name)).map(entry => entry.name);
	} catch {
		return [];
	}
}

/** Read-only GateFile catalog: id + trust state + prerequisite readiness
 *  (hash integrity and scope-appropriate reusability). Never mutates gates. */
function listGateCandidates(cwd: string): Array<Required<Pick<CompletionCandidate, "value" | "label" | "description">> & { hint: string }> {
	const scopes = [["project", projectGatesDir(cwd)], ["global", globalGatesDir()]] as const;
	const candidates: Array<{ value: string; label: string; description: string; hint: string }> = [];
	for (const [scope, dir] of scopes) {
		if (!existsSync(dir)) continue;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
			const id = entry.name.slice(0, -".json".length);
			if (candidates.some(candidate => candidate.label === id)) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(readFileSync(join(dir, entry.name), "utf8"));
			} catch {
				continue;
			}
			if (validateGateFile(parsed) !== null) continue;
			const gate = parsed as GateFileV1;
			const hashOk = gate.contentHash === gateContentHash(gate);
			const reusableTrust = gate.trust === "approved" || gate.trust === "safe";
			const ready = hashOk && reusableTrust;
			candidates.push({
				value: renderCompletionToken(id),
				label: id,
				description: `gate · trust: ${gate.trust}`,
				hint: ready ? "prerequisites ready" : "prerequisites unverified",
			});
		}
	}
	return candidates;
}

const LIST_SURFACES = ["recipes", "gates"] as const;

function describeRecipe(name: string, cwd: string): string {
	return resolveWorkflowDefinition(name, cwd, "effective").workflow?.description ?? name;
}

/** A partial token with its opening quote removed (quote is replaced syntax). */
function strippedPartial(partial: string): string {
	return partial.replace(/^["']/, "");
}

/** Preserved base for a partial token: an opening quote on the partial is
 *  replaced syntax, so it is dropped from the preserved base too. */
function tokenBase(base: string, partial: string): string {
	return /^["']/.test(partial) && (base.endsWith("\"") || base.endsWith("'")) ? base.slice(0, -1) : base;
}

/** Recipe candidates replacing the typed partial; quoted candidates are
 *  rendered with balanced quotes around names containing whitespace. */
function completeRecipeToken(cwd: string, base: string, partial: string): AutocompleteItem[] {
	const typed = strippedPartial(partial).toLowerCase();
	const quote = /^["']/.test(partial) ? partial[0]! : "";
	const render = (name: string) => (quote ? `${quote}${name}${quote}` : renderCompletionToken(name));
	return listRecipeNames(cwd).filter(recipe => recipe.name.toLowerCase().startsWith(typed)).map(recipe =>
		completionItem(tokenBase(base, partial), { value: render(recipe.name), label: recipe.name, description: recipe.description }));
}

/** Resolve /workflows argument completions for the typed prefix. Values carry
 *  the full entered prefix plus a trailing space; quoted tokens survive. */
function workflowCompletions(argumentPrefix: string): AutocompleteItem[] {
	const prefix = argumentPrefix ?? "";
	const trimmed = prefix.trim();
	const cwd = process.cwd();
	const { base, partial } = splitCompletionToken(prefix);
	const appendBase = prefix.length === 0 || /\s$/.test(prefix) ? prefix : base;
	const verbMatch = /^(run|chain|create|list|status|resume|retry|stop)\b/.exec(trimmed);

	// No verb yet (or still typing one): suggest root verbs.
	if (!verbMatch) {
		const verbs = ["run", "chain", "create", "list", "status", "resume", "retry", "stop"];
		const typed = trimmed.split(/\s+/)[0] ?? trimmed;
		return verbs.filter(verb => verb.startsWith(typed.toLowerCase())).map(verb => completionItem("", { value: verb, label: verb, description: verb === "create" ? "author a new recipe from a prompt" : "/workflows subcommand" }));
	}
	const verb = verbMatch[1]!;
	const rest = trimmed.slice(verb.length);
	if (/^\s*$/.test(rest)) {
		// Verb fully typed, argument not started.
		if (verb === "chain") return [];
		if (verb === "create") return [];
		if (verb === "list") return LIST_SURFACES.map(surface => completionItem(appendBase, { value: surface, label: surface, description: `list surface` }));
		if (verb === "run") return listRecipeNames(cwd).map(recipe => completionItem(appendBase, { value: recipe.name, label: recipe.name, description: recipe.description }));
		return listRunIds(cwd).map(runId => completionItem(appendBase, { value: runId, label: runId, description: "workflow run id" }));
	}
	if (verb === "create") {
		// Free-form prompt after `create`: nothing to complete.
		return [];
	}
	if (verb === "chain") {
		// Complete the segment after the last top-level "->"; without one, the
		// trailing token is the first chain link. Entered text is preserved.
		// Quoted spans never contain a separator ("a -> b" is one link name).
		let activeQuote: string | null = null;
		let lastSeparator = -1;
		for (let index = 0; index < rest.length; index++) {
			const char = rest[index]!;
			if (activeQuote) {
				if (char === activeQuote) activeQuote = null;
				continue;
			}
			if (char === '"' || char === "'") {
				activeQuote = char;
				continue;
			}
			if (char === "-" && rest[index + 1] === ">") lastSeparator = index;
		}
		const segment = lastSeparator === -1 ? rest : rest.slice(lastSeparator + 2);
		const segmentToken = splitCompletionToken(segment);
		const linkPartial = segmentToken.partial;
		const typedLink = strippedPartial(linkPartial).toLowerCase();
		const chainBase = tokenBase(prefix.slice(0, prefix.length - linkPartial.length), linkPartial);
		return listRecipeNames(cwd).filter(recipe => recipe.name.toLowerCase().startsWith(typedLink)).map(recipe => completionItem(chainBase, { value: recipe.name, label: recipe.name, description: describeRecipe(recipe.name, cwd) }));
	}
	if (verb === "list") {
		const surfacePartial = rest.trim().toLowerCase();
		if (surfacePartial === "gates" && partial === "") {
			// Gates surface fully typed with the cursor appending: list gate ids.
			return listGateCandidates(cwd).map(gate => completionItem(appendBase, gate));
		}
		return LIST_SURFACES.filter(surface => surface.startsWith(surfacePartial)).map(surface => completionItem(appendBase, { value: surface, label: surface, description: "list surface" }));
	}
	if (verb === "run") {
		return completeRecipeToken(cwd, base, partial);
	}
	// status | resume | retry | stop take run ids.
	return listRunIds(cwd).filter(runId => runId.startsWith(strippedPartial(partial))).map(runId => completionItem(tokenBase(base, partial), { value: runId, label: runId, description: "workflow run id" }));
}

function isWorkflowzEnabled(): boolean {
	try {
		const enabled = settings.get("magicKeywords.enabled");
		const workflow = settings.get("magicKeywords.workflow");
		return enabled === true && String(workflow) === "workflowz";
	} catch {
		return false;
	}
}

/** Append a namespaced session mirror for a run and reflect its activity in
 *  the terminal title and working message. Only workflow-owned signals are
 *  written; terminal states clear only what workflowz set. The journal remains
 *  the authority and supplies route/checkpoint/journal/artifact pointers. */
function mirrorRun(pi: ExtensionAPI, ctx: ExtensionContext, runId: string, workflow: string, status: string, stageId?: string): void {
	const refs = journalMirrorRefs(ctx.cwd, runId);
	const mirror: RunMirror = { runId, workflow, status, ...(stageId ? { stageId } : {}), ...refs, timestamp: new Date().toISOString() };
	pi.appendEntry("ezxomp.workflowz.mirror", mirror);
	if (status === "running") sendLifecycleCard(pi, "ezxomp.workflowz.started", { runId, workflow, ...(stageId !== undefined ? { stageId } : {}) });
	if (isTerminalRunStatus(status)) {
		if (status === "completed") sendLifecycleCard(pi, "ezxomp.workflowz.completed", { runId, workflow });
		else sendLifecycleCard(pi, "ezxomp.workflowz.failed", { runId, workflow, reason: status });
		ctx.ui.notify(status === "completed" ? `Workflow "${workflow}" (${runId.slice(0, 8)}) completed.` : `Workflow "${workflow}" (${runId.slice(0, 8)}) ${status}.`, status === "completed" ? "info" : "warning");
	}
	if (ctx.hasUI) {
		applyWorkflowActivity(ctx.ui, workflowActivityState, runId, workflow, status, stageId);
		refreshLiveSurfaces(ctx);
	}
}

/** Reconstruct namespaced mirrors from the session branch on start/tree/switch
 *  and reconcile each against the authoritative journal. Journal status and
 *  journal-derived pointers win; a snapshot is never treated as execution
 *  proof. */
function reconcileSessionMirrors(pi: ExtensionAPI, ctx: ExtensionContext): void {
	try {
		const branch = ctx.sessionManager.getBranch();
		const entries = branch as unknown as Array<{ type?: string; customType?: string; timestamp?: string; data?: unknown }>;
		// AC16/design §3C: reconstruct the latest namespaced checkpoint approvals
		// from the current session branch and restore their run activity state.
		for (const checkpoint of reconstructCheckpointsFromBranch(entries)) {
			if (!ctx.hasUI) continue;
			if (checkpoint.status !== "approved") continue;
			applyWorkflowActivity(ctx.ui, workflowActivityState, checkpoint.runId, checkpoint.workflow ?? "workflow", "running", checkpoint.stageId);
		}
		const mirrors = reconstructRunMirrors(entries);
		for (const mirror of mirrors) {
			// The journal is the only execution authority: refresh the mirror's
			// status and route/checkpoint/journal/artifact pointers from it so
			// the namespaced session entry is never a stale snapshot.
			const authoritative = buildRunMirror(ctx.cwd, mirror.runId);
			if (authoritative) {
				pi.appendEntry("ezxomp.workflowz.mirror", authoritative);
				if (ctx.hasUI) applyWorkflowActivity(ctx.ui, workflowActivityState, authoritative.runId, authoritative.workflow, authoritative.status, authoritative.stageId);
				continue;
			}
			// No journal: keep the recorded mirror status and pointers.
			if (ctx.hasUI) applyWorkflowActivity(ctx.ui, workflowActivityState, mirror.runId, mirror.workflow, mirror.status, mirror.stageId);
		}
	} catch {
		// session reconstruction must never break the extension
	}
}


// ── Session autocomplete provider: one wrapper per UI object ────────────────

/** Wrap the host autocomplete provider so /workflows argument grammar is
 *  offered inside the editor; every other input delegates to `current`
 *  unchanged (non-workflow fallback behavior preserved). */
function createWorkflowAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol) {
			const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
			const commandMatch = /^\/workflows[ \t](.*)$/s.exec(textBeforeCursor);
			if (commandMatch) {
				const items = workflowCompletions(commandMatch[1] ?? "");
				if (items.length > 0) return { items, prefix: commandMatch[1] ?? "" };
			}
			return current.getSuggestions(lines, cursorLine, cursorCol);
		},
		applyCompletion: (lines, cursorLine, cursorCol, item, prefix) => current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
	};
}

/** Registers the workflowz autocomplete provider at most once per UI object;
 *  repeated session events for the same UI must not stack wrappers. */
const providerRegisteredUIs = new WeakMap<object, boolean>();

function registerWorkflowAutocompleteProvider(ctx: ExtensionContext): void {
	if (!ctx.hasUI || typeof ctx.ui.addAutocompleteProvider !== "function") return;
	const ui: object = ctx.ui;
	if (providerRegisteredUIs.get(ui)) return;
	ctx.ui.addAutocompleteProvider(createWorkflowAutocompleteProvider);
	providerRegisteredUIs.set(ui, true);
}

// ── TASK-15.4 live surfaces: widget, status line, run inspector, lifecycle cards, shortcuts ──

const WORKFLOWZ_STATUS_KEY = "workflowz";
const RUN_STRIP_WIDGET_KEY = "workflowz-run-strip";

interface LiveRunView {
	snapshot: RunSnapshot;
	snapshotBacked: boolean;
	stageId?: string;
	gateId?: string;
	pendingCheckpoint: boolean;
}

/** Latest journal-derived view for a session's most recently mirrored active
 *  run. Journal-authoritative; the snapshot bit comes from the branch mirrors. */
function latestLiveRun(cwd: string): LiveRunView | undefined {
	const summaries = listRunSummaries(cwd);
	for (let index = summaries.length - 1; index >= 0; index--) {
		const summary = summaries[index];
		if (!summary || isTerminalRunStatus(summary.status) || summary.status === "stopped") continue;
		const snapshot = buildRunSnapshot(cwd, summary.runId);
		if (!snapshot) continue;
		const stageId = snapshot.stages.at(-1)?.id;
		const activeGate = snapshot.gates.find(gate => gate.status !== "passed");
		const gateId = activeGate?.gateId;
		const view: LiveRunView = {
			snapshot,
			snapshotBacked: false,
			pendingCheckpoint: snapshot.pendingCheckpoint,
		};
		if (stageId !== undefined) view.stageId = stageId;
		if (gateId !== undefined) view.gateId = gateId;
		return view;
	}
	return undefined;
}

/** Render the belowEditor footer strip for the active run (10-line cap). */
function runStripWidget(live: LiveRunView | undefined): string[] | undefined {
	if (!live) return undefined;
	return runStripLines(live.snapshot, live.snapshotBacked);
}

/** Per-key status text distinguishing route planning / waiting approval /
 *  active gate / completed chain. Returns undefined when the key must clear. */
function currentStatusLine(cwd: string): string | undefined {
	const live = latestLiveRun(cwd);
	if (live) {
		return workflowStatusLine({
			workflow: live.snapshot.workflow,
			status: live.snapshot.status,
			...(live.stageId !== undefined ? { stageId: live.stageId } : {}),
			...(live.gateId !== undefined ? { gateId: live.gateId } : {}),
			pendingCheckpoint: live.pendingCheckpoint,
		});
	}
	const runs = listRunSummaries(cwd);
	const last = runs.at(-1);
	if (!last || last.status !== "completed") return undefined;
	return workflowStatusLine({ workflow: last.workflow, status: "completed" });
}

/** Refresh the footer strip + status key from the journals. Never throws into
 *  the poll loop; clearing on terminal/idle keeps unrelated host state. */
function refreshLiveSurfaces(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	try {
		const strip = runStripWidget(latestLiveRun(ctx.cwd));
		ctx.ui.setWidget(RUN_STRIP_WIDGET_KEY, strip, { placement: "belowEditor" });
		const status = currentStatusLine(ctx.cwd);
		ctx.ui.setStatus(WORKFLOWZ_STATUS_KEY, status);
	} catch {
		// live-surface refresh must never break the session
	}
}

/** Open the live run inspector over a run id; polls through ctx.setInterval. */
export async function openWorkflowRunOverlay(ctx: ExtensionCommandContext, startRunId?: string): Promise<void> {
	if (!ctx.hasUI) return;
	const runIds = listRunSummaries(ctx.cwd).map(summary => summary.runId);
	if (runIds.length === 0) {
		ctx.ui.notify("No journaled workflow runs to inspect.", "info");
		return;
	}
	let cursor = startRunId !== undefined ? Math.max(0, runIds.indexOf(startRunId)) : runIds.length - 1;
	await hostCenteredOverlay(ctx, (tui, _theme, done) => {
		let timer: ReturnType<typeof ctx.setInterval> | undefined;
		// Closing the inspector must clear the journal poll; the host only hides
		// the overlay handle and never disposes components itself.
		const finish = (): void => {
			if (timer !== undefined) ctx.clearTimer(timer);
			timer = undefined;
			done(undefined);
		};
		const initial = buildRunSnapshot(ctx.cwd, runIds[cursor] ?? "");
		const overlay = new WorkflowRunOverlay(initial, {
			onStep: delta => {
				cursor = Math.min(runIds.length - 1, Math.max(0, cursor + delta));
				overlay.setSnapshot(buildRunSnapshot(ctx.cwd, runIds[cursor] ?? ""));
			},
			onStop: runId => {
				void ctx.ui.confirm("Workflow checkpoint", `Stop run ${runId.slice(0, 8)}?`).then(async approved => {
					if (!approved) return;
					try {
						stopRun(ctx.cwd, runId);
						ctx.ui.notify(`Stop requested for run ${runId.slice(0, 8)}.`, "info");
					} catch (error) {
						ctx.ui.notify(`Stop failed for run ${runId.slice(0, 8)}: ${String(error)}`, "error");
					}
				}).catch(() => {});
			},
		}, tui, finish);
		const poll = (): void => {
			if (!isTerminalRunStatus(runStatus(ctx.cwd, runIds[cursor] ?? "").status)) {
				overlay.setSnapshot(buildRunSnapshot(ctx.cwd, runIds[cursor] ?? ""));
			}
		};
		timer = ctx.setInterval(poll, RUN_POLL_MS);
		return overlay;
	});
}

/** Send a visible lifecycle card into the transcript via sendMessage. */
function sendLifecycleCard(pi: ExtensionAPI, customType: "ezxomp.workflowz.started" | "ezxomp.workflowz.completed" | "ezxomp.workflowz.failed" | "ezxomp.workflowz.checkpoint", details: Record<string, unknown>): void {
	try {
		pi.sendMessage({ customType, content: "", display: true, details }, { deliverAs: "nextTurn" });
	} catch {
		// card delivery must never break the run
	}
}

/** Build the strict preview model for an explicit route request. Reuses the
 *  existing route validation exports; nothing executes from this path. */
function buildRoutePreviewModel(ctx: ExtensionContext, request: string): RoutePreviewModel | undefined {
	const parsed = parseRouteRequest(request);
	if (!parsed) return undefined;
	const notes: string[] = [];
	// Single source of truth with omp_workflow_route (design §3A): the same
	// buildRoutePlan validation gates both the TUI preview and the tool plan.
	const mode = parsed.steps.length > 1 ? "chain" : "direct";
	const planResult = buildRoutePlan({ mode, steps: parsed.steps }, ctx.cwd);
	if (planResult.error || !planResult.plan) return undefined;
	const steps: RoutePreviewModel["steps"] = planResult.plan.steps.map(step => ({
		name: step.workflow,
		...(step.scope !== undefined ? { scope: step.scope } : {}),
		inputs: Object.entries(step.inputs ?? {}).map(([key, value]) => ({ key, value })),
		gates: step.gates.map(gate => gate.ref ?? gate.id),
	}));
	if (!isWorkflowzEnabled()) notes.push("workflowz is disabled in settings; launching will not start a workflow until enabled.");
	return {
		request,
		mode,
		steps,
		approval: planResult.plan.approval === "auto" ? "auto" : "required",
		notes,
	};
}

/** Strict route preview for `/workflows <prompt>`: shows recipes, chain order,
 *  inputs, required gates, and approval mode. Launching only sends the same
 *  /workflows text through sendUserMessage — every execution approval stays. */
async function openRoutePreview(ctx: ExtensionCommandContext, pi: ExtensionAPI, request: string): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(buildRoutePreviewModel(ctx, request)?.steps.map((step, index) => `${index + 1}. ${step.name}`).join("\n") ?? "Not a valid explicit route — use name, name -> name, or key=value inputs (free-form prompts are dispatched to authoring).", "info");
		return;
	}
	const model = buildRoutePreviewModel(ctx, request);
	if (!model) {
		ctx.ui.notify(`No strict route for "${request}" — use recipe names, "->" chains, and key=value inputs (free-form prompts are dispatched to authoring).`, "warning");
		return;
	}
	const launch = (): void => { launchRecipe(ctx, pi, model.request); };
	await hostCenteredOverlay(ctx, (tui, _theme, done) => new WorkflowRoutePreviewOverlay(model, launch, () => tui.requestRender(), () => done(undefined)));
}

/** Authoring dispatch for `/workflows create <prompt>`: compose the bundled
 *  authoring skill body into a single agent prompt and deliver it through the
 *  documented sendUserMessage seam — the same seam library launch uses. No
 *  tool runs from the command itself; the normal turn-level approvals apply
 *  to whatever the authoring turn later does (save/verify gates included). */
export async function openWorkflowAuthoring(ctx: ExtensionCommandContext, pi: ExtensionAPI | undefined, prompt: string, skillsDir?: string): Promise<void> {
	const composed = composeAuthoringPrompt(prompt, skillsDir);
	if (composed === undefined) {
		ctx.ui.notify("Authoring unavailable: the bundled omp-workflow-authoring SKILL.md could not be read.", "error");
		return;
	}
	try {
		if (typeof pi?.sendUserMessage === "function") {
			pi.sendUserMessage(composed, { deliverAs: "followUp" });
			ctx.ui.notify("Authoring workflow — sent the request to the agent with the omp-workflow-authoring runbook", "info");
		} else {
			ctx.ui.notify("Authoring is not wired on this host; the composed prompt was not delivered.", "warning");
		}
	} catch {
		// authoring delivery must never break the command
	}
}

/** Compose the authoring turn prompt: bundled SKILL.md body (frontmatter
 *  stripped) + library context + the user's request. Returns undefined when
 *  the skill body is unreadable — the caller notifies instead of silently
 *  doing nothing. */
export function composeAuthoringPrompt(prompt: string, skillsDir?: string): string | undefined {
	const body = loadAuthoringSkillBody(skillsDir);
	if (body === undefined) return undefined;
	const trimmed = prompt.trim();
	const context = authoringContextLines();
	return [
		"Create a new workflowz recipe from the following request.",
		"",
		"# omp-workflow-authoring skill",
		"",
		body,
		"",
		"# Current library",
		"",
		context,
		"",
		"# Request",
		"",
		trimmed.length > 0 ? trimmed : "Ask me what workflow to create if the request is empty; otherwise design the recipe from the request.",
	].join("\n");
}

/** Load the bundled omp-workflow-authoring SKILL.md body with YAML
 *  frontmatter stripped. Resolved relative to this module so both source
 *  installs and marketplace cache installs resolve the shipped copy. */
function loadAuthoringSkillBody(skillsDir?: string): string | undefined {
	const dir = skillsDir ?? join(import.meta.dir, "..", "skills");
	try {
		const raw = readFileSync(join(dir, "omp-workflow-authoring", "SKILL.md"), "utf8");
		return raw.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
	} catch {
		return undefined;
	}
}

/** One-line-per-recipe library snapshot for the authoring turn: names,
 *  descriptions, and builtin template names the recipe may start from. */
function authoringContextLines(): string {
	const recipes = listWorkflowDefinitions(process.cwd(), "effective").workflows;
	const lines = recipes.length > 0
		? recipes.map(recipe => `- ${recipe.name}: ${recipe.description} [${recipe.scope}]`)
		: ["- (no saved recipes yet)"];
	lines.push(`- builtin templates: ${builtinTemplates.map(template => template.name).join(", ")}`);
	return lines.join("\n");
}

/** Compact transcript lines for a lifecycle card. */
function lifecycleCardLines(customType: string, details: Record<string, unknown>): string {
	const runId = typeof details.runId === "string" ? details.runId.slice(0, 8) : "????????";
	const workflow = typeof details.workflow === "string" ? details.workflow : "workflow";
	switch (customType) {
		case "ezxomp.workflowz.started":
			return `▶ workflowz started — ${workflow} (${runId})`;
		case "ezxomp.workflowz.completed":
			return `✓ workflowz completed — ${workflow} (${runId})`;
		case "ezxomp.workflowz.failed": {
			const reason = typeof details.reason === "string" ? ` — ${details.reason}` : "";
			return `✗ workflowz failed — ${workflow} (${runId})${reason}`;
		}
		default: {
			const status = typeof details.status === "string" ? details.status : "pending";
			return `⏸ workflowz checkpoint ${status} — ${workflow} (${runId})`;
		}
	}
}

export default function extensibleWorkflows(pi: ExtensionAPI): void {
	registerP0Tools(pi);

	pi.registerTool<TSchema>({
		name: "omp_workflow_list",
		label: "List Workflow Recipes",
		description: "List validated workflow recipes by scope without executing them.",
		parameters: pi.zod.object({ scope: pi.zod.enum(["effective", "global", "project"]).optional() }),
		async execute(_toolCallId: string, params: { scope?: EffectiveScope }, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
			const scope = params.scope ?? "effective";
			const result = listWorkflowDefinitions(ctx.cwd, scope);
			let content = result.workflows.length === 0 ? `No workflows found (scope: ${scope}).` : `Workflows (${scope}):\n${result.workflows.map(workflow => `  ${workflow.name} — ${workflow.description} [${workflow.scope}]`).join("\n")}`;
			if (result.diagnostics.length > 0) content += `\n\nDiagnostics:\n${result.diagnostics.map(diagnostic => `  ${diagnostic.path}: ${diagnostic.code} — ${diagnostic.message}`).join("\n")}`;
			return okResult(content, result);
		},
	});

	pi.registerTool<TSchema>({
		name: "omp_workflow_save",
		label: "Save Workflow Recipe",
		description: "Validate and save a workflow recipe to project or global scope.",
		parameters: pi.zod.object({ scope: pi.zod.enum(["global", "project"]), workflow: pi.zod.record(pi.zod.string(), pi.zod.unknown()), overwrite: pi.zod.boolean().optional() }),
		async execute(_toolCallId: string, params: { scope: WorkflowScope; workflow: Record<string, unknown>; overwrite?: boolean }, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
			const result = saveWorkflowDefinition(params.workflow as unknown as WorkflowDefinition, params.scope, params.overwrite === true, ctx.cwd);
			if (result.error) return errorResult(`Save failed: ${result.error.details.message}`, result.error.details);
			return okResult(`Saved workflow "${params.workflow.name ?? "unknown"}" to ${params.scope} scope.`, result);
		},
	});

	pi.registerTool<TSchema>({
		name: "omp_workflow_render",
		label: "Render Workflow Recipe",
		description: "Resolve inputs and render a workflow recipe to native eval JavaScript without executing it.",
		parameters: pi.zod.object({ name: pi.zod.string(), inputs: pi.zod.record(pi.zod.string(), pi.zod.string()).optional(), scope: pi.zod.enum(["effective", "global", "project"]).optional(), ownerIds: pi.zod.array(pi.zod.string()).optional(), artifactKind: pi.zod.string().optional(), artifactPath: pi.zod.string().optional(), maxLaunches: pi.zod.number().optional(), maxWallClockMs: pi.zod.number().optional() }),
		async execute(_toolCallId: string, params: { name: string; inputs?: Record<string, string>; scope?: EffectiveScope; ownerIds?: string[]; artifactKind?: string; artifactPath?: string; maxLaunches?: number; maxWallClockMs?: number }, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
			const resolved = resolveWorkflowDefinition(params.name, ctx.cwd, params.scope ?? "effective");
			if (resolved.error || !resolved.workflow || !resolved.path || !resolved.scope) return errorResult(`Render failed: ${resolved.error?.details.message ?? "workflow not found"}`, resolved.error?.details ?? { code: "WORKFLOW_NOT_FOUND" });
			const inputResult = resolveDefinitionInputs(resolved.workflow, params.inputs);
			if (inputResult.error || !inputResult.inputs) return errorResult(`Render failed: ${inputResult.error?.details.message ?? "invalid inputs"}`, inputResult.error?.details ?? { code: "WORKFLOW_INPUT_INVALID" });
			// AC24: explicit host budget config (launch/time ceilings) is recorded in
			// the run provenance so every boundary can enforce the same ledger;
			// token/cost limits remain advisory (§7B row 3 — no OMP usage telemetry).
			const budgetConfig: Required<Pick<WorkflowBudgetConfig, "maxLaunches" | "maxWallClockMs">> = {
				maxLaunches: params.maxLaunches ?? DEFAULT_RUN_BUDGET.maxLaunches ?? 64,
				maxWallClockMs: params.maxWallClockMs ?? DEFAULT_RUN_BUDGET.maxWallClockMs ?? 30 * 60_000,
			};
			const runId = createRun(ctx.cwd, resolved.workflow.name, inputResult.inputs, { contentHash: contentHash(resolved.workflow), maxLaunches: budgetConfig.maxLaunches, maxWallClockMs: budgetConfig.maxWallClockMs, ...(params.ownerIds !== undefined ? { ownerIds: params.ownerIds } : {}), ...(params.artifactKind !== undefined ? { artifactKind: params.artifactKind } : {}), ...(params.artifactPath !== undefined ? { artifactPath: params.artifactPath } : {}) });
			try {
				reserveRunLaunch(ctx.cwd, runId, budgetConfig);
			} catch (error) {
				return errorResult(`Render failed: ${error instanceof Error ? error.message : String(error)}`, { code: "WORKFLOW_BUDGET_EXHAUSTED" });
			}
			mirrorRun(pi, ctx, runId, resolved.workflow.name, "running");
			const createdEvent = readRunEvents(ctx.cwd, runId)[0];
			const recovery = createdEvent?.event === "created" ? { governance: governanceFromCreated(createdEvent) } : {};
			const code = renderWorkflowDefinition(resolved.workflow, inputResult.inputs, runId, name => resolveWorkflowDefinition(name, ctx.cwd, "effective").workflow, recovery);
			return okResult(`Rendered workflow "${params.name}" (${resolved.scope}):\n\n\`\`\`js\n${code}\n\`\`\``, { name: params.name, scope: resolved.scope, path: resolved.path, runId, code });
		},
	});

	pi.registerCommand("workflow-run", {
		description: "Inspect live workflow runs (journal-authoritative).",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const requested = args.trim().length > 0 ? args.trim() : undefined;
			await openWorkflowRunOverlay(ctx, requested);
		},
	});

	// Lifecycle cards: visible transcript messages rendered by the registered
	// renderers below (TASK-15.4 AC#4).
	if (typeof pi.registerMessageRenderer === "function") {
		for (const customType of ["ezxomp.workflowz.started", "ezxomp.workflowz.completed", "ezxomp.workflowz.failed", "ezxomp.workflowz.checkpoint"] as const) {
			pi.registerMessageRenderer<Record<string, unknown>>(customType, message => new Text(lifecycleCardLines(customType, message.details ?? {})));
		}
	}

	// Keyboard shortcuts (not in the host reserved list).
	if (typeof pi.registerShortcut === "function") {
		pi.registerShortcut("alt+w", { description: "Open the workflow library overlay", handler: ctx => openWorkflowLibrary(ctx as ExtensionCommandContext, {}, pi) });
		pi.registerShortcut("alt+shift+w", { description: "Open the live workflow run inspector", handler: ctx => openWorkflowRunOverlay(ctx as ExtensionCommandContext) });
	}

	pi.registerCommand("workflow-library", {
		description: "Browse validated workflow recipes.",
		handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => { await openWorkflowLibrary(ctx, {}, pi); },
	});

	pi.registerCommand("workflows", {
		description: "Browse recipes; run <recipe|chain>; create <prompt> authors a new recipe via the authoring skill.",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const request = args.trim();
			if (request.length === 0) {
				await openWorkflowLibrary(ctx);
				return;
			}
			const createMatch = /^create\b/.exec(request);
			if (createMatch) {
				await openWorkflowAuthoring(ctx, pi, request.slice(createMatch[0].length).trim());
				return;
			}
			// Explicit route syntax (name, name -> name, key=value inputs)
			// previews strictly; free-form prompts are authoring requests.
			if (parseRouteRequest(request) === undefined) {
				await openWorkflowAuthoring(ctx, pi, request);
				return;
			}
			await openRoutePreview(ctx, pi, request);
		},
		getArgumentCompletions: (argumentPrefix: string) => workflowCompletions(argumentPrefix),
	});

	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		registerWorkflowAutocompleteProvider(ctx);
		reconcileSessionMirrors(pi, ctx);
		if (ctx.hasUI) refreshLiveSurfaces(ctx);
	});
	pi.on("session_tree", (_event, ctx: ExtensionContext) => { reconcileSessionMirrors(pi, ctx); });
	pi.on("session_switch", (_event, ctx: ExtensionContext) => { reconcileSessionMirrors(pi, ctx); });

	pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
		if (!isWorkflowzEnabled() || !containsWorkflow(event.prompt) || !hasRequiredRuntimeTools(pi)) return undefined;
		const notice = buildCatalogNotice(ctx.cwd);
		return notice ? { systemPrompt: [...event.systemPrompt, notice] } : undefined;
	});
}
