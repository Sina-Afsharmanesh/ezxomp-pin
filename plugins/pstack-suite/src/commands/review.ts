import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync, isToolAvailable } from "../runner.js";
import { beginRun, addAction, finishRun, saveRun } from "../run.js";
import { startProgressOverlayForCtx } from "../overlay/progress-overlay.js";
import { createReviewOverlay, startFindingsOverlayForCtx, type FindingRow } from "../overlay/findings-overlay.js";
import { parseDocId, runDiffStat, createOpenDocAction } from "./review-common.js";

/**
 * Deep branch/PR review
 * Produces a review report doc via backlog CLI with Scope, Correctness, Security,
 * Quality findings, Blockers, and Next steps. Diff stat captured from VCS.
 * Runs under an optional live progress overlay (headless-safe).
 * @implements TASK-37.11 / TASK-11
 */
export async function handleReview(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const run = beginRun({ playbook: "review", phase: "review", target: args.trim() || "HEAD" });
  const abortController = new AbortController();
  const overlayCtrl = startProgressOverlayForCtx(ctx, "review", {
    runId: run.runId,
    onCancelRequest() {
      abortController.abort();
      // The local AbortController owns this command.
    },
  });

  try {
    if (!isToolAvailable("backlog")) {
      saveRun(finishRun(addAction(run, "review", "blocked", "backlog CLI unavailable"), "failed"), cwd);
      ctx.ui.notify("backlog CLI is required. Install: npm i -g backlog.md", "error");
      return;
    }

    const branch = args.trim() || "HEAD";
    const today = new Date().toISOString().slice(0, 10);
    const docTitle = `Review ${branch} ${today}`;

    // 1. Capture diff stat from Git
    const diffStat = runDiffStat(branch, cwd, { signal: abortController.signal, runId: run.runId, maxOutputBytes: 1 << 20 });

    // 2. Build review report content
    const content = buildReviewDoc(branch, diffStat, today);

    // 3. Create doc via backlog CLI
    const createResult = runProcessSync(["backlog", "doc", "create", docTitle, "-p", "reviews", "-t", "report", "--plain"], { cwd, maxOutputBytes: 1024 * 256, signal: abortController.signal, runId: run.runId });
    if (createResult.exitCode !== 0 || !createResult.ok) {
      saveRun(finishRun(addAction(run, "review", "failed", "backlog doc create failed"), "failed"), cwd);
      ctx.ui.notify(`Failed to create review doc: ${createResult.stderr || createResult.stdout}`, "error");
      return;
    }

    // Parse doc ID from --plain output
    const docId = parseDocId(createResult.stdout);
    if (!docId) {
      saveRun(finishRun(addAction(run, "review", "failed", "missing document ID"), "failed"), cwd);
      ctx.ui.notify("Could not determine document ID from backlog CLI output", "error");
      return;
    }

    // 4. Update doc with full content
    const updateResult = runProcessSync(["backlog", "doc", "update", docId, "--content", content], { cwd, maxOutputBytes: 1024 * 256, signal: abortController.signal, runId: run.runId });
    if (updateResult.exitCode !== 0 || !updateResult.ok) {
      saveRun(finishRun(addAction(run, "review", "failed", "backlog doc update failed"), "failed"), cwd);
      ctx.ui.notify(`Failed to update review doc content: ${updateResult.stderr || updateResult.stdout}`, "error");
      return;
    }

    saveRun(finishRun(addAction(run, "review", "ok", `doc ${docId}`), "success"), cwd);

    // TASK-12: real findings from observable diff evidence; severity unknown until an agent reviews (AC2/AC4).
    const diffRows: FindingRow[] = diffStat.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "(no changes)")
      .slice(0, 50)
      .map((l) => ({ label: l, status: "unknown" as const, detail: "pending review agent" }));
    const findings = [
      { label: `Review doc created: ${docId}`, status: "pass" as const, detail: "backlog document ready for agent review", nextAction: "open review doc" },
      ...diffRows,
    ];
    const openDoc = createOpenDocAction(docId, cwd, ctx.ui);

    if (ctx.hasUI) {
      const findingsCtrl = startFindingsOverlayForCtx(ctx, createReviewOverlay(
        findings.map((f) => ({
          label: f.label,
          severity: f.status === "pass" ? "pass" : "unknown",
          ...(f.detail !== undefined ? { evidence: f.detail } : {}),
          ...(f.nextAction !== undefined ? { nextAction: f.nextAction } : {}),
        })),
        { title: `Review ${branch}`, onAction: openDoc },
      ));
      if (findingsCtrl) {
        await findingsCtrl.done;
        return;
      }
    }
    // Headless parity (AC6): same normalized findings without the overlay.
    const lines = [
      `Review report created: ${docTitle}`,
      `Doc ID: ${docId}`,
      ...findings.map((f) => `  [${f.status}] ${f.label}${f.detail ? ": " + f.detail : ""}`),
    ];
    ctx.ui.notify(lines.join("\n"), "info");
  } finally {
    overlayCtrl?.close();
  }
}

function buildReviewDoc(branch: string, diffStat: string, date: string): string {
  return `# Review: ${branch}

Date: ${date}
Branch: ${branch}

## Scope

\`\`\`
${diffStat}
\`\`\`

## Correctness Findings

> **Manual step** — Run a correctness review agent against this branch.
>
> Suggested prompt (agents/review-correctness.md):
> Review the diff for logical errors, incorrect assumptions, off-by-one errors,
> missing null/undefined guards, and contract violations. Report findings with
> file:line citations.

-

## Security Findings

> **Manual step** — Run a security review agent against this branch.
>
> Suggested prompt (agents/review-security.md):
> Review the diff for injection, credential leaks, insecure defaults, privilege
> escalation, information disclosure, and dependency vulnerabilities.

-

## Quality Findings

> **Manual step** — Run a quality review agent against this branch.
>
> Suggested prompt (agents/review-quality.md):
> Review the diff for code smells, duplication, over-engineering, naming issues,
> and test coverage gaps. Report findings with severity and suggested fixes.

-

## Blockers

-

## Next Steps

-
`;
}
