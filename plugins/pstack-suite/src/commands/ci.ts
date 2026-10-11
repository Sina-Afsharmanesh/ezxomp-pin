import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync, runProcess } from "../runner.js";
import { hasGh, hasBacklogMd } from "../utils.js";
import { startProgressOverlayForCtx } from "../overlay/progress-overlay.js";
import { createCiOverlay, startFindingsOverlayForCtx, type FindingRow } from "../overlay/findings-overlay.js";
import {
  beginRun,
  addAction,
  finishRun,
  saveRun,
} from "../run.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderCheck {
  name: string;
  status: "pass" | "fail" | "pending" | "skipped" | "cancelled" | "unknown";
  detail?: string;
}

export interface RunChecksResult {
  status: "all-pass" | "failure" | "pending" | "unknown";
  checks: ProviderCheck[];
  failures: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/** Monitor/fix CI failures
 * --watch: gh pr checks --watch
 * --fix: create a backlog task for failures
 * Soft-fails when gh is missing.
 * Creates run receipts in .omp/pstack-runs/.
 * @implements TASK-37.6
 */
export async function handleCi(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const flags = parseArgs(args);
  const watch = flags.has("watch");
  const fix = flags.has("fix");

  // Begin run receipt
  const rec = beginRun({
    playbook: "ci",
    phase: "ci",
    target: "pr-checks",
  });
  const abortController = new AbortController();
  const overlayCtrl = startProgressOverlayForCtx(ctx, "ci", {
    runId: rec.runId,
    onCancelRequest() {
      abortController.abort();
      // The local AbortController owns this command.
    },
  });

  if (!hasGh()) {
    const failedRec = finishRun(
      addAction(rec, "check-github-cli", "blocked", "gh CLI not available"),
      "failed",
    );
    saveRun(failedRec, cwd);
    overlayCtrl?.close();
    ctx.ui.notify(
      "pstack ci: gh (GitHub CLI) is required. Install: https://cli.github.com/",
      "error",
    );
    return;
  }

  if (watch) {
    await watchChecks(cwd, ctx, rec, abortController.signal);
    overlayCtrl?.close();
    return;
  }

  // Run checks
  const result = await runChecks(cwd, ctx, rec.runId);

  // Save receipt
  const actionResult = result.status === "all-pass" ? "ok"
    : result.status === "failure" ? "failed"
    : "blocked";
  const receiptStatus = result.status === "all-pass" ? "success"
    : result.status === "failure" ? "failed"
    : "unknown";
  const detail = result.error || (result.failures.length
    ? result.failures.join(", ")
    : undefined);
  const savedRec = finishRun(
    addAction(rec, "ci-checks", actionResult, detail),
    receiptStatus,
  );
  saveRun(savedRec, cwd);
  overlayCtrl?.close();


  // Headless / fallback notification
  if (result.status === "all-pass") {
    ctx.ui.notify("pstack ci: all checks passing ✓", "info");
    return;
  }

  // TASK-12: normalized findings — same data for TUI overlay and headless output (AC1/AC4/AC6).
  const rows: FindingRow[] = result.checks.map((c) => {
    const row: FindingRow = { label: c.name, status: c.status };
    if (c.detail) row.detail = c.detail;
    return row;
  });
  if (result.checks.length === 0) {
    rows.push({ label: "provider data unavailable", status: "unknown", detail: result.error ?? "no checks returned" });
  }
  const summary = `pstack ci: ${rows.filter(r => r.status === "pass").length} pass, ${rows.filter(r => r.status === "fail").length} fail, ${rows.filter(r => r.status === "pending").length} pending, ${rows.filter(r => r.status === "skipped").length} skipped, ${rows.filter(r => r.status === "cancelled").length} cancelled, ${rows.filter(r => r.status === "unknown").length} unknown`;

  const findingsCtrl = ctx.hasUI && rows.length > 0
    ? startFindingsOverlayForCtx(ctx, createCiOverlay(result.checks, { title: "CI Checks" }))
    : undefined;
  if (!findingsCtrl) {
    // Headless parity: identical normalized findings without the overlay (AC6).
    const lines = [summary, ...rows.map((r) => `  [${r.status}] ${r.label}${r.detail ? ": " + r.detail : ""}`)];
    ctx.ui.notify(lines.join("\n"), "warning");
  }
  if (findingsCtrl) {
    // Overlay owns interaction; close it before --fix task creation below.
    findingsCtrl.close();
  }

  if (fix && hasBacklogMd()) {
    for (const f of result.failures) {
      await createFailureTask(f, cwd, ctx);
    }
    ctx.ui.notify(
      `pstack ci: created ${result.failures.length} backlog task(s) for failures`,
      "info",
    );
  }
}

// ---------------------------------------------------------------------------
// runChecks — fetches PR checks from GitHub
// ---------------------------------------------------------------------------

/**
 * Parse gh pr checks --json name,state,conclusion output.
 * Strict: returns [] unless input is a JSON array. Raw records keep state/conclusion
 * fields (smoke/parity tests assert these). Use toProviderChecks for normalization.
 */
export function parseGhChecks(json: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed as Array<Record<string, unknown>>;
}

/** Normalize raw gh check records into ProviderChecks. Null members map to unknown. */
function toProviderChecks(records: Array<Record<string, unknown>>): ProviderCheck[] {
  const checks: ProviderCheck[] = [];
  for (const item of records) {
    if (item === null || typeof item !== "object") {
      checks.push({ name: "(null entry)", status: "unknown" });
      continue;
    }
    const name = (item as any).name || "(unnamed)";
    const state = (item as any).state || "";
    const conclusion = (item as any).conclusion;

    if (state === "completed" && conclusion === "success") {
      checks.push({ name, status: "pass" });
    } else if (state === "completed" && conclusion === "failure") {
      checks.push({ name, status: "fail", detail: conclusion });
    } else if (state === "completed") {
      checks.push({ name, status: "unknown", detail: "completed without conclusion" });
    } else if (state === "in_progress") {
      checks.push({ name, status: "pending", detail: "in progress" });
    } else if (state === "pending") {
      checks.push({ name, status: "pending" });
    } else if (state === "skipped") {
      checks.push({ name, status: "skipped" });
    } else if (state === "cancelled") {
      checks.push({ name, status: "cancelled" });
    } else {
      checks.push({ name, status: "unknown", detail: `state: ${state}` });
    }
  }
  return checks;
}
/** Run `gh pr checks` once; return structured result.
 * Strict: only accepts JSON array from gh; rejects NDJSON, single objects,
 * null array members, and empty output. Non-zero gh exit → unknown.
 */
export async function runChecks(
  cwd: string,
  ctx: ExtensionCommandContext,
  runId?: string,
): Promise<RunChecksResult> {
  if (!hasGh()) {
    return { status: "unknown", checks: [], failures: [], error: "gh CLI not available" };
  }

  const r = runProcessSync(
    ["gh", "pr", "checks", "--json", "name,state,conclusion"],
    { cwd, maxOutputBytes: 1024 * 512, ...(runId ? { runId } : {}) },
  );

  // Non-zero exit → unknown with typed error
  if (r.exitCode !== 0) {
    const stderr = r.stderr || "";
    let errorType = "gh pr checks failed";
    if (/no\s+active\s+(pull\s+)?(request|pr)?/i.test(stderr)) {
      errorType = "no active PR";
    } else if (/not authenticated/i.test(stderr)) {
      errorType = "auth: " + stderr.trim();
    } else if (/connection|network|refused/i.test(stderr)) {
      errorType = "network: " + stderr.trim();
    }
    const out = stderr || (r.stdout || "");
    if (out.length > 0 && ctx.hasUI) {
      ctx.ui.notify(out.slice(0, 400), "info");
    }
    return { status: "unknown", checks: [], failures: [], error: errorType };
  }

  // Parse JSON array only — strict: no NDJSON, no single object
  const raw = r.stdout || "";
  if (!raw.trim()) {
    return { status: "unknown", checks: [], failures: [], error: "empty output from gh pr checks" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unknown", checks: [], failures: [], error: "malformed JSON from gh" };
  }
  if (!Array.isArray(parsed)) {
    return { status: "unknown", checks: [], failures: [], error: "expected JSON array from gh" };
  }

  // Parse individual checks via shared parser (also used by smoke/parity tests)
  const checks = toProviderChecks(parseGhChecks(raw));
  const failures = checks.filter((c) => c.status === "fail").map((c) => c.name);


  // Determine overall status (priority: failure > unknown > pending > all-pass)
  const hasFail = failures.length > 0;
  const hasUnknown = checks.some((c) => c.status === "unknown");
  const hasPending = checks.some((c) => c.status === "pending");

  if (hasFail) return { status: "failure", checks, failures };
  if (hasUnknown) return { status: "unknown", checks, failures };
  if (hasPending) return { status: "pending", checks, failures };
  if (checks.length > 0) return { status: "all-pass", checks, failures };
  return { status: "unknown", checks, failures, error: "no checks" };
}

// ---------------------------------------------------------------------------
// watchChecks — gh pr checks --watch
// ---------------------------------------------------------------------------

async function watchChecks(
  cwd: string,
  ctx: ExtensionCommandContext,
  rec: Parameters<typeof addAction>[0],
  signal?: AbortSignal,
): Promise<void> {
  ctx.ui.notify("pstack ci: watching PR checks (Ctrl+C to stop) ...", "info");
  const r = await runProcess(["gh", "pr", "checks", "--watch"], { cwd, ...(signal ? { signal } : {}) });
  const exitCode = r.exitCode ?? 130;

  if (exitCode === 0) {
    const okRec = finishRun(
      addAction(rec, "ci-watch", "ok", "all passed"),
      "success",
    );
    saveRun(okRec, cwd);
    ctx.ui.notify("pstack ci: all checks passed ✓", "info");
  } else if (r.cancelled || exitCode === 130 || exitCode === null) {
    const cancelledRec = finishRun(
      addAction(rec, "ci-watch", "cancelled", "watch cancelled"),
      "cancelled",
    );
    saveRun(cancelledRec, cwd);
  } else {
    const failRec = finishRun(
      addAction(rec, "ci-watch", "failed", `exit ${exitCode}`),
      "failed",
    );
    saveRun(failRec, cwd);
    ctx.ui.notify(
      `pstack ci: could not determine CI status (exit ${exitCode})`,
      "error",
    );
  }
}

// ---------------------------------------------------------------------------
// createFailureTask — backlog task creation for CI failures
// ---------------------------------------------------------------------------

async function createFailureTask(
  failure: string,
  cwd: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const title = `CI failure: ${failure}`;
  const result = runProcessSync(
    ["backlog", "task", "create", title, "-l", "ci"],
    { cwd },
  );
  if (result.exitCode !== 0) {
    ctx.ui.notify(
      `pstack ci: failed to create task for "${failure}": ${result.stderr || "unknown"}`,
      "error",
    );
  }
}

// ---------------------------------------------------------------------------
// parseArgs — flag parser
// ---------------------------------------------------------------------------

function parseArgs(raw: string): Set<string> {
  const s = new Set<string>();
  for (const tok of raw.split(/\s+/)) {
    const flag = tok.startsWith("--") ? tok.slice(2) : tok;
    if (flag.length > 0) {
      s.add(flag);
    }
  }
  return s;
}
