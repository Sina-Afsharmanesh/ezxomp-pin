import { existsSync, lstatSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { ExecResult } from "./runtime.js";

export type RunExec = (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<ExecResult>;

export interface WorktreeState {
	name?: string;
	workspace: string;
	isolation: "none" | "worktree";
	manager: "git";
	gitCommit?: string;
	gitBranch?: string;
	reused?: boolean;
}

export interface WorktreeOptions {
	name?: string;
	selected?: boolean;
}

export interface WorktreeResult {
	state?: WorktreeState;
	error?: string;
}

async function safeExec(exec: RunExec, command: string, args: string[], options: { cwd: string; timeout?: number }): Promise<ExecResult> {
	try { return await exec(command, args, options); }
	catch (error) { return { code: 1, stdout: "", stderr: String(error), killed: false }; }
}

/** A valid named isolation is a non-empty slug that cannot contain separators. */
function validIsolationName(name: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

function symlinkError(): string {
	return "worktree path cannot be a symlink";
}

/** Validate a directory path exists, is a real directory, and is not a symlink. */
export function validateDirectory(path: string): string | undefined {
	const resolved = resolve(path);
	if (!existsSync(resolved)) return "workspace path does not exist";
	if (lstatSync(resolved).isSymbolicLink()) return symlinkError();
	if (!lstatSync(resolved).isDirectory()) return `worktree path is not a directory: ${resolved}`;
	return undefined;
}

/** Return a human error when `target` is not contained within `base` (no escapes). */
function containmentError(base: string, target: string): string | undefined {
	const rel = resolve(target) === resolve(base) ? "" : relative(resolve(base), resolve(target));
	if (!rel || rel === "." || rel === ".." || rel.startsWith(".." + sep)) return "workspace path escapes the repository";
	return undefined;
}

/**
 * Identity check for a named native Git isolation. Accepts only paths that
 * provably belong to the requested isolation: the configured sibling layout
 * `${repoDir}/../${repo}.${name}`. Any other location fails closed, even when
 * it is inside the repository and carries the right branch name.
 * Returns a human error, or undefined when the path matches.
 */
function isolationIdentityError(base: string, name: string, target: string): string | undefined {
	const root = resolve(base);
	const targetPath = resolve(target);
	if (dirname(targetPath) === dirname(root) && basename(targetPath) === `${basename(root)}.${name}`) return undefined;
	return containmentError(root, targetPath) ?? `worktree path does not match isolation "${name}"`;
}

interface WorktreeListEntry {
	worktree: string;
	head?: string;
	branch?: string;
	bare?: boolean;
	detached?: boolean;
}

/**
 * Parse `git worktree list --porcelain` output (Git >= 2.7). Blocks are
 * separated by blank lines; each block is a set of `key value` lines
 * (`worktree`, optional `HEAD`, optional `branch`/`detached`, optional `bare`,
 * plus `locked`/`prunable` which are ignored). Malformed or missing blocks
 * fail closed — a caller-supplied exec cannot silently fabricate identity.
 */
function parseWorktreeList(stdout: string): WorktreeListEntry[] {
	const entries: WorktreeListEntry[] = [];
	let current: Partial<WorktreeListEntry> | undefined;
	for (const rawLine of stdout.split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		if (line.trim() === "") {
			if (current?.worktree) entries.push(current as WorktreeListEntry);
			current = undefined;
			continue;
		}
		const spaceIndex = line.indexOf(" ");
		const key = spaceIndex < 0 ? line : line.slice(0, spaceIndex);
		const value = spaceIndex < 0 ? "" : line.slice(spaceIndex + 1);
		// Git permits these porcelain records without a value. They carry no
		// location identity, but must not invalidate another worktree's registry.
		if (key === "bare" || key === "detached" || key === "locked" || key === "prunable") {
			if (current === undefined) return [];
			if (key === "bare") current.bare = true;
			if (key === "detached") {
				if (current.branch !== undefined) return [];
				current.detached = true;
			}
			continue;
		}
		if (spaceIndex <= 0 || !value) return [];
		if (key === "worktree") {
			if (current?.worktree) return [];
			current = { worktree: value };
		} else if (key === "HEAD") {
			if (current === undefined) return [];
			if (!/^[0-9a-f]{40,64}$/.test(value)) return [];
			current.head = value;
		} else if (key === "branch") {
			if (current === undefined) return [];
			if (!value.startsWith("refs/heads/")) return [];
			if (current.branch !== undefined || current.detached) return [];
			current.branch = value.slice("refs/heads/".length);
		} else {
			return [];
		}
	}
	if (current?.worktree) entries.push(current as WorktreeListEntry);
	return entries;
}

/** Live Git identity evidence: current branch name (must not be detached) and HEAD commit. */
async function gitState(cwd: string, exec: RunExec): Promise<{ gitCommit?: string; gitBranch?: string; error?: string }> {
	const revParse = await safeExec(exec, "git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 30_000 });
	if (revParse.code !== 0 || revParse.killed) return { error: "git repository state is unavailable: " + (revParse.stderr || revParse.stdout).slice(-400) };
	const branch = revParse.stdout.trim();
	if (branch === "HEAD" || branch === "") return { error: "git HEAD is detached; a current branch is required" };
	const commit = await safeExec(exec, "git", ["rev-parse", "HEAD"], { cwd, timeout: 30_000 });
	if (commit.code !== 0 || commit.killed) return { error: "git commit is unavailable: " + (commit.stderr || commit.stdout).slice(-400) };
	const commitId = commit.stdout.trim();
	if (!commitId) return { error: "git commit id is empty" };
	return { gitBranch: branch, gitCommit: commitId };
}

/** Resolve the real repository top-level directory via Git, never trusting `cwd`. */
async function gitRoot(cwd: string, exec: RunExec): Promise<{ root?: string; error?: string }> {
	const result = await safeExec(exec, "git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 30_000 });
	if (result.code !== 0 || result.killed) return { error: "git repository root is unavailable: " + (result.stderr || result.stdout).slice(-4000) };
	const root = result.stdout.trim();
	if (!root) return { error: "git repository root resolved to an empty path" };
	return { root };
}

function siblingWorktreePath(root: string, name: string): string {
	return join(dirname(root), `${basename(root)}.${name}`);
}

/** True when an exec failure reports a missing binary rather than a runtime error. */
function binaryUnavailable(result: ExecResult): boolean {
	const text = (result.stderr + "\n" + result.stdout).toLowerCase();
	return /(command not found|no such file|enoent|spawn )/.test(text);
}

/**
 * Confirm that `entry` from the parsed `git worktree list --porcelain` registry
 * is exactly the requested isolation: branch `refs/heads/task/<name>` AND a path
 * satisfying the isolation identity rules (nested leaf or sibling layout, inside
 * allowed bounds, real non-symlink directory). Identity comes from the registry —
 * never filesystem containment alone.
 */
async function validateRegisteredEntry(
	root: string,
	name: string,
	entry: WorktreeListEntry | undefined,
): Promise<{ path?: string; error?: string }> {
	if (!entry || !entry.worktree) return { error: "git worktree registry has no entry for isolation " + JSON.stringify(name) };
	if (entry.branch !== `task/${name}`) return { error: `git worktree entry does not carry branch task/${name}` };
	const identity = isolationIdentityError(root, name, entry.worktree);
	if (identity) return { error: identity };
	const invalid = validateDirectory(entry.worktree);
	if (invalid) return { error: "Selected worktree is invalid: " + invalid };
	return { path: entry.worktree };
}

export async function resolveWorktree(cwd: string, exec: RunExec, options: WorktreeOptions = {}): Promise<WorktreeResult> {
	const rootResult = await gitRoot(cwd, exec);
	if (rootResult.error) return { error: rootResult.error };
	const root = rootResult.root!;

	// Non-isolated path: validate the current Git workspace and return its branch/commit evidence.
	if (!options.selected || !options.name) {
		const invalid = validateDirectory(root);
		if (invalid) return { error: "git workspace is invalid: " + invalid };
		const state = await gitState(root, exec);
		if (state.error) return { error: state.error };
		return { state: { workspace: root, isolation: "none", manager: "git", ...(state.gitCommit ? { gitCommit: state.gitCommit } : {}), ...(state.gitBranch ? { gitBranch: state.gitBranch } : {}) } };
	}

	const name = options.name;
	if (!validIsolationName(name)) return { error: "worktree name must be a valid slug" };
	const branch = `task/${name}`;

	// Read the Git worktree registry; a caller cannot fabricate a location that
	// the real Git registry does not record.
	const listed = await safeExec(exec, "git", ["worktree", "list", "--porcelain"], { cwd, timeout: 30_000 });
	if (listed.code !== 0 || listed.killed) {
		if (binaryUnavailable(listed)) return { error: "git worktree registry is unavailable: git binary is missing" };
		return { error: "git worktree list failed: " + (listed.stderr || listed.stdout).slice(-4000) };
	}
	const registry = parseWorktreeList(listed.stdout);
	if (registry.length === 0) return { error: "git worktree list returned an invalid registry" };
	const bare = registry.find(entry => entry.bare === true && resolve(entry.worktree) === resolve(root));
	const entry = registry.find(candidate => candidate !== bare && candidate.branch === branch);
	let workspace: string;
	let reused: boolean;
	if (entry) {
		// Reuse only the exact registered branch/path combination; identity is
		// re-verified below against the real Git top-level of that location.
		const validated = await validateRegisteredEntry(root, name, entry);
		if (validated.error) return { error: validated.error };
		if (!validated.path) return { error: "git worktree registry returned a matched isolation without a path" };
		workspace = validated.path;
		reused = true;
	} else {
		// Create the sibling worktree from main, or reattach the task branch left
		// behind by a prior clean. The Git top-level must match the target exactly.
		const target = siblingWorktreePath(root, name);
		if (existsSync(target)) return { error: "git worktree target already exists but is not a registered worktree: " + target };
		const branchProbe = await safeExec(exec, "git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd, timeout: 30_000 });
		if (branchProbe.killed || (branchProbe.code !== 0 && branchProbe.code !== 1)) {
			return { error: "git task branch probe failed: " + (branchProbe.stderr || branchProbe.stdout).slice(-4000) };
		}
		const created = await safeExec(exec, "git", branchProbe.code === 0
			? ["worktree", "add", target, branch]
			: ["worktree", "add", target, "-b", branch, "main"], { cwd, timeout: 60_000 });
		if (created.code !== 0 || created.killed) {
			if (binaryUnavailable(created)) return { error: "git worktree creation failed: git binary is missing" };
			return { error: "git worktree add failed: " + (created.stderr || created.stdout).slice(-4000) };
		}
		const invalid = validateDirectory(target);
		if (invalid) return { error: "Created worktree is invalid: " + invalid };
		workspace = target;
		reused = false;
	}

	// The actual Git top-level of the selected location must be exactly the
	// location the registry (or the create call) reported — never a symlink or
	// a nested unrelated repository.
	const actual = await gitRoot(workspace, exec);
	if (actual.error) return { error: "Selected worktree is invalid: " + actual.error };
	if (resolve(actual.root!) !== resolve(workspace)) return { error: "Selected worktree git root does not match the registered path: " + actual.root };

	const identity = isolationIdentityError(root, name, workspace);
	if (identity) return { error: "Selected worktree is invalid: " + identity };

	const state = await gitState(workspace, exec);
	if (state.error) return { error: state.error };
	if (state.gitBranch !== branch) return { error: `Selected worktree branch changed from ${branch} to ${state.gitBranch ?? "unknown"}` };
	return { state: { name, workspace, isolation: "worktree", manager: "git", ...(state.gitCommit ? { gitCommit: state.gitCommit } : {}), ...(state.gitBranch ? { gitBranch: state.gitBranch } : {}), reused } };
}

async function registeredWorktreeForClean(cwd: string, exec: RunExec, name: string): Promise<{ found?: string; error?: string }> {
	const rootResult = await gitRoot(cwd, exec);
	if (rootResult.error) return { error: rootResult.error };
	const listed = await safeExec(exec, "git", ["worktree", "list", "--porcelain"], { cwd, timeout: 30_000 });
	if (listed.code !== 0 || listed.killed) return { error: "git worktree registry is unavailable" };
	const registry = parseWorktreeList(listed.stdout);
	if (registry.length === 0) return { error: "git worktree list returned an invalid registry" };
	const entry = registry.find(candidate => candidate.branch === `task/${name}`);
	if (!entry) return {};
	const validated = await validateRegisteredEntry(rootResult.root!, name, entry);
	if (validated.error) return { error: validated.error };
	if (!validated.path) return { error: "git worktree registry returned a matched isolation without a path" };
	const invalid = validateDirectory(validated.path);
	return invalid ? { error: "Selected worktree is invalid: " + invalid } : { found: validated.path };
}

export async function cleanWorktree(cwd: string, exec: RunExec, name: string): Promise<{ error?: string }> {
	if (!validIsolationName(name)) return { error: "worktree name must be a valid slug" };
	// Only clean a validated registered isolation; never a branch or unrelated worktree.
	const selected = await registeredWorktreeForClean(cwd, exec, name);
	if (selected.error) return { error: selected.error };
	if (!selected.found) return {};
	const status = await safeExec(exec, "git", ["status", "--short", "--branch"], { cwd: selected.found, timeout: 30_000 });
	if (status.code !== 0 || status.killed) return { error: "git worktree status is unavailable: " + (status.stderr || status.stdout).slice(-4000) };
	if (status.stdout.split("\n").some(line => line.trim() !== "" && !line.startsWith("##"))) return { error: "git worktree has uncommitted changes" };

	// Removal has already run when the exec fails here, so an error reports
	// possible side effects rather than implying none occurred.
	const removed = await safeExec(exec, "git", ["worktree", "remove", selected.found], { cwd, timeout: 60_000 });
	if (removed.code !== 0 || removed.killed) return { error: "git worktree remove failed: " + (removed.stderr || removed.stdout).slice(-4000) };
	// The worker branch task/<name> is preserved by design: clean removes only
	// the exact registered worktree directory, never the branch.
	return {};
}
