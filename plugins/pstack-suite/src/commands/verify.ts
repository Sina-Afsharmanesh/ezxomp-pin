import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync } from "../runner.js";
import { hasGh } from "../utils.js";
import { emitEvent } from "../events.js";
import { beginRun, addAction, finishRun, saveRun, truncateTail } from "../run.js";
import type { VerifyCheck, VerifyResult, CheckStatus } from "../verify-state.js";
import { worstStatus, isPassing } from "../verify-state.js";

/** Run verification: type-check + optional provider checks */
export async function handleVerify(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();

  ctx.ui.notify("pstack verify: starting verification ...", "info");

  const rec = beginRun({ playbook: "pstack", phase: "verify", target: cwd });
  const checks: VerifyCheck[] = [];

  // 1. Type check — tsc --noEmit
  const tscCheck = await runTypeCheck(cwd, rec.runId);
  try { emitEvent({ type: "check", at: new Date().toISOString(), meta: { playbook: "verify", runId: rec.runId }, payload: { check: tscCheck.name, status: tscCheck.status } }); } catch {}
  checks.push(tscCheck);

  // 2. Provider checks (gh pr checks) — only if gh available
  const providerCheck = await runProviderCheck(cwd, rec.runId);
  try { emitEvent({ type: "check", at: new Date().toISOString(), meta: { playbook: "verify", runId: rec.runId }, payload: { check: providerCheck.name, status: providerCheck.status } }); } catch {}
  checks.push(providerCheck);

  const overall = worstStatus(...checks.map(c => c.status));
  const result: VerifyResult = { checks, overall };
  // Record receipt — carry addAction returns through finishRun + saveRun
  // Receipt mapping: pass/skipped → ok+success; fail → failed+failed; pending/unknown → blocked+unknown
  const actionResult = overall === "fail" ? "failed" : overall === "pending" || overall === "unknown" ? "blocked" : "ok";
  const runStatus = overall === "fail" ? "failed" : overall === "pending" || overall === "unknown" ? "unknown" : "success";
  const recWithActions = addAction(
    rec,
    "verify",
    actionResult,
    JSON.stringify(checks.map(c => ({ name: c.name, kind: c.kind, status: c.status, detail: c.detail, evidence: c.evidence ? truncateTail(c.evidence) : undefined }))),
  );
  saveRun(finishRun(recWithActions, runStatus), cwd);
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "verify", runId: rec.runId }, payload: { phase: "verify", status: runStatus === "success" ? "ok" : "failed" } }); } catch {}

  // Report
  if (isPassing(result)) {
    ctx.ui.notify("pstack verify: all checks passed ✓", "info");
  } else {
    const failChecks = checks.filter(c => c.status === "fail");
    const pendingChecks = checks.filter(c => c.status === "pending");
    const unknownChecks = checks.filter(c => c.status === "unknown");
    if (failChecks.length) {
      ctx.ui.notify(
        `pstack verify: FAILED ✗ — ${failChecks.map(c => c.name).join(", ")}`,
        "error",
      );
    }
    if (pendingChecks.length) {
      ctx.ui.notify(
        `pstack verify: ${pendingChecks.length} check(s) pending: ${pendingChecks.map(c => c.name).join(", ")}`,
        "info",
      );
    }
    if (unknownChecks.length) {
      ctx.ui.notify(
        `pstack verify: could not determine status for ${unknownChecks.map(c => c.name).join(", ")} — ${unknownChecks.map(c => c.detail || "unknown reason").join("; ")}`,
        "info",
      );
    }
    const skippedChecks = checks.filter(c => c.status === "skipped");
    if (skippedChecks.length) {
      ctx.ui.notify(
        `pstack verify: ${skippedChecks.length} check(s) skipped: ${skippedChecks.map(c => c.name).join(", ")}`,
        "info",
      );
    }
  }
}

async function runTypeCheck(cwd: string, runId?: string): Promise<VerifyCheck> {
  const r = runProcessSync(["tsc", "--noEmit"], { cwd, timeoutMs: 60000, ...(runId ? { runId } : {}) });
  const raw = r.stderr || r.stdout || "";
  if (r.exitCode === 0 && !r.stderr?.trim()) {
    return { kind: "type-check", name: "tsc", status: "pass", evidence: truncateTail(r.stdout) };
  }
  return {
    kind: "type-check",
    name: "tsc",
    status: "fail",
    evidence: truncateTail(raw),
    detail: `tsc exit ${r.exitCode}: ${truncateTail(raw.slice(0, 200))}`,
  };
}

async function runProviderCheck(cwd: string, runId?: string): Promise<VerifyCheck> {
  // Missing gh → skipped
  if (!hasGh()) {
    return { kind: "provider-check", name: "gh pr checks", status: "skipped", detail: "gh unavailable" };
  }

  const r = runProcessSync(
    ["gh", "pr", "checks", "--json", "name,state,conclusion,link,startedAt"],
    { cwd, timeoutMs: 30000, ...(runId ? { runId } : {}) },
  );

  // Non-zero exit — classify
  if (!r.ok) {
    const stderrTail = truncateTail((r.stderr || "").slice(0, 300));
    // Detect specific failure modes from stderr
    const stderr = (r.stderr || "").toLowerCase();
    if (stderr.includes("not authenticated") || stderr.includes("authentication") || stderr.includes("auth failed") || r.spawnError?.includes("auth")) {
      return {
        kind: "provider-check",
        name: "gh pr checks",
        status: "unknown",
        detail: `auth: ${stderrTail}`,
        evidence: truncateTail(r.stderr),
      };
    }
    if (stderr.includes("no active pull request") || stderr.includes("not inside a working tree") || stderr.includes("no pull request")) {
      return {
        kind: "provider-check",
        name: "gh pr checks",
        status: "skipped",
        detail: `no active PR: ${stderrTail}`,
        evidence: truncateTail(r.stderr),
      };
    }
    if (stderr.includes("network") || stderr.includes("connection") || stderr.includes("timeout") || stderr.includes("refused") || r.spawnError) {
      return {
        kind: "provider-check",
        name: "gh pr checks",
        status: "unknown",
        detail: `network: ${stderrTail}`,
        evidence: truncateTail(r.stderr),
      };
    }
    // Generic non-zero exit
    return {
      kind: "provider-check",
      name: "gh pr checks",
      status: "unknown",
      detail: `exit ${r.exitCode}: ${stderrTail}`,
      evidence: truncateTail(r.stderr),
    };
  }

  // Exit 0 — parse JSON output
  const parsed = parseGhChecksOutput(r.stdout);
  if (parsed.length === 0) {
    // Exit 0 + empty output → unknown (no checks to report)
    return {
      kind: "provider-check",
      name: "gh pr checks",
      status: "unknown",
      detail: "empty output from gh pr checks (exit 0)",
      evidence: truncateTail(r.stdout),
    };
  }

  // Classify each check
  const statuses: CheckStatus[] = [];
  const evidences: string[] = [];
  for (const check of parsed) {
    const cs = classifyGhCheck(check);
    statuses.push(cs);
    evidences.push(JSON.stringify(check));
  }

  const overall = worstStatus(...statuses);
  return {
    kind: "provider-check",
    name: "gh pr checks",
    status: overall,
    evidence: truncateTail(evidences.join("\n")),
    detail: parsed.length > 1 ? `parsed ${parsed.length} checks: ${statuses.join(", ")}` : `parsed ${parsed.length} check: ${statuses.join(", ")}`,
  };
}

/** Parse gh --json output: strictly a JSON array of non-null objects. Rejects objects, NDJSON, partial, null members. */
function parseGhChecksOutput(stdout: string): Array<Record<string, unknown>> {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    // Validate every member is a non-null object
    for (const item of parsed) {
      if (item === null || typeof item !== "object") return [];
    }
    return parsed;
  } catch {
    // Parse error — not a valid JSON array
  }

  return [];
}

/** Classify a single gh pr check JSON object. */
function classifyGhCheck(check: Record<string, unknown>): CheckStatus {
  const conclusion = check.conclusion != null ? String(check.conclusion) : undefined;
  const state = check.state != null ? String(check.state) : undefined;

  // conclusion takes priority if present
  if (conclusion) {
    const cl = conclusion.toLowerCase();
    if (cl === "success") return "pass";
    if (cl === "failure" || cl === "failure") return "fail";
    if (cl === "skipped") return "skipped";
    // action_required, timed_out, startup_failure, etc. → fail
    if (cl !== "" && cl !== "null") return "fail";
  }

  // Fall back to state
  if (state) {
    const sl = state.toLowerCase();
    if (sl === "success") return "pass";
    if (sl === "failure" || sl === "failure") return "fail";
    if (sl === "in_progress" || sl === "queued") return "pending";
    if (sl === "completed") return "unknown"; // completed without conclusion is ambiguous
    if (sl === "skipped") return "skipped";
  }

  return "unknown";
}

export { classifyGhCheck };
