// ship-flow.ts — staged, confirmation-gated, truthful ship flow
// Local module — not exported from index. Used by commands/ship.ts only.

import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { RunRecord, PreflightResult, RunAction } from "./run.js";
import type { CommandResult } from "./runner.js";
import { runProcessSync } from "./runner.js";
/* ------------------------------------------------------------------ */
/* Confirmation strategy                                              */
/*                                                                    */
/* When --confirm is missing and UI is not interactive (headless /    */
/* RPC mode), we finishRun as "cancelled" with detail                  */
/* "awaiting confirmation: <phase>". This is NOT "failed" because     */
/* the user's code/repo is fine — they simply haven't confirmed yet.  */
/* "success" would lie (nothing was done). "running" leaves orphaned.  */
/* "cancelled" = "the operator chose not to proceed at this time".     */
/* ------------------------------------------------------------------ */

export interface ShipParseResult {
  dryRun: boolean;
  confirmPhases: Set<"push" | "merge">;
  target: string | undefined;
}

/** Parse --dry-run, --preview, --confirm=push,merge, --branch <name> */
export function parseShipArgs(raw: string): ShipParseResult {
  const dryRun = /--dry-run|--preview/.test(raw);
  const confirmPhases = new Set<"push" | "merge">();
  let target: string | undefined;

  const mConfirm = raw.match(/--confirm=(\w+(?:,\w+)*)/);
  if (mConfirm) {
    for (const p of (mConfirm[1] ?? "").split(",")) {
      const trimmed = p.trim() as "push" | "merge";
      if (trimmed === "push" || trimmed === "merge") confirmPhases.add(trimmed);
    }
  } else if (/--confirm\b/.test(raw)) {
    // Bare --confirm without = means confirm all
    confirmPhases.add("push");
    confirmPhases.add("merge");
  }

  const mBranch = raw.match(/--branch\s+(\S+)/);
  if (mBranch) target = mBranch[1];

  return { dryRun, confirmPhases, target };
}

/* ------------------------------------------------------------------ */
/* Stage helpers                                                      */
/* ------------------------------------------------------------------ */

/** Return the argv for push in dry-run or real mode. */
export function pushCommand(branch: string): string[] {
  return ["git", "push", "-u", "origin", branch];
}

export function mergeCommand(prNumber: string): string[] {
  return ["gh", "pr", "merge", prNumber, "--merge", "--auto"];
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Require explicit confirmation for a mutation phase.
 * Returns true if confirmed, false if cancelled/awaiting.
 */
export async function confirmPhase(
  phase: string,
  ctx: ExtensionCommandContext,
  confirmPhases: Set<string>,
): Promise<boolean> {
  // Headless: require --confirm
  if (!ctx.hasUI) {
    if (confirmPhases.has(phase)) return true;
    return false;
  }
  // Interactive: use UI confirm dialog if --confirm not provided
  if (confirmPhases.has(phase)) return true;
  try {
    return await ctx.ui.confirm(
      `pstack ship: confirm ${phase}`,
      `This will ${phase === "push" ? "push your branch to the remote" : "merge the pull request (irreversible)"}. Proceed?`,
    );
  } catch {
    // UI confirm not available — fall through to notify path
    ctx.ui.notify(
      `pstack ship: run with --confirm=${phase} (headless) or approve interactively to ${phase}.`,
      "warning",
    );
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Remote-state verification                                          */
/* ------------------------------------------------------------------ */

/** Verify merge via gh pr view. Returns true only when MERGED + mergedAt. */
export function verifyMerge(prNumber: string, cwd: string): CommandResult {
  return runProcessSync(
    ["gh", "pr", "view", prNumber, "--json", "state,mergedAt"],
    { cwd },
  );
}

/** Check if remote received the push. Quick git ls-remote check. */
export function verifyPushRemote(branch: string, cwd: string): CommandResult {
  const result = runProcessSync(["git", "ls-remote", "origin", branch], { cwd });
  const expectedRef = `refs/heads/${branch}`;
  if (!result.ok || !result.stdout.trim() || !result.stdout.includes(expectedRef)) {
    return {
      ...result,
      ok: false,
      stderr: `target ref ${expectedRef} not found on remote`,
    };
  }
  return result;
}
export function resolveRemote(cwd: string): string {
  const result = runProcessSync(["git", "remote", "get-url", "origin"], { cwd });
  if (result.ok && result.stdout.trim()) {
    return result.stdout.trim();
  }
  const fallback = runProcessSync(["git", "remote", "-v"], { cwd });
  if (fallback.ok && fallback.stdout.trim()) {
    const line = fallback.stdout.trim().split("\n")[0];
    const match = line?.match(/origin\s+(.*)/);
    const remoteUrl = match?.[1];
    if (remoteUrl) return remoteUrl.trim();
  }
  return "unknown";
}

/** Parse merge verification JSON — true only if state MERGED && non-empty mergedAt ISO timestamp. */
export function parseMergeVerification(stdout: string): { merged: boolean; mergedAt?: string } {
  try {
    const json = JSON.parse(stdout);
    const state = json?.state;
    const mergedAt = json?.mergedAt;
    // Strict: state must be "MERGED" and mergedAt must be a non-empty string (ISO timestamp)
    const merged = state === "MERGED" && typeof mergedAt === "string" && mergedAt.length > 0 && !Number.isNaN(Date.parse(mergedAt));
    return merged ? { merged, mergedAt } : { merged };
  } catch {
    return { merged: false };
  }
}

/** Check if PR exists for branch. Returns PR number or null. */
export function findExistingPr(branch: string, cwd: string): string | null {
  const result = runProcessSync(
    ["gh", "pr", "list", "--head", branch, "--json", "number", "--limit", "1"],
    { cwd },
  );
  if (result.ok && result.stdout.trim()) {
    try {
      const items = JSON.parse(result.stdout);
      if (Array.isArray(items) && items.length > 0) {
        return String(items[0].number);
      }
    } catch { /* parse error */ }
  }
  return null;
}

/** Create PR for branch. Returns PR number or null. */
export function prCreateCommand(branch: string, title: string): string[] {
  return ["gh", "pr", "create", "--head", branch, "--title", title, "--body", "Shipped via pstack"];
}

export function createPr(branch: string, title: string, cwd: string): string | null {
  const result = runProcessSync(prCreateCommand(branch, title), { cwd });
  if (!result.ok) return null;
  // gh pr create outputs URL like https://github.com/owner/repo/pull/123
  const m = result.stdout.match(/\/pull\/(\d+)/);
  return m?.[1] ?? null;
}

/* ------------------------------------------------------------------ */
/* PR verification                                                    */
/* ------------------------------------------------------------------ */

/** Verify PR was created by checking gh pr view. Returns { url, open } or null. */
export function verifyPrCreated(branch: string, cwd: string): { url: string; open: boolean } | null {
  const result = runProcessSync(
    ["gh", "pr", "view", "--json", "url,state", "--head", branch],
    { cwd },
  );
  if (!result.ok || !result.stdout.trim()) return null;
  try {
    const json = JSON.parse(result.stdout);
    return { url: json.url ?? "", open: json.state === "OPEN" };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* tsc verify — only fail on non-zero exit / spawnError / timeout     */
/* ------------------------------------------------------------------ */

/**
 * Run tsc --noEmit; stderr with exit 0 is NOT a failure (AC6-FU6 fix).
 * Only non-zero exit / spawnError / timeout / cancelled fail verify.
 */
export function runTscVerify(cwd: string): CommandResult {
  return runProcessSync(["tsc", "--noEmit"], { cwd, timeoutMs: 120_000 });
}

/** Check if tsc result is a genuine failure (not just stderr). */
export function isTscFailure(result: CommandResult): boolean {
  // Only non-zero exit, spawnError, timeout, or cancelled = failure
  if (result.spawnError) return true;
  if (result.timeout) return true;
  if (result.cancelled) return true;
  if (result.exitCode !== 0) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Dirty tree check                                                   */
/* ------------------------------------------------------------------ */

/** Get dirty tree summary for preflight pause. */
export function getDirtyTreeDetail(cwd: string): string {
  const r = runProcessSync(["git", "status", "--porcelain"], { cwd });
  return r.stdout?.trim() ?? "";
}

/* ------------------------------------------------------------------ */
/* Slugify for branch naming                                          */
/* ------------------------------------------------------------------ */

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
