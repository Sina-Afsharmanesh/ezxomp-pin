import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as childProcess from "node:child_process";
import { isToolAvailable } from "./runner.js";
import { emitEvent } from "./events.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus = "running" | "success" | "failed" | "cancelled" | "timed_out" | "unknown";

export interface RunAction {
  action: string;
  at: string;
  result: "ok" | "failed" | "blocked" | "cancelled";
  detail?: string;
}

export interface RunRecord {
  runId: string;
  playbook: string;
  phase: string;
  target: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  actions: RunAction[];
  lastConfirmedAction?: string;
  preflight?: PreflightResult;
  resolvedModel?: { role: string; model: string; source: "role" | "session" | "project-default" };
}

export interface PreflightCheck {
  name: string;
  status: "pass" | "warn" | "block" | "unknown";
  detail?: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  overall: "pass" | "warn" | "block" | "unknown";
  target: string;
  at: string;
}

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

export function createRunId(): string {
  return randomUUID();
}

export function beginRun(input: {
  playbook: string;
  phase: string;
  target: string;
  runId?: string;
  resolvedModel?: { role: string; model: string; source: "role" | "session" | "project-default" };
}): RunRecord {
  return {
    runId: input.runId ?? createRunId(),
    playbook: input.playbook,
    phase: input.phase,
    target: input.target,
    startedAt: new Date().toISOString(),
    status: "running",
    actions: [],
    ...(input.resolvedModel !== undefined ? { resolvedModel: input.resolvedModel } : {}),
  };
}

export function addAction(
  rec: RunRecord,
  action: string,
  result: RunAction["result"],
  detail?: string,
): RunRecord {
  const actionEntry: RunAction = {
    action,
    at: new Date().toISOString(),
    result,
    ...(detail !== undefined ? { detail } : {}),
  };
  const partial: Omit<RunRecord, "lastConfirmedAction"> & {
    lastConfirmedAction?: string | undefined;
  } = {
    ...rec,
    actions: [...rec.actions, actionEntry],
    ...(result === "ok" || rec.lastConfirmedAction !== undefined
      ? { lastConfirmedAction: result === "ok" ? action : rec.lastConfirmedAction }
      : {}),
  };
  return partial as RunRecord;
}

export function finishRun(
  rec: RunRecord,
  status: Exclude<RunStatus, "running">,
): RunRecord {
  return { ...rec, status, finishedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Run store — .omp/pstack-runs/<runId>.json
// ---------------------------------------------------------------------------

export function runStoreDir(cwd: string): string {
  return path.join(cwd, ".omp", "pstack-runs");
}

export function saveRun(rec: RunRecord, cwd: string): void {
  try {
    const dir = runStoreDir(cwd);
    const file = path.join(dir, `${rec.runId}.json`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf-8");
    try {
      emitEvent({
        type: "receipt",
        at: new Date().toISOString(),
        meta: { runId: rec.runId, playbook: rec.playbook, phase: rec.phase },
        payload: { runId: rec.runId, status: rec.status, actions: rec.actions.length },
      });
    } catch {}
  } catch (err) {
    // best-effort persistence — do not break caller
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pstack-suite] failed to save run ${rec.runId}: ${msg}`);
  }
}

export function loadRun(cwd: string, runId: string): RunRecord | undefined {
  const file = path.join(runStoreDir(cwd), `${runId}.json`);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return undefined;
  }
}

export function latestRun(cwd: string): RunRecord | undefined {
  const dir = runStoreDir(cwd);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name.slice(0, -5)); // strip .json
    if (files.length === 0) return undefined;
    // Parse all and return the one with latest finishedAt or startedAt
    let latest: RunRecord | undefined;
    let latestTime = "";
    for (const id of files) {
      const rec = loadRun(cwd, id);
      if (!rec) continue;
      const t = rec.finishedAt ?? rec.startedAt;
      if (t > latestTime) {
        latestTime = t;
        latest = rec;
      }
    }
    return latest;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Bounded diagnostics
// ---------------------------------------------------------------------------

export function truncateTail(text: string, maxChars = 1000): string {
  if (text.length <= maxChars) return text;
  const tail = text.slice(-maxChars);
  return "\u2026 (truncated) " + tail;
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

const STATUS_WORST: Record<string, number> = { block: 3, unknown: 2, warn: 1, pass: 0 };

function worstStatus(a: PreflightCheck["status"], b: PreflightCheck["status"]): PreflightCheck["status"] {
  const wa = STATUS_WORST[a] ?? 0;
  const wb = STATUS_WORST[b] ?? 0;
  return wa >= wb ? a : b;
}

export function preflightSafe(pf: PreflightResult): boolean {
  return pf.overall === "pass" || pf.overall === "warn";
}

export function assertPreflightSafe(pf: PreflightResult): string | null {
  if (pf.overall === "pass" || pf.overall === "warn") return null;
  if (pf.overall === "block") {
    const blocked = pf.checks.filter((c) => c.status === "block");
    return "Preflight blocked: " + blocked.map((c) => c.name + (c.detail ? ": " + c.detail : "")).join("; ");
  }
  return "Preflight status unknown — cannot verify safety before irreversible action.";
}

// ---------------------------------------------------------------------------
// Per-check helpers — exported for individual unit testing
// ---------------------------------------------------------------------------

export function checkRepository(cwd: string): PreflightCheck {
  // Check for .git directory
  const hasGit = fs.existsSync(path.join(cwd, ".git"));
  if (!hasGit) {
    return { name: "repository", status: "block", detail: "Not a git repository" };
  }
  return { name: "repository", status: "pass", detail: "git repository" };
}

export function checkVcsBackend(cwd: string): PreflightCheck {
  const hasGit = fs.existsSync(path.join(cwd, ".git"));
  if (hasGit) {
    return { name: "vcs_backend", status: "pass", detail: "git" };
  }
  return { name: "vcs_backend", status: "block", detail: "No VCS backend detected" };
}

export function checkBranch(cwd: string): PreflightCheck {
  const headResult = childProcess.spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (headResult.status === 0) {
    const branch = headResult.stdout.trim();
    if (branch === "HEAD") {
      return { name: "branch", status: "block", detail: "HEAD is detached" };
    }
    return { name: "branch", status: "pass", detail: `git branch: ${branch}` };
  }
  // Try to detect detached HEAD via symbolic-ref
  const symResult = childProcess.spawnSync("git", ["symbolic-ref", "--short", "HEAD"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (symResult.status !== 0) {
    return { name: "branch", status: "block", detail: "detached HEAD" };
  }
  return { name: "branch", status: "pass", detail: `git branch: ${symResult.stdout.trim()}` };
}

export function checkDirtyTree(cwd: string): PreflightCheck {
  let output = "";
  const status = childProcess.spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (status.status === 0) {
    output = status.stdout.trim();
  }
  if (output.length > 0) {
    const fileCount = output.split("\n").filter((l) => l.trim().length > 0).length;
    return { name: "dirty_tree", status: "warn", detail: `${fileCount} modified file(s)` };
  }
  return { name: "dirty_tree", status: "pass" };
}

export function checkRemote(cwd: string): PreflightCheck {
  const result = childProcess.spawnSync("git", ["remote", "-v"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0 && result.stdout.trim().length > 0) {
    const first = result.stdout.trim().split("\n")[0]?.trim() ?? "";
    const remoteName = first.split("\t")[0]?.trim() ?? first.split(" ")[0]?.trim() ?? "unknown";
    return { name: "remote", status: "pass", detail: `remote: ${remoteName}` };
  }
  return { name: "remote", status: "warn", detail: "No remotes configured" };
}

export function checkAuth(cwd: string): PreflightCheck {
  if (!isToolAvailable("gh")) {
    return { name: "auth", status: "unknown", detail: "gh CLI not available — cannot verify auth" };
  }
  // Pass an explicit env copy: bun's spawnSync resolves bare command names
  // against the environment it captured at startup, ignoring runtime
  // process.env.PATH mutations — so PATH-prepended gh fixtures would be
  // silently skipped and a stale real gh would win (fail-open).
  const env = { ...process.env };
  const authResult = childProcess.spawnSync("gh", ["auth", "status"], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  if (authResult.status !== 0 || authResult.error) {
    const err = authResult.stderr?.trim() || authResult.error?.message || "gh auth failed";
    return { name: "auth", status: "block", detail: `gh auth failed: ${err}` };
  }
  // Also verify API access
  const apiResult = childProcess.spawnSync("gh", ["api", "user"], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  if (apiResult.status !== 0) {
    return { name: "auth", status: "warn", detail: "gh auth status OK but API call failed" };
  }
  return { name: "auth", status: "pass", detail: `authenticated as: ${apiResult.stdout.trim()}` };
}

export function checkRequiredDependencies(
  cwd: string,
  required: string[] = [],
): PreflightCheck {
  const missing = required.filter((t) => !isToolAvailable(t));
  if (missing.length > 0) {
    return { name: "dependencies", status: "block", detail: `missing: ${missing.join(", ")}` };
  }
  return { name: "dependencies", status: "pass", detail: `all ${required.length} required tool(s) available` };
}

export function checkRequestedAction(cwd: string, requestedAction: string): PreflightCheck {
  const action = requestedAction.trim();
  if (!action) {
    return { name: "requested_action", status: "unknown", detail: "no requested action provided" };
  }
  return { name: "requested_action", status: "pass", detail: action };
}

// ---------------------------------------------------------------------------
// Composed preflight
// ---------------------------------------------------------------------------

function safeCheck(name: string, fn: () => PreflightCheck): PreflightCheck {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, status: "unknown", detail: `check threw: ${msg.slice(0, 200)}` };
  }
}

export async function runPreflight(
  cwd: string,
  opts: {
    requestedAction: string;
    target?: string;
    required?: string[];
    runId?: string;
    /** Skip external authentication checks for non-mutating previews. */
    skipAuth?: boolean;
  },
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  checks.push(safeCheck("repository", () => checkRepository(cwd)));
  checks.push(safeCheck("vcs_backend", () => checkVcsBackend(cwd)));
  checks.push(safeCheck("branch", () => checkBranch(cwd)));
  checks.push(safeCheck("dirty_tree", () => checkDirtyTree(cwd)));
  checks.push(safeCheck("remote", () => checkRemote(cwd)));
  if (!opts.skipAuth) {
    checks.push(safeCheck("auth", () => checkAuth(cwd)));
  }
  checks.push(safeCheck("dependencies", () => checkRequiredDependencies(cwd, opts.required ?? [])));
  checks.push(safeCheck("requested_action", () => checkRequestedAction(cwd, opts.requestedAction)));

  // Compute overall = worst status
  let overall: PreflightCheck["status"] = "pass";
  for (const c of checks) {
    overall = worstStatus(overall, c.status);
  }

  return {
    checks,
    overall,
    target: opts.target ?? cwd,
    at: new Date().toISOString(),
  };
}

/** Emit preflight event — called by command handlers after runPreflight. */
export function emitPreflight(pf: PreflightResult, target: string, runId?: string): void {
  try {
    emitEvent({
      type: "preflight",
      at: new Date().toISOString(),
      ...(runId ? { meta: { runId } } : {}),
      payload: {
        overall: pf.overall,
        checks: pf.checks.length,
        target,
      },
    });
  } catch {
    // never break caller
  }
}
