import {
	appendFileSync,
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import {
	globalWorkflowsDir,
	projectWorkflowsDir,
	renderWorkflow,
	type EffectiveScope,
	type WorkflowFileV1,
	type WorkflowScope,
	validateWorkflow,
} from "./library.js";
import { resolveGateFile, type GateFileV1 } from "./gates.js";
import { buildRules, classify, type Rule } from "@ezxomp/agent-learning/src/gate.ts";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_SIZE = 256 * 1024;
const MAX_ROUTE_DEPTH = 8;
const GATE_TYPES = new Set<WorkflowGate["type"]>([
	"shell", "exec", "just", "lsp", "frontmatter", "llm", "checkpoint", "budget", "output",
]);
/** Gate ids reserved for host-produced governance evidence. Workflows can never
 *  declare gates under these names (validated here at definition time), and the
 *  tool layer refuses journaling/executing them — the host evidence producers are
 *  their only source. Enforcement twin: p0-tools.ts omp_workflow_gate/report. */
export const RESERVED_GOVERNANCE_GATE_IDS = ["backlog-record", "git-state"] as const;
const WORKFLOW_GATE_RULES: Rule[] = buildRules({}).rules;
function directiveBlockReason(command: string): string | null {
	if (/[;|&$`><(){}\n]/.test(command)) return "shell metacharacters are not allowed in workflow gates";
	const rule = classify(command, WORKFLOW_GATE_RULES);
	return rule ? `${rule.severity} — ${rule.reason}` : null;
}

export interface WorkflowInputDefinition {
	description: string;
	required?: boolean;
	default?: string;
}

export interface WorkflowGate {
	id: string;
	type: "shell" | "exec" | "just" | "lsp" | "frontmatter" | "llm" | "checkpoint" | "budget" | "output";
	command?: string;
	executable?: string;
	args?: string[];
	timeoutMs?: number;
	retries?: number;
	repair?: string;
	prompt?: string;
	schema?: unknown;
	expect?: { exitCode?: number; stdout?: string; stderr?: string };
	optional?: boolean;
	advisory?: boolean;
	auto?: boolean;
	threshold?: number;
	/** Reference to a reusable GateFileV1 catalog entry (design §4). */
	ref?: string;
}

export interface WorkflowTaskV2 {
	id: string;	prompt: string;	agent?: string;	setup?: string;	workflow?: string;	schema?: unknown;
}

export interface WorkflowStageV2 {
	id: string;	label: string;	tasks: WorkflowTaskV2[];	gates: WorkflowGate[];
}

export interface WorkflowArtifactRef {
	taskId: string;	documentId?: string;	kind: string;	path: string;	contentHash?: string;
}

export interface WorkflowFileV2 {
	schemaVersion: 2;
	name: string;	description: string;	inputs: Record<string, WorkflowInputDefinition>;
	stages: WorkflowStageV2[];	outputs?: Record<string, unknown>;	artifacts?: WorkflowArtifactRef[];
	contentHash?: string;	version?: string;	owners?: string[];
}

export type WorkflowDefinition = WorkflowFileV1 | WorkflowFileV2;
import type { WorkflowDiagnostic, WorkflowError } from "./library.js";
export type { EffectiveScope, WorkflowScope } from "./library.js";
export type { WorkflowDiagnostic, WorkflowError } from "./library.js";

export interface DefinitionMeta {
	name: string;	description: string; scope: WorkflowScope; path: string; schemaVersion: number;
}

export interface DefinitionList {
	scope: EffectiveScope; workflows: DefinitionMeta[]; diagnostics: WorkflowDiagnostic[];
}

export interface GateCheck {
	item: string; ok: boolean; note?: string; tool?: string; durationMs?: number;
}

export interface GateReport {
	gate: string; passed: boolean; advisory?: boolean | undefined; checks: GateCheck[]; violations: string[];
	evidenceTail?: string | undefined; stdout?: string | undefined; stderr?: string | undefined; exitCode?: number | undefined; killed?: boolean | undefined;
	signal?: string | undefined; durationMs?: number | undefined; tool?: string | undefined; [key: string]: unknown;
}

export interface ExecResult {
	code: number; stdout: string; stderr: string; killed?: boolean; signal?: string;
}

export type ExecFn = (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<ExecResult>;

export interface RouteStep {
	workflow: string; inputs?: Record<string, string>; resultRef?: string;
}

export interface WorkflowRoute {
	mode: "direct" | "chain"; steps: RouteStep[]; maxDepth?: number;
}

export interface JournalEvent {
	timestamp: string; runId: string; event: string; status?: string; operationId?: string; contentHash?: string; [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workflowError(code: string, message: string, path?: string): WorkflowError {
	return { isError: true, details: { code, message, ...(path ? { path } : {}) } };
}

function isInputDefinition(value: unknown): value is WorkflowInputDefinition {
	return isRecord(value) && typeof value.description === "string" &&
		(value.required === undefined || typeof value.required === "boolean") &&
		(value.default === undefined || typeof value.default === "string");
}

function templateReferences(value: string): { inputs: string[]; results: string[] } {
	return {
		inputs: [...value.matchAll(/\{\{input\.([a-z0-9-]+)\}\}/g)].map(match => match[1] ?? ""),
		results: [...value.matchAll(/\{\{result\.([a-z0-9-]+)\}\}/g)].map(match => match[1] ?? ""),
	};
}

function validateOutputSchema(schema: unknown): string | undefined {
	const type = typeof schema === "string" ? schema : isRecord(schema) && typeof schema.type === "string" ? schema.type : undefined;
	if (!type) return "output schema must be a type string or object with a type";
	if (!["string", "number", "boolean", "object", "array", "null", "any"].includes(type)) return `unsupported output type ${type}`;
	return undefined;
}

function validateV2(workflow: Record<string, unknown>): { code: string; message: string } | null {
	if (workflow.schemaVersion !== 2) return { code: "WORKFLOW_INVALID", message: "schemaVersion must be 2" };
	if (typeof workflow.name !== "string" || !SLUG_RE.test(workflow.name)) return { code: "WORKFLOW_INVALID", message: "name must be a valid slug" };
	if (typeof workflow.description !== "string") return { code: "WORKFLOW_INVALID", message: "description must be a string" };
	if (!isRecord(workflow.inputs)) return { code: "WORKFLOW_INVALID", message: "inputs must be an object" };
	for (const [name, input] of Object.entries(workflow.inputs)) {
		if (!SLUG_RE.test(name) || !isInputDefinition(input)) return { code: "WORKFLOW_INVALID", message: `input ${name} is invalid` };
	}
	if (!Array.isArray(workflow.stages) || workflow.stages.length === 0) return { code: "WORKFLOW_INVALID", message: "stages must be a non-empty array" };
	const allIds = new Set<string>();
	const allTaskIds = new Set<string>();
	for (const stage of workflow.stages) {
		if (!isRecord(stage) || typeof stage.id !== "string" || !SLUG_RE.test(stage.id) || typeof stage.label !== "string") return { code: "WORKFLOW_INVALID", message: "stage is invalid" };
		if (allIds.has(stage.id)) return { code: "WORKFLOW_INVALID", message: `duplicate id ${stage.id}` };
		allIds.add(stage.id);
		if (!Array.isArray(stage.tasks) || stage.tasks.length === 0) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} tasks must be a non-empty array` };
		if (!Array.isArray(stage.gates)) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} gates must be an array` };
		for (const task of stage.tasks) {
			if (!isRecord(task) || typeof task.id !== "string" || !SLUG_RE.test(task.id) || typeof task.prompt !== "string" || task.prompt.length === 0) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} task is invalid` };
			if (allIds.has(task.id)) return { code: "WORKFLOW_INVALID", message: `duplicate id ${task.id}` };
			allIds.add(task.id); allTaskIds.add(task.id);
			for (const [field, expected] of [["agent", "string"], ["setup", "string"], ["workflow", "string"]] as const) {
				if (task[field] !== undefined && typeof task[field] !== expected) return { code: "WORKFLOW_INVALID", message: `task ${task.id} ${field} must be a string` };
			}
			if (task.workflow !== undefined && !SLUG_RE.test(String(task.workflow))) return { code: "WORKFLOW_INVALID", message: `task ${task.id} workflow is invalid` };
			if (task.schema !== undefined && !isRecord(task.schema)) return { code: "WORKFLOW_INVALID", message: `task ${task.id} schema must be an object` };
		}
		for (const gate of stage.gates) {
			if (!isRecord(gate) || typeof gate.id !== "string" || !SLUG_RE.test(gate.id) || allIds.has(gate.id)) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} gate id is invalid or duplicated` };
			if ((RESERVED_GOVERNANCE_GATE_IDS as readonly string[]).includes(gate.id)) return { code: "WORKFLOW_GATE_RESERVED_ID", message: `gate ${gate.id} is reserved for host governance evidence` };
			allIds.add(gate.id);
			if (typeof gate.type !== "string" || !GATE_TYPES.has(gate.type as WorkflowGate["type"])) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} type is invalid` };
			if (gate.command !== undefined && typeof gate.command !== "string") return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} command must be a string` };
			if (gate.type === "shell" && typeof gate.command === "string" && /[;&|<>`$(){}\n]/.test(gate.command)) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} raw shell metacharacters require explicit approval` };
			if (gate.executable !== undefined && (typeof gate.executable !== "string" || /[;&|<>`$()]/.test(gate.executable) || gate.executable.includes(".."))) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} executable is invalid` };
			if (gate.args !== undefined && (!Array.isArray(gate.args) || gate.args.some(arg => typeof arg !== "string"))) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} args must be strings` };
			if (gate.schema !== undefined && !isRecord(gate.schema)) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} schema must be an object` };
			if (gate.expect !== undefined && (!isRecord(gate.expect) || (gate.expect.exitCode !== undefined && typeof gate.expect.exitCode !== "number") || (gate.expect.stdout !== undefined && typeof gate.expect.stdout !== "string") || (gate.expect.stderr !== undefined && typeof gate.expect.stderr !== "string"))) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} expect is invalid` };
			if (gate.retries !== undefined && (!Number.isInteger(gate.retries) || Number(gate.retries) < 0 || Number(gate.retries) > 8)) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} retries must be 0-8` };
			if (gate.timeoutMs !== undefined && (!Number.isInteger(gate.timeoutMs) || Number(gate.timeoutMs) < 1 || Number(gate.timeoutMs) > 600_000)) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} timeoutMs is invalid` };
			for (const field of ["repair", "prompt"] as const) if (gate[field] !== undefined && typeof gate[field] !== "string") return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} ${field} must be a string` };
			for (const field of ["optional", "advisory", "auto"] as const) if (gate[field] !== undefined && typeof gate[field] !== "boolean") return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} ${field} must be boolean` };
			if (gate.threshold !== undefined && (typeof gate.threshold !== "number" || !Number.isFinite(gate.threshold) || gate.threshold < 0)) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} threshold is invalid` };
			// Gates declaring a reusable ref (design §4) inherit the command surface
			// from the referenced approved GateFile; inline gates need their own.
			if (!gate.ref && ["shell", "exec", "just", "lsp"].includes(String(gate.type)) && !gate.command && !gate.executable) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} requires command, executable, or a gate ref` };
			if (gate.ref !== undefined && (typeof gate.ref !== "string" || !SLUG_RE.test(gate.ref))) return { code: "WORKFLOW_INVALID", message: `gate ${gate.id} ref must be a valid slug` };
		}
	}
	const priorTasks = new Set<string>();
	const stageIds = new Set<string>();
	for (const stage of workflow.stages as Array<Record<string, unknown>>) if (typeof stage.id === "string") stageIds.add(stage.id);
	const inputNames = new Set(Object.keys(workflow.inputs));
	for (const stage of workflow.stages as Array<Record<string, unknown>>) {
		for (const task of stage.tasks as Array<Record<string, unknown>>) {
			for (const field of ["prompt", "setup"] as const) {
				if (typeof task[field] !== "string") continue;
				const refs = templateReferences(task[field]);
				for (const input of refs.inputs) if (!inputNames.has(input)) return { code: "WORKFLOW_INVALID", message: `task ${task.id} references unknown input ${input}` };
				for (const result of refs.results) if (!priorTasks.has(result) && !stageIds.has(result)) return { code: "WORKFLOW_INVALID", message: `task ${task.id} references unknown or forward task ${result}` };
			}
			priorTasks.add(String(task.id));
		}
	}
	if (workflow.outputs !== undefined) {
		if (!isRecord(workflow.outputs)) return { code: "WORKFLOW_INVALID", message: "outputs must be an object" };
		for (const [name, schema] of Object.entries(workflow.outputs)) {
			if (!SLUG_RE.test(name)) return { code: "WORKFLOW_INVALID", message: `output ${name} is invalid` };
			const schemaError = validateOutputSchema(schema);
			if (schemaError) return { code: "WORKFLOW_INVALID", message: `output ${name}: ${schemaError}` };
		}
	}
	if (workflow.artifacts !== undefined) {
		if (!Array.isArray(workflow.artifacts)) return { code: "WORKFLOW_INVALID", message: "artifacts must be an array" };
		for (const artifact of workflow.artifacts) if (!isRecord(artifact) || typeof artifact.taskId !== "string" || typeof artifact.kind !== "string" || typeof artifact.path !== "string" || (artifact.documentId !== undefined && typeof artifact.documentId !== "string") || (artifact.contentHash !== undefined && typeof artifact.contentHash !== "string")) return { code: "WORKFLOW_INVALID", message: "artifact reference is invalid" };
	}
	if (workflow.contentHash !== undefined && (typeof workflow.contentHash !== "string" || workflow.contentHash.length === 0)) return { code: "WORKFLOW_INVALID", message: "contentHash must be a non-empty string" };
	if (workflow.version !== undefined && (typeof workflow.version !== "string" || !/^\d+\.\d+\.\d+$/.test(workflow.version))) return { code: "WORKFLOW_INVALID", message: "version must be semver" };
	if (workflow.owners !== undefined && (!Array.isArray(workflow.owners) || workflow.owners.some(owner => typeof owner !== "string" || owner.length === 0))) return { code: "WORKFLOW_INVALID", message: "owners must be an array of non-empty strings" };
	return null;
}

export function isWorkflowV2(workflow: WorkflowDefinition): workflow is WorkflowFileV2 { return workflow.schemaVersion === 2; }

export function validateWorkflowDefinition(workflow: unknown): { code: string; message: string } | null {
	if (!isRecord(workflow) || (workflow.schemaVersion !== 1 && workflow.schemaVersion !== 2)) return { code: "WORKFLOW_INVALID", message: "schemaVersion must be 1 or 2" };
	return workflow.schemaVersion === 1 ? validateWorkflow(workflow) : validateV2(workflow);
}

function readDefinition(filePath: string): { workflow?: WorkflowDefinition; error?: WorkflowDiagnostic } {
	try {
		const absolute = resolve(filePath);
		const real = realpathSync(absolute);
		if (real !== absolute) return { error: { path: absolute, code: "WORKFLOW_INVALID", message: "symlinked workflow files are rejected" } };
		if (!statSync(absolute).isFile()) return { error: { path: absolute, code: "WORKFLOW_INVALID", message: "not a regular file" } };
		if (statSync(absolute).size > MAX_FILE_SIZE) return { error: { path: absolute, code: "WORKFLOW_INVALID", message: `file exceeds ${MAX_FILE_SIZE} bytes` } };
		const parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
		const error = validateWorkflowDefinition(parsed);
		if (error) return { error: { path: absolute, ...error } };
		const definition = parsed as WorkflowDefinition;
		// Fail closed on a persisted identity that no longer matches its
		// content; legacy files without a contentHash remain compatible.
		const declaredHash = (definition as Partial<WorkflowFileV2>).contentHash;
		if (declaredHash !== undefined && declaredHash !== contentHash(definition)) return { error: { path: absolute, code: "WORKFLOW_INVALID", message: "persisted contentHash does not match definition content" } };
		return { workflow: definition };
	} catch {
		return { error: { path: resolve(filePath), code: "WORKFLOW_INVALID", message: "malformed or unreadable file" } };
	}
}

function listScope(dir: string, scope: WorkflowScope): { workflows: DefinitionMeta[]; diagnostics: WorkflowDiagnostic[] } {
	const workflows: DefinitionMeta[] = [];
	const diagnostics: WorkflowDiagnostic[] = [];
	if (!existsSync(dir)) return { workflows, diagnostics };
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const path = join(dir, entry.name);
		const result = readDefinition(path);
		if (result.error) diagnostics.push(result.error);
		else if (result.workflow) workflows.push({ name: result.workflow.name, description: result.workflow.description, scope, path: resolve(path), schemaVersion: result.workflow.schemaVersion });
	}
	return { workflows, diagnostics };
}

export function listWorkflowDefinitions(cwd: string, scope: EffectiveScope = "effective"): DefinitionList {
	const project = listScope(projectWorkflowsDir(cwd), "project");
	const global = listScope(globalWorkflowsDir(), "global");
	if (scope === "project") return { scope, workflows: project.workflows.sort((a, b) => a.name.localeCompare(b.name)), diagnostics: project.diagnostics };
	if (scope === "global") return { scope, workflows: global.workflows.sort((a, b) => a.name.localeCompare(b.name)), diagnostics: global.diagnostics };
	const byName = new Map<string, DefinitionMeta>();
	for (const workflow of [...global.workflows, ...project.workflows]) byName.set(workflow.name, workflow);
	return { scope, workflows: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), diagnostics: [...project.diagnostics, ...global.diagnostics] };
}

export function resolveWorkflowDefinition(name: string, cwd: string, scope: EffectiveScope = "effective"): { workflow?: WorkflowDefinition; path?: string; scope?: WorkflowScope; error?: WorkflowError } {
	if (!SLUG_RE.test(name)) return { error: workflowError("WORKFLOW_INVALID", "workflow name is invalid") };
	const candidates: Array<[string, WorkflowScope]> = scope === "project" ? [[join(projectWorkflowsDir(cwd), `${name}.json`), "project"]] : scope === "global" ? [[join(globalWorkflowsDir(), `${name}.json`), "global"]] : [[join(projectWorkflowsDir(cwd), `${name}.json`), "project"], [join(globalWorkflowsDir(), `${name}.json`), "global"]];
	for (const [path, resolvedScope] of candidates) {
		if (!existsSync(path)) continue;
		const result = readDefinition(path);
		if (result.error) return { error: workflowError(result.error.code, result.error.message, result.error.path) };
		return result.workflow ? { workflow: result.workflow, path: resolve(path), scope: resolvedScope } : { error: workflowError("WORKFLOW_INVALID", "workflow file did not contain a definition", path) };
	}
	return { error: workflowError("WORKFLOW_NOT_FOUND", `workflow "${name}" not found`) };
}

export function saveWorkflowDefinition(workflow: WorkflowDefinition, scope: WorkflowScope, overwrite = false, cwd = process.cwd()): { path?: string; created?: boolean; error?: WorkflowError } {
	const validation = validateWorkflowDefinition(workflow);
	if (validation) return { error: workflowError(validation.code, validation.message) };
	const dir = scope === "global" ? globalWorkflowsDir() : projectWorkflowsDir(cwd);
	const path = join(dir, `${workflow.name}.json`);
	const existed = existsSync(path);
	if (existed && !overwrite) return { error: workflowError("WORKFLOW_EXISTS", `workflow "${workflow.name}" already exists`, path) };
	try {
		mkdirSync(dir, { recursive: true, mode: scope === "global" ? 0o700 : 0o755 });
		const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
		writeFileSync(temp, `${JSON.stringify(workflow, null, 2)}\n`, { mode: scope === "global" ? 0o600 : 0o644 });
		renameSync(temp, path);
		return { path, created: !existed };
	} catch (error) {
		return { error: workflowError("WORKFLOW_SAVE_FAILED", String(error), path) };
	}
}

export function resolveDefinitionInputs(workflow: WorkflowDefinition, provided?: Record<string, string>): { inputs?: Record<string, string>; error?: WorkflowError } {
	const resolved: Record<string, string> = {};
	for (const [name, input] of Object.entries(workflow.inputs)) {
		const value = provided?.[name];
		if (value !== undefined) resolved[name] = value;
		else if (input.default !== undefined) resolved[name] = input.default;
		else if (input.required) return { error: workflowError("WORKFLOW_INPUT_MISSING", `required input "${name}" not provided`) };
	}
	for (const key of Object.keys(provided ?? {})) if (!(key in workflow.inputs)) return { error: workflowError("WORKFLOW_INPUT_UNKNOWN", `unknown input "${key}"`) };
	return { inputs: resolved };
}

function json(value: unknown): string { return JSON.stringify(value).replaceAll("\\u2028", "\\u2028").replaceAll("\\u2029", "\\u2029"); }
function variable(id: string): string { return `gate_${id.replace(/[^a-zA-Z0-9_$]/g, "_")}`; }
function namespaceTemplate(value: string, prefix: string): string { return value.replace(/\{\{result\.([a-z0-9-]+)\}\}/g, (_match, id: string) => `{{result.${prefix}${id}}}`); }
function namespaceGate(gate: WorkflowGate, prefix: string): WorkflowGate {
	const ns = (value: string): string => namespaceTemplate(value, prefix);
	const nsArgs = (args: string[]): string[] => args.map(arg => namespaceTemplate(arg, prefix));
	const expect = gate.expect ? {
		...(gate.expect.exitCode !== undefined ? { exitCode: gate.expect.exitCode } : {}),
		...(gate.expect.stdout !== undefined ? { stdout: namespaceTemplate(gate.expect.stdout, prefix) } : {}),
		...(gate.expect.stderr !== undefined ? { stderr: namespaceTemplate(gate.expect.stderr, prefix) } : {}),
	} : undefined;
	return {
		...gate,
		id: `${prefix}${gate.id}`,
		...(gate.prompt !== undefined ? { prompt: ns(gate.prompt) } : {}),
		...(gate.command !== undefined ? { command: ns(gate.command) } : {}),
		...(gate.executable !== undefined ? { executable: ns(gate.executable) } : {}),
		...(gate.args !== undefined ? { args: nsArgs(gate.args) } : {}),
		...(gate.repair !== undefined ? { repair: ns(gate.repair) } : {}),
		...(expect !== undefined ? { expect } : {}),
	};
}

export interface ExpandedStage { id: string; label: string; tasks: WorkflowTaskV2[]; gates: WorkflowGate[]; }
export function expandStages(workflow: WorkflowFileV2, resolveChild: ((name: string) => WorkflowDefinition | undefined) | undefined, prefix = "", stack: string[] = []): ExpandedStage[] {
	if (stack.includes(workflow.name)) throw new Error(`workflow cycle detected: ${[...stack, workflow.name].join(" -> ")}`);
	const nextStack = [...stack, workflow.name];
	const expanded: ExpandedStage[] = [];
	for (const stage of workflow.stages) {
		const localTasks: WorkflowTaskV2[] = [];
		const nested: ExpandedStage[] = [];
		for (const task of stage.tasks) {
			if (!task.workflow) {
				localTasks.push({ ...task, id: `${prefix}${task.id}`, prompt: namespaceTemplate(task.prompt, prefix), ...(task.setup ? { setup: namespaceTemplate(task.setup, prefix) } : {}) });
				continue;
			}
			if (!resolveChild) throw new Error(`child workflow resolver required for ${task.workflow}`);
			const child = resolveChild(task.workflow);
			if (!child || !isWorkflowV2(child)) throw new Error(`child workflow ${task.workflow} not found or is not schema V2`);
			const childValidation = validateV2(child as unknown as Record<string, unknown>);
			if (childValidation) throw new Error(`child workflow ${task.workflow} is invalid: ${childValidation.code}: ${childValidation.message}`);
			nested.push(...expandStages(child, resolveChild, `${prefix}${task.id}-`, nextStack));
		}
		if (localTasks.length > 0 || stage.gates.length > 0) expanded.push({ id: `${prefix}${stage.id}`, label: stage.label, tasks: localTasks, gates: stage.gates.map(gate => namespaceGate(gate, prefix)) });
		expanded.push(...nested);
	}
	return expanded;
}

/** Deterministic, bounded projection of a failed GateReport for the same-session
 *  repair prompt. Self-contained by design: renderWorkflowDefinition embeds this
 *  function's own source into generated eval JavaScript, so the helper covered by
 *  tests and the behavior of rendered workflows cannot drift apart. */
export function buildRepairPrompt(repair: string, report: GateReport): string {
	const tail = (value: unknown, max: number): string => {
		const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value) ?? "";
		return text.length > max ? text.slice(-max) : text;
	};
	const violations = (report.violations ?? []).map(String).slice(0, 20);
	const checks = (report.checks ?? []).slice(0, 40);
	const parts: string[] = [`gate: ${tail(report.gate, 200)}`, `passed: ${report.passed === true}`];
	if (typeof report.exitCode === "number") parts.push(`exitCode: ${report.exitCode}`);
	if (violations.length > 0) parts.push(`violations:\n${violations.map(violation => `- ${tail(violation, 500)}`).join("\n")}`);
	if (checks.length > 0) {
		parts.push(`checks:\n${checks.map(check => {
			const okFlag = check.ok === false ? "FAIL" : check.ok === true ? "PASS" : "?";
			const note = tail(check.note, 400);
			return `- [${okFlag}] ${tail(check.item, 200)}${note ? ` — ${note}` : ""}`;
		}).join("\n")}`);
	}
	for (const key of ["stdout", "stderr", "evidenceTail"] as const) {
		const value = report[key];
		if (typeof value === "string" && value.trim().length > 0) parts.push(`${key} (tail):\n${tail(value, 4000)}`);
	}
	return `${repair}\n\n## Failed gate report — repair these exact violations in this same working session; do not restart unrelated work\n\n${parts.join("\n")}`;
}

/** Governance envelope injected into every rendered agent/setup prompt
 *  (design §3D step 2). Values come verbatim from run provenance; absent
 *  values render as explicit absences and are never fabricated. */
export interface GovernanceContext {
	ownerIds?: string[];
	artifactKind?: string;
	artifactPath?: string;
	gitCommit?: string;
	gitBranch?: string;
	worktreeName?: string;
	routeRef?: string;
}

export function renderGovernanceSetup(governance: GovernanceContext | undefined): string {
	if (!governance) return "";
	const lines: string[] = [];
	const owners = (governance.ownerIds ?? []).filter(id => typeof id === "string" && id.trim().length > 0);
	lines.push(owners.length > 0 ? `Backlog owners (verified IDs only): ${owners.join(", ")}` : "Backlog owners: none recorded for this run");
	if (governance.artifactKind || governance.artifactPath) {
		lines.push(`Durable artifact: kind=${governance.artifactKind ?? "unspecified"} path=${governance.artifactPath ?? "unspecified"}; link it through Backlog operations before durable writes`);
	}
	const repo = [
		governance.worktreeName ? `mode=git worktree isolation "${governance.worktreeName}"` : "mode=shared workspace",
		governance.gitCommit ? `commit=${governance.gitCommit}` : "commit=not recorded",
		governance.gitBranch ? `branch=${governance.gitBranch}` : "branch=not recorded",
	];
	lines.push(`Repository: native Git is authoritative (${repo.join("; ")})${governance.routeRef ? `; route=${governance.routeRef}` : ""}`);
	lines.push(
		"Forbidden operations: never edit Backlog task/document markdown files directly (use Backlog CLI/plugin operations only); "
		+ "workers never run git push or move main; only the coordinator integrates the worker branch to main and pushes origin main.",
	);
	return lines.join("\n");
}

/** Build the governance envelope for a recovery run from the parent journal's
 *  created record. Only fields actually recorded by the parent are carried. */
export function governanceFromCreated(created: JournalEvent): GovernanceContext {
	return {
		...(Array.isArray(created.ownerIds) ? { ownerIds: created.ownerIds.map(String) } : {}),
		...(typeof created.gitCommit === "string" ? { gitCommit: created.gitCommit } : {}),
		...(typeof created.gitBranch === "string" ? { gitBranch: created.gitBranch } : {}),
		...(typeof created.worktreeName === "string" ? { worktreeName: created.worktreeName } : {}),
		...(typeof created.routeRef === "string" ? { routeRef: created.routeRef } : {}),
	};
}

// ── Oversized GateReport evidence: session-artifact routing contracts ───────

/** Inline-size ceiling (JSON bytes) for GateReports persisted verbatim in the
 *  run journal. Larger evidence routes through an OMP session artifact; the
 *  journal keeps a bounded copy plus a bounded pointer/content-hash and remains
 *  execution-authoritative for external outcomes. */
export const GATE_REPORT_INLINE_LIMIT = 16_384;

export interface GateArtifactPointer {
	artifactId?: string | undefined;
	path?: string | undefined;
	contentHash: string;
	bytes: number;
}

/** Bounded journal-safe projection of an oversized GateReport: evidence blobs
 *  collapse to short tails; verdict metadata (gate, passed, checks, violations,
 *  exit/result metadata, duration, tool) is preserved verbatim so the journal
 *  stays authoritative for acceptance decisions. */
export function boundGateReportForJournal(report: GateReport): GateReport {
	return {
		gate: report.gate,
		passed: report.passed,
		...(report.advisory !== undefined ? { advisory: report.advisory } : {}),
		checks: (report.checks ?? []).slice(0, 40),
		violations: (report.violations ?? []).map(String).slice(0, 20),
		evidenceTail: (report.evidenceTail ?? "").slice(-600),
		exitCode: report.exitCode,
		killed: report.killed,
		signal: report.signal,
		durationMs: report.durationMs,
		tool: report.tool,
	};
}

/** Bounded pointer for a stored GateReport payload: canonical content hash of
 *  the full report plus byte size, optionally the session artifact id/path. */
export function gateArtifactPointer(report: GateReport, saved?: { id?: string; path?: string }): GateArtifactPointer {
	return {
		...(saved?.id ? { artifactId: saved.id } : {}),
		...(saved?.path ? { path: saved.path } : {}),
		contentHash: contentHash(report),
		bytes: Buffer.byteLength(JSON.stringify(report)),
	};
}


export interface RenderRecovery {
	seeds?: Record<string, unknown>;
	skipStages?: string[];
	governance?: GovernanceContext;
	/** AC25: explicit bounded-scheduling config; defaults are fail-closed. */
	parallel?: ParallelPolicy;
}

export function renderWorkflowDefinition(workflow: WorkflowDefinition, inputs: Record<string, string>, runId: string = randomUUID(), resolveChild?: (name: string) => WorkflowDefinition | undefined, recovery?: RenderRecovery): string {
	if (!isWorkflowV2(workflow)) return renderWorkflow(workflow, inputs);
	const validation = validateV2(workflow as unknown as Record<string, unknown>);
	if (validation) throw new Error(`${validation.code}: ${validation.message}`);
	const stages = expandStages(workflow, resolveChild);
	for (const stage of stages) {
		for (const gate of stage.gates) {
			if (!["shell", "exec", "just", "lsp"].includes(gate.type)) continue;
			const command = gate.command ?? gate.executable;
			if (!command) continue;
			// Interpolated commands/argv are classified at execution after substitution.
			const templated = command.includes("{{") || (gate.args ?? []).some(arg => arg.includes("{{"));
			if (templated) continue;
			const full = gate.command ? command : [command, ...(gate.args ?? [])].join(" ");
			const reason = directiveBlockReason(full);
			if (reason) throw new Error(`gate ${gate.id} command is unsafe: ${reason}`);
		}
	}
	const seeds = recovery?.seeds ?? {};
	const skipStages = new Set(recovery?.skipStages ?? []);
	// Design §3D step 2: every rendered agent/setup prompt carries the Backlog/Git
	// governance envelope. Recovery runs rebuild it from the parent journal.
	let governance = recovery?.governance;
	if (!governance && isRecord(workflow) && Array.isArray((workflow as { stages?: unknown }).stages)) {
		governance = {
			...(Array.isArray((workflow as WorkflowFileV2).owners) ? { ownerIds: ((workflow as WorkflowFileV2).owners ?? []).map(String) } : {}),
		};
	}
	const governanceBlock = renderGovernanceSetup(governance);
	const withGovernance = (prompt: string): string => governanceBlock ? `${governanceBlock}\n\n${prompt}` : prompt;
	const lines: string[] = [
		`const workflow = ${json(workflow)};`,
		`const inputs = ${json(inputs)};`,
		`const runId = ${json(runId)};`,
		`const results = ${json(seeds)};`,
		"const normalize = value => value && typeof value === 'object' && value.details ? { ...value.details, isError: value.isError === true } : value;",
		"const stopped = value => value?.status === 'stopped' || value?.stopped === true;",
		// Same-session repair evidence builder, embedded from the runtime export so
		// the generated workflow and the tested implementation share one source of truth.
		`const buildRepairPrompt = ${buildRepairPrompt};`,
		"const render = template => String(template).replace(/\\{\\{input\\.([a-z0-9-]+)\\}\\}/g, (_, id) => inputs[id] ?? '').replace(/\\{\\{result\\.([a-z0-9-]+)\\}\\}/g, (_, id) => typeof results[id] === 'string' ? results[id] : JSON.stringify(results[id] ?? ''));",
		"const report = async (event, data = {}) => normalize(await tool.omp_workflow_report({ runId, workflow: workflow.name, event, ...data }));",
		// AC24/AC25: every agent launch is reserved against the host ledger before
		// execution (tool.omp_workflow_reserve_launch); exhaustion fails the run closed.
		"const reserve = async () => { if (typeof tool.omp_workflow_reserve_launch !== 'function') return; let response; try { response = await tool.omp_workflow_reserve_launch({ runId }); } catch (error) { throw Object.assign(new Error('host launch refused: ' + String(error && error.message || error)), { code: 'WORKFLOW_LAUNCH_REFUSED' }); } if (response && (response.isError === true || (response.details && response.details.code === 'WORKFLOW_BUDGET_EXHAUSTED'))) { throw Object.assign(new Error('host budget exhausted before launch'), { code: 'WORKFLOW_BUDGET_EXHAUSTED', details: response.details }); } };",
		`const boundedParallel = async (tasks) => { const limit = ${Math.max(1, recovery?.parallel?.limit ?? DEFAULT_PARALLEL_LIMIT)}; const failFast = ${recovery?.parallel?.failFast === true}; const results = new Array(tasks.length); let failed = false; let next = 0; const worker = async () => { while (true) { if (failFast && failed) return; const index = next++; if (index >= tasks.length) return; try { await reserve(); } catch (error) { results[index] = [null, false]; throw error; } try { results[index] = [await tasks[index](), true]; } catch (error) { if (error && error.code === 'WORKFLOW_BUDGET_EXHAUSTED') { results[index] = [null, false]; throw error; } failed = true; results[index] = [null, false]; } } }; await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker)); return results; };`,
		"try {",
	];
	for (const stage of stages) {
		if (skipStages.has(stage.id)) {
			lines.push(`// stage ${json(stage.id)} completed in the previous run; resumed from journal evidence`);
			continue;
		}
		lines.push(`phase(${json(stage.label)});`);
		lines.push(`if (stopped(await report('stage_start', { stageId: ${json(stage.id)} }))) return { workflow: workflow.name, results, runId, status: 'stopped' };`);
		const taskAgentName = stage.tasks.find(task => typeof task.agent === "string")?.agent ?? "task";
		const taskEntries = stage.tasks.map(task => {
			const prompt = task.setup ? `${withGovernance(task.setup)}\n\n${task.prompt}` : withGovernance(task.prompt);
			const schema = task.schema ? `, schema: ${json(task.schema)}` : "";
			const agent = task.agent ?? "task";
			return `async () => [${json(task.id)}, await agent(render(${json(prompt)}), { agent: ${json(agent)}, label: ${json(`workflow:${workflow.name}:${stage.id}:${task.id}`)}${schema} })]`;
		});
		lines.push(`const fanout_${stage.id.replace(/[^a-zA-Z0-9_$]/g, "_")} = await boundedParallel([${taskEntries.join(",")}]);`);
		lines.push(`Object.assign(results, Object.fromEntries(fanout_${stage.id.replace(/[^a-zA-Z0-9_$]/g, "_")}.filter((entry) => entry[1] === true).map((entry) => entry[0])));`);
		for (const gate of stage.gates) {
			const name = variable(`${stage.id}-${gate.id}`);
			if (gate.type === "budget" && gate.threshold !== undefined) lines.push(`const budgetRemaining_${name} = typeof budget !== 'undefined' && typeof budget.remaining === 'function' ? await budget.remaining() : undefined;`);
			if (gate.type === "checkpoint") {
				lines.push(`const raw_${name} = await tool.omp_workflow_checkpoint({ runId, prompt: render(${json(gate.prompt ?? gate.id)}), auto: ${gate.auto === true} });`);
				lines.push(`const checkpoint_${name} = normalize(raw_${name});`);
				lines.push(`const ${name} = { ...checkpoint_${name}, passed: checkpoint_${name}?.approved === true, violations: checkpoint_${name}?.approved === true ? [] : ['checkpoint rejected'] };`);
			} else {
				const evidence = gate.type === "llm" ? `, evidence: await completion(render(${json(gate.prompt ?? gate.id)}), "default", undefined${gate.schema !== undefined ? `, ${json(gate.schema)}` : ""})` : gate.type === "budget" ? ", evidence: { budgetRemaining: typeof budget !== 'undefined' && typeof budget.remaining === 'function' ? await budget.remaining() : undefined }" : "";
				if (gate.type === "shell" && gate.command && !gate.executable && !gate.command.includes("{{")) {
					lines.push(`const rawBash_${name} = await tool.bash({ command: render(${json(gate.command)}), timeout: ${gate.timeoutMs ?? 120_000} });`);
					lines.push(`const bash_${name} = normalize(rawBash_${name});`);
					lines.push(`const raw_${name} = await tool.omp_workflow_gate({ runId, workflow: workflow.name, stageId: ${json(stage.id)}, gate: ${json(gate)}, inputs, results, execution: { code: bash_${name}?.exitCode ?? bash_${name}?.code ?? 1, stdout: bash_${name}?.stdout ?? '', stderr: bash_${name}?.stderr ?? '', killed: bash_${name}?.killed ?? false } });`);
				} else {
					lines.push(`const raw_${name} = await tool.omp_workflow_gate({ runId, workflow: workflow.name, stageId: ${json(stage.id)}, gate: ${json(gate)}, inputs, results${evidence} });`);
				}
				lines.push(`const ${name} = normalize(raw_${name});`);
				if (gate.type === "budget" && gate.threshold !== undefined) lines.push(`if (budgetRemaining_${name} !== undefined && budgetRemaining_${name} < ${gate.threshold}) return { workflow: workflow.name, results, runId, status: 'budget_exhausted', reason: 'budget threshold reached' };`);
			}
			lines.push(`if (stopped(${name})) return { workflow: workflow.name, results, runId, status: 'stopped' };`);
			const optional = gate.type === "checkpoint" ? false : gate.optional === true || gate.advisory === true;
			const failureStatus = gate.type === "checkpoint" ? "cancelled" : "failed";
			if (gate.repair && (gate.retries ?? 0) > 0 && gate.type !== "checkpoint") {
				// Design §3B: a failed gate sends the full GateReport to the SAME agent
				// identity/session for repair — never a cold restart. Bounded by the gate's
				// retries AND a host budget probe before every retry; exhaustion preserves
				// the LAST GateReport verbatim in the returned evidence.
				lines.push(`if (!${name}.passed && !${optional}) {`);
				lines.push(`  let lastReport_${name} = ${name};`);
				lines.push(`  const repairPromptBase_${name} = buildRepairPrompt(render(${json(gate.repair)}), ${name});`);
				lines.push(`  const label_${name} = ${json(`workflow:${workflow.name}:${stage.id}:${gate.id}:repair`)};`);
				lines.push(`  for (let attempt = 1; attempt <= ${gate.retries}; attempt++) {`);
				lines.push(`    if (typeof budget !== 'undefined' && typeof budget.remaining === 'function') {`);
				lines.push(`      const remainingBeforeRetry = await budget.remaining();`);
				lines.push("      if (remainingBeforeRetry !== undefined && remainingBeforeRetry <= 0) return { workflow: workflow.name, results, runId, status: 'budget_exhausted', reason: `budget exhausted before repair attempt ${attempt} of " + String(gate.retries) + "` };");
				lines.push(`    }`);
				lines.push(`    await reserve();`);
				lines.push(`    await agent(repairPromptBase_${name}, { agent: ${json(taskAgentName)}, label: label_${name} });`);
				lines.push(`    const rawRetry = await tool.omp_workflow_gate({ runId, workflow: workflow.name, stageId: ${json(stage.id)}, gate: ${json(gate)}, inputs, results, attempt });`);
				lines.push("    const retry = normalize(rawRetry);");
				lines.push("    if (retry?.passed || retry?.advisory) break;");
				lines.push(`    lastReport_${name} = retry ?? lastReport_${name};`);
				lines.push(`    if (attempt === ${gate.retries}) return { workflow: workflow.name, results, runId, status: ${json(failureStatus)}, reason: lastReport_${name}?.violations?.join('; ') ?? 'gate failed', report: lastReport_${name} };`);
				lines.push("  }");
				lines.push("}");
			} else {
				lines.push(`if (!${name}.passed && !${optional}) return { workflow: workflow.name, results, runId, status: ${json(failureStatus)}, reason: ${name}.violations?.join('; ') ?? 'gate failed' };`);
			}
		}
		lines.push(`if (stopped(await report('stage_complete', { stageId: ${json(stage.id)}, results }))) return { workflow: workflow.name, results, runId, status: 'stopped' };`);
	}
	lines.push("const complete = await report('complete', { results, outputs: workflow.outputs });");
	lines.push("if (stopped(complete)) return { workflow: workflow.name, results, runId, status: 'stopped' };");
	lines.push("if (complete?.status === 'failed' || complete?.isError) return { workflow: workflow.name, results, runId, status: 'failed', reason: complete?.violations?.join('; ') ?? 'output validation failed' };");
	lines.push("return { workflow: workflow.name, results, runId, status: complete?.status ?? 'completed' };");
	lines.push("} catch (error) {");
	lines.push("  try { await tool.omp_workflow_report({ runId, workflow: workflow.name, event: 'failed', status: 'failed', reason: String(error) }); } catch {};");
	lines.push("  return { workflow: workflow.name, results, runId, status: 'failed', reason: String(error) };");
	lines.push("}");
	return lines.join("\n");
}

// ── Bounded parallel scheduler (design §3E/§7A/§7B row 7) ───────────────────

export interface ParallelPolicy {
	/** Maximum concurrently launched tasks. Default 4 (fail-closed conservative). */
	limit?: number;
	/** Stop launching new tasks after the first rejection. Default false. */
	failFast?: boolean;
}

export const DEFAULT_PARALLEL_LIMIT = 4;

/** Bounded worker pool over task thunks. True in-flight cancellation requires
 *  OMP-core abort propagation (§7B row 4/7), so this is the documented
 *  extension-level fallback: launches are bounded, and with failFast the
 *  scheduler stops launching further chunks after the first failure while
 *  already-running tasks remain indeterminate until they settle.
 *  Ad-hoc callers passing no policy keep plain all-at-once semantics. */
export async function runBoundedParallel<T>(tasks: Array<() => Promise<T>>, policy: ParallelPolicy = {}): Promise<Array<{ ok: true; value: T } | { ok: false; error: unknown }>> {
	const limit = Math.max(1, Math.min(policy.limit ?? DEFAULT_PARALLEL_LIMIT, tasks.length));
	const results: Array<{ ok: true; value: T } | { ok: false; error: unknown }> = new Array(tasks.length);
	let next = 0;
	let failed = false;
	const workers = Array.from({ length: limit }, async () => {
		while (true) {
			if (policy.failFast === true && failed) return;
			const index = next++;
			if (index >= tasks.length) return;
			try {
				results[index] = { ok: true, value: await tasks[index]!() };
			} catch (error) {
				failed = true;
				results[index] = { ok: false, error };
			}
		}
	});
	await Promise.all(workers);
	return results;
}

function runDir(cwd: string, runId: string): string {
	if (!RUN_ID_RE.test(runId)) throw new Error("invalid workflow run id");
	const root = resolve(cwd, ".omp", "workflows", "runs");
	const target = resolve(root, runId);
	const rel = relative(root, target);
	if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) throw new Error("workflow run path escapes runs root");
	// Reject symlinked ancestors from the project root down to the runs root.
	const anchor = resolve(cwd);
	const components = [anchor, join(anchor, ".omp"), join(anchor, ".omp", "workflows"), root];
	for (const component of components) {
		if (existsSync(component) && lstatSync(component).isSymbolicLink()) throw new Error("workflow journal ancestor cannot be a symlink");
	}
	if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("workflow run cannot be a symlink");
	return target;
}

export function journalPath(cwd: string, runId: string): string { return join(runDir(cwd, runId), "journal.jsonl"); }

// ── Host budget ledger (design §7A/§7B row 3) ───────────────────────────────

/** Host-enforced run budget: launch/time limits are HARD (fail closed before
 *  execution); token/cost limits stay ADVISORY until OMP exposes authoritative
 *  per-call usage telemetry (§7B row 3: "Exact OMP-core API needed"). */
export interface WorkflowBudgetConfig {
	maxLaunches?: number;
	maxWallClockMs?: number;
	/** Advisory only — no OMP usage telemetry exists to enforce it. */
	maxTokens?: number;
}

export const DEFAULT_RUN_BUDGET: Readonly<WorkflowBudgetConfig> = Object.freeze({ maxLaunches: 64, maxWallClockMs: 30 * 60_000 });

interface BudgetLedgerState {
	launched: number;
	startedAt: number;
	exhausted?: "launches" | "wall_clock";
}

const activeBudgetLedgers = new Map<string, BudgetLedgerState>();

/** Reserve one host launch against the run's ledger. Throws (fail closed)
 *  when the configured launch or wall-clock ceiling is already exhausted.
 *  Runs without an explicit config keep the conservative default ceiling. */
export function reserveRunLaunch(cwd: string, runId: string, config: WorkflowBudgetConfig = DEFAULT_RUN_BUDGET): void {
	let state = activeBudgetLedgers.get(runId);
	if (!state) { state = { launched: 0, startedAt: Date.now() }; activeBudgetLedgers.set(runId, state); }
	if (config.maxLaunches !== undefined && state.launched >= config.maxLaunches) {
		state.exhausted = "launches";
		appendRunEvent(cwd, runId, { event: "failed", status: "budget_exhausted", reason: `host budget exhausted: ${state.launched} agent/tool launches reached the configured ceiling of ${config.maxLaunches}` });
		throw new Error(`workflow host budget exhausted: launch ceiling ${config.maxLaunches} reached`);
	}
	if (config.maxWallClockMs !== undefined && Date.now() - state.startedAt >= config.maxWallClockMs) {
		state.exhausted = "wall_clock";
		appendRunEvent(cwd, runId, { event: "failed", status: "budget_exhausted", reason: `host budget exhausted: wall-clock ceiling of ${Math.round(config.maxWallClockMs / 1000)}s reached before launch` });
		throw new Error("workflow host budget exhausted: wall-clock ceiling reached");
	}
	state.launched += 1;
}

export function budgetLedgerSnapshot(runId: string): { launched: number; elapsedMs: number; exhausted?: string } | undefined {
	const state = activeBudgetLedgers.get(runId);
	if (!state) return undefined;
	return { launched: state.launched, elapsedMs: Date.now() - state.startedAt, ...(state.exhausted ? { exhausted: state.exhausted } : {}) };
}

export interface CreateRunOptions {
	parentRunId?: string;
	mode?: "resume" | "retry";
	routeMode?: "direct" | "chain";
	ownerIds?: string[];
	gitCommit?: string;
	gitBranch?: string;
	worktreeName?: string;
	routeRef?: string;
	previewRef?: string;
	contentHash?: string;
	reason?: string;
	artifactKind?: string;
	artifactPath?: string;
	/** AC24 host budget ledger: hard launch ceiling for this run. */
	maxLaunches?: number;
	/** AC24 host budget ledger: hard wall-clock ceiling (ms) for this run. */
	maxWallClockMs?: number;
}

export function createRun(cwd: string, workflow: string, inputs: Record<string, string>, options: CreateRunOptions = {}): string {
	const runId = randomUUID();
	const dir = runDir(cwd, runId);
	mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
	appendRunEvent(cwd, runId, { event: "created", workflow, inputs, status: "running", ...options });
	return runId;
}

export function appendRunEvent(cwd: string, runId: string, event: Omit<JournalEvent, "timestamp" | "runId">): JournalEvent {
	if (!event.event) throw new Error("workflow journal event is required");
	if (event.operationId) {
		const existing = readRunEvents(cwd, runId).find(entry => entry.operationId === event.operationId);
		if (existing) return existing;
	}
	const dir = runDir(cwd, runId);
	mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
	const journal = join(dir, "journal.jsonl");
	if (existsSync(journal) && lstatSync(journal).isSymbolicLink()) throw new Error("workflow journal cannot be a symlink");
	if (existsSync(journal)) chmodSync(journal, 0o600);
	const entry = { ...event, timestamp: new Date().toISOString(), runId } as JournalEvent;
	appendFileSync(journal, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
	return entry;
}

export function readRunEvents(cwd: string, runId: string): JournalEvent[] {
	const path = journalPath(cwd, runId);
	if (!existsSync(path)) return [];
	if (lstatSync(path).isSymbolicLink()) throw new Error("workflow journal cannot be a symlink");
	return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
		try {
			const parsed = JSON.parse(line) as unknown;
			if (!isRecord(parsed) || typeof parsed.event !== "string") throw new Error("invalid event");
			return parsed as JournalEvent;
		} catch {
			return { timestamp: new Date().toISOString(), runId, event: "journal_error", status: "failed", line: index + 1, reason: "malformed journal entry" };
		}
	});
}

export function runStatus(cwd: string, runId: string): { runId: string; status: string; events: JournalEvent[]; stopped: boolean } {
	const events = readRunEvents(cwd, runId);
	const stopped = events.some(event => event.event === "stop" || event.status === "stopped");
	const latestStatus = [...events].reverse().find(event => typeof event.status === "string")?.status ?? "unknown";
	return { runId, status: stopped ? "stopped" : latestStatus, events, stopped };
}

export function stopRun(cwd: string, runId: string, reason = "stopped by user"): JournalEvent {
	return appendRunEvent(cwd, runId, { event: "stop", status: "stopped", reason });
}

function substitute(value: string, inputs: Record<string, string>, results: Record<string, unknown>): string {
	return value.replace(/\{\{input\.([a-z0-9-]+)\}\}/g, (_match, key: string) => inputs[key] ?? "").replace(/\{\{result\.([a-z0-9-]+)\}\}/g, (_match, key: string) => {
		const result = results[key];
		return typeof result === "string" ? result : JSON.stringify(result ?? "");
	});
}

function tokenizeCommand(command: string): { args?: string[]; error?: string } {
	const args: string[] = []; let current = ""; let quote: "'" | '"' | undefined;
	for (const char of command.trim()) {
		if (quote) { if (char === quote) quote = undefined; else current += char; continue; }
		if (char === "'" || char === '"') { quote = char; continue; }
		if (/\s/.test(char)) { if (current) { args.push(current); current = ""; } continue; }
		current += char;
	}
	if (quote) return { error: "raw command has an unterminated quote" };
	if (current) args.push(current);
	return args.length > 0 ? { args } : { error: "gate command is empty" };
}

function argvFromGate(gate: WorkflowGate, inputs: Record<string, string>, results: Record<string, unknown>): { command?: string; args: string[]; error?: string } {
	if (gate.executable) return { command: substitute(gate.executable, inputs, results), args: (gate.args ?? []).map(arg => substitute(arg, inputs, results)) };
	if (!gate.command) return { args: [], error: "gate has no executable or command" };
	if (/[;&|<>`$()]/.test(gate.command)) return { args: [], error: "raw shell metacharacters are rejected; use executable and args" };
	const parsed = tokenizeCommand(substitute(gate.command, inputs, results));
	if (parsed.error || !parsed.args?.[0]) return { args: [], error: parsed.error ?? "gate command is empty" };
	const [command, ...args] = parsed.args;
	return { command, args };
}

/** Normalized tool identity for a GateReport: executable plus its --version/
 *  equivalent probe output. Probing is best-effort and bounded; failures never
 *  flip the gate verdict. */
export async function resolveToolVersion(tool: string | undefined, cwd: string, exec: ExecFn): Promise<string | undefined> {
	if (!tool || /[;&|`$><(){}\n]/.test(tool)) return undefined;
	const result = await safeExec(exec, tool, ["--version"], { cwd, timeout: 5_000 });
	if (result.code !== 0) return undefined;
	return `${tool} ${result.stdout.trim().split("\n")[0]?.slice(0, 80)}`.trim();
}

const EVIDENCE_STRING_LIMIT = 4_000;

/** Enforce the evidence-bearing GateReport contract (design §3B/§3C): a bare
 *  boolean with no per-item checks is invalid at the normalization boundary.
 *  Evidence strings are bounded here so journal/TUI consumers can trust size. */
export function normalizeGateReport(report: unknown): { report?: GateReport; error?: string } {
	if (!isRecord(report)) return { error: "gate report must be an object" };
	if (typeof report.passed !== "boolean") return { error: "gate report passed must be a boolean" };
	if (!Array.isArray(report.checks)) return { error: "gate report must carry per-item checks; boolean-only reports are invalid" };
	const checks: GateCheck[] = [];
	for (const check of report.checks as unknown[]) {
		if (!isRecord(check) || typeof check.item !== "string" || typeof check.ok !== "boolean") return { error: "each gate check requires item and ok fields" };
		checks.push({
			item: String(check.item).slice(0, EVIDENCE_STRING_LIMIT),
			ok: check.ok,
			...(typeof check.note === "string" ? { note: String(check.note).slice(0, EVIDENCE_STRING_LIMIT) } : {}),
			...(typeof check.tool === "string" ? { tool: check.tool } : {}),
			...(typeof check.durationMs === "number" ? { durationMs: check.durationMs } : {}),
		});
	}
	const violations = Array.isArray(report.violations) ? (report.violations as unknown[]).map(value => String(value).slice(0, EVIDENCE_STRING_LIMIT)) : [];
	const normalized: GateReport = {
		gate: typeof report.gate === "string" ? report.gate : "unknown",
		passed: report.passed,
		checks,
		violations,
		...(report.advisory !== undefined ? { advisory: report.advisory === true } : {}),
		...(typeof report.evidenceTail === "string" ? { evidenceTail: report.evidenceTail.slice(-EVIDENCE_STRING_LIMIT) } : {}),
		...(typeof report.stdout === "string" ? { stdout: report.stdout.slice(-EVIDENCE_STRING_LIMIT) } : {}),
		...(typeof report.stderr === "string" ? { stderr: report.stderr.slice(-EVIDENCE_STRING_LIMIT) } : {}),
		...(typeof report.exitCode === "number" ? { exitCode: report.exitCode } : {}),
		...(typeof report.killed === "boolean" ? { killed: report.killed } : {}),
		...(typeof report.signal === "string" ? { signal: report.signal } : {}),
		...(typeof report.durationMs === "number" ? { durationMs: report.durationMs } : {}),
		...(typeof report.tool === "string" ? { tool: report.tool } : {}),
		...(typeof report.version === "string" ? { version: report.version } : {}),
	};
	return { report: normalized };
}

function reportBase(gate: WorkflowGate, started: number, passed: boolean, checks: GateCheck[], violations: string[], extra: Partial<GateReport> = {}): GateReport {
	return { gate: gate.id, passed, checks, violations, durationMs: Date.now() - started, ...extra };
}

async function safeExec(exec: ExecFn, command: string, args: string[], options: { cwd: string; timeout?: number }): Promise<ExecResult> {
	try { return await exec(command, args, options); }
	catch (error) { return { code: 1, stdout: "", stderr: String(error), killed: false }; }
}

export async function executeGate(gate: WorkflowGate, cwd: string, inputs: Record<string, string>, results: Record<string, unknown>, exec: ExecFn, precomputed?: ExecResult, evidence?: unknown): Promise<GateReport> {
	const started = Date.now();
	if (gate.type === "llm") return reportBase(gate, started, true, [{ item: gate.id, ok: true, note: "advisory LLM gate; deterministic acceptance must use code" }], [], { advisory: true, evidence });
	if (gate.type === "checkpoint") return reportBase(gate, started, true, [{ item: gate.id, ok: true, note: "checkpoint delegated to OMP UI policy" }], [], { advisory: gate.advisory });
	if (gate.type === "budget") {
		// budget.remaining may be sync or async on installed kernels; resolve either shape.
		const suppliedBudget: unknown = isRecord(evidence) ? evidence.budgetRemaining : undefined;
		const resolvedBudget = typeof suppliedBudget === "number" ? suppliedBudget
			: suppliedBudget !== null && typeof suppliedBudget === "object" && typeof (suppliedBudget as { then?: unknown }).then === "function" ? await suppliedBudget
			: undefined;
		const budgetRemaining = typeof resolvedBudget === "number" ? resolvedBudget : undefined;
		if (gate.threshold !== undefined && budgetRemaining !== undefined && budgetRemaining < gate.threshold) {
			return reportBase(gate, started, false, [{ item: gate.id, ok: false, note: `budget exhausted: ${budgetRemaining} below threshold ${gate.threshold}` }], [`budget exhausted: ${budgetRemaining} below threshold ${gate.threshold}`], { advisory: false, evidence: { budgetRemaining } });
		}
		return reportBase(gate, started, true, [{ item: gate.id, ok: true, note: "budget gate evaluated by native eval budget policy" }], [], { advisory: true, evidence });
	}
	if (gate.type === "output") return reportBase(gate, started, true, [{ item: gate.id, ok: true, note: "output gate deferred to report validation" }], [], { advisory: gate.advisory });
	if (gate.type === "frontmatter") return reportBase(gate, started, true, [{ item: gate.id, ok: true, note: "frontmatter adapter available through host policy" }], [], { advisory: gate.advisory });
	const command = argvFromGate(gate, inputs, results);
	if (command.error || !command.command) return reportBase(gate, started, false, [{ item: gate.id, ok: false, note: command.error ?? "missing command" }], [command.error ?? "missing command"]);
	const safetyReason = directiveBlockReason([command.command, ...command.args].join(" "));
	if (safetyReason) return reportBase(gate, started, false, [{ item: gate.id, ok: false, note: safetyReason, tool: command.command }], [safetyReason], { tool: command.command });
	// Tool/version identity is probed only for commands that pass safety
	// classification and will actually execute; a blocked command never spawns.
	const toolVersion = await resolveToolVersion(command.command, cwd, exec);
	const result = precomputed ?? await safeExec(exec, command.command, command.args, { cwd, timeout: gate.timeoutMs ?? 120_000 });
	const evidenceTail = `${result.stdout}\n${result.stderr}`.trim().slice(-4000);
	const expected = gate.expect ?? {};
	const violations: string[] = [];
	if (result.code !== (expected.exitCode ?? 0)) violations.push(`expected exit code ${expected.exitCode ?? 0}, received ${result.code}`);
	if (expected.stdout !== undefined && !result.stdout.includes(expected.stdout)) violations.push("stdout expectation failed");
	if (expected.stderr !== undefined && !result.stderr.includes(expected.stderr)) violations.push("stderr expectation failed");
	if (result.killed) violations.push(`process killed${result.signal ? ` by ${result.signal}` : ""}`);
	const passed = violations.length === 0;
	return reportBase(gate, started, passed, [{ item: gate.id, ok: passed, note: passed ? "command passed" : violations.join("; ") || evidenceTail, tool: command.command, durationMs: Date.now() - started }], passed ? [] : violations.length > 0 ? violations : [evidenceTail || `exit code ${result.code}`], { evidenceTail, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000), exitCode: result.code, killed: result.killed, signal: result.signal, tool: command.command, ...(toolVersion ? { version: toolVersion } : {}) });
}

function outputType(schema: unknown): string | undefined { return typeof schema === "string" ? schema : isRecord(schema) && typeof schema.type === "string" ? schema.type : undefined; }
function outputMatches(value: unknown, type: string): boolean {
	if (type === "any") return true;
	if (type === "null") return value === null;
	if (type === "array") return Array.isArray(value);
	if (type === "object") return isRecord(value);
	return typeof value === type;
}

export function validateOutputs(results: Record<string, unknown>, outputs: Record<string, unknown> | undefined): string[] {
	if (!outputs) return [];
	const errors: string[] = [];
	for (const [key, schema] of Object.entries(outputs)) {
		const type = outputType(schema);
		if (!type || !["string", "number", "boolean", "object", "array", "null", "any"].includes(type)) { errors.push(`output ${key} has unsupported schema`); continue; }
		if (!outputMatches(results[key], type)) errors.push(`output ${key} expected ${type}`);
	}
	return errors;
}

const DOC_OWNER_RE = /^doc-[a-z0-9][a-z0-9-]{0,63}$/i;

// ── Artifact readiness validation (design §3D Backlog artifact contract) ────

export interface ArtifactReadinessInput {
	acceptanceCriteria?: string[];
	definitionOfDone?: string[];
	type?: string;
	priority?: string;
	status?: string;
	labels?: string[];
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
}

/** Full readiness contract enforced BEFORE durable writes: acceptance criteria,
 *  inherited Definition of Done, type/priority/status, labels, dependencies
 *  (referenced ids must exist as records — checked by the caller's Backlog probe),
 *  references/documentation links, and modified files. Returns the first gap. */
export function artifactReadinessGap(artifact: ArtifactReadinessInput): string | undefined {
	if (!artifact.acceptanceCriteria || artifact.acceptanceCriteria.length === 0) return "acceptance criteria are required before a durable write";
	const unfilledAC = artifact.acceptanceCriteria.find(value => typeof value !== "string" || value.trim().length === 0);
	if (unfilledAC !== undefined) return "acceptance criteria contain an empty item";
	if (!artifact.definitionOfDone || artifact.definitionOfDone.length === 0) return "Definition of Done (including inherited items) is required before a durable write";
	if (!artifact.type || typeof artifact.type !== "string" || artifact.type.trim().length === 0) return "artifact type is required";
	if (!artifact.priority || typeof artifact.priority !== "string" || artifact.priority.trim().length === 0) return "artifact priority is required";
	if (!artifact.status || typeof artifact.status !== "string" || artifact.status.trim().length === 0) return "artifact status is required";
	if (!artifact.labels || artifact.labels.length === 0) return "at least one label is required";
	for (const [field, values] of [["dependencies", artifact.dependencies], ["references", artifact.references], ["documentation", artifact.documentation], ["modifiedFiles", artifact.modifiedFiles]] as const) {
		if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.trim().length === 0))) {
			return `artifact ${field} must be a list of non-empty strings`;
		}
	}
	// A durable write with no modified files records nothing; require at least one.
	if (!artifact.modifiedFiles || artifact.modifiedFiles.length === 0) return "modified files are required before a durable write";
	return undefined;
}

/** Readiness gate for omp_workflow_artifact_record: combines the metadata
 *  contract above with live Backlog task/document existence probes so a bare
 *  ID can never carry an unready artifact to a durable write. */
export async function verifyArtifactReadiness(cwd: string, taskId: string, documentId: string | undefined, artifact: ArtifactReadinessInput, exec: ExecFn): Promise<GateReport> {
	const started = Date.now();
	const checks: GateCheck[] = [];
	const violations: string[] = [];
	const gap = artifactReadinessGap(artifact);
	checks.push({ item: "readiness metadata completeness", ok: gap === undefined, ...(gap ? { note: gap } : { note: "all readiness fields present" }) });
	if (gap) violations.push(gap);
	const existence = await verifyBacklogArtifact(cwd, taskId, documentId, exec);
	checks.push(...existence.checks);
	violations.push(...existence.violations);
	return { gate: "backlog-readiness", passed: violations.length === 0, checks, violations, durationMs: Date.now() - started };
}

export async function verifyBacklogArtifact(cwd: string, taskId: string, documentId: string | undefined, exec: ExecFn): Promise<GateReport> {
	const started = Date.now(); const checks: GateCheck[] = []; const violations: string[] = [];
	const docOnly = DOC_OWNER_RE.test(taskId);
	if (!docOnly) {
		const task = await safeExec(exec, "backlog", ["task", "view", taskId, "--plain"], { cwd, timeout: 30_000 });
		const taskOk = task.code === 0 && !task.killed;
		checks.push({ item: `backlog task ${taskId}`, ok: taskOk, note: taskOk ? "task metadata available" : task.stderr || task.stdout.slice(-1000), tool: "backlog" }); if (!taskOk) violations.push(`task ${taskId} unavailable`);
	}
	if (docOnly || documentId) { const docId = docOnly ? taskId : documentId!; const doc = await safeExec(exec, "backlog", ["doc", "view", docId, "--plain"], { cwd, timeout: 30_000 }); const docOk = (doc.code === 0 && !doc.killed && !/not found/i.test(doc.stderr + doc.stdout)); checks.push({ item: `backlog document ${docId}`, ok: docOk, note: docOk ? "document available" : doc.stderr || doc.stdout.slice(-1000), tool: "backlog" }); if (!docOk) violations.push(`document ${docId} unavailable`); }
	return { gate: "backlog-artifact", passed: violations.length === 0, checks, violations, durationMs: Date.now() - started };
}

/** Git-state governance probe: the real Git root, worktree status, current
 *  non-detached branch, and HEAD commit must all resolve before any mutating
 *  workflow-owned operation is approved. Each check runs a read-only Git
 *  invocation; failures accumulate as named violations and fail the gate closed. */
interface GitProbe {
	item: string;
	args: readonly string[];
	detached?: boolean;
}

async function gitProbe(cwd: string, exec: ExecFn, probe: GitProbe): Promise<{ check: GateCheck; violation?: string; evidence: string }> {
	const result = await safeExec(exec, "git", [...probe.args], { cwd, timeout: 30_000 });
	const detached = probe.detached === true && result.stdout.trim() === "HEAD";
	const passed = result.code === 0 && !result.killed && !detached;
	const note = detached ? "git HEAD is detached; a current branch is required" : passed ? result.stdout.slice(-1000) : result.stderr || result.stdout.slice(-1000);
	return {
		check: { item: probe.item, ok: passed, note, tool: "git" },
		violation: passed ? undefined : detached ? "git HEAD is detached; a current branch is required" : `${probe.item} unavailable`,
		evidence: `${probe.item}: ${note}`,
	};
}

export async function verifyGitState(cwd: string, exec: ExecFn): Promise<GateReport> {
	const probes: GitProbe[] = [
		{ item: "git root", args: ["rev-parse", "--show-toplevel"] },
		{ item: "git status", args: ["status", "--porcelain"] },
		{ item: "git branch", args: ["rev-parse", "--abbrev-ref", "HEAD"], detached: true },
		{ item: "git commit", args: ["rev-parse", "HEAD"] },
	];
	const checks: GateCheck[] = []; const violations: string[] = []; const evidence: string[] = [];
	for (const probe of probes) {
		const { check, violation, evidence: line } = await gitProbe(cwd, exec, probe);
		checks.push(check);
		evidence.push(line);
		if (violation) violations.push(violation);
	}
	return { gate: "git-state", passed: violations.length === 0, checks, violations, evidenceTail: evidence.join("\n").slice(-4000), tool: "git" };
}

export async function listJustRecipes(cwd: string, exec: ExecFn): Promise<GateReport & { recipes?: string[] }> {
	const result = await safeExec(exec, "just", ["--list", "--unsorted"], { cwd, timeout: 30_000 }); const passed = result.code === 0 && !result.killed;
	const recipes = result.stdout.split("\n").map(line => line.match(/^\s{2,}([a-zA-Z0-9_-]+)/)?.[1]).filter((value): value is string => Boolean(value));
	return { gate: "just-list", passed, recipes, checks: [{ item: "just --list", ok: passed, note: passed ? `${recipes.length} recipes discovered` : result.stderr || result.stdout.slice(-1000), tool: "just" }], violations: passed ? [] : [result.stderr || "just unavailable"], evidenceTail: result.stdout.slice(-4000), exitCode: result.code, killed: result.killed, signal: result.signal };
}

export async function runJustRecipe(cwd: string, recipe: string, args: string[], exec: ExecFn): Promise<GateReport> {
	if (!SLUG_RE.test(recipe)) return { gate: `just:${recipe}`, passed: false, checks: [{ item: recipe, ok: false, note: "recipe name is invalid" }], violations: ["recipe name is invalid"] };
	const result = await safeExec(exec, "just", [recipe, ...args], { cwd, timeout: 600_000 }); const passed = result.code === 0 && !result.killed; const evidence = `${result.stdout}\n${result.stderr}`.trim().slice(-4000);
	return { gate: `just:${recipe}`, passed, checks: [{ item: recipe, ok: passed, note: passed ? "recipe passed" : evidence || `exit code ${result.code}`, tool: "just" }], violations: passed ? [] : [evidence || `exit code ${result.code}`], evidenceTail: evidence, exitCode: result.code, killed: result.killed, signal: result.signal };
}

export function routeError(route: unknown): string | undefined {
	if (!isRecord(route)) return "route must be an object";
	if (route.mode !== "direct" && route.mode !== "chain") return "route mode must be direct or chain";
	if (!Array.isArray(route.steps) || route.steps.length === 0 || route.steps.length > MAX_ROUTE_DEPTH) return `route steps must contain 1-${MAX_ROUTE_DEPTH} items`;
	if (route.mode === "direct" && route.steps.length !== 1) return "direct routes require one workflow";
	if (route.maxDepth !== undefined && (typeof route.maxDepth !== "number" || !Number.isInteger(route.maxDepth) || route.maxDepth < 1 || route.maxDepth > MAX_ROUTE_DEPTH)) return "route maxDepth is invalid";
	const seen = new Set<string>();
	for (const step of route.steps) {
		if (!isRecord(step) || typeof step.workflow !== "string" || !SLUG_RE.test(step.workflow)) return "route contains an invalid workflow";
		if (seen.has(step.workflow)) return `cyclic workflow ${step.workflow}`;
		seen.add(step.workflow);
		if (step.inputs !== undefined && (!isRecord(step.inputs) || Object.values(step.inputs).some(value => typeof value !== "string"))) return `inputs for ${step.workflow} must be strings`;
		if (step.resultRef !== undefined && (typeof step.resultRef !== "string" || !SLUG_RE.test(step.resultRef))) return `resultRef for ${step.workflow} is invalid`;
	}
	return undefined;
}

// ── Strict WorkflowRouteV1 route plans (design §3A) ─────────────────────────

export const MAX_ROUTE_PLAN_DEPTH = MAX_ROUTE_DEPTH;

/** Host-validated, executable-nothing route plan returned by /workflows routing
 *  (omp_workflow_route). Inputs are fully resolved (defaults applied), steps are
 *  topologically ordered, every referenced gate is resolved to an approved
 *  reusable version when declared by reference, and approval is explicit. */
export interface WorkflowRouteStepV1 {
	workflow: string;
	scope?: "project" | "global";
	path?: string;
	inputs?: Record<string, string>;
	gates: Array<{ id: string; type: WorkflowGate["type"]; ref?: string; version?: string; required: boolean }>;
}

export interface WorkflowRouteV1 {
	version: 1;
	mode: "direct" | "chain";
	steps: WorkflowRouteStepV1[];
	gates: string[];
	maxDepth: number;
	approval: "required" | "auto";
	contentHash: string;
}

export function routeApprovalMode(route: Pick<WorkflowRoute, "mode">): "required" | "auto" {
	void route;
	return "required";
}

/** Resolve a gate reference to an APPROVED GateFileV1 version (design §4).
 *  Reuses the templates resolver (project-over-global precedence, hash and
 *  ownership verification); only safe/approved trust passes so draft/untrusted
 *  gates can never satisfy a route's gate availability check. */
export function resolveGateReference(ref: string, cwd: string): { gate?: GateFileV1; scope?: "project" | "global"; error?: string } {
	const resolved = resolveGateFile(ref, cwd);
	if (resolved.error || !resolved.gate) return { error: resolved.error ?? "gate not found" };
	if (resolved.gate.trust !== "approved" && resolved.gate.trust !== "safe") return { error: `gate "${ref}" is ${resolved.gate.trust}; approved or safe trust is required` };
	return { gate: resolved.gate, ...(resolved.scope ? { scope: resolved.scope } : {}) };
}

function routeGateEntries(workflow: WorkflowDefinition, cwd: string): Array<{ id: string; type: WorkflowGate["type"]; ref?: string; version?: string; required: boolean }> | string {
	const entries: Array<{ id: string; type: WorkflowGate["type"]; ref?: string; version?: string; required: boolean }> = [];
	if (!isWorkflowV2(workflow)) return entries;
	for (const stage of workflow.stages) {
		for (const gate of stage.gates) {
			if (typeof gate.ref !== "string" || gate.ref.length === 0) {
				entries.push({ id: gate.id, type: gate.type, required: !(gate.optional === true || gate.advisory === true) });
				continue;
			}
			const resolved = resolveGateReference(gate.ref, cwd);
			if (resolved.error || !resolved.gate) return `gate ${gate.id} references unavailable or untrusted gate "${gate.ref}": ${resolved.error ?? "not found"}`;
			entries.push({ id: gate.id, type: gate.type, ref: resolved.gate.id, ...(resolved.gate.version ? { version: resolved.gate.version } : {}), required: !(gate.optional === true || gate.advisory === true) });
		}
	}
	return entries;
}

/** Validate a raw route and build the strict WorkflowRouteV1 plan without
 *  executing anything. Returns the first validation failure verbatim. Route-level
 *  checks (shape/depth/cycle/typed inputs/result refs/gate trust) run BEFORE any
 *  rendering; unknown recipes are rejected here, never silently dropped. */
export function buildRoutePlan(route: unknown, cwd: string): { plan?: WorkflowRouteV1; error?: string } {
	const base = routeError(route);
	if (base) return { error: base };
	const typed = route as WorkflowRoute;
	const maxDepth = typeof typed.maxDepth === "number" ? Math.min(typed.maxDepth, MAX_ROUTE_DEPTH) : MAX_ROUTE_DEPTH;
	if (typed.steps.length > maxDepth) return { error: `route chain depth ${typed.steps.length} exceeds maxDepth ${maxDepth}` };
	const completed = new Set<string>();
	const steps: WorkflowRouteStepV1[] = [];
	const allGates: string[] = [];
	for (const step of typed.steps) {
		if (step.resultRef !== undefined && !completed.has(step.resultRef)) return { error: `forward or unknown result reference ${step.resultRef}` };
		const item = resolveWorkflowDefinition(step.workflow, cwd, "effective");
		if (item.error || !item.workflow) return { error: `unknown workflow ${step.workflow}` };
		const inputs = resolveDefinitionInputs(item.workflow, step.inputs);
		if (inputs.error) return { error: `invalid inputs for ${step.workflow}: ${inputs.error.details.message}` };
		const gates = routeGateEntries(item.workflow, cwd);
		if (typeof gates === "string") return { error: gates };
		for (const gate of gates) if (!allGates.includes(gate.ref ?? gate.id)) allGates.push(gate.ref ?? gate.id);
		steps.push({
			workflow: item.workflow.name,
			...(item.scope ? { scope: item.scope } : {}),
			...(item.path ? { path: item.path } : {}),
			...(inputs.inputs && Object.keys(inputs.inputs).length > 0 ? { inputs: inputs.inputs } : {}),
			gates,
		});
		completed.add(item.workflow.name);
	}
	const plan: WorkflowRouteV1 = {
		version: 1,
		mode: typed.mode,
		steps,
		gates: allGates,
		maxDepth,
		approval: routeApprovalMode(typed),
		contentHash: contentHash({ mode: typed.mode, steps: steps.map(step => ({ workflow: step.workflow, inputs: step.inputs })) }),
	};
	return { plan };
}

/** Recursively normalize key order so equivalent nested definitions hash identically. */
/** Recursively normalize key order so equivalent nested definitions hash identically. */
function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
		return out;
	}
	return value;
}

/** Canonical, deep-stable content hash of a value. Equivalent key orders and
 *  nested permutations of the same definition produce the same identity.
 *  A top-level `contentHash` key is excluded so a persisted definition can
 *  verify its own identity without a self-referential hash. */
export function contentHash(value: unknown): string {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		if (typeof record.contentHash === "string") {
			const { contentHash: _ignored, ...rest } = record;
			return createHash("sha256").update(JSON.stringify(canonicalize(rest))).digest("hex");
		}
	}
	return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export interface RunRecoveryEvidence {
	runId: string;
	parentRunId: string;
	workflow: string;
	inputs: Record<string, string>;
	results: Record<string, unknown>;
	skippedStages: string[];
	code: string;
	ownerIds?: string[];
	gitCommit?: string;
	gitBranch?: string;
	worktreeName?: string;
	routeRef?: string;
	previewRef?: string;
}

function isDoneStatus(status: string | undefined): boolean {
	return status === "completed" || status === "failed" || status === "cancelled" || status === "budget_exhausted";
}

const KNOWN_EVENT_KINDS = new Set(["created", "stage_start", "stage_complete", "gate", "checkpoint", "complete", "failed", "stop", "resumed", "retried"]);

function validateRunJournal(cwd: string, runId: string): { created?: JournalEvent; events?: JournalEvent[]; stageIds?: string[]; error?: string } {
	if (!RUN_ID_RE.test(runId)) return { error: "invalid workflow run id" };
	const events = readRunEvents(cwd, runId);
	if (events.length === 0) return { error: "run journal is missing" };
	const malformed = events.find(event => event.event === "journal_error");
	if (malformed) return { error: `journal is malformed at line ${String(malformed.line)}` };
	if (events[0]?.event !== "created") return { error: "run journal must begin with the created record" };
	const createdEvents = events.filter(event => event.event === "created");
	if (createdEvents.length !== 1) return { error: "run journal must contain exactly one created record" };
	const created = createdEvents[0]!;
	if (typeof created.workflow !== "string") return { error: "run journal has no created record" };
	const stageIds = new Set<string>();
	const stageStartIndex = new Map<string, number>();
	const stageCompleteIndex = new Map<string, number>();
	let terminalIndex = -1;
	for (let index = 0; index < events.length; index++) {
		const event = events[index]!;
		if (typeof event.runId === "string" && event.runId !== runId) return { error: "journal contains a foreign run id" };
		if (typeof event.workflow === "string" && event.workflow !== created.workflow) return { error: "journal contains a foreign workflow value" };
		if (!KNOWN_EVENT_KINDS.has(event.event)) return { error: `journal contains unknown event kind ${event.event}` };
		if (terminalIndex >= 0 && (event.event === "stage_start" || event.status === "running")) return { error: "journal runs after a terminal status" };
		if (event.event === "complete" || event.event === "failed" || event.event === "stop") terminalIndex = index;
		if (typeof event.stageId !== "string") continue;
		if (!SLUG_RE.test(event.stageId)) return { error: "journal contains an invalid stage id" };
		stageIds.add(event.stageId);
		if (event.event === "stage_start") {
			if (stageStartIndex.has(event.stageId)) return { error: `journal repeats stage_start for ${event.stageId}` };
			stageStartIndex.set(event.stageId, index);
		}
		if (event.event === "stage_complete") {
			const startIndex = stageStartIndex.get(event.stageId);
			if (startIndex === undefined || startIndex >= index) return { error: `stage_complete for ${event.stageId} has no preceding stage_start` };
			if (stageCompleteIndex.has(event.stageId)) return { error: `journal repeats stage_complete for ${event.stageId}` };
			stageCompleteIndex.set(event.stageId, index);
		}
	}
	return { created, events, stageIds: [...stageIds] };
}

function stageSeedResults(events: JournalEvent[], stageIds: string[]): { results: Record<string, unknown>; skipped: string[] } {
	const results: Record<string, unknown> = {};
	const skipped: string[] = [];
	for (const stageId of stageIds) {
		const start = events.find(event => event.event === "stage_start" && event.stageId === stageId);
		const complete = events.find(event => event.event === "stage_complete" && event.stageId === stageId);
		if (!start || !complete) continue;
		const reported = complete.results;
		if (typeof reported !== "object" || reported === null || Object.keys(reported).length === 0) continue;
		skipped.push(stageId);
		Object.assign(results, reported);
	}
	return { results, skipped };
}

function validateResumableStages(workflow: WorkflowDefinition, skipped: string[], resolveChild?: (name: string) => WorkflowDefinition | undefined): { error?: string } {
	if (!isWorkflowV2(workflow)) return { error: "resume requires a schema V2 workflow definition" };
	try {
		const stages = expandStages(workflow, resolveChild);
		const unknown = skipped.filter(stageId => !stages.some(stage => stage.id === stageId));
		if (unknown.length > 0) return { error: `journal references stage ${unknown[0] ?? ""} that is not in workflow "${workflow.name}"` };
		return {};
	} catch (error) {
		return { error: String(error) };
	}
}

function journalProvenance(created: JournalEvent): Omit<CreateRunOptions, "parentRunId" | "mode"> {
	const provenance: Omit<CreateRunOptions, "parentRunId" | "mode"> = {};
	if (Array.isArray(created.ownerIds)) provenance.ownerIds = created.ownerIds.map(String);
	if (typeof created.gitCommit === "string") provenance.gitCommit = created.gitCommit;
	if (typeof created.gitBranch === "string") provenance.gitBranch = created.gitBranch;
	if (typeof created.routeRef === "string") provenance.routeRef = created.routeRef;
	if (typeof created.previewRef === "string") provenance.previewRef = created.previewRef;
	if (typeof created.routeMode === "string") provenance.routeMode = created.routeMode as "direct" | "chain";
	if (typeof created.worktreeName === "string") provenance.worktreeName = created.worktreeName;
	if (typeof created.contentHash === "string") provenance.contentHash = created.contentHash;
	return provenance;
}

function journalInputs(created: JournalEvent): { inputs?: Record<string, string>; error?: string } {
	const inputs: Record<string, string> = {};
	for (const [key, value] of Object.entries(created.inputs ?? {})) {
		if (typeof value !== "string") return { error: "journaled inputs are not strings" };
		inputs[key] = value;
	}
	return { inputs };
}

function conflictingInputs(caller: Record<string, string>, journaled: Record<string, string>): string | undefined {
	for (const [key, value] of Object.entries(caller)) {
		if (!(key in journaled)) return `caller input "${key}" is not part of the journaled run`;
		if (journaled[key] !== value) return `caller input "${key}" conflicts with journaled inputs`;
	}
	return undefined;
}

function journalReferences(created: JournalEvent): Omit<RunRecoveryEvidence, "runId" | "parentRunId" | "workflow" | "inputs" | "results" | "skippedStages" | "code"> {
	const refs: Omit<RunRecoveryEvidence, "runId" | "parentRunId" | "workflow" | "inputs" | "results" | "skippedStages" | "code"> = {};
	if (Array.isArray(created.ownerIds)) refs.ownerIds = created.ownerIds.map(String);
	if (typeof created.gitCommit === "string") refs.gitCommit = created.gitCommit;
	if (typeof created.gitBranch === "string") refs.gitBranch = created.gitBranch;
	if (typeof created.worktreeName === "string") refs.worktreeName = created.worktreeName;
	if (typeof created.routeRef === "string") refs.routeRef = created.routeRef;
	if (typeof created.previewRef === "string") refs.previewRef = created.previewRef;
	return refs;
}

export function resumeWorkflowRun(cwd: string, runId: string, workflow: WorkflowDefinition | undefined, inputs?: Record<string, string>, resolveChild?: (name: string) => WorkflowDefinition | undefined, reason = "resume from journal evidence"): { run?: RunRecoveryEvidence; error?: WorkflowError } {
	if (!RUN_ID_RE.test(runId)) return { error: workflowError("WORKFLOW_RUN_INVALID", "invalid workflow run id") };
	const validated = validateRunJournal(cwd, runId);
	if (validated.error) return { error: workflowError("WORKFLOW_RESUME_REFUSED", validated.error) };
	const created = validated.created!;
	const workflowName = String(created.workflow);
	if (workflow) {
		if (workflow.name !== workflowName) return { error: workflowError("WORKFLOW_RESUME_REFUSED", `workflow "${workflow.name}" does not match the journaled run "${workflowName}"`) };
		if (!isWorkflowV2(workflow)) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "resume requires a schema V2 workflow definition") };
		if (typeof created.contentHash !== "string" || created.contentHash.length === 0) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "run journal has no recorded content hash; refusing hashless recovery") };
		if (created.contentHash !== contentHash(workflow)) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "workflow definition content changed since the run was created") };
	}
	const journaled = journalInputs(created);
	if (journaled.error) return { error: workflowError("WORKFLOW_RESUME_REFUSED", journaled.error) };
	if (!workflow) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "cannot resume without the workflow definition") };
	if (inputs) {
		const conflict = conflictingInputs(inputs, journaled.inputs!);
		if (conflict) return { error: workflowError("WORKFLOW_RESUME_REFUSED", conflict) };
	}
	const inputCheck = resolveDefinitionInputs(workflow, journaled.inputs!);
	if (inputCheck.error || !inputCheck.inputs) return { error: workflowError("WORKFLOW_RESUME_REFUSED", inputCheck.error?.details.message ?? "journaled inputs are invalid") };
	const effectiveInputs = inputCheck.inputs;
	const events = validated.events!;
	if (events.some(event => event.event === "stop" || event.status === "stopped")) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "run is stopped; retry it instead") };
	const statuses = events.filter(event => typeof event.status === "string").map(event => String(event.status));
	if (statuses.length > 0 && isDoneStatus(statuses[statuses.length - 1])) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "run already " + statuses[statuses.length - 1]) };
	if (validated.stageIds!.length === 0) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "journal has no stage evidence; nothing to resume") };
	const analysis = stageSeedResults(events, validated.stageIds!);
	if (analysis.skipped.length === 0) return { error: workflowError("WORKFLOW_RESUME_REFUSED", "no completed stage results in the journal") };
	const stageCheck = validateResumableStages(workflow, analysis.skipped, resolveChild);
	if (stageCheck.error) return { error: workflowError("WORKFLOW_RESUME_REFUSED", stageCheck.error) };
	const newRunId = createRun(cwd, workflowName, effectiveInputs, { parentRunId: runId, mode: "resume", ...journalProvenance(created), reason });
	appendRunEvent(cwd, newRunId, { event: "resumed", parentRunId: runId, status: "running", seededResults: analysis.results, skippedStages: analysis.skipped, reason });
	const code = renderWorkflowDefinition(workflow, effectiveInputs, newRunId, resolveChild, { seeds: analysis.results, skipStages: analysis.skipped, governance: governanceFromCreated(created) });
	return { run: { runId: newRunId, parentRunId: runId, workflow: workflowName, inputs: effectiveInputs, results: analysis.results, skippedStages: analysis.skipped, code, ...journalReferences(created) } };
}

export function retryWorkflowRun(cwd: string, runId: string, workflow: WorkflowDefinition | undefined, inputs?: Record<string, string>, resolveChild?: (name: string) => WorkflowDefinition | undefined, reason = "retry without result seeding"): { run?: RunRecoveryEvidence; error?: WorkflowError } {
	if (!RUN_ID_RE.test(runId)) return { error: workflowError("WORKFLOW_RUN_INVALID", "invalid workflow run id") };
	const validated = validateRunJournal(cwd, runId);
	if (validated.error) return { error: workflowError("WORKFLOW_RETRY_REFUSED", validated.error) };
	const created = validated.created!;
	const workflowName = String(created.workflow);
	if (workflow) {
		if (workflow.name !== workflowName) return { error: workflowError("WORKFLOW_RETRY_REFUSED", `workflow "${workflow.name}" does not match the journaled run "${workflowName}"`) };
		if (!isWorkflowV2(workflow)) return { error: workflowError("WORKFLOW_RETRY_REFUSED", "retry requires a schema V2 workflow definition") };
		if (typeof created.contentHash !== "string" || created.contentHash.length === 0) return { error: workflowError("WORKFLOW_RETRY_REFUSED", "run journal has no recorded content hash; refusing hashless recovery") };
		if (created.contentHash !== contentHash(workflow)) return { error: workflowError("WORKFLOW_RETRY_REFUSED", "workflow definition content changed since the run was created") };
	}
	const inputed = journalInputs(created);
	if (inputed.error) return { error: workflowError("WORKFLOW_RETRY_REFUSED", inputed.error) };
	if (!workflow) return { error: workflowError("WORKFLOW_RETRY_REFUSED", "cannot retry without the workflow definition") };
	if (inputs) {
		const conflict = conflictingInputs(inputs, inputed.inputs!);
		if (conflict) return { error: workflowError("WORKFLOW_RETRY_REFUSED", conflict) };
	}
	const inputCheck = resolveDefinitionInputs(workflow, inputed.inputs!);
	if (inputCheck.error || !inputCheck.inputs) return { error: workflowError("WORKFLOW_RETRY_REFUSED", inputCheck.error?.details.message ?? "journaled inputs are invalid") };
	const effectiveInputs = inputCheck.inputs;
	const newRunId = createRun(cwd, workflowName, effectiveInputs, { parentRunId: runId, mode: "retry", ...journalProvenance(created), reason });
	appendRunEvent(cwd, newRunId, { event: "retried", parentRunId: runId, reason });
	const code = renderWorkflowDefinition(workflow, effectiveInputs, newRunId, resolveChild, { governance: governanceFromCreated(created) });
	return { run: { runId: newRunId, parentRunId: runId, workflow: workflowName, inputs: effectiveInputs, results: {}, skippedStages: [], code, ...journalReferences(created) } };
}


// ── Observability: session mirror reconstruction ────────────────────────────

// ── Namespaced checkpoint session entries (design §3C) ──────────────────────

/** Durable namespaced session entry appended on every checkpoint approval
 *  (pi.appendEntry("ezxomp.workflowz.checkpoint", ...)). The journal remains the
 *  execution authority; this pointer makes approvals reconstructible from the
 *  OMP session branch alone. */
export interface CheckpointSessionEntry {
	runId: string;
	workflow?: string;
	stageId?: string;
	gateId?: string;
	status: "approved" | "rejected";
	routeRef?: string;
	journalRef?: string;
	artifactRefs?: string[];
	timestamp: string;
}

export function isCheckpointSessionEntry(data: unknown): data is CheckpointSessionEntry {
	return isRecord(data)
		&& typeof data.runId === "string"
		&& (data.status === "approved" || data.status === "rejected")
		&& (data.routeRef === undefined || typeof data.routeRef === "string")
		&& (data.journalRef === undefined || typeof data.journalRef === "string");
}

/** Reconstruct the latest checkpoint state per run from the current OMP session
 *  branch (sessionManager.getBranch()). Latest wins per runId. */
export function reconstructCheckpointsFromBranch(entries: SessionEntryLike[]): CheckpointSessionEntry[] {
	const byRun = new Map<string, CheckpointSessionEntry>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== "ezxomp.workflowz.checkpoint") continue;
		const data = entry.data;
		if (!isCheckpointSessionEntry(data)) continue;
		byRun.set(data.runId, { ...data, timestamp: data.timestamp || entry.timestamp || new Date().toISOString() });
	}
	return [...byRun.values()];
}

export interface RunMirror {
	runId: string;
	workflow: string;
	status: string;
	stageId?: string;
	gateId?: string;
	routeRef?: string;
	journalRef?: string;
	artifactRefs?: string[];
	timestamp: string;
}

export interface SessionEntryLike {
	type?: string;
	customType?: string;
	timestamp?: string;
	data?: unknown;
}

/** Reconstruct namespaced workflow mirrors from a session branch. The journal
 *  remains the execution authority; a mirror is only a navigation aid. */
export function reconstructRunMirrors(entries: SessionEntryLike[]): RunMirror[] {
	const mirrors: RunMirror[] = [];
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== "ezxomp.workflowz.mirror") continue;
		const data = isRecord(entry.data) ? entry.data : {};
		if (typeof data.runId !== "string" || typeof data.workflow !== "string" || typeof data.status !== "string") continue;
		mirrors.push({
			runId: data.runId,
			workflow: data.workflow,
			status: data.status,
			...(typeof data.stageId === "string" ? { stageId: data.stageId } : {}),
			...(typeof data.gateId === "string" ? { gateId: data.gateId } : {}),
			...(typeof data.routeRef === "string" ? { routeRef: data.routeRef } : {}),
			...(typeof data.journalRef === "string" ? { journalRef: data.journalRef } : {}),
			...(Array.isArray(data.artifactRefs) ? { artifactRefs: data.artifactRefs.map(String) } : {}),
			timestamp: typeof data.timestamp === "string" ? data.timestamp : (entry.timestamp ?? new Date().toISOString()),
		});
	}
	return mirrors;
}

/** Reconstruct route/checkpoint/journal/artifact pointers for a run from the
 *  authoritative journal. The journal is the only execution authority; a
 *  mirror is a navigation aid that points at it, never a substitute for it. */
export function journalMirrorRefs(cwd: string, runId: string): { routeRef?: string; journalRef?: string; artifactRefs?: string[] } {
	let events: JournalEvent[];
	try { events = readRunEvents(cwd, runId); } catch { return {}; }
	const created = events.find(event => event.event === "created");
	const routeRef = typeof created?.routeRef === "string" ? created.routeRef : typeof created?.previewRef === "string" ? created.previewRef : undefined;
	const artifactRefs: string[] = [];
	for (const event of events) {
		if (event.event !== "checkpoint" || !Array.isArray(event.artifactRefs)) continue;
		for (const ref of event.artifactRefs) if (typeof ref === "string" && !artifactRefs.includes(ref)) artifactRefs.push(ref);
	}
	return {
		...(routeRef ? { routeRef } : {}),
		journalRef: journalPath(cwd, runId),
		...(artifactRefs.length > 0 ? { artifactRefs } : {}),
	};
}

/** Build a full authoritative mirror for a run from the journal: status,
 *  route/checkpoint/journal/artifact pointers, and the active stage/gate. The
 *  journal is the only execution authority; the mirror is a navigation aid that
 *  points at it. Returns undefined when the run journal is unreadable. */
export function buildRunMirror(cwd: string, runId: string): RunMirror | undefined {
	let events: JournalEvent[];
	try { events = readRunEvents(cwd, runId); } catch { return undefined; }
	if (events.length === 0) return undefined;
	const created = events.find(event => event.event === "created");
	const workflow = typeof created?.workflow === "string" ? created.workflow : "";
	if (!workflow) return undefined;
	const status = runStatus(cwd, runId);
	const lastStage = [...events].reverse().find(event => typeof event.stageId === "string");
	const lastGate = [...events].reverse().find(event => event.event === "gate" && typeof event.gateId === "string");
	return {
		runId,
		workflow,
		status: status.stopped ? "stopped" : status.status,
		...(typeof lastStage?.stageId === "string" ? { stageId: lastStage.stageId } : {}),
		...(typeof lastGate?.gateId === "string" ? { gateId: lastGate.gateId } : {}),
		...journalMirrorRefs(cwd, runId),
		timestamp: new Date().toISOString(),
	};
}

// ── Observability: activity title / working message ─────────────────────────

export function isTerminalRunStatus(status: string): boolean {
	return status === "completed" || status === "failed" || status === "cancelled" || status === "stopped" || status === "budget_exhausted";
}

export function workflowActivityTitle(runId: string, workflow: string, status: string): string {
	return `workflowz: ${workflow} (${runId.slice(0, 8)}) — ${status}`;
}

export function workflowActivityMessage(workflow: string, status: string, stageId?: string): string {
	return stageId ? `workflowz: ${workflow} — ${status} (${stageId})` : `workflowz: ${workflow} — ${status}`;
}

/** Tracks which terminal title/working-message signals workflowz owns so that
 *  cleanup only clears workflow-owned state and never overwrites unrelated
 *  host title/message state. */
export interface WorkflowActivityState {
	titleOwned: boolean;
	messageOwned: boolean;
	/** Exact terminal title value workflowz last wrote, for ownership-safe cleanup. */
	ownedTitle?: string | undefined;
	/** Exact working-message value workflowz last wrote, for ownership-safe cleanup. */
	ownedMessage?: string | undefined;
	/** Most recent title value set by ANY caller (workflow or host), observed
	 *  through the narrow setter wrapper. Lets cleanup detect that the host
	 *  replaced workflowz's signal after activation and preserve it. */
	observedTitle?: string | undefined;
	/** Most recent working-message value set by any caller, observed through the
	 *  narrow setter wrapper. `undefined` means the default is restored. */
	observedMessage?: string | undefined;
}

/** Shared module-level activity ownership state so mirror writes and journal
 *  terminal events clear the same workflow-owned signals. */
export const workflowActivityState: WorkflowActivityState = { titleOwned: false, messageOwned: false, observedTitle: undefined, observedMessage: undefined };

/** Terminal UI surface used by workflow activity. The supported host contract
 *  (ExtensionUIContext) exposes only setters — there are no title/message
 *  getters — so ownership observation relies on narrowly wrapping the setters
 *  rather than on optional read APIs. */
export interface ActivityUI {
	setTitle(title: string): void;
	setWorkingMessage(message?: string): void;
}

/** Bookkeeping for the narrow setter wrappers installed on a live UI surface.
 *  keyed by the ui object so wrapping is idempotent and restorable. */
const observedUi = new WeakMap<object, { state: WorkflowActivityState; restore: () => void }>();

/** Wrap `ui.setTitle`/`ui.setWorkingMessage` narrowly to observe the current
 *  host-displayed values without relying on nonexistent getters. Every call is
 *  forwarded verbatim to the original setter, so host behavior is unchanged;
 *  the wrapper only records the latest value so cleanup can tell whether the
 *  host replaced workflowz's signal after activation. Returns the original ui. */
function ensureObserved(ui: ActivityUI, state: WorkflowActivityState): void {
	const existing = observedUi.get(ui);
	if (existing && existing.state === state) return;
	if (existing) existing.restore();
	const originalTitle = ui.setTitle;
	const originalMessage = ui.setWorkingMessage;
	ui.setTitle = (title: string) => {
		state.observedTitle = title;
		originalTitle.call(ui, title);
	};
	ui.setWorkingMessage = (message?: string) => {
		state.observedMessage = message;
		originalMessage.call(ui, message);
	};
	observedUi.set(ui, {
		state,
		restore: () => {
			ui.setTitle = originalTitle;
			ui.setWorkingMessage = originalMessage;
		},
	});
}

/** Remove the narrow setter wrappers for `ui` so observation never leaks across
 *  sessions or unrelated callers. Restores the original host setters unchanged. */
function releaseObserved(ui: ActivityUI): void {
	const existing = observedUi.get(ui);
	if (!existing) return;
	existing.restore();
	observedUi.delete(ui);
}

/** Apply a workflow activity signal to the terminal title and working message.
 *  Active runs install narrow setter wrappers, set workflow-owned signals, and
 *  record the exact values written. Terminal states clear a workflow-owned
 *  signal only if the observed current value still equals the recorded owned
 *  value; if host code replaced it, the external value is preserved and
 *  ownership is released without clearing. Unrelated host state is never
 *  overwritten and wrappers are removed on cleanup. */
export function applyWorkflowActivity(ui: ActivityUI, state: WorkflowActivityState, runId: string, workflow: string, status: string, stageId?: string): void {
	if (isTerminalRunStatus(status)) {
		if (state.titleOwned) {
			const current = state.observedTitle;
			const stillOwned = current === undefined || state.ownedTitle === undefined || current === state.ownedTitle;
			if (stillOwned) ui.setTitle("");
			state.titleOwned = false;
			delete state.ownedTitle;
		}
		if (state.messageOwned) {
			const current = state.observedMessage;
			const stillOwned = current === undefined || state.ownedMessage === undefined || current === state.ownedMessage;
			if (stillOwned) ui.setWorkingMessage();
			state.messageOwned = false;
			delete state.ownedMessage;
		}
		// Drop observation bookkeeping so the state object returns to its
		// initial shape and wrappers never leak across sessions/callers.
		state.observedTitle = undefined;
		state.observedMessage = undefined;
		releaseObserved(ui);
		return;
	}
	ensureObserved(ui, state);
	const title = workflowActivityTitle(runId, workflow, status);
	const message = workflowActivityMessage(workflow, status, stageId);
	ui.setTitle(title);
	ui.setWorkingMessage(message);
	state.titleOwned = true;
	state.messageOwned = true;
	state.ownedTitle = title;
	state.ownedMessage = message;
	state.observedTitle = title;
	state.observedMessage = message;
}

// ── Observability: catalog counts ───────────────────────────────────────────

export function countActiveRuns(cwd: string): number {
	const root = resolve(cwd, ".omp", "workflows", "runs");
	if (!existsSync(root)) return 0;
	let active = 0;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name)) continue;
		try {
			const status = runStatus(cwd, entry.name);
			if (!status.stopped && !isTerminalRunStatus(status.status)) active++;
		} catch {
			// unreadable run dirs are not counted as active
		}
	}
	return active;
}

export function countTemplateGates(workflow: WorkflowDefinition): number {
	if (!isWorkflowV2(workflow)) return 0;
	let count = 0;
	for (const stage of workflow.stages) {
		for (const gate of stage.gates) {
			const command = gate.command ?? gate.executable;
			const templated = (command && command.includes("{{")) || (gate.args ?? []).some(arg => arg.includes("{{"));
			if (templated) count++;
		}
	}
	return count;
}

// ── Observability: adapter health (non-mutating probes) ─────────────────────

export interface AdapterHealth {
	fallow: { detected: boolean; version?: string };
	linter: { detected: boolean; kind?: "viteplus" | "oxlint"; version?: string };
	lsp: { detected: boolean; kind?: string; version?: string };
	frontmatter: { detected: boolean; version?: string };
	languageTools: Array<{ tool: string; detected: boolean; version?: string }>;
	missingPrerequisites: string[];
	mutated: false;
}

const LANGUAGE_TOOL_PROBES: Array<[string, string[]]> = [
	["node", ["--version"]],
	["rustc", ["--version"]],
	["go", ["version"]],
	["python3", ["--version"]],
	["tsc", ["--version"]],
];

const LSP_PROBES: Array<[string, string, string[]]> = [
	["rust-analyzer", "rust-analyzer", ["--version"]],
	["gopls", "gopls", ["version"]],
	["pyright-langserver", "pyright-langserver", ["--version"]],
	["typescript-language-server", "typescript-language-server", ["--version"]],
];

/** Probe adapter prerequisites with read-only version commands only. Never
 *  runs a mutating command; `mutated` is always false. */
export async function probeAdapterHealth(cwd: string, exec: ExecFn): Promise<AdapterHealth> {
	const fallow = await safeExec(exec, "fallow", ["--version"], { cwd, timeout: 15_000 });
	const vp = await safeExec(exec, "vp", ["--version"], { cwd, timeout: 15_000 });
	const oxlint = await safeExec(exec, "oxlint", ["--version"], { cwd, timeout: 15_000 });
	const vpVersion = vp.stdout.trim().split("\n")[0];
	const oxlintVersion = oxlint.stdout.trim().split("\n")[0];
	const linter: { detected: boolean; kind?: "viteplus" | "oxlint"; version?: string } = vp.code === 0 && !vp.killed
		? { detected: true, kind: "viteplus", ...(vpVersion ? { version: vpVersion } : {}) }
		: oxlint.code === 0 && !oxlint.killed
			? { detected: true, kind: "oxlint", ...(oxlintVersion ? { version: oxlintVersion } : {}) }
			: { detected: false };
	const lsp: { detected: boolean; kind?: string; version?: string } = { detected: false };
	for (const [kind, command, args] of LSP_PROBES) {
		const result = await safeExec(exec, command, args, { cwd, timeout: 15_000 });
		if (result.code === 0 && !result.killed) {
			lsp.detected = true;
			lsp.kind = kind;
			const version = result.stdout.trim().split("\n")[0];
			if (version) lsp.version = version;
			break;
		}
	}
	const languageTools: Array<{ tool: string; detected: boolean; version?: string }> = [];
	for (const [tool, args] of LANGUAGE_TOOL_PROBES) {
		const result = await safeExec(exec, tool, args, { cwd, timeout: 15_000 });
		languageTools.push({ tool, detected: result.code === 0 && !result.killed, ...(result.code === 0 && !result.killed ? { version: result.stdout.trim().split("\n")[0] } : {}) });
	}
	const missingPrerequisites: string[] = [];
	if (fallow.code !== 0 || fallow.killed) missingPrerequisites.push("fallow");
	if (!linter.detected) missingPrerequisites.push("linter (vp or oxlint)");
	if (!lsp.detected) missingPrerequisites.push("lsp server");
	for (const tool of languageTools) if (!tool.detected) missingPrerequisites.push(tool.tool);
	return {
		fallow: { detected: fallow.code === 0 && !fallow.killed, ...(fallow.code === 0 && !fallow.killed ? { version: fallow.stdout.trim().split("\n")[0] } : {}) },
		linter,
		lsp,
		frontmatter: { detected: true, version: "regex" },
		languageTools,
		missingPrerequisites,
		mutated: false,
	};
}

// ── Observability: run outcome classification and aggregate statistics ──────

export type RunOutcomeCategory = "running" | "completed" | "failed" | "gate_failure" | "missing_tool_failure" | "cancelled" | "stopped" | "budget_exhausted";

export function classifyRunOutcome(events: JournalEvent[]): { category: RunOutcomeCategory; detail?: string } {
	if (events.some(event => event.event === "stop" || event.status === "stopped")) return { category: "stopped" };
	const statuses = events.filter(event => typeof event.status === "string").map(event => String(event.status));
	const last = statuses[statuses.length - 1];
	if (last === "completed") return { category: "completed" };
	if (last === "cancelled") return { category: "cancelled" };
	if (last === "budget_exhausted") return { category: "budget_exhausted" };
	if (last === "failed") {
		const gateEvents = events.filter(event => event.event === "gate" && event.status === "failed");
		if (gateEvents.length > 0) {
			const lastGate = gateEvents[gateEvents.length - 1];
			const report = isRecord(lastGate?.report) ? lastGate.report : undefined;
			const rawViolations = report?.violations;
			const violations = Array.isArray(rawViolations) ? rawViolations.map(String) : [];
			// A missing tool surfaces as exit 127 with "command not found" in
			// stderr/evidenceTail, or as an explicit not-found violation. Scan
			// the bounded evidence, not just the violation list, so realistic
			// exit-127 reports classify as missing_tool_failure.
			const evidence = [report?.stderr, report?.evidenceTail, report?.stdout].filter((value): value is string => typeof value === "string").join("\n");
			const exitCode = typeof report?.exitCode === "number" ? report.exitCode : undefined;
			const missingTool = violations.some(v => /not found|no such file|command not found|unavailable|missing/i.test(v))
				|| (exitCode === 127 && /command not found|not found|no such file/i.test(evidence))
				|| /command not found|no such file or directory/i.test(evidence);
			if (missingTool) return { category: "missing_tool_failure", detail: violations.join("; ") || evidence.trim().slice(0, 400) };
			return { category: "gate_failure", detail: violations.join("; ") };
		}
		return { category: "failed" };
	}
	return { category: "running" };
}

export interface RunStatistics {
	total: number;
	routePlans: number;
	chainCompletions: number;
	gateFailures: number;
	missingToolFailures: number;
	checkpointOutcomes: { approved: number; rejected: number };
}

export function aggregateRunStatistics(cwd: string, runIds: string[]): RunStatistics {
	const stats: RunStatistics = { total: 0, routePlans: 0, chainCompletions: 0, gateFailures: 0, missingToolFailures: 0, checkpointOutcomes: { approved: 0, rejected: 0 } };
	for (const runId of runIds) {
		if (!RUN_ID_RE.test(runId)) continue;
		let events: JournalEvent[];
		try { events = readRunEvents(cwd, runId); } catch { continue; }
		if (events.length === 0) continue;
		stats.total++;
		const created = events.find(event => event.event === "created");
		if (created && (typeof created.routeRef === "string" || typeof created.previewRef === "string")) stats.routePlans++;
		const outcome = classifyRunOutcome(events);
		// A chain completion is a completed run whose created record declares a
		// chain route. Direct route plans and resume/retry recovery runs (which
		// also carry a parentRunId) are not chain completions.
		if (outcome.category === "completed" && created && created.routeMode === "chain") stats.chainCompletions++;
		if (outcome.category === "gate_failure") stats.gateFailures++;
		if (outcome.category === "missing_tool_failure") stats.missingToolFailures++;
		for (const event of events) {
			if (event.event === "checkpoint") {
				if (event.status === "approved") stats.checkpointOutcomes.approved++;
				if (event.status === "rejected") stats.checkpointOutcomes.rejected++;
			}
		}
	}
	return stats;
}
