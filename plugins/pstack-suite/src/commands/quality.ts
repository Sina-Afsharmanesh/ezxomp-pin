import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync } from "../runner.js";
import { createReviewOverlay, startFindingsOverlayForCtx } from "../overlay/findings-overlay.js";
import { hasBacklogMd } from "../utils.js";
import { parseDocId, runDiffStat, createOpenDocAction } from "./review-common.js";

/** Code quality audit
 * Produces a quality-only audit doc via backlog CLI with Scope, Quality findings,
 * Blockers, and Next steps (no security section). Diff stat captured from VCS.
 * @implements TASK-37.11
 */
export async function handleQuality(args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!hasBacklogMd()) {
    ctx.ui.notify("backlog CLI is required. Install: npm i -g backlog.md", "error");
    return;
  }

  const branch = args.trim() || "HEAD";
  const cwd = ctx.cwd;
  const today = new Date().toISOString().slice(0, 10);
  const docTitle = `Quality ${branch} ${today}`;

  // 1. Capture diff stat from Git
  const diffStat = runDiffStat(branch, cwd);

  // 2. Build quality-only audit content
  const content = buildQualityDoc(branch, diffStat, today);

  // 3. Create doc via backlog CLI
  const createResult = runProcessSync([
    "backlog", "doc", "create", docTitle,
    "-p", "reviews",
    "-t", "report",
    "--plain",
  ], { cwd });

  if (createResult.exitCode !== 0) {
    ctx.ui.notify(
      `Failed to create quality doc: ${createResult.stderr || createResult.stdout}`,
      "error",
    );
    return;
  }

  // Parse doc ID from --plain output
  const docId = parseDocId(createResult.stdout);
  if (!docId) {
    ctx.ui.notify("Could not determine document ID from backlog CLI output", "error");
    return;
  }

  // 4. Update doc with full content
  const updateResult = runProcessSync([
    "backlog", "doc", "update", docId,
    "--content", content,
  ], { cwd });

  if (updateResult.exitCode !== 0) {
    ctx.ui.notify(
      `Failed to update quality doc content: ${updateResult.stderr || updateResult.stdout}`,
      "error",
    );
    return;
  }

  // TASK-12: real observable evidence only — diff stat rows are "unknown" until a review agent runs (AC2/AC4).
  const evidenceRows = diffStat.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== "(no changes)")
    .slice(0, 50);
  const findings = [
    { label: `Quality doc created: ${docId}`, severity: "pass", evidence: "backlog document ready for quality review", nextAction: "open quality doc" },
    ...evidenceRows.map((l) => ({ label: l, severity: "unknown", evidence: "pending quality review agent" })),
  ];
  const openDoc = createOpenDocAction(docId, cwd, ctx.ui);

  if (ctx.hasUI) {
    const findingsCtrl = startFindingsOverlayForCtx(ctx, createReviewOverlay(findings, {
      title: `Quality ${branch}`,
      onAction: openDoc,
    }));
    if (findingsCtrl) {
      await findingsCtrl.done;
      return;
    }
  }
  // Headless parity (AC6): same normalized findings without the overlay.
  const lines = [
    `Quality audit created: ${docTitle}`,
    `Doc ID: ${docId}`,
    ...findings.map((f) => `  [${f.severity}] ${f.label}`),
  ];
  ctx.ui.notify(lines.join("\n"), "info");
}

function buildQualityDoc(branch: string, diffStat: string, date: string): string {
  return `# Quality Audit: ${branch}

Date: ${date}
Branch: ${branch}

## Scope

\`\`\`
${diffStat}
\`\`\`

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
