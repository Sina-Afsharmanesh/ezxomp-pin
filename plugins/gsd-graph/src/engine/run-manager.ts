/**
 * run-manager.ts — Create and list isolated workflow run directories.
 *
 * Sequential port of gsd-pi src/resources/extensions/gsd/run-manager.ts.
 *
 * A run directory is `<basePath>/.gsd/workflow-runs/<defName>/<timestamp>/`
 * containing:
 * - DEFINITION.yaml — frozen, fully substituted definition (single source of
 *   truth for the run; edited upstream definitions never affect running runs)
 * - GRAPH.yaml — initialized all-pending step graph
 * - PARAMS.json — the overrides used (only when overrides were given)
 *
 * Definition resolution precedence (no bundled tier — the plugin ships no
 * definitions):
 *   1. <projectDir>/.gsd/workflows/<name>.{yaml,yml}
 *   2. <projectDir>/.gsd/workflow-defs/<name>.{yaml,yml}
 *   3. ~/.gsd/workflows/<name>.{yaml,yml}
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

import * as yaml from "../../vendor/js-yaml.mjs";
import {
	initializeGraph,
	readGraph,
	writeGraph as writeGraphFile,
	type WorkflowGraph,
} from "./graph.ts";
import { loadDefinitionFromFile, substituteParams, type WorkflowDefinition } from "./definition-loader.ts";

const RUNS_DIR = "workflow-runs";
const DEFS_DIR = "workflow-defs";
const WORKFLOW_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface RunMetadata {
	name: string;
	timestamp: string;
	runDir: string;
	steps: { total: number; completed: number; pending: number; active: number };
	status: "pending" | "running" | "complete";
}

/** Filesystem-safe timestamp `YYYY-MM-DDTHH-MM-SS` (colons → hyphens). */
export function makeTimestamp(date: Date = new Date()): string {
	return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
}

/**
 * Fresh run directory under `<basePath>/.gsd/workflow-runs/<defName>/`.
 * Two runs created within the same second would otherwise collide and
 * clobber each other's artifacts — disambiguate with a numeric suffix.
 */
function freshRunDir(basePath: string, defName: string, timestamp: string): string {
	if (!WORKFLOW_NAME_PATTERN.test(defName) || defName.includes("..")) {
		throw new Error(`Invalid workflow name "${defName}": must contain only alphanumeric characters, dots, underscores, or hyphens (no "..")`);
	}
	// Resolved containment: the charset already excludes separators, but guard
	// the resolved path against symlink/alias surprises at the runs root.
	const runsRoot = resolve(join(basePath, ".gsd", RUNS_DIR));
	const resolvedDir = resolve(runsRoot, defName);
	if (resolvedDir !== runsRoot && !resolvedDir.startsWith(runsRoot + sep)) {
		throw new Error(`Invalid workflow name "${defName}": resolved path escapes .gsd/${RUNS_DIR}`);
	}
	const nameDir = join(basePath, ".gsd", RUNS_DIR, defName);
	let runDir = join(nameDir, timestamp);
	for (let n = 2; existsSync(runDir); n++) {
		runDir = join(nameDir, `${timestamp}-${n}`);
	}
	return runDir;
}

function deriveStatus(graph: WorkflowGraph): "pending" | "running" | "complete" {
	if (graph.steps.every((s) => s.status === "complete" || s.status === "expanded")) {
		return "complete";
	}
	return graph.steps.some((s) => s.status !== "pending") ? "running" : "pending";
}

/** Candidate definition files for a name, in precedence order (no bundled tier). */
function definitionCandidates(basePath: string, defName: string): string[] {
	const home = homedir();
	return [
		join(basePath, ".gsd", "workflows", `${defName}.yaml`),
		join(basePath, ".gsd", "workflows", `${defName}.yml`),
		join(basePath, ".gsd", DEFS_DIR, `${defName}.yaml`),
		join(basePath, ".gsd", DEFS_DIR, `${defName}.yml`),
		join(home, ".gsd", "workflows", `${defName}.yaml`),
		join(home, ".gsd", "workflows", `${defName}.yml`),
	];
}

/**
 * Resolve a definition file for a workflow name.
 *
 * @throws Error listing every directory searched when no file matches.
 */
export function resolveDefinitionFile(basePath: string, defName: string): string {
	const searched = new Set<string>();
	for (const candidate of definitionCandidates(basePath, defName)) {
		if (existsSync(candidate)) return candidate;
		searched.add(candidate);
	}
	const dirs = [...searched].map((p) => p.replace(/[/\\][^/\\]+$/, "")).filter((v, i, a) => a.indexOf(v) === i);
	throw new Error(`Workflow definition "${defName}" not found. Searched:\n  - ${dirs.join("\n  - ")}`);
}

/** Serialize a definition back to YAML (frozen form written to the run dir). */
function stringify(def: WorkflowDefinition): string {
	return yaml.dump(
		{
			version: def.version,
			name: def.name,
			...(def.description !== undefined ? { description: def.description } : {}),
			...(def.params !== undefined ? { params: def.params } : {}),
			steps: def.steps.map((s) => ({
				id: s.id,
				name: s.name,
				prompt: s.prompt,
				...(s.requires.length > 0 ? { requires: s.requires } : {}),
				...(s.produces.length > 0 ? { produces: s.produces } : {}),
				...(s.contextFrom !== undefined ? { context_from: s.contextFrom } : {}),
				...(s.verify !== undefined ? { verify: s.verify } : {}),
				...(s.iterate !== undefined ? { iterate: s.iterate } : {}),
			})),
		},
		{ indent: 2, lineWidth: -1 },
	);
}

/** Create the run directory + frozen artifacts from an explicit definition file. */
export function createRunFromDefinition(
	basePath: string,
	defName: string,
	definitionFile: string,
	overrides?: Record<string, string>,
	timestamp = makeTimestamp(),
): string {
	if (!WORKFLOW_NAME_PATTERN.test(defName)) {
		throw new Error(`Invalid workflow name "${defName}": must contain only alphanumeric characters, dots, underscores, or hyphens`);
	}
	const rawDef = loadDefinitionFromFile(definitionFile);
	const def = substituteParams(rawDef, overrides);

	const runDir = freshRunDir(basePath, defName, timestamp);
	mkdirSync(runDir, { recursive: true });

	writeFileSync(join(runDir, "DEFINITION.yaml"), stringify(def), "utf-8");

	writeGraphFile(runDir, initializeGraph(def));

	if (overrides && Object.keys(overrides).length > 0) {
		writeFileSync(join(runDir, "PARAMS.json"), JSON.stringify(overrides, null, 2), "utf-8");
	}

	return runDir;
}

/** Create a new isolated run directory for a workflow definition (precedence chain). */
export function createRun(
	basePath: string,
	defName: string,
	overrides?: Record<string, string>,
	timestamp?: string,
): string {
	if (!WORKFLOW_NAME_PATTERN.test(defName)) {
		throw new Error(`Invalid workflow name "${defName}": must contain only alphanumeric characters, dots, underscores, or hyphens`);
	}
	const definitionFile = resolveDefinitionFile(basePath, defName);
	return createRunFromDefinition(basePath, defName, definitionFile, overrides, timestamp);
}

/**
 * List existing workflow runs with metadata, newest-first within each
 * definition. Runs with invalid/missing GRAPH.yaml are skipped.
 */
export function listRuns(basePath: string, defName?: string): RunMetadata[] {
	const runsRoot = join(basePath, ".gsd", RUNS_DIR);
	if (!existsSync(runsRoot)) return [];

	const results: RunMetadata[] = [];

	// defName flows into path joins — same confinement as freshRunDir.
	if (defName !== undefined && (!WORKFLOW_NAME_PATTERN.test(defName) || defName.includes(".."))) {
		return [];
	}
	const nameDirs = defName ? [defName] : readdirSync(runsRoot).filter((entry) => WORKFLOW_NAME_PATTERN.test(entry) && !entry.includes("..") && statSync(join(runsRoot, entry)).isDirectory());

	for (const name of nameDirs) {
		const nameDir = join(runsRoot, name);
		if (!existsSync(nameDir)) continue;

		const timestamps = readdirSync(nameDir).filter((entry) => statSync(join(nameDir, entry)).isDirectory());
		// Sort newest-first (ISO strings sort lexicographically)
		timestamps.sort().reverse();

		for (const ts of timestamps) {
			const runDir = join(nameDir, ts);
			try {
				const graph = readGraph(runDir);
				results.push({
					name,
					timestamp: ts,
					runDir,
					steps: {
						total: graph.steps.length,
						completed: graph.steps.filter((s) => s.status === "complete").length,
						pending: graph.steps.filter((s) => s.status === "pending").length,
						active: graph.steps.filter((s) => s.status === "active").length,
					},
					status: deriveStatus(graph),
				});
			} catch {
				// Skip runs with invalid/missing GRAPH.yaml
			}
		}
	}

	return results;
}
