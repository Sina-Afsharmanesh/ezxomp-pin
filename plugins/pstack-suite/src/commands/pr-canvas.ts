import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { createBacklogDoc, execBacklogCapture, writeBacklogBody } from "./backlog-doc.js";
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { hasGh } from "../utils.js";
import { createReviewOverlay, startFindingsOverlayForCtx } from "../overlay/findings-overlay.js";

interface PRFile {
  path: string;
  additions: number;
  deletions: number;
}

interface PRData {
  number: string;
  title: string;
  body: string;
  files: PRFile[];
}

/** Render PR diff as structured backlog report.
 * PR from args (number) or current branch via gh; falls back to git diff --stat.
 * Creates a backlog doc under reviews/ with type "other" (report-like).
 * @implements TASK-37.12
 */
export async function handlePrCanvas(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const prNum = args.trim();

  // 1. Gather PR data
  let prData: PRData;
  if (hasGh()) {
    if (prNum) {
      ctx.ui.notify(`pstack pr-canvas: fetching PR #${prNum} ...`, "info");
      prData = await ghPrView(cwd, prNum, ctx);
    } else {
      ctx.ui.notify(`pstack pr-canvas: resolving PR for current branch ...`, "info");
      const branch = await gitCurrentBranch(cwd);
      prData = await ghPrViewByBranchOrFallback(cwd, branch, ctx);
    }
  } else {
    ctx.ui.notify(`pstack pr-canvas: gh not found, falling back to git diff --stat`, "info");
    prData = await gitDiffAsPrData(cwd);
  }

  // 2. Build content
  const totals = prData.files.reduce(
    (a, f) => ({ add: a.add + f.additions, del: a.del + f.deletions }),
    { add: 0, del: 0 },
  );
  const tableRows = prData.files.map((f) => `| ${f.path} | +${f.additions} | -${f.deletions} |`);

  const body = `## Summary

- **PR:** #${prData.number}
- **Title:** ${prData.title}
${prData.body ? `- **Body:** ${prData.body.split("\n")[0]}` : ""}
- **Files changed:** ${prData.files.length}
- **Total:** +${totals.add} / -${totals.del}

## Files Changed

| File | Additions | Deletions |
|------|-----------|-----------|
${tableRows.join("\n")}

## Review Notes

- Review for security issues, error handling, test coverage
- Check for unused imports, type correctness, formatting
`;

  // 3. Create doc via backlog CLI, then write body
  const slug = prData.title.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const title = `PR-${prData.number}-${slug}`;

  const createResult = await execBacklogCapture(
    "backlog",
    ["doc", "create", title, "-p", "reviews", "-t", "other"],
    cwd,
    ctx,
  );
  const docPaths = writeBacklogBody(createResult, body, cwd, "pr-canvas", ctx);
  if (!docPaths) {
    return;
  }
  const relPath = docPaths.relPath;
  const fullPath = docPaths.fullPath;

  // TASK-12: findings from real PR data — per-file rows with add/del evidence; review verdicts stay unknown (AC2/AC4).
  const findings = [
    { label: `PR #${prData.number}: ${prData.title}`, severity: "pass", evidence: `report saved to ${relPath}`, nextAction: "open report" },
    ...prData.files.slice(0, 50).map((f) => ({
      label: f.path,
      severity: "unknown",
      evidence: `+${f.additions} / -${f.deletions}`,
    })),
  ];
  const openReport = async (): Promise<void> => {
    try {
      const content = readFileSync(fullPath, "utf-8");
      ctx.ui.notify(content.slice(0, 2000), "info");
    } catch (e) {
      ctx.ui.notify(`pstack pr-canvas: could not open report: ${e instanceof Error ? e.message : "unknown"}`, "error");
    }
  };

  if (ctx.hasUI) {
    const findingsCtrl = startFindingsOverlayForCtx(ctx, createReviewOverlay(findings, {
      title: `PR Canvas #${prData.number}`,
      onAction: openReport,
    }));
    if (findingsCtrl) {
      await findingsCtrl.done;
      return;
    }
  }
  // Headless parity (AC6)
  ctx.ui.notify(
    [`pstack pr-canvas: report created under reviews/ ✓ (${relPath})`,
     ...findings.map((f) => `  [${f.severity}] ${f.label}`)].join("\n"),
    "info",
  );
}

/* ── helpers ── */

function ghPrView(cwd: string, prNum: string, ctx: ExtensionCommandContext): Promise<PRData> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "view", prNum, "--json", "number,title,body,files", "--jq", "."],
      { cwd, maxBuffer: 1024 * 512 },
      (error, stdout, stderr) => {
        if (error) {
          ctx.ui.notify(`pstack pr-canvas: gh pr view failed — ${stderr || error.message}`, "error");
          reject(error);
          return;
        }
        try {
          const raw: { number: number; title: string; body: string; files: Array<{ path: string; additions: number; deletions: number }> } = JSON.parse(stdout);
          resolve({
            number: String(raw.number),
            title: raw.title || "Untitled",
            body: raw.body || "",
            files: (raw.files || []).map((f) => ({
              path: f.path,
              additions: f.additions || 0,
              deletions: f.deletions || 0,
            })),
          });
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

function ghPrViewByBranchOrFallback(cwd: string, branch: string, ctx: ExtensionCommandContext): Promise<PRData> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "view", "--search", `base:main head:${branch}`, "--json", "number,title,body,files", "--jq", "."],
      { cwd, maxBuffer: 1024 * 512 },
      (error, stdout, stderr) => {
        if (error) {
          ctx.ui.notify(`pstack pr-canvas: no PR for branch ${branch}, falling back to git diff`, "info");
          gitDiffAsPrData(cwd).then((d) => {
            d.title = `branch: ${branch}`;
            resolve(d);
          }).catch(reject);
          return;
        }
        try {
          const raw: { number: number; title: string; body: string; files: Array<{ path: string; additions: number; deletions: number }> } = JSON.parse(stdout);
          resolve({
            number: String(raw.number),
            title: raw.title || "Untitled",
            body: raw.body || "",
            files: (raw.files || []).map((f) => ({ path: f.path, additions: f.additions || 0, deletions: f.deletions || 0 })),
          });
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

function gitCurrentBranch(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }, (_err, stdout) => {
      resolve((stdout || "HEAD").trim());
    });
  });
}

function gitDiffAsPrData(cwd: string): Promise<PRData> {
  return new Promise((resolve) => {
    // --numstat format: additions\tdeletions\tpath
    execFile("git", ["diff", "--numstat", "HEAD~1"], { cwd, maxBuffer: 1024 * 512 }, (_err, stdout) => {
      const files: PRFile[] = (stdout || "")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [addStr = "0", delStr = "0", ...rest] = line.split("\t");
          const path = rest.join("\t");
          return {
            path,
            additions: addStr === "-" ? 0 : parseInt(addStr, 10) || 0,
            deletions: delStr === "-" ? 0 : parseInt(delStr, 10) || 0,
          };
        });
      resolve({ number: "N/A", title: "git diff HEAD~1", body: "", files });
    });
  });
}
