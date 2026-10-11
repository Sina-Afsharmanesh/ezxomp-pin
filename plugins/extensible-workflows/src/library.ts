/**
 * library.ts — WorkflowFileV1 schema, two-scope discovery, validation,
 * precedence, atomic save, and render for OMP native Workflowz.
 *
 * This module is the persistence/authoring layer. It does NOT execute
 * workflows — OMP's native `eval` does that. It stores reusable definitions
 * as JSON and renders self-contained JS for native eval.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, lstatSync, realpathSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";

// ── Types ──────────────────────────────────────────────────────────────────

/** A workflow input parameter definition. */
export interface WorkflowInput {
	description: string;
	required?: boolean;
	default?: string;
}

/** A task within a stage. */
export interface WorkflowTask {
	id: string;
	agent?: string;
	prompt: string;
	schema?: object;
}

/** A stage within a workflow. */
export interface WorkflowStage {
	id: string;
	label: string;
	tasks: WorkflowTask[];
}

/** The on-disk workflow file schema (v1). */
export interface WorkflowFileV1 {
	schemaVersion: 1;
	name: string;
	description: string;
	inputs: Record<string, WorkflowInput>;
	stages: WorkflowStage[];
}

export type WorkflowScope = "global" | "project";
export type EffectiveScope = "effective" | "global" | "project";

/** Metadata about a discovered workflow. */
export interface WorkflowMeta {
	name: string;
	description: string;
	scope: WorkflowScope;
	path: string;
}

/** Diagnostic for a malformed file. */
export interface WorkflowDiagnostic {
	path: string;
	code: string;
	message: string;
}

export interface ListResult {
	scope: EffectiveScope;
	workflows: WorkflowMeta[];
	diagnostics: WorkflowDiagnostic[];
}

export interface SaveResult {
	name: string;
	scope: WorkflowScope;
	path: string;
	created: boolean;
}

export interface RenderResult {
	name: string;
	scope: WorkflowScope;
	path: string;
	code: string;
}

export interface WorkflowError {
	isError: true;
	details: { code: string; message: string; path?: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FILE_SIZE = 128 * 1024; // 128 KiB
const MAX_STAGES = 32;
const MAX_TOTAL_TASKS = 128;

// ── Path resolution ─────────────────────────────────────────────────────────

/** Global workflows directory: ~/.omp/agent/workflows (or active profile). */
export function globalWorkflowsDir(): string {
	return join(getAgentDir(), "workflows");
}

/** Project workflows directory: <cwd>/.omp/workflows. */
export function projectWorkflowsDir(cwd: string): string {
	return join(cwd, ".omp", "workflows");
}

function workflowPath(dir: string, name: string): string {
	return join(dir, `${name}.json`);
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Validate a WorkflowFileV1. Returns null if valid, or an error code+message. */
export function validateWorkflow(wf: unknown): { code: string; message: string } | null {
	if (typeof wf !== "object" || wf === null) return { code: "WORKFLOW_INVALID", message: "workflow must be an object" };
	const w = wf as Record<string, unknown>;

	if (w.schemaVersion !== 1) return { code: "WORKFLOW_INVALID", message: "schemaVersion must be 1" };

	if (typeof w.name !== "string" || !SLUG_RE.test(w.name)) {
		return { code: "WORKFLOW_INVALID", message: `name must match ${SLUG_RE}` };
	}

	if (typeof w.description !== "string" || w.description.length < 1 || w.description.length > 200) {
		return { code: "WORKFLOW_INVALID", message: "description must be 1-200 characters" };
	}

	// inputs
	if (typeof w.inputs !== "object" || w.inputs === null || Array.isArray(w.inputs)) {
		return { code: "WORKFLOW_INVALID", message: "inputs must be an object" };
	}
	const inputs = w.inputs as Record<string, unknown>;
	for (const [key, val] of Object.entries(inputs)) {
		if (!SLUG_RE.test(key)) return { code: "WORKFLOW_INVALID", message: `input key "${key}" must match ${SLUG_RE}` };
		if (typeof val !== "object" || val === null) return { code: "WORKFLOW_INVALID", message: `input "${key}" must be an object` };
		const v = val as Record<string, unknown>;
		if (typeof v.description !== "string") return { code: "WORKFLOW_INVALID", message: `input "${key}" missing description` };
		if (v.required !== undefined && typeof v.required !== "boolean") return { code: "WORKFLOW_INVALID", message: `input "${key}" required must be boolean` };
		if (v.default !== undefined && typeof v.default !== "string") return { code: "WORKFLOW_INVALID", message: `input "${key}" default must be string` };
	}

	// stages
	if (!Array.isArray(w.stages) || w.stages.length === 0) {
		return { code: "WORKFLOW_INVALID", message: "stages must be a non-empty array" };
	}
	if (w.stages.length > MAX_STAGES) {
		return { code: "WORKFLOW_INVALID", message: `more than ${MAX_STAGES} stages` };
	}

	const allIds = new Set<string>();
	let totalTasks = 0;

	for (let si = 0; si < w.stages.length; si++) {
		const stage = w.stages[si] as Record<string, unknown>;
		if (typeof stage !== "object" || stage === null) return { code: "WORKFLOW_INVALID", message: `stage ${si} must be an object` };
		if (typeof stage.id !== "string" || !SLUG_RE.test(stage.id)) return { code: "WORKFLOW_INVALID", message: `stage ${si} id must match ${SLUG_RE}` };
		if (allIds.has(stage.id)) return { code: "WORKFLOW_INVALID", message: `duplicate id "${stage.id}"` };
		allIds.add(stage.id);
		if (typeof stage.label !== "string") return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} missing label` };

		if (!Array.isArray(stage.tasks) || stage.tasks.length === 0) {
			return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} tasks must be a non-empty array` };
		}

		for (let ti = 0; ti < stage.tasks.length; ti++) {
			totalTasks++;
			if (totalTasks > MAX_TOTAL_TASKS) return { code: "WORKFLOW_INVALID", message: `more than ${MAX_TOTAL_TASKS} total tasks` };
			const task = stage.tasks[ti] as Record<string, unknown>;
			if (typeof task !== "object" || task === null) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} task ${ti} must be an object` };
			if (typeof task.id !== "string" || !SLUG_RE.test(task.id)) return { code: "WORKFLOW_INVALID", message: `stage ${stage.id} task ${ti} id must match ${SLUG_RE}` };
			if (allIds.has(task.id)) return { code: "WORKFLOW_INVALID", message: `duplicate id "${task.id}"` };
			allIds.add(task.id);
			if (task.agent !== undefined) {
				if (typeof task.agent !== "string" || !SLUG_RE.test(task.agent)) return { code: "WORKFLOW_INVALID", message: `task ${task.id} agent must match ${SLUG_RE}` };
			}
			if (typeof task.prompt !== "string" || task.prompt.length === 0) return { code: "WORKFLOW_INVALID", message: `task ${task.id} prompt must be non-empty string` };
			if (task.schema !== undefined) {
				if (typeof task.schema !== "object" || task.schema === null || Array.isArray(task.schema)) {
					return { code: "WORKFLOW_INVALID", message: `task ${task.id} schema must be a JSON object` };
				}
			}
		}
	}

	// Validate template references: {{input.<name>}} and {{result.<task-id>}}
	const inputNames = new Set(Object.keys(inputs));
	const knownTaskIds = new Set<string>();
	const stageTaskIds: Array<Set<string>> = [];

	for (const stage of w.stages as Array<Record<string, unknown>>) {
		const sids = new Set<string>();
		for (const task of stage.tasks as Array<Record<string, unknown>>) {
			sids.add(task.id as string);
		}
		stageTaskIds.push(sids);
	}

	for (let si = 0; si < w.stages.length; si++) {
		const stage = w.stages[si] as Record<string, unknown>;
		for (const task of stage.tasks as Array<Record<string, unknown>>) {
			const prompt = task.prompt as string;
			// Check {{input.<name>}}
			for (const m of prompt.matchAll(/\{\{input\.([a-z0-9-]+)\}\}/g)) {
				if (!inputNames.has(m[1] ?? "")) {
					return { code: "WORKFLOW_INVALID", message: `task ${task.id} references unknown input "${m[1] ?? ""}"` };
				}
			}
			// Check {{result.<task-id>}}
			for (const m of prompt.matchAll(/\{\{result\.([a-z0-9-]+)\}\}/g)) {
				const refId = m[1] ?? "";
				// Same-stage reference
				if (stageTaskIds[si]?.has(refId)) {
					return { code: "WORKFLOW_INVALID", message: `task ${task.id} references same-stage task "${refId}"` };
				}
				// Forward reference (not in any prior stage)
				let found = false;
				for (let pi = 0; pi < si; pi++) {
					if (stageTaskIds[pi]?.has(refId)) { found = true; break; }
				}
				if (!found) {
					return { code: "WORKFLOW_INVALID", message: `task ${task.id} references unknown or forward task "${refId}"` };
				}
			}
		}
		// Add this stage's task IDs to known for next stage
		for (const id of stageTaskIds[si] ?? []) knownTaskIds.add(id);
	}

	return null;
}

// ── File I/O ────────────────────────────────────────────────────────────────

/** Safely read a workflow file, checking for symlinks, size, and path escapes. */
function safeReadWorkflowFile(filePath: string): { workflow?: WorkflowFileV1; error?: WorkflowDiagnostic } {
	try {
		const real = realpathSync(filePath);
		if (real !== filePath) {
			return { error: { path: filePath, code: "WORKFLOW_INVALID", message: "symlinked workflow files are rejected" } };
		}
		const stat = lstatSync(filePath);
		if (!stat.isFile()) {
			return { error: { path: filePath, code: "WORKFLOW_INVALID", message: "not a regular file" } };
		}
		if (stat.size > MAX_FILE_SIZE) {
			return { error: { path: filePath, code: "WORKFLOW_INVALID", message: `file exceeds ${MAX_FILE_SIZE} bytes` } };
		}
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		const verr = validateWorkflow(parsed);
		if (verr) {
			return { error: { path: filePath, code: verr.code, message: verr.message } };
		}
		return { workflow: parsed as WorkflowFileV1 };
	} catch {
		return { error: { path: filePath, code: "WORKFLOW_INVALID", message: "malformed or unreadable file" } };
	}
}

/** List workflows from a directory scope. */
function listScope(dir: string, scope: WorkflowScope): { workflows: WorkflowMeta[]; diagnostics: WorkflowDiagnostic[] } {
	const workflows: WorkflowMeta[] = [];
	const diagnostics: WorkflowDiagnostic[] = [];
	if (!existsSync(dir)) return { workflows, diagnostics };

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const filePath = join(dir, entry.name);
		const { workflow, error } = safeReadWorkflowFile(filePath);
		if (error) {
			diagnostics.push(error);
			continue;
		}
		if (workflow) {
			workflows.push({
				name: workflow.name,
				description: workflow.description,
				scope,
				path: filePath,
			});
		}
	}
	return { workflows, diagnostics };
}



/** List workflows with effective (project-over-global) precedence. */
export function listWorkflows(cwd: string, scope: EffectiveScope = "effective"): ListResult {
	const gDir = globalWorkflowsDir();
	const pDir = projectWorkflowsDir(cwd);

	if (scope === "global") {
		const r = listScope(gDir, "global");
		return { scope, workflows: r.workflows.sort((a, b) => a.name.localeCompare(b.name)), diagnostics: r.diagnostics };
	}
	if (scope === "project") {
		const r = listScope(pDir, "project");
		return { scope, workflows: r.workflows.sort((a, b) => a.name.localeCompare(b.name)), diagnostics: r.diagnostics };
	}

	// effective: project overrides global
	const gResult = listScope(gDir, "global");
	const pResult = listScope(pDir, "project");
	const projectNames = new Set(pResult.workflows.map(w => w.name));
	const effective = [...pResult.workflows, ...gResult.workflows.filter(w => !projectNames.has(w.name))];
	return {
		scope: "effective",
		workflows: effective.sort((a, b) => a.name.localeCompare(b.name)),
		diagnostics: [...gResult.diagnostics, ...pResult.diagnostics],
	};
}

/** Resolve a single workflow by name with scope precedence. */
export function resolveWorkflow(name: string, cwd: string, scope: EffectiveScope = "effective"): { workflow?: WorkflowFileV1; path?: string; scope?: WorkflowScope; error?: WorkflowError } {
	const gDir = globalWorkflowsDir();
	const pDir = projectWorkflowsDir(cwd);

	if (scope === "global" || scope === "project") {
		const dir = scope === "global" ? gDir : pDir;
		const filePath = workflowPath(dir, name);
		if (!existsSync(filePath)) {
			return { error: { isError: true, details: { code: "WORKFLOW_NOT_FOUND", message: `workflow "${name}" not found in ${scope} scope`, path: filePath } } };
		}
		const { workflow, error } = safeReadWorkflowFile(filePath);
		if (error) return { error: { isError: true, details: { code: error.code, message: error.message, path: error.path } } };
		if (!workflow) return { error: { isError: true, details: { code: "WORKFLOW_INVALID", message: "workflow file did not contain a definition", path: filePath } } };
		return { workflow, path: filePath, scope };
	}

	// effective: project overrides global
	const pPath = workflowPath(pDir, name);
	if (existsSync(pPath)) {
		const { workflow, error } = safeReadWorkflowFile(pPath);
		if (error) return { error: { isError: true, details: { code: error.code, message: error.message, path: error.path } } };
		if (!workflow) return { error: { isError: true, details: { code: "WORKFLOW_INVALID", message: "workflow file did not contain a definition", path: pPath } } };
		return { workflow, path: pPath, scope: "project" };
	}
	const gPath = workflowPath(gDir, name);
	if (existsSync(gPath)) {
		const { workflow, error } = safeReadWorkflowFile(gPath);
		if (error) return { error: { isError: true, details: { code: error.code, message: error.message, path: error.path } } };
		if (!workflow) return { error: { isError: true, details: { code: "WORKFLOW_INVALID", message: "workflow file did not contain a definition", path: gPath } } };
		return { workflow, path: gPath, scope: "global" };
	}
	return { error: { isError: true, details: { code: "WORKFLOW_NOT_FOUND", message: `workflow "${name}" not found`, path: pPath } } };
}

/** Atomically save a workflow to the given scope. */
export function saveWorkflow(wf: WorkflowFileV1, scope: WorkflowScope, overwrite = false, cwd?: string): { result?: SaveResult; error?: WorkflowError } {
	const verr = validateWorkflow(wf);
	if (verr) return { error: { isError: true, details: { code: verr.code, message: verr.message } } };

	const dir = scope === "global" ? globalWorkflowsDir() : projectWorkflowsDir(cwd ?? process.cwd());
	const filePath = workflowPath(dir, wf.name);

	const existed = existsSync(filePath);
	if (existed && !overwrite) {
		return { error: { isError: true, details: { code: "WORKFLOW_EXISTS", message: `workflow "${wf.name}" already exists in ${scope} scope`, path: filePath } } };
	}

	mkdirSync(dir, { recursive: true });
	const mode = scope === "global" ? 0o600 : 0o644;

	// Atomic write: write to temp then rename
	const tmpPath = filePath + ".tmp";
	writeFileSync(tmpPath, JSON.stringify(wf, null, 2) + "\n", { mode });
	renameSync(tmpPath, filePath);

	return { result: { name: wf.name, scope, path: filePath, created: !existed } };
}

// ── Render ─────────────────────────────────────────────────────────────────

/** JSON-escape a string for embedding in generated JS. */
function jsonEscape(s: string): string {
	return JSON.stringify(s);
}

/** Resolve inputs: apply defaults, reject missing required, reject unknown. */
export function resolveInputs(wf: WorkflowFileV1, provided?: Record<string, string>): { inputs?: Record<string, string>; error?: WorkflowError } {
	const resolved: Record<string, string> = {};
	for (const [name, def] of Object.entries(wf.inputs)) {
		const providedValue = provided?.[name];
		if (providedValue !== undefined) {
			resolved[name] = providedValue;
		} else if (def.default !== undefined) {
			resolved[name] = def.default;
		} else if (def.required) {
			return { error: { isError: true, details: { code: "WORKFLOW_INPUT_MISSING", message: `required input "${name}" not provided` } } };
		}
	}
	// Reject unknown inputs
	if (provided) {
		for (const key of Object.keys(provided)) {
			if (!(key in wf.inputs)) {
				return { error: { isError: true, details: { code: "WORKFLOW_INPUT_UNKNOWN", message: `unknown input "${key}"` } } };
			}
		}
	}
	return { inputs: resolved };
}

/** Render a workflow file as self-contained JS for OMP native eval. */
export function renderWorkflow(wf: WorkflowFileV1, inputs: Record<string, string>): string {
	const lines: string[] = [];
	lines.push(`const workflow = ${jsonEscape(wf.name)};`);
	lines.push(`const inputs = ${JSON.stringify(inputs)};`);
	lines.push(`const results = {};`);
	lines.push(`const text = value => typeof value === "string" ? value : JSON.stringify(value);`);
	lines.push(`const render = template => template`);
	lines.push(`  .replace(/\\{\\{input\\.([a-z0-9-]+)\\}\\}/g, (_, id) => inputs[id])`);
	lines.push(`  .replace(/\\{\\{result\\.([a-z0-9-]+)\\}\\}/g, (_, id) => text(results[id]));`);

	for (const stage of wf.stages) {
		lines.push(``);
		lines.push(`phase(${jsonEscape(stage.label)});`);
		const taskEntries = stage.tasks.map(task => {
			const agent = task.agent ?? "task";
			const label = `workflow:${wf.name}:${task.id}`;
			const promptExpr = `render(${jsonEscape(task.prompt)})`;
			const schemaLine = task.schema ? `, schema: ${JSON.stringify(task.schema)}` : "";
			return `  async () => [${jsonEscape(task.id)}, await agent(${promptExpr}, { agent: ${jsonEscape(agent)}, label: ${jsonEscape(label)}${schemaLine} })]`;
		});
		lines.push(`Object.assign(results, Object.fromEntries(await parallel([`);
		lines.push(taskEntries.join(",\n"));
		lines.push(`])));`);
	}

	lines.push(``);
	lines.push(`return { workflow, results };`);
	return lines.join("\n");
}
