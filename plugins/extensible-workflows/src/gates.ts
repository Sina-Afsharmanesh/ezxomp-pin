/**
 * gates.ts — Gate file schema, validation, drafting, and project/global
 * persistence for OMP Workflowz scaffold gates (TASK-40.5 cycle break).
 *
 * Extracted from templates.ts so runtime can consume gate resolution without
 * touching the workflow-template graph. Pure gate domain: no workflow
 * definition/validation dependencies.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { globalWorkflowsDir, projectWorkflowsDir, SLUG_RE } from "./library.js";

// ---- GateFileV1 ----

export type GateTrust = "safe" | "approved" | "draft" | "untrusted";

export interface GateFileV1 {
	schemaVersion: 1;
	id: string;
	version: string;
	description: string;
	kind: "shell" | "exec" | "lsp" | "frontmatter" | "llm" | "checkpoint";
	language?: string[];
	executable?: string;
	args?: string[];
	command?: string;
	expect?: { exitCode?: number; stdout?: string; stderr?: string };
	safety?: "standard" | "explicit";
	timeoutMs?: number;
	trust: GateTrust;
	contentHash: string;
	createdBy?: string;
	createdAt?: string;
	owners?: string[];
}

const GATE_VERSION_RE = /^\d+\.\d+\.\d+$/;
/** A recorded owner must be a real Backlog task (TASK-15, task-15.1.1) or
 *  document (doc-...) identifier; empty or free-form strings are refused. */
const BACKLOG_OWNER_RE = /^(?:task-\d+(?:\.\d+)*|doc-[a-z0-9][a-z0-9-]{0,63})$/i;
const GATE_KINDS = new Set(["shell", "exec", "lsp", "frontmatter", "llm", "checkpoint"]);
const GATE_TRUSTS = new Set(["safe", "approved", "draft", "untrusted"]);

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

/** Canonical content hash of a GateFileV1, content-addressing its definition.
 *  Excludes the contentHash field itself to avoid a circular dependency, and
 *  normalizes nested key order so the hash is stable across equivalent
 *  definitions (e.g. {exitCode, stdout} vs {stdout, exitCode}). */
export function gateContentHash(value: unknown): string {
	if (typeof value !== "object" || value === null) return createHash("sha256").update(JSON.stringify(value)).digest("hex");
	const record = value as Record<string, unknown>;
	const { contentHash: _ignored, ...rest } = record;
	return createHash("sha256").update(JSON.stringify(canonicalize(rest))).digest("hex");
}

/** Validate a GateFileV1. Returns null when valid, else an error message. */
export function validateGateFile(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return "gate must be an object";
	const gate = value as Record<string, unknown>;
	if (gate.schemaVersion !== 1) return "schemaVersion must be 1";
	if (typeof gate.id !== "string" || !SLUG_RE.test(gate.id)) return "id must be a valid slug";
	if (typeof gate.version !== "string" || !GATE_VERSION_RE.test(gate.version)) return "version must be semver";
	if (typeof gate.description !== "string" || gate.description.length === 0) return "description is required";
	if (typeof gate.kind !== "string" || !GATE_KINDS.has(gate.kind)) return "kind is invalid";
	if (gate.trust !== undefined && (typeof gate.trust !== "string" || !GATE_TRUSTS.has(gate.trust))) return "trust is invalid";
	if (gate.owners !== undefined && (!Array.isArray(gate.owners) || !gate.owners.every(owner => typeof owner === "string"))) return "owners must be an array of Backlog task/document ids";
	if (gate.kind !== "llm" && gate.kind !== "checkpoint" && !gate.executable && !gate.command) return "gate requires executable or command";
	return null;
}

/** Draft a new GateFileV1 from a definition. LLM-created gates are marked
 *  draft and require approval before global reuse. */
export function draftGate(definition: Omit<GateFileV1, "schemaVersion" | "trust" | "contentHash">): GateFileV1 {
	const gate: GateFileV1 = { schemaVersion: 1, trust: "draft", ...definition, contentHash: "" };
	gate.contentHash = gateContentHash(gate);
	return gate;
}

/** Promote a draft/untrusted gate to approved, refreshing its content hash. */
export function approveGate(gate: GateFileV1): GateFileV1 {
	const approved = { ...gate, trust: "approved" as GateTrust, contentHash: "" };
	approved.contentHash = gateContentHash(approved);
	return approved;
}

// ---- Scope resolution and persistence ----

/** Project gates directory: <cwd>/.omp/workflows/gates. */
export function projectGatesDir(cwd: string): string { return join(projectWorkflowsDir(cwd), "gates"); }
/** Global gates directory: ~/.omp/agent/workflows/gates. */
export function globalGatesDir(): string { return join(globalWorkflowsDir(), "gates"); }

export interface GateResolution {
	gate?: GateFileV1;
	scope?: "project" | "global";
	path?: string;
	error?: string;
}

/** Resolve a gate by id with deterministic project-over-global precedence.
 *  Global gates are only reusable when approved and carry recorded Backlog
 *  ownership; a draft/untrusted global gate is never exposed as reusable. */
export function resolveGateFile(id: string, cwd: string): GateResolution {
	if (!SLUG_RE.test(id)) return { error: "gate id is invalid" };
	for (const [dir, scope] of [[projectGatesDir(cwd), "project"], [globalGatesDir(), "global"]] as const) {
		const path = join(dir, id + ".json");
		if (!existsSync(path)) continue;
		let parsed: unknown;
		try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return { error: "gate file " + path + " is unreadable" }; }
		const error = validateGateFile(parsed);
		if (error) return { error };
		const gate = parsed as GateFileV1;
		if (gate.contentHash !== gateContentHash(gate)) return { error: 'gate "' + id + '" content hash does not match its definition' };
		if (scope === "global" && gate.trust !== "approved" && gate.trust !== "safe") return { error: 'global gate "' + id + '" is not approved for reuse' };
		if (scope === "global" && (!gate.owners || gate.owners.length === 0)) return { error: 'global gate "' + id + '" has no recorded Backlog ownership' };
		if (scope === "global") {
			const invalidOwner = (gate.owners ?? []).find(owner => typeof owner !== "string" || !BACKLOG_OWNER_RE.test(owner));
			if (invalidOwner !== undefined) return { error: 'global gate "' + id + '" has invalid Backlog ownership: ' + JSON.stringify(invalidOwner) + " is not a task/document id" };
		}
		return { gate, scope, path };
	}
	return { error: 'gate "' + id + '" not found' };
}

/** Save a GateFile-1 to project or global scope with atomic write.
 *  Global persistence is fail-closed: only approved/safe gates with recorded
 *  Backlog ownership may be written, and draft/untrusted gates are refused. */
export function saveGateFile(gate: GateFileV1, scope: "project" | "global", overwrite: boolean, cwd: string): { path?: string; created?: boolean; error?: string } {
	const error = validateGateFile(gate);
	if (error) return { error };
	if (gate.contentHash !== gateContentHash(gate)) return { error: "gate content hash does not match its definition" };
	if (scope === "global") {
		if (gate.trust !== "approved" && gate.trust !== "safe") return { error: "global gates require approved/safe trust before persistence" };
		if (!gate.owners || gate.owners.length === 0) return { error: "global gates require recorded Backlog ownership before persistence" };
		const invalidOwner = gate.owners.find(owner => typeof owner !== "string" || !BACKLOG_OWNER_RE.test(owner));
		if (invalidOwner !== undefined) return { error: 'global gate "' + gate.id + '" has invalid Backlog ownership: ' + JSON.stringify(invalidOwner) + " is not a task/document id" };
	}
	const dir = scope === "global" ? globalGatesDir() : projectGatesDir(cwd);
	const path = join(dir, gate.id + ".json");
	const existed = existsSync(path);
	if (existed && !overwrite) return { error: 'gate "' + gate.id + '" already exists' };
	if (scope === "global" && existed) {
		// Global gates are immutable by version/content identity: an overwrite
		// may never silently replace an existing version's behavior.
		let existing: unknown;
		try { existing = JSON.parse(readFileSync(path, "utf8")); } catch { return { error: 'existing global gate "' + gate.id + '" is unreadable' }; }
		const existingError = validateGateFile(existing);
		if (existingError) return { error: 'existing global gate "' + gate.id + '" failed validation: ' + existingError };
		const previous = existing as GateFileV1;
		if (previous.version === gate.version) {
			if (previous.contentHash === gate.contentHash) return { path, created: false };
			return { error: 'global gate "' + gate.id + '" version ' + gate.version + ' is immutable; publish a new version instead' };
		}
	}
	try {
		mkdirSync(dir, { recursive: true, mode: scope === "global" ? 0o700 : 0o755 });
		writeFileSync(path, JSON.stringify(gate, null, 2) + "\n", { mode: scope === "global" ? 0o600 : 0o644 });
		return { path, created: !existed };
	} catch (writeError) {
		return { error: String(writeError) };
	}
}

// ---- Scaffold helpers ----
