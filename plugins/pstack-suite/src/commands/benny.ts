import { spawnSync } from "node:child_process";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { hasGh, hasBacklogMd, isToolAvailable } from "../utils.js";

/** Issue triage automation
 * Detects remote, checks for duplicate backlog tasks, creates backlog task,
 * optionally creates remote issue on GitHub/GitLab.
 *
 * Usage: pstack benny <title> [--yes]
 *   <title>  - Issue title (required)
 *   --yes    - Auto-confirm remote issue creation
 *
 * @implements TASK-37.13
 */
export async function handleBenny(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parts = parseArgs(args);
  const title = parts.title;
  const autoConfirm = parts.flags.includes("--yes");

  if (!title) {
    ctx.ui.notify("pstack benny: usage: pstack benny <title> [--yes]", "error");
    return;
  }

  if (!hasBacklogMd()) {
    ctx.ui.notify("pstack benny: backlog CLI not found. Install: npm i -g backlog.md", "error");
    return;
  }

  const cwd = ctx.cwd;
  const existingTask = findExistingTask(title, cwd);
  if (existingTask) {
    ctx.ui.notify(
      "pstack benny: duplicate found - linking to existing task: " + existingTask,
      "info",
    );
    return;
  }

  const description = parts.description ?? "";
  const labels: string[] = [];
  if (!description || description.trim().length < 50) {
    labels.push("needs-investigation");
  }

  const taskResult = createBacklogTask(title, description, labels, cwd);
  if (!taskResult.ok) {
    ctx.ui.notify("pstack benny: failed to create backlog task: " + taskResult.error, "error");
    return;
  }
  ctx.ui.notify("pstack benny: created backlog task: " + title + " (" + taskResult.id + ")", "info");

  const remote = detectRemote(cwd);

  if (!remote) {
    ctx.ui.notify("pstack benny: no remote found - skipping remote issue creation", "info");
    return;
  }

  if (remote.type === "github") {
    if (!hasGh()) {
      ctx.ui.notify("pstack benny: gh CLI not found - cannot create GitHub issue", "error");
      return;
    }
    if (autoConfirm) {
      const ghResult = createGithubIssue(title, description || title, cwd);
      if (ghResult.ok) {
        ctx.ui.notify("pstack benny: created GitHub issue: " + ghResult.url, "info");
      } else {
        ctx.ui.notify("pstack benny: failed to create GitHub issue: " + ghResult.error, "error");
      }
    } else {
      ctx.ui.notify(
        "pstack benny: GitHub remote detected (" + remote.owner + "/" + remote.repo + ")." +
        "\nRun with --yes to create issue automatically, or manually:" +
        "\n  gh issue create --title \"" + escapeShell(title) +
        "\" --body \"" + escapeShell(description || title) + "\"",
        "info",
      );
    }
  } else if (remote.type === "gitlab") {
    if (autoConfirm) {
      if (!isToolAvailable("glab")) {
        ctx.ui.notify("pstack benny: glab CLI not found - cannot create GitLab issue", "error");
        return;
      }
      const glResult = createGitlabIssue(title, description || title, cwd);
      if (glResult.ok) {
        ctx.ui.notify("pstack benny: created GitLab issue: " + glResult.url, "info");
      } else {
        ctx.ui.notify("pstack benny: failed to create GitLab issue: " + glResult.error, "error");
      }
    } else {
      ctx.ui.notify(
        "pstack benny: GitLab remote detected." +
        "\nRun with --yes to auto-create, or manually:" +
        "\n  glab issue create --title \"" + escapeShell(title) +
        "\" --description \"" + escapeShell(description || title) + "\"",
        "info",
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

interface ParsedArgs {
  title: string | undefined;
  description: string | undefined;
  flags: string[];
}

function parseArgs(args: string): ParsedArgs {
  const trimmed = args.trim();
  if (!trimmed) return { title: undefined, description: undefined, flags: [] };

  const tokens = trimmed.match(/([^\s"]+|"[^"]*")+/g) ?? [];
  const flags: string[] = [];
  const positional: string[] = [];

  for (const t of tokens) {
    if (t.startsWith("--")) {
      flags.push(t);
    } else {
      positional.push(t.replace(/^"|"$/g, ""));
    }
  }

  const title = positional[0];
  const description = positional.length > 1 ? positional.slice(1).join(" ") : undefined;
  return { title, description, flags };
}

interface RemoteInfo {
  type: "github" | "gitlab";
  owner: string;
  repo: string;
}

function detectRemote(cwd: string): RemoteInfo | null {
  const result = spawnSync("git", ["remote", "-v"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const ghMatch = trimmed.match(/github\.com[:/]([^/]+)\/([^/\s]+(?:\.git)?)/);
    if (ghMatch) {
      return {
        type: "github",
        owner: ghMatch[1]!,
        repo: ghMatch[2]!.replace(/\.git$/, ""),
      };
    }

    const glMatch = trimmed.match(/gitlab\.com[:/]([^/]+)\/([^/\s]+(?:\.git)?)/);
    if (glMatch) {
      return {
        type: "gitlab",
        owner: glMatch[1]!,
        repo: glMatch[2]!.replace(/\.git$/, ""),
      };
    }
  }

  return null;
}

/** Search for existing backlog tasks with matching title */
function findExistingTask(title: string, cwd: string): string | null {
  const query = title.split(" ").slice(0, 5).join(" ");
  const result = spawnSync("backlog", ["task", "search", query], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  const output = result.stdout.trim();
  if (!output) return null;

  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const taskTitle = extractTitleFromLine(trimmed);
    if (taskTitle && taskTitle.toLowerCase() === title.toLowerCase()) {
      const idMatch = trimmed.match(/(TASK-\S+)/);
      return idMatch ? (idMatch[1] ?? trimmed) : trimmed;
    }
  }

  return null;
}

function extractTitleFromLine(line: string): string | null {
  const match = line.match(/\]\s+(?:[^|]+\|\s*)?(.+)$/);
  return match ? (match[1] ?? "") : null;
}

interface TaskResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function createBacklogTask(
  title: string,
  description: string,
  labels: string[],
  cwd: string,
): TaskResult {
  const argv = ["task", "create", title];

  if (description) {
    argv.push("-d", description);
  }

  if (labels.length > 0) {
    argv.push("-l", labels.join(","));
  }

  argv.push("--type", "bug");

  const result = spawnSync("backlog", argv, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });

  if (result.status !== 0) {
    const errMsg = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
    return { ok: false, error: errMsg };
  }

  const output = result.stdout.trim();
  const idMatch = output.match(/(TASK-\S+)/);
  return { ok: true, id: idMatch?.[1] ?? output };
}

interface IssueResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function createGithubIssue(
  title: string,
  body: string,
  cwd: string,
): IssueResult {
  const result = spawnSync("gh", [
    "issue", "create",
    "--title", title,
    "--body", body,
  ], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });

  if (result.status !== 0) {
    const errMsg = result.stderr?.trim() || result.stdout?.trim() || "gh issue create failed";
    return { ok: false, error: errMsg };
  }

  const output = result.stdout.trim();
  const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
  return { ok: true, url: urlMatch?.[0] ?? output };
}

function createGitlabIssue(
  title: string,
  description: string,
  cwd: string,
): IssueResult {
  const result = spawnSync("glab", [
    "issue", "create",
    "--title", title,
    "--description", description,
  ], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });

  if (result.status !== 0) {
    const errMsg = result.stderr?.trim() || result.stdout?.trim() || "glab issue create failed";
    return { ok: false, error: errMsg };
  }

  const output = result.stdout.trim();
  const urlMatch = output.match(/https:\/\/gitlab\.com\/[^\s]+/);
  return { ok: true, url: urlMatch?.[0] ?? output };
}

/** Escape for shell display in notify messages (not for execution) */
function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''");
}
