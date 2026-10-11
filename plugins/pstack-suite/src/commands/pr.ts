import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync } from "../runner.js";
import { showConfirmOverlay, preflightToOverlayLines } from "../overlay/confirm-overlay.js";
import { hasGh } from "../utils.js";
import { emitEvent } from "../events.js";
import {
  beginRun,
  addAction,
  finishRun,
  saveRun,
  runPreflight,
  emitPreflight,
  preflightSafe,
  assertPreflightSafe,
} from "../run.js";
import { confirmPhase, slugify, verifyPrCreated } from "../ship-flow.js";
import { recordPushCancelled, runPushConfirmation } from "../push-confirm.js";

interface PrParseResult {
  title: string | undefined;
  body: string | undefined;
  paths: string[] | undefined;
  all: boolean;
  confirmPhases: Set<string>;
}

function parsePrArgs(raw: string): PrParseResult {
  const confirmPhases = new Set<string>();

  const mPaths = raw.match(/--paths\s+(.+?)(?=\s+-+\s|$)/);
  let paths: string[] | undefined;
  if (mPaths) {
    paths = mPaths[1]!.trim().split(/\s+/);
  }

  const all = /--all/.test(raw);

  const mTitle = raw.match(/--title\s+"([^"]*)"/);
  const title = mTitle?.[1];

  const mBody = raw.match(/--body\s+"([^"]*)"/);
  const body = mBody?.[1];

  const mConfirm = raw.match(/--confirm(?:=(.+))?/);
  if (mConfirm) {
    const list = mConfirm[1] ? mConfirm[1]!.split(",") : ["branch", "commit", "push"];
    for (const p of list) {
      const trimmed = p.trim();
      if (trimmed) confirmPhases.add(trimmed);
    }
  } else if (raw.includes("--confirm")) {
    confirmPhases.add("branch");
    confirmPhases.add("commit");
    confirmPhases.add("push");
  }

  return { title, body, paths, all, confirmPhases };
}

export async function handlePr(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd;

  // Check gh availability
  if (!hasGh()) {
    const run = beginRun({ playbook: "pr", phase: "preflight", target: cwd });
    ctx.ui.notify("pstack pr: gh CLI not found — install GitHub CLI.", "error");
    saveRun(finishRun(run, "failed"), cwd);
    return;
  }

  // Preflight
  const run = beginRun({ playbook: "pr", phase: "preflight", target: cwd });
  const pf = await runPreflight(cwd, { requestedAction: "pr", required: ["gh"] });
  const errMsg = assertPreflightSafe(pf);
  if (!preflightSafe(pf)) {
    ctx.ui.notify(`pstack pr: preflight blocked — ${errMsg}`, "error");
    saveRun(finishRun(run, "failed"), cwd);
    return;
  }
  const run2 = addAction(run, "preflight", "ok", `overall: ${pf.overall}`);
  emitPreflight(pf, cwd);

  const parsed = parsePrArgs(args);

  await prWithGit(parsed, cwd, ctx, run2, parsed.confirmPhases);
}

/** git: checkout -b -> stage paths -> commit -> confirm -> push -> PR -> verify */
async function prWithGit(
  parsed: PrParseResult,
  cwd: string,
  ctx: ExtensionCommandContext,
  run: any,
  confirmPhases: Set<string>,
): Promise<void> {
  const branch = `feature/${slugify(parsed.title || "pr")}-${Date.now()}`;
  ctx.ui.notify(`pstack pr: creating branch ${branch} ...`, "info");

  // B7: confirm before creating branch (mutation gate)
  const branchOverlay = await showConfirmOverlay(ctx, {
    title: "PR Branch Confirmation",
    lines: [
      parsed.title ? `Title: ${parsed.title}` : "",
      `Branch: ${branch}`,
      "",
      "Create this branch?",
    ],
    confirmLabel: "Create",
    cancelLabel: "Cancel",
  });
  if (branchOverlay === false) {
    ctx.ui.notify("pstack pr: branch creation cancelled.", "info");
    saveRun(finishRun(addAction(run, "branch", "cancelled", "user cancelled: branch"), "cancelled"), cwd);
    return;
  }
  if (branchOverlay === true) {
    confirmPhases.add("branch");
  }
  const branchConfirmed = await confirmPhase("branch", ctx, confirmPhases);
  if (!branchConfirmed) {
    ctx.ui.notify("pstack pr: awaiting confirmation for branch creation. Run with --confirm=branch.", "info");
    saveRun(finishRun(addAction(run, "branch", "cancelled", "awaiting confirmation: branch creation"), "cancelled"), cwd);
    return;
  }

  const branchResult = runProcessSync(["git", "checkout", "-b", branch], { cwd });
  if (!branchResult.ok) {
    ctx.ui.notify("pstack pr: git checkout -b failed.", "error");
    saveRun(finishRun(addAction(run, "branch", "failed", "git checkout failed"), "failed"), cwd);
    return;
  }
  const run2 = addAction(run, "branch", "ok");
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "pr" }, payload: { phase: "branch", status: "ok" } }); } catch {}
  saveRun(run2, cwd);

  // --- Staging: NO "git add ." — explicit paths or --all with confirm ---
  if (parsed.paths && parsed.paths.length > 0) {
    ctx.ui.notify(`pstack pr: staging paths: ${parsed.paths.join(", ")} ...`, "info");
    const addResult = runProcessSync(["git", "add", ...parsed.paths], { cwd });
    if (!addResult.ok) {
      ctx.ui.notify("pstack pr: git add (explicit paths) failed.", "error");
      saveRun(finishRun(addAction(run2, "branch", "failed", "git add failed"), "failed"), cwd);
      return;
    }
  } else if (parsed.all) {
    const allConfirmed = await confirmPhase("push", ctx, confirmPhases);
    if (!allConfirmed) {
      ctx.ui.notify("pstack pr: --all requires confirmation. Run with --confirm=push.", "info");
      saveRun(finishRun(addAction(run2, "branch", "cancelled", "awaiting confirmation: git add --all"), "cancelled"), cwd);
      return;
    }
    ctx.ui.notify("pstack pr: staging all changes (--all confirmed) ...", "info");
    const addResult = runProcessSync(["git", "add", "."], { cwd });
    if (!addResult.ok) {
      ctx.ui.notify("pstack pr: git add . failed.", "error");
      saveRun(finishRun(addAction(run2, "branch", "failed", "git add . failed"), "failed"), cwd);
      return;
    }
  } else {
    ctx.ui.notify("pstack pr: no paths specified. Use --paths a b c or --all to stage changes.", "error");
    saveRun(finishRun(addAction(run2, "branch", "failed", "no paths specified — use --paths or --all"), "failed"), cwd);
    return;
  }

  // Confirm before commit
  const commitOverlayGit = await showConfirmOverlay(ctx, {
    title: "PR Commit Confirmation",
    lines: preflightToOverlayLines(run.preflight ?? { checks: [], overall: "pass" }, [
      parsed.title ? `Title: ${parsed.title}` : "",
      `Branch: ${branch}`,
      parsed.paths ? `Paths: ${parsed.paths.join(", ")}` : parsed.all ? "All changes" : "",
      "",
      "Commit changes?",
    ]),
    confirmLabel: "Commit",
    cancelLabel: "Cancel",
  });
  if (commitOverlayGit === false) {
    ctx.ui.notify("pstack pr: commit cancelled.", "info");
    saveRun(finishRun(addAction(run2, "commit", "cancelled", "user cancelled: commit"), "cancelled"), cwd);
    return;
  }
  if (commitOverlayGit === true) {
    confirmPhases.add("commit");
  }
  const commitConfirmedGit = await confirmPhase("commit", ctx, confirmPhases);
  if (!commitConfirmedGit) {
    ctx.ui.notify("pstack pr: awaiting confirmation for commit. Run with --confirm=commit.", "info");
    saveRun(finishRun(addAction(run2, "branch", "cancelled", "awaiting confirmation: commit"), "cancelled"), cwd);
    return;
  }
  const commitResult = runProcessSync(["git", "commit", "-m", parsed.title || "Work in progress"], { cwd });
  if (!commitResult.ok) {
    ctx.ui.notify("pstack pr: git commit failed (maybe nothing to commit).", "error");
    saveRun(finishRun(addAction(run2, "branch", "failed", "git commit failed"), "failed"), cwd);
    return;
  }
  const run3 = addAction(run2, "commit", "ok");
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "pr" }, payload: { phase: "commit", status: "ok" } }); } catch {}

  // Confirm before push
  const pushOverlayGit = await showConfirmOverlay(ctx, {
    title: "PR Push Confirmation",
    lines: preflightToOverlayLines(run.preflight ?? { checks: [], overall: "pass" }, [
      `Branch: ${branch}`,
      `Remote: origin`,
      "",
      "Push to remote?",
    ]),
    confirmLabel: "Push",
    cancelLabel: "Cancel",
  });
  if (pushOverlayGit === false) {
    ctx.ui.notify("pstack pr: push cancelled.", "info");
    recordPushCancelled(run3, cwd, "user cancelled: push");
    return;
  }
  if (pushOverlayGit === true) {
    confirmPhases.add("push");
  }
  const pushConfirmed = await confirmPhase("push", ctx, confirmPhases);
  if (!pushConfirmed) {
    ctx.ui.notify("pstack pr: awaiting confirmation for push. Run with --confirm=push.", "info");
    recordPushCancelled(run3, cwd, "awaiting confirmation: push");
    return;
  }

  const pushResult = runProcessSync(["git", "push", "-u", "origin", branch], { cwd });
  if (!pushResult.ok) {
    ctx.ui.notify("pstack pr: git push failed.", "error");
    saveRun(finishRun(addAction(run3, "push", "failed", "git push failed"), "failed"), cwd);
    return;
  }
  const run4 = addAction(run3, "push", "ok");
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "pr" }, payload: { phase: "push", status: "ok" } }); } catch {}

  await createPrFlow(parsed, cwd, ctx, run4, branch);
}

async function createPrFlow(
  parsed: PrParseResult,
  cwd: string,
  ctx: ExtensionCommandContext,
  run: any,
  branch?: string,
): Promise<void> {
  const title = parsed.title || "Work in progress";
  const cmdArgs: string[] = ["pr", "create", "--title", title];

  if (parsed.body) {
    cmdArgs.push("--body", parsed.body);
  }
  if (branch) {
    cmdArgs.push("--head", branch);
  }

  const cmd = ["gh", ...cmdArgs];
  const createResult = runProcessSync(cmd, { cwd });
  if (!createResult.ok) {
    ctx.ui.notify("pstack pr: gh pr create failed.", "error");
    saveRun(finishRun(addAction(run, "pr", "failed", "gh pr create failed"), "failed"), cwd);
    return;
  }
  const run2 = addAction(run, "pr", "ok");
  try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: "pr" }, payload: { phase: "pr", status: "ok" } }); } catch {}

  // Verify PR was created
  if (branch) {
    const prVerified = verifyPrCreated(branch, cwd);
    if (prVerified) {
      const prUrl = prVerified.url;
      ctx.ui.notify(`pstack pr: created ✓ ${prUrl ? "(" + prUrl + ")" : ""}`, "info");
      saveRun(finishRun(addAction(run2, "pr_verify", "ok", prUrl ?? ""), "success"), cwd);
    } else {
      ctx.ui.notify(`pstack pr: could not verify PR for branch '${branch}'. PR creation may have failed.`, "error");
      saveRun(finishRun(addAction(run2, "pr_verify", "failed", "PR verification failed"), "failed"), cwd);
    }
  } else {
    ctx.ui.notify("pstack pr: no branch info — skipping PR verification.", "warning");
    saveRun(finishRun(addAction(run2, "pr_verify", "ok", "no branch"), "failed"), cwd);
  }
}
