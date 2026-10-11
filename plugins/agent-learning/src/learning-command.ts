/**
 * /learning — unified surface over the three learning lanes.
 *
 *   /learning            (or status) → lane overview
 *   /learning experience → pointer to the companion /experience command
 *   /learning skillforge <args> → routes into the procedures UI (same handler as /skillforge)
 *   /learning sleep      → describe-only nightly SkillOpt-sleep cycle surface
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { existsSync } from "node:fs";
import { readdirSync as readdirSyncFs } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatSkillforgeHelp,
  listMemoryReports,
} from "./procedures/memory/commands.js";
import { openSkillforge } from "./procedures/extension.js";
import { getGlobalSkillforgeRoot } from "./procedures/store/storage.js";
import { catalogRoot } from "./read-skills.ts";
import { isReviewGateEnabled } from "./review-gate.ts";

function countEntries(root: string): number {
  try {
    if (!existsSync(root)) return 0;
    return readdirSyncFs(root, { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Counts pending proposals recursively under <root>/promotions.
 */
function countPendingProposals(root: string): number {
  try {
    const promotionsDir = join(root, "promotions");
    if (!existsSync(promotionsDir)) return 0;
    let count = 0;
    function walk(dir: string): void {
      const entries = readdirSyncFs(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && isPendingProposal(full)) {
          count++;
        }
      }
    }
    walk(promotionsDir);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Pure, testable render of the describe-only sleep surface.
 * Reads the promotions directory via getGlobalSkillforgeRoot() for the staged-proposal count.
 */
function isPendingProposal(file: string): boolean {
  if (!file.endsWith(".json")) return false;
  try {
    const content = readFileSync(file, "utf-8");
    const proposal = JSON.parse(content) as { status?: string };
    return proposal?.status === "pending";
  } catch {
    return false; // non-fatal: skip malformed files
  }
}

export function formatSleepSurface(cwd: string): string {
  // Use the cwd parameter to compute the global store root directly.
  const globalRoot = join(cwd, ".omp/agent/agent-learning");
  const pending = countPendingProposals(globalRoot);
  const lines = [
    "agent-learning sleep — nightly SkillOpt-sleep cycle (describe-only; nothing is executed here)",
    "",
    "Cycle:",
    "  harvest  → read local Pi transcripts at ~/.pi/agent/sessions",
    "  mine     → recurring tasks → outcome-labeled candidate memories",
    "  replay   → validate on your own sessions/budget",
    "  consolidate → reflect → bounded edit → held-out validation gate",
    "  stage    → proposal written under <getGlobalSkillforgeRoot()>/promotions",
    "  adopt    → explicit human review → apply with backup + evidence log",
    "",
    `Staged proposals: ${pending} pending`,
    "",
    "Data boundary: any LLM-calling piece (replay, LLM mining, reflection) must stay behind explicit user invocation. Heuristic pieces (gate math, edit application, mining) are pure code and safe.",
    "",
    "External CLI warning: real-backend runs read your local Pi transcripts (~/.pi/agent/sessions) and send mined content to the configured LLM backend; run only with explicit user intent.",
    "",
    "External skillopt-sleep CLI (github.com/microsoft/SkillOpt, skillopt_sleep/ package):",
    "  skillopt_sleep --dry-run   # describe cycle, no writes",
    "  skillopt_sleep             # executes the cycle (user must run explicitly; this plugin never executes it)",
  ];
  void cwd;
  return lines.join("\n");
}

export function formatLearningStatus(cwd: string): string {
  const catalog = countEntries(catalogRoot());
  const gate = isReviewGateEnabled();
  const lines = [
    "agent-learning lanes:",
    `- surface    catalog entries: ${catalog} (native discovery lists them; skill://<name> loads)`,
    "- facts      native memory backend (learn/retain/recall) — no plugin store",
    `- procedures store: ${getGlobalSkillforgeRoot()} (${countEntries(getGlobalSkillforgeRoot())} top-level entries)`,
    "- habits     companion @ezxomp/experiences package (/experience)",
    `- review gate: ${gate ? "ON (captures route to reviewed lanes)" : 'off (enable: env LEARNING_REVIEW=1 or <agentDir>/agent-learning.json {"review": true})'}`,
  ];
  void cwd;
  return lines.join("\n");
}

export function registerLearningCommand(pi: ExtensionAPI): void {
  pi.registerCommand("learning", {
    description:
      "Unified agent-learning surface: lanes status, experience, skillforge, sleep",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const [head, ...rest] = trimmed.split(/\s+/);
      switch (head) {
        case "":
        case "status":
          ctx.ui.notify(formatLearningStatus(ctx.cwd), "info");
          return;
        case "experience":
          ctx.ui.notify(
            "The habits lane is provided by the @ezxomp/experiences companion plugin — run /experience" +
              (rest.length ? ` ${rest.join(" ")}` : "") +
              " (setup: /experience setup).",
            "info",
          );
          return;
        case "skillforge":
        case "procedures":
          await openSkillforge(rest.join(" "), ctx);
          return;
        case "help":
          ctx.ui.notify(
            [
              `/learning [status]`,
              "/learning experience",
              "/learning skillforge <args>",
              "/learning sleep",
              formatSkillforgeHelp(),
            ].join("\n"),
            "info",
          );
          return;
        case "sleep":
          ctx.ui.notify(formatSleepSurface(ctx.cwd), "info");
          return;
        default:
          ctx.ui.notify(
            `Unknown /learning subcommand "${head}". Use status | experience | skillforge | help | sleep.`,
            "warning",
          );
      }
    },
  });
}
