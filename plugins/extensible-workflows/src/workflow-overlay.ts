/**
 * Workflowz TUI overlays — TASK-15.4.
 *
 * Library v2 (Recipes / Templates / Runs / Gates tabs), live run inspector,
 * footer strip + status line models, and the strict route preview. Every
 * journal read here is read-only: the JSONL run journal stays the execution
 * authority and navigation never moves the session leaf. Overlay hosting
 * follows the shared host rule in @ezxomp/experiences overlay-host.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Key, type Component } from "@oh-my-pi/pi-tui";
import { isOverlayDown, isOverlayEscape, isOverlayUp } from "@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts";
import {
	classifyRunOutcome,
	expandStages,
	isTerminalRunStatus,
	isWorkflowV2,
	readRunEvents,
	resolveWorkflowDefinition,
	runStatus,
	type DefinitionList,
	type JournalEvent,
	type RunOutcomeCategory,
	type RunStatistics,
	type WorkflowDefinition,
} from "./runtime.js";
import {
	builtinTemplates,
	gateContentHash,
	globalGatesDir,
	projectGatesDir,
	validateGateFile,
	type GateFileV1,
} from "./templates.js";

export type WorkflowResolver = (name: string) => { workflow?: WorkflowDefinition; error?: { details?: { message?: string } } };

/** Footer-widget / run-strip line ceiling (TASK-15.4 AC#3). */
export const MAX_RUN_STRIP_LINES = 10;
/** Live-surface poll cadence; hosts must poll through ctx.setInterval only. */
export const RUN_POLL_MS = 1_000;

/**
 * Tab order. The journal-statistics contract test navigates Recipes →(right)
 * →(right) Runs, so Runs is the third tab and Gates (added by TASK-15.4 AC#9
 * on top of the design doc's Recipes/Templates/Runs trio) comes last.
 */
export const LIBRARY_TABS = ["Recipes", "Templates", "Runs", "Gates"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

// ── Read-only gate catalog ──────────────────────────────────────────────────

export interface GateCatalogEntry {
	gate: GateFileV1;
	scope: "project" | "global";
	hashOk: boolean;
	/** Trust + integrity (+ global ownership) readiness, mirroring the
	 *  completion candidates' prerequisite hint. */
	ready: boolean;
}

/** Read-only GateFile catalog for the library Gates tab. Never mutates gate
 *  files and never widens trust: a global draft/untrusted gate lists with
 *  ready=false exactly because resolveGateFile would refuse it. */
export function listGateCatalog(cwd: string): GateCatalogEntry[] {
	const scopes: Array<readonly ["project" | "global", string]> = [["project", projectGatesDir(cwd)], ["global", globalGatesDir()]];
	const entries: GateCatalogEntry[] = [];
	for (const [scope, dir] of scopes) {
		if (!existsSync(dir)) continue;
		let files;
		try {
			files = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.isFile() || !file.name.endsWith(".json")) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(readFileSync(join(dir, file.name), "utf8"));
			} catch {
				continue;
			}
			if (validateGateFile(parsed) !== null) continue;
			const gate = parsed as GateFileV1;
			if (entries.some(entry => entry.gate.id === gate.id)) continue;
			const hashOk = gate.contentHash === gateContentHash(gate);
			const trusted = gate.trust === "approved" || gate.trust === "safe";
			const owned = scope === "project" || (Array.isArray(gate.owners) && gate.owners.length > 0);
			entries.push({ gate, scope, hashOk, ready: hashOk && trusted && owned });
		}
	}
	return entries.sort((a, b) => a.gate.id.localeCompare(b.gate.id));
}

// ── Journal-derived run summaries and snapshots ─────────────────────────────

export interface RunSummary {
	runId: string;
	workflow: string;
	status: string;
	category: RunOutcomeCategory;
	detail?: string;
}

/** Build a journal-authoritative one-row summary for a run directory. */
export function buildRunSummary(cwd: string, runId: string): RunSummary | undefined {
	let events: JournalEvent[];
	try {
		events = readRunEvents(cwd, runId);
	} catch {
		return undefined;
	}
	if (events.length === 0) return undefined;
	const created = events.find(event => event.event === "created");
	const workflow = typeof created?.workflow === "string" ? created.workflow : "unknown";
	const status = runStatus(cwd, runId);
	const outcome = classifyRunOutcome(events);
	return {
		runId,
		workflow,
		status: status.status,
		category: outcome.category,
		...(outcome.detail !== undefined ? { detail: outcome.detail } : {}),
	};
}

const RUN_ID_TEST = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every readable run summary for a cwd, ordered by run id. */
export function listRunSummaries(cwd: string): RunSummary[] {
	const root = join(cwd, ".omp", "workflows", "runs");
	if (!existsSync(root)) return [];
	let names: string[];
	try {
		names = readdirSync(root).filter(name => RUN_ID_TEST.test(name));
	} catch {
		return [];
	}
	const summaries: RunSummary[] = [];
	for (const runId of names) {
		const summary = buildRunSummary(cwd, runId);
		if (summary) summaries.push(summary);
	}
	return summaries.sort((a, b) => a.runId.localeCompare(b.runId));
}

export interface RunSnapshot {
	runId: string;
	workflow: string;
	status: string;
	stopped: boolean;
	/** Chain step boundaries: stage_start opens, stage_complete closes. */
	stages: Array<{ id: string; status: string }>;
	/** Journaled gate reports with normalized diagnostics. */
	gates: Array<{ stageId?: string; gateId?: string; status?: string; violations: string[] }>;
	results: Record<string, unknown>;
	pendingCheckpoint: boolean;
	routeRef?: string;
	journalPath: string;
	failureDetail?: string;
	eventCount: number;
}

/** True while the run sits at a checkpoint-type gate whose journal event has
 *  not landed yet: the active stage is open and the recipe declares a
 *  checkpoint gate on it. Recipe-derived, never guessed from silence alone. */
function detectPendingCheckpoint(cwd: string, events: JournalEvent[]): boolean {
	const created = events.find(event => event.event === "created");
	if (!created || typeof created.workflow !== "string") return false;
	const resolved = resolveWorkflowDefinition(created.workflow, cwd, "effective");
	if (resolved.error || !resolved.workflow) return false;
	const completedStages = new Set(events.filter(event => event.event === "stage_complete").map(event => String(event.stageId ?? "")));
	const started = events.filter(event => event.event === "stage_start").map(event => String(event.stageId ?? ""));
	const active = [...started].reverse().find(id => id.length > 0 && !completedStages.has(id));
	if (!active) return false;
	try {
		const workflow = resolved.workflow;
		const stages = isWorkflowV2(workflow)
			? expandStages(workflow, name => resolveWorkflowDefinition(name, cwd, "effective").workflow)
			: workflow.stages.map(stage => ({ id: stage.id }));
		const stage = stages.find(candidate => candidate.id === active);
		if (!stage || !("gates" in stage) || !Array.isArray(stage.gates)) return false;
		return stage.gates.some(gate => gate.type === "checkpoint");
	} catch {
		return false;
	}
}

/** Full journal-derived view model for the run inspector and footer strip. */
export function buildRunSnapshot(cwd: string, runId: string): RunSnapshot | undefined {
	let events: JournalEvent[];
	try {
		events = readRunEvents(cwd, runId);
	} catch {
		return undefined;
	}
	if (events.length === 0) return undefined;
	const created = events.find(event => event.event === "created");
	const workflow = typeof created?.workflow === "string" ? created.workflow : "unknown";
	const status = runStatus(cwd, runId);
	const stages: RunSnapshot["stages"] = [];
	for (const event of events) {
		if (event.event !== "stage_start" && event.event !== "stage_complete") continue;
		const id = String(event.stageId ?? "");
		if (id.length === 0) continue;
		if (event.event === "stage_start") {
			if (!stages.some(stage => stage.id === id)) stages.push({ id, status: "running" });
			continue;
		}
		const target = stages.find(stage => stage.id === id && stage.status === "running");
		const closeStatus = typeof event.status === "string" ? event.status : "complete";
		if (target) target.status = closeStatus;
		else stages.push({ id, status: closeStatus });
	}
	const gates: RunSnapshot["gates"] = [];
	const results: Record<string, unknown> = {};
	let failureDetail: string | undefined;
	for (const event of events) {
		if (event.event === "gate") {
			const report = typeof event.report === "object" && event.report !== null ? event.report as Record<string, unknown> : {};
			const rawViolations = report.violations;
			gates.push({
				...(typeof event.stageId === "string" ? { stageId: event.stageId } : {}),
				...(typeof event.gateId === "string" ? { gateId: event.gateId } : {}),
				...(typeof event.status === "string" ? { status: event.status } : {}),
				violations: Array.isArray(rawViolations) ? rawViolations.map(String) : [],
			});
		}
		if (event.event !== "created" && typeof event.results === "object" && event.results !== null && !Array.isArray(event.results)) {
			Object.assign(results, event.results as Record<string, unknown>);
		}
		if (event.status === "failed") {
			const parts: string[] = [];
			if (typeof event.reason === "string") parts.push(event.reason);
			const report = typeof event.report === "object" && event.report !== null ? event.report as Record<string, unknown> : {};
			const rawViolations = report.violations;
			if (Array.isArray(rawViolations)) parts.push(...rawViolations.map(String));
			if (parts.length > 0) failureDetail = parts.join("; ");
		}
	}
	const routeRef = typeof created?.routeRef === "string" ? created.routeRef : typeof created?.previewRef === "string" ? created.previewRef : undefined;
	return {
		runId,
		workflow,
		status: status.status,
		stopped: status.stopped,
		stages,
		gates,
		results,
		pendingCheckpoint: !status.stopped && !isTerminalRunStatus(status.status) && detectPendingCheckpoint(cwd, events),
		...(routeRef !== undefined ? { routeRef } : {}),
		journalPath: join(cwd, ".omp", "workflows", "runs", runId, "journal.jsonl"),
		...(failureDetail !== undefined ? { failureDetail } : {}),
		eventCount: events.length,
	};
}

/** Which store backs a surfaced state (TASK-15.4 AC#14): the workflow journal
 *  is always present for a live snapshot; the session-snapshot bit is passed
 *  by the caller after checking its branch mirrors. */
export function backingLabel(journalBacked: boolean, snapshotBacked: boolean): string {
	if (journalBacked && snapshotBacked) return "backing: workflow journal + native session snapshot";
	if (journalBacked) return "backing: workflow journal";
	if (snapshotBacked) return "backing: native session snapshot";
	return "backing: none";
}

// ── Footer strip + status line ──────────────────────────────────────────────

/** Compact live run strip for the belowEditor widget and inspector header.
 *  Hard-capped at MAX_RUN_STRIP_LINES. */
export function runStripLines(snapshot: RunSnapshot | undefined, snapshotBacked = false): string[] {
	if (!snapshot) return [];
	const flags: string[] = [];
	if (snapshot.pendingCheckpoint) flags.push("waiting approval");
	if (snapshot.stopped) flags.push("stopped");
	const head = `run ${snapshot.runId.slice(0, 8)} · ${snapshot.workflow} · ${snapshot.status}${flags.length > 0 ? ` · ${flags.join(", ")}` : ""}`;
	const lines = [`${head} · ${backingLabel(true, snapshotBacked)}`];
	for (const stage of snapshot.stages) lines.push(`  stage ${stage.id}: ${stage.status}`);
	for (const gate of snapshot.gates) {
		const suffix = gate.violations.length > 0 ? ` — ${gate.violations.join("; ")}` : "";
		lines.push(`  gate ${gate.gateId ?? "?"}${gate.stageId ? ` [${gate.stageId}]` : ""}: ${gate.status ?? "?"}${suffix}`);
	}
	return lines.slice(0, MAX_RUN_STRIP_LINES);
}

export interface WorkflowStatusInput {
	workflow: string;
	status: string;
	stageId?: string;
	gateId?: string;
	pendingCheckpoint?: boolean;
	routePlanned?: boolean;
}

/** Footer status-line text distinguishing route planning, waiting approval,
 *  active gate, and completed-chain states. Returns undefined when the caller
 *  must CLEAR the workflowz status key (idle/terminal non-completed states). */
export function workflowStatusLine(input: WorkflowStatusInput): string | undefined {
	const { workflow, status } = input;
	if (input.pendingCheckpoint === true) return `workflowz: ${workflow} — waiting for checkpoint approval`;
	if (input.routePlanned === true && status === "running") return `workflowz: ${workflow} — route planned, awaiting approval`;
	if (status === "running" || status === "resumed" || status === "retried") {
		if (input.gateId !== undefined) return `workflowz: ${workflow} — gate ${input.gateId} active`;
		if (input.stageId !== undefined) return `workflowz: ${workflow} — ${status} (stage ${input.stageId})`;
		return `workflowz: ${workflow} — ${status}`;
	}
	if (status === "completed") return `workflowz: ${workflow} — chain completed`;
	return undefined;
}

// ── Detail rendering ────────────────────────────────────────────────────────

function workflowDetail(workflow: WorkflowDefinition): string[] {
	const lines = [`Workflow: ${workflow.name}`, workflow.description, "", "Inputs:"];
	const inputs = Object.entries(workflow.inputs);
	if (inputs.length === 0) lines.push("  (none)");
	for (const [name, input] of inputs) {
		const requirement = input.required ? "required" : input.default !== undefined ? `default=${input.default}` : "optional";
		lines.push(`  ${name} — ${input.description} (${requirement})`);
	}
	lines.push("", "Stages:");
	for (const stage of workflow.stages) {
		lines.push(`  ${stage.label} (${stage.id})`);
		for (const task of stage.tasks) {
			const agent = task.agent ? ` [${task.agent}]` : "";
			lines.push(`    ${task.id}${agent}: ${task.prompt}`);
		}
		const gates = "gates" in stage ? stage.gates : [];
		for (const gate of gates) lines.push(`    gate ${gate.id} (${gate.type}${gate.auto === true ? ", auto" : ""})`);
	}
	lines.push("", "Esc: back · q: close");
	return lines;
}

function gateDetail(entry: GateCatalogEntry): string[] {
	const gate = entry.gate;
	const lines = [
		`Gate: ${gate.id} v${gate.version} [${entry.scope}]`,
		gate.description,
		"",
		`Kind: ${gate.kind}`,
		`Trust: ${gate.trust}`,
		`Integrity: ${entry.hashOk ? "content hash verified" : "CONTENT HASH MISMATCH"}`,
		`Prerequisites: ${entry.ready ? "ready" : "unverified"}`,
	];
	if (gate.command !== undefined) lines.push(`Command: ${gate.command}`);
	if (gate.executable !== undefined) lines.push((`Executable: ${gate.executable} ${(gate.args ?? []).join(" ")}`).trimEnd());
	if (gate.language !== undefined && gate.language.length > 0) lines.push(`Languages: ${gate.language.join(", ")}`);
	if (gate.owners !== undefined && gate.owners.length > 0) lines.push(`Owners: ${gate.owners.join(", ")}`);
	lines.push("", "Read-only view — trust changes go through the gate tools.", "Esc: back · q: close");
	return lines;
}

function runDetail(summary: RunSummary): string[] {
	const outcome = summary.category.replaceAll("_", " ");
	const lines = [
		`Run: ${summary.runId}`,
		`Workflow: ${summary.workflow}`,
		`Status: ${summary.status} (${outcome})`,
	];
	if (summary.detail !== undefined) lines.push(`Detail: ${summary.detail}`);
	lines.push("", "alt+shift+w opens the live inspector.", "Esc: back · q: close");
	return lines;
}

// ── Library overlay v2 ──────────────────────────────────────────────────────

export interface WorkflowLibraryData {
	result: DefinitionList;
	resolveWorkflow: WorkflowResolver;
	templates: readonly WorkflowDefinition[];
	gates: readonly GateCatalogEntry[];
	runs: readonly RunSummary[];
	statistics?: RunStatistics;
	onLaunch?: (name: string) => void;
	onOpenRun?: (runId: string) => void;
}

export class WorkflowLibraryOverlay implements Component {
	#data: WorkflowLibraryData;
	#tui: import("@oh-my-pi/pi-tui").TUI;
	#done: () => void;
	#tab = 0;
	#indexes: number[] = [0, 0, 0, 0];
	#detail: string[] | undefined;

	constructor(data: WorkflowLibraryData, tui: import("@oh-my-pi/pi-tui").TUI, done: () => void) {
		this.#data = data;
		this.#tui = tui;
		this.#done = done;
	}

	get tab(): LibraryTab {
		return LIBRARY_TABS[this.#tab] ?? "Recipes";
	}

	get tabIndex(): number {
		return this.#tab;
	}

	get selectedIndex(): number {
		return this.#indexes[this.#tab] ?? 0;
	}

	#rowCount(): number {
		if (this.#tab === 0) return this.#data.result.workflows.length;
		if (this.#tab === 1) return this.#data.templates.length;
		if (this.#tab === 2) return this.#data.runs.length;
		return this.#data.gates.length;
	}

	render(_width: number): readonly string[] {
		if (this.#detail) return this.#detail;
		const tabs = LIBRARY_TABS.map((name, index) => index === this.#tab ? `[${index + 1}/${LIBRARY_TABS.length}] ${name}` : `  ${name}`).join(" · ");
		const lines = [`Workflow Library — ${tabs}`, ""];
		const row = this.#indexes[this.#tab] ?? 0;
		if (this.#tab === 0) {
			if (this.#data.result.workflows.length === 0) lines.push("No saved workflows found.");
			for (const [index, workflow] of this.#data.result.workflows.entries()) {
				const marker = index === row ? ">" : " ";
				lines.push(`${marker} ${workflow.name} [${workflow.scope}] — ${workflow.description}`);
			}
			if (this.#data.result.diagnostics.length > 0) {
				lines.push("", "Diagnostics:");
				for (const diagnostic of this.#data.result.diagnostics) lines.push(`  ${diagnostic.path}: ${diagnostic.code} — ${diagnostic.message}`);
			}
		} else if (this.#tab === 1) {
			if (this.#data.templates.length === 0) lines.push("No builtin templates.");
			for (const [index, template] of this.#data.templates.entries()) {
				const marker = index === row ? ">" : " ";
				lines.push(`${marker} ${template.name} — ${template.description}`);
			}
		} else if (this.#tab === 2) {
			const stats = this.#data.statistics;
			if (stats) {
				lines.push(
					`Total runs: ${stats.total}`,
					`Route plans: ${stats.routePlans}`,
					`Chain completions: ${stats.chainCompletions}`,
					`Gate failures: ${stats.gateFailures}`,
					`Missing-tool failures: ${stats.missingToolFailures}`,
					`Approved checkpoints: ${stats.checkpointOutcomes.approved}`,
					`Rejected checkpoints: ${stats.checkpointOutcomes.rejected}`,
					"",
				);
			}
			if (this.#data.runs.length === 0) lines.push("No workflow runs journaled.");
			for (const [index, summary] of this.#data.runs.entries()) {
				const marker = index === row ? ">" : " ";
				lines.push(`${marker} ${summary.runId.slice(0, 8)} · ${summary.workflow} · ${summary.status} (${summary.category.replaceAll("_", " ")})`);
			}
		} else {
			if (this.#data.gates.length === 0) lines.push("No gate files found.");
			for (const [index, entry] of this.#data.gates.entries()) {
				const marker = index === row ? ">" : " ";
				lines.push(`${marker} ${entry.gate.id} v${entry.gate.version} [${entry.scope}] — trust: ${entry.gate.trust} · ${entry.ready ? "prerequisites ready" : "prerequisites unverified"}`);
			}
		}
		const launchHint = this.#data.onLaunch ? " · l launch" : "";
		lines.push("", `←→ tab · ↑↓ select · Enter inspect${launchHint} · Esc/q close`);
		return lines;
	}

	invalidate(): void {
		this.#tui.requestRender();
	}

	handleInput(input: string): void {
		if (isOverlayEscape(input)) {
			if (this.#detail) {
				this.#detail = undefined;
				this.#tui.requestRender();
			} else {
				this.#done();
			}
			return;
		}
		if (this.#detail) return;
		if (input === Key.left) {
			this.#tab = Math.max(0, this.#tab - 1);
			this.#tui.requestRender();
			return;
		}
		if (input === Key.right) {
			this.#tab = Math.min(LIBRARY_TABS.length - 1, this.#tab + 1);
			this.#tui.requestRender();
			return;
		}
		if (isOverlayUp(input)) {
			this.#indexes[this.#tab] = Math.max(0, (this.#indexes[this.#tab] ?? 0) - 1);
			this.#tui.requestRender();
			return;
		}
		if (isOverlayDown(input)) {
			this.#indexes[this.#tab] = Math.min(this.#rowCount() - 1, (this.#indexes[this.#tab] ?? 0) + 1);
			this.#tui.requestRender();
			return;
		}
		if (input === "l" && (this.#tab === 0 || this.#tab === 1)) {
			const name = this.#tab === 0
				? this.#data.result.workflows[this.#indexes[this.#tab] ?? 0]?.name
				: this.#data.templates[this.#indexes[this.#tab] ?? 0]?.name;
			if (name !== undefined) this.#data.onLaunch?.(name);
			return;
		}
		if (input !== Key.enter) return;
		const index = this.#indexes[this.#tab] ?? 0;
		if (this.#tab === 0) {
			const selected = this.#data.result.workflows[index];
			if (!selected) return;
			const resolved = this.#data.resolveWorkflow(selected.name);
			this.#detail = resolved.workflow
				? workflowDetail(resolved.workflow)
				: [`Unable to inspect ${selected.name}.`, resolved.error?.details?.message ?? "Workflow could not be resolved.", "", "Esc: back · q: close"];
		} else if (this.#tab === 1) {
			const selected = this.#data.templates[index];
			if (!selected) return;
			this.#detail = workflowDetail(selected);
		} else if (this.#tab === 3) {
			const selected = this.#data.gates[index];
			if (!selected) return;
			this.#detail = gateDetail(selected);
		} else {
			const selected = this.#data.runs[index];
			if (!selected) return;
			if (this.#data.onOpenRun) {
				this.#data.onOpenRun(selected.runId);
				return;
			}
			this.#detail = runDetail(selected);
		}
		this.#tui.requestRender();
	}
}

// ── Live run inspector overlay ──────────────────────────────────────────────

export interface WorkflowRunOverlayHooks {
	onStop?: (runId: string) => void;
	/** Switch the inspected run (left/right); receives -1/+1. */
	onStep?: (delta: number) => void;
}

export class WorkflowRunOverlay implements Component {
	#snapshot: RunSnapshot | undefined;
	#hooks: WorkflowRunOverlayHooks;
	#tui: import("@oh-my-pi/pi-tui").TUI;
	#done: () => void;

	constructor(snapshot: RunSnapshot | undefined, hooks: WorkflowRunOverlayHooks, tui: import("@oh-my-pi/pi-tui").TUI, done: () => void) {
		this.#snapshot = snapshot;
		this.#hooks = hooks;
		this.#tui = tui;
		this.#done = done;
	}

	setSnapshot(snapshot: RunSnapshot | undefined): void {
		this.#snapshot = snapshot;
		this.#tui.requestRender();
	}

	get snapshot(): RunSnapshot | undefined {
		return this.#snapshot;
	}

	render(_width: number): readonly string[] {
		const snapshot = this.#snapshot;
		if (!snapshot) return ["Workflow Run Inspector", "", "No run selected.", "", "←→ switch run · x stop · Esc/q close"];
		const lines = [
			`Run ${snapshot.runId.slice(0, 8)} — ${snapshot.workflow} · ${snapshot.status}${snapshot.stopped ? " (stopped)" : ""}`,
			backingLabel(true, false),
			`Journal: ${snapshot.journalPath} (${snapshot.eventCount} events)`,
			"",
		];
		if (snapshot.pendingCheckpoint) lines.push("CHECKPOINT PENDING — answer the checkpoint dialog to continue");
		if (snapshot.routeRef !== undefined) lines.push(`Route: ${snapshot.routeRef}`);
		lines.push("", "Phases:");
		if (snapshot.stages.length === 0) lines.push("  (none yet)");
		for (const stage of snapshot.stages) lines.push(`  ${stage.status === "running" ? ">" : "-"} ${stage.id}: ${stage.status}`);
		lines.push("", "Gates:");
		if (snapshot.gates.length === 0) lines.push("  (none yet)");
		for (const gate of snapshot.gates) {
			const violations = gate.violations.length > 0 ? ` — ${gate.violations.join("; ")}` : "";
			const mark = gate.status === "passed" ? "-" : gate.status === "failed" ? "x" : "-";
			lines.push(`  ${mark} ${gate.gateId ?? "?"}${gate.stageId ? ` [${gate.stageId}]` : ""}: ${gate.status ?? "?"}${violations}`);
		}
		if (snapshot.failureDetail !== undefined) lines.push("", `Failure: ${snapshot.failureDetail}`);
		const resultKeys = Object.keys(snapshot.results);
		lines.push("", "Results:");
		if (resultKeys.length === 0) lines.push("  (none yet)");
		for (const key of resultKeys.slice(0, 8)) {
			const value = snapshot.results[key];
			const text = typeof value === "string" ? value : JSON.stringify(value);
			lines.push(`  ${key}: ${(text ?? "").slice(0, 120)}`);
		}
		lines.push("", "Journal-authoritative; navigation never moves the session leaf.", "←→ switch run · x stop · Esc/q close");
		return lines;
	}

	invalidate(): void {
		this.#tui.requestRender();
	}

	handleInput(input: string): void {
		if (isOverlayEscape(input)) {
			this.#done();
			return;
		}
		if (input === Key.left) {
			this.#hooks.onStep?.(-1);
			return;
		}
		if (input === Key.right) {
			this.#hooks.onStep?.(1);
			return;
		}
		if (input === "x" && this.#snapshot && !this.#snapshot.stopped) this.#hooks.onStop?.(this.#snapshot.runId);
	}
}

// ── Route preview model + overlay (strict preview, never executes) ──────────

export interface RoutePreviewStep {
	name: string;
	scope?: string;
	inputs: Array<{ key: string; value: string }>;
	gates: string[];
}

export interface RoutePreviewModel {
	request: string;
	mode: "direct" | "chain";
	steps: RoutePreviewStep[];
	approval: "required" | "auto";
	notes: string[];
}

export function routePreviewLines(model: RoutePreviewModel): string[] {
	const lines = [
		"Route Preview (strict — nothing has executed)",
		`Request: ${model.request}`,
		`Mode: ${model.mode}`,
		`Approval: ${model.approval}`,
		"",
		"Chain order:",
	];
	model.steps.forEach((step, index) => {
		lines.push(`  ${index + 1}. ${step.name}${step.scope ? ` [${step.scope}]` : ""}`);
		for (const input of step.inputs) lines.push(`     input ${input.key}=${input.value}`);
		if (step.gates.length > 0) lines.push(`     gates: ${step.gates.join(", ")}`);
	});
	for (const note of model.notes) lines.push("", `Note: ${note}`);
	lines.push("", "Preview only — launching sends /workflows through the agent with every tool approval intact.", "l launch · Esc/q close");
	return lines;
}

export class WorkflowRoutePreviewOverlay implements Component {
	#lines: string[];
	#onLaunch: (() => void) | undefined;
	#done: () => void;
	#requestRender: () => void;

	constructor(model: RoutePreviewModel, onLaunch: (() => void) | undefined, requestRender: () => void, done: () => void) {
		this.#lines = routePreviewLines(model);
		this.#onLaunch = onLaunch;
		this.#requestRender = requestRender;
		this.#done = done;
	}

	render(_width: number): readonly string[] {
		return this.#lines;
	}

	invalidate(): void {
		this.#requestRender();
	}

	handleInput(input: string): void {
		if (isOverlayEscape(input)) {
			this.#done();
			return;
		}
		if (input === "l") this.#onLaunch?.();
	}
}

/** Parse `/workflows <request>` route syntax: names separated by `->`, each
 *  optionally followed by `key=value` inputs. Returns undefined when the
 *  request is not explicit route syntax (free-form natural language). */
export function parseRouteRequest(request: string): { steps: Array<{ workflow: string; inputs?: Record<string, string> }> } | undefined {
	const trimmed = request.trim();
	if (trimmed.length === 0) return undefined;
	const segments = trimmed.split("->").map(segment => segment.trim()).filter(segment => segment.length > 0);
	const steps: Array<{ workflow: string; inputs?: Record<string, string> }> = [];
	for (const segment of segments) {
		const tokens = segment.split(/\s+/);
		const workflow = tokens[0];
		if (workflow === undefined || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(workflow)) return undefined;
		const inputs: Record<string, string> = {};
		for (const token of tokens.slice(1)) {
			const eq = token.indexOf("=");
			if (eq <= 0) return undefined;
			inputs[token.slice(0, eq)] = token.slice(eq + 1);
		}
		steps.push(Object.keys(inputs).length > 0 ? { workflow, inputs } : { workflow });
	}
	return { steps };
}
