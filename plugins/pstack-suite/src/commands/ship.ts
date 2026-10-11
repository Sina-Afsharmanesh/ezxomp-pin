import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync } from "../runner.js";
import { hasGh } from "../utils.js";
import { beginRun, addAction, finishRun, saveRun, runPreflight, preflightSafe, assertPreflightSafe, emitPreflight } from "../run.js";
import { emitEvent } from "../events.js";
import { showConfirmOverlay, preflightToOverlayLines } from "../overlay/confirm-overlay.js";
import { startProgressOverlayForCtx } from "../overlay/progress-overlay.js";
import {
  parseShipArgs,
  confirmPhase,
  pushCommand,
  mergeCommand,
  verifyMerge,
  verifyPushRemote,
  parseMergeVerification,
  findExistingPr,
  createPr,
  prCreateCommand,
  runTscVerify,
  isTscFailure,
  getDirtyTreeDetail,
  verifyPrCreated,
  resolveRemote,
} from "../ship-flow.js";
import { recordPushCancelled, runPushConfirmation } from "../push-confirm.js";

/**
 * Staged, truthful, confirmation-gated ship flow.
 *
 * Stages: preflight -> verify -> push -> pr (if none exists) -> merge -> remote-state confirmation.
 * finishRun "success" ONLY after final remote-state confirmation (MERGED + mergedAt).
 * Any failure/cancel -> finishRun "failed" (or "cancelled" for awaiting confirmation).
 *
 * Confirmation semantics:
 *   --confirm=push,merge (or bare --confirm) = skip interactive confirm
 *   Headless without --confirm -> finishRun "cancelled", detail "awaiting confirmation: <phase>"
 *   "cancelled" chosen over "failed" because nothing is broken — operator hasn't approved yet.
 *   "success" would lie; "running" leaves orphaned receipts.
 *
 * @implements TASK-5
 */
export async function handleShip(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const parsed = parseShipArgs(args);
  const dryRun = parsed.dryRun;

  // Determine target branch
  const branch = resolveTargetBranch(cwd, parsed.target);
  if (!branch) {
    ctx.ui.notify("pstack ship: cannot determine target branch. Use --branch <name>.", "error");
    const run = beginRun({ playbook: "ship", phase: "preflight", target: cwd });
    saveRun(finishRun(addAction(run, "preflight", "failed", "no target branch"), "failed"), cwd);
    return;
  }

  const run = beginRun({ playbook: "ship", phase: "preflight", target: branch });
  const abortController = new AbortController();

  // Start progress overlay (fire-and-forget; headless-safe)
  const overlayCtrl = startProgressOverlayForCtx(ctx, "ship", {
    runId: run.runId,
    onCancelRequest() {
      abortController.abort();
    },
  });

  // --- gh gate (early, before preflight) ---
  if (!dryRun && !hasGh()) {
    ctx.ui.notify(
      "pstack ship: gh (GitHub CLI) is required. Install: https://cli.github.com/",
      "error",
    );
    saveRun(finishRun(addAction(run, "preflight", "blocked", "gh not available"), "failed"), cwd);
    overlayCtrl?.close();
    return;
  }

  // --- STAGE 1: Preflight ---
  ctx.ui.notify(`pstack ship: preflight for branch '${branch}' ...`, "info");
  const pf = await runPreflight(cwd, {
    requestedAction: "ship",
    target: branch,
    required: dryRun ? [] : ["gh"],
    runId: run.runId,
    skipAuth: dryRun,
  });

  // Record preflight result
  const runWithPf = { ...run, preflight: pf };

  // Block on preflight failure
  if (!preflightSafe(pf)) {
    const errMsg = assertPreflightSafe(pf);
    ctx.ui.notify(`pstack ship: preflight blocked — ${errMsg}`, "error");
    saveRun(finishRun(addAction(runWithPf, "preflight", "blocked", errMsg ?? "preflight failed"), "failed"), cwd);
    overlayCtrl?.close();
    return;
  }

  // Warn + pause on dirty tree
  const dirtyCheck = pf.checks.find((c) => c.name === "dirty_tree" && c.status === "warn");
  if (dirtyCheck) {
    const detail = getDirtyTreeDetail(cwd);
    ctx.ui.notify(
      `pstack ship: WARNING — dirty tree detected (${dirtyCheck.detail}).\n${detail ? detail.slice(0, 500) : ""}`,
      "warning",
    );
    // PAUSE: require confirmation before mutating with dirty tree
    const overlayConfirmed = await showConfirmOverlay(ctx, {
      title: "⚠ Dirty Tree Detected",
      lines: preflightToOverlayLines(pf, [
        detail ? ("Details: " + detail.slice(0, 200)) : "",
        "",
        "Proceed with dirty tree?",
      ]),
      confirmLabel: "Proceed",
      cancelLabel: "Cancel",
    });
    if (overlayConfirmed === false) {
      ctx.ui.notify("pstack ship: cancelled — dirty tree requires confirmation.", "info");
      saveRun(finishRun(addAction(runWithPf, "preflight", "cancelled", "user cancelled: dirty tree"), "cancelled"), cwd);
      overlayCtrl?.close();
      return;
    }
    if (overlayConfirmed === true) {
      parsed.confirmPhases.add("push");
    }
    const confirmed = await confirmPhase("push", ctx, parsed.confirmPhases);
    if (!confirmed) {
      ctx.ui.notify("pstack ship: paused — dirty tree requires confirmation. Run with --confirm=push,merge or confirm interactively.", "info");
      saveRun(finishRun(addAction(runWithPf, "preflight", "cancelled", "awaiting confirmation: dirty tree"), "cancelled"), cwd);
      overlayCtrl?.close();
      return;
    }
  }

  const run2 = addAction(runWithPf, "preflight", "ok", `overall: ${pf.overall}`);
  emitPreflight(pf, branch, run.runId);
  saveRun(run2, cwd);

  // --- DRY-RUN mode ---
  if (dryRun) {
    const pushCmd = pushCommand(branch);
    const prCreateCmd = prCreateCommand(branch, `Ship: ${branch}`);
    const mergeCmd = mergeCommand("<number>");

    const dryRunActions = [
      addAction(run2, "verify", "ok", "dry-run: tsc --noEmit"),
    ];
    const r2a = dryRunActions[0]!;
    const r2b = addAction(r2a, "push", "ok", `dry-run: ${pushCmd.join(" ")}`);
    const r2c = addAction(r2b, "pr", "ok", `dry-run: ${prCreateCmd.join(" ")}`);
    const r2d = addAction(r2c, "merge", "ok", `dry-run: ${mergeCmd.join(" ")}`);
    const r2e = addAction(r2d, "remote_confirm", "ok", "dry-run: remote state verification");
    saveRun(finishRun(r2e, "success"), cwd);

    const effectiveRemote = resolveRemote(cwd);
    // Print dry-run summary with resolved branch
    ctx.ui.notify(
      `pstack ship: DRY-RUN (no mutations)\n` +
      `  branch:   ${branch}\n` +
      `  remote:   ${effectiveRemote}\n` +
      `  push:     ${pushCmd.join(" ")}\n` +
      `  pr:       ${prCreateCmd.join(" ")}\n` +
      `  merge:    ${mergeCmd.join(" ")} (resolved after push)\n` +
      `  IRREVERSIBLE: push + merge`,
      "info",
    );
    overlayCtrl?.close();
    return;
  }

  // --- STAGE 2: Verify (tsc --noEmit) ---
  ctx.ui.notify("pstack ship: verify — running tsc --noEmit ...", "info");
  const tscResult = runTscVerify(cwd);
  if (isTscFailure(tscResult)) {
    // Real failure
    const msg = (tscResult.stderr || tscResult.spawnError || "tsc failed").slice(0, 500);
    ctx.ui.notify(`pstack ship: verify failed — ${msg}`, "error");
    saveRun(finishRun(addAction(run2, "verify", "failed", `tsc exit ${tscResult.exitCode}${msg ? ": " + msg : ""}`), "failed"), cwd);
    overlayCtrl?.close();
    return;
  }
  // tsc passed (may have stderr warnings — that's OK per FU6 fix)
  const tscDetail = tscResult.stderr && tscResult.stderr.length > 0
    ? `warnings: ${tscResult.stderr.slice(0, 200)}`
    : undefined;
  ctx.ui.notify("pstack ship: verify passed ✓", "info");
  const run3 = addAction(run2, "verify", "ok", tscDetail);
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "ship", runId: run.runId }, payload: { phase: "verify", status: "ok" } }); } catch {}
  saveRun(run3, cwd);

  // --- STAGE 3: Push ---
  const pushCmd = pushCommand(branch);

  // Confirmation gate for push
  const pushConfirmed = await runPushConfirmation({
    show: showConfirmOverlay,
    ctx,
    title: "Push Confirmation",
    lines: preflightToOverlayLines(pf, [
      `Remote: origin`,
      `Command: ${pushCmd.join(" ")}`,
      "",
      "Push to remote? (cannot be undone)",
    ]),
    confirm: () => confirmPhase("push", ctx, parsed.confirmPhases),
    addConfirmedPhase: () => parsed.confirmPhases.add("push"),
    notify: (message) => ctx.ui.notify(message, "info"),
    recordCancelled: (detail) => recordPushCancelled(run3, cwd, detail),
    close: () => overlayCtrl?.close(),
    cancelledMessage: "pstack ship: push cancelled.",
    awaitingMessage: "pstack ship: awaiting confirmation for push. Run with --confirm=push or confirm interactively.",
  });
  if (!pushConfirmed) return;

  const failPush = (
    result: { stderr?: string; stdout?: string },
    fallback: string,
    notify: (msg: string) => string,
  ): void => {
    const msg = (result.stderr || result.stdout || fallback).slice(0, 300);
    ctx.ui.notify(notify(msg), "error");
    saveRun(finishRun(addAction(run3, "push", "failed", msg), "failed"), cwd);
    overlayCtrl?.close();
  };

  ctx.ui.notify(`pstack ship: push — ${pushCmd.join(" ")} ...`, "info");
  const pushResult = runProcessSync(pushCmd, { cwd, runId: run.runId, signal: abortController.signal });
  if (!pushResult.ok) {
    failPush(pushResult, "push failed", (m) => `pstack ship: push failed — ${m}`);
    return;
  }

  // Verify push reached remote (truthful)
  // Verify push reached remote (truthful) — B1: fail if verification fails
  const pushVerifyResult = verifyPushRemote(branch, cwd);
  if (!pushVerifyResult.ok) {
    failPush(pushVerifyResult, "remote verification failed", (m) => `pstack ship: push verification failed — remote did not receive push. ${m}`);
    return;
  }
  ctx.ui.notify("pstack ship: push confirmed on remote ✓", "info");
  const run4 = addAction(run3, "push", "ok", "verified on remote");
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "ship", runId: run.runId }, payload: { phase: "push", status: "ok" } }); } catch {}
  // --- STAGE 4: PR (create if none exists) ---
  ctx.ui.notify(`pstack ship: checking for existing PR on '${branch}' ...`, "info");
  let prNumber = findExistingPr(branch, cwd);

  if (!prNumber) {
    ctx.ui.notify(`pstack ship: creating PR for '${branch}' ...`, "info");
    prNumber = createPr(branch, `Ship: ${branch}`, cwd);
    if (!prNumber) {
      ctx.ui.notify("pstack ship: gh pr create failed — check output above.", "error");
      saveRun(finishRun(addAction(run4, "pr", "failed", "gh pr create failed"), "failed"), cwd);
      overlayCtrl?.close();
      return;
    }
  }

  // Verify PR is open (truthful)
  const prVerify = verifyPrCreated(branch, cwd);
  const prOpen = prVerify?.open ?? false;
  const prUrl = prVerify?.url ?? "";

  // B2: fail/pause before merge unless PR identity and OPEN state are verified
  if (!prOpen) {
    ctx.ui.notify(
      `pstack ship: PR not open or not found after creation (PR #${prNumber}). ` +
      `Aborting — cannot merge non-open PR.`,
      "error",
    );
    saveRun(finishRun(addAction(run4, "pr", "failed", "PR not open for branch " + branch), "failed"), cwd);
    overlayCtrl?.close();
    return;
  }

  const run5 = addAction(run4, "pr", "ok", `PR #${prNumber}${prUrl ? ": " + prUrl : ""}`);
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "ship", runId: run.runId }, payload: { phase: "pr", status: "ok" } }); } catch {}
  saveRun(run5, cwd);

  // --- STAGE 5: Merge ---
  // Second confirmation gate for merge
  const mergeOverlay = await showConfirmOverlay(ctx, {
    title: "Merge Confirmation",
    lines: preflightToOverlayLines(pf, [
      `PR: #${prNumber}`,
      prUrl ? `URL: ${prUrl}` : "",
      "",
      "Merge this PR? (irreversible)",
    ]),
    confirmLabel: "Merge",
    cancelLabel: "Cancel",
  });
  if (mergeOverlay === false) {
    ctx.ui.notify("pstack ship: merge cancelled.", "info");
    saveRun(finishRun(addAction(run5, "merge", "cancelled", "user cancelled: merge"), "cancelled"), cwd);
    overlayCtrl?.close();
    return;
  }
  if (mergeOverlay === true) {
    parsed.confirmPhases.add("merge");
  }
  const mergeConfirmed = await confirmPhase("merge", ctx, parsed.confirmPhases);
  if (!mergeConfirmed) {
    ctx.ui.notify(`pstack ship: awaiting confirmation for merge (irreversible). Run with --confirm=merge or confirm interactively.`, "info");
    saveRun(finishRun(addAction(run5, "merge", "cancelled", "awaiting confirmation: merge"), "cancelled"), cwd);
    overlayCtrl?.close();
    return;
  }

  ctx.ui.notify(`pstack ship: merge — merging PR #${prNumber} ...`, "info");
  const mergeResult = runProcessSync(mergeCommand(prNumber ?? "0"), { cwd, runId: run.runId, signal: abortController.signal });
  if (!mergeResult.ok) {
    const msg = (mergeResult.stderr || mergeResult.stdout || "merge failed").slice(0, 300);
    ctx.ui.notify(`pstack ship: merge failed — ${msg}`, "error");
    // Push happened but merge failed — status is failed, NOT success
    saveRun(finishRun(addAction(run5, "merge", "failed", msg), "failed"), cwd);
    overlayCtrl?.close();
    return;
  }

  // --- STAGE 6: Remote-state confirmation (truthful) ---
  ctx.ui.notify("pstack ship: verifying merge on remote ...", "info");
  const mergeVerifyResult = verifyMerge(prNumber ?? "0", cwd);
  // B3: require command success (result.ok) before trusting JSON output
  if (!mergeVerifyResult.ok) {
    const msg = (mergeVerifyResult.stderr || mergeVerifyResult.stdout || "gh pr view failed").slice(0, 300);
    ctx.ui.notify(`pstack ship: merge verification command failed — ${msg}`, "error");
    const run6 = addAction(run5, "remote_confirm", "failed", "gh pr view command failed");
    saveRun(finishRun(run6, "failed"), cwd);
    overlayCtrl?.close();
    return;
  }
  const { merged, mergedAt } = parseMergeVerification(mergeVerifyResult.stdout);

  if (!merged) {
    // AC4: push without verified merge NEVER reports merged success
    ctx.ui.notify(
      `pstack ship: WARNING — merge command exited OK but remote does not show MERGED state. ` +
      `This is NOT a successful ship.`,
      "error",
    );
    const run6 = addAction(run5, "remote_confirm", "failed", "remote state not MERGED");
    saveRun(finishRun(run6, "failed"), cwd);
    overlayCtrl?.close();
    return;
  }

  // TRUE success — merged and confirmed
  ctx.ui.notify(`pstack ship: merged and confirmed on remote ✓ (mergedAt: ${mergedAt})`, "info");
  const run6 = addAction(run5, "remote_confirm", "ok", `MERGED at ${mergedAt ?? "unknown"}`);
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "ship", runId: run.runId }, payload: { phase: "merge", status: "ok" } }); } catch {}
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "ship", runId: run.runId }, payload: { phase: "remote_confirm", status: "ok" } }); } catch {}
  overlayCtrl?.close();
  saveRun(finishRun(addAction(run6, "merge", "ok"), "success"), cwd);
}

/** Resolve target branch from args or the current Git branch. */
function resolveTargetBranch(cwd: string, argTarget: string | undefined): string | undefined {
  if (argTarget) return argTarget;

  // Git branch
  const headResult = runProcessSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  if (headResult.ok && headResult.stdout?.trim() && headResult.stdout.trim() !== "HEAD") {
    return headResult.stdout.trim();
  }

  return undefined;
}
