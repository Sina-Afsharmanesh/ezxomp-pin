import { execFile } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { runProcessSync } from "../runner.js";

/** Runner used by each command's tests: why mocks runner.runProcessSync; how/arena/blast mock child_process execFile. */
export type BacklogDocRunner = "exec" | "sync";

/**
 * Write content to a temp file and create a Backlog.md specification doc from it.
 * Shared by how/why/arena/blast commands; `source` labels tmp files and error messages.
 * `runner` preserves each command's original process API (execFile vs runProcessSync).
 */
export function createBacklogDoc(
  title: string,
  p: string,
  content: string,
  cwd: string,
  ctx: ExtensionCommandContext,
  source: string,
  runner: BacklogDocRunner = "sync",
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const tmpPath = join(cwd, ".pstack-" + source + "-" + Date.now() + ".md");
    writeFileSync(tmpPath, content);
    const done = (error: Error | null, stderr: string) => {
      try { unlinkSync(tmpPath); } catch {}
      if (error) {
        ctx.ui.notify("pstack " + source + ": " + (stderr || "backlog doc create failed").slice(0, 300), "error");
        resolve(false);
        return;
      }
      resolve(true);
    };
    if (runner === "exec") {
      execFile("backlog", ["doc", "create", title, "-p", p, "-t", "specification"], { cwd, maxBuffer: 1024 * 256, signal },
        (error, _stdout, stderr) => done(error, stderr || ""));
    } else {
      const r = runProcessSync(["backlog", "doc", "create", title, "-p", p, "-t", "specification"], { cwd });
      done(r.ok ? null : new Error("failed"), r.stderr || "");
    }
  });
}

/** Run a backlog CLI command, capturing stdout+stderr; notifies UI on output. */
export function execBacklogCapture(
  cmd: string,
  args: string[],
  cwd: string,
  ctx: ExtensionCommandContext,
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
      const out = stdout || "";
      const err = stderr || "";
      if (out.length > 0 && ctx.hasUI) {
        ctx.ui.notify(out.slice(0, 500), "info");
      }
      resolve({ ok: !error, stdout: out + err });
    });
  });
}

/** Resolve a backlog doc relPath from CLI output to an absolute path by walking up from cwd. */
function resolveDocPath(cwd: string, relPath: string): string {
  if (relPath.startsWith("/")) return relPath;
  let dir = cwd;
  const maxDepth = 20;
  let depth = 0;
  while (depth < maxDepth) {
    const candidate = `${dir}/${relPath}`;
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dir.split("/").slice(0, -1).join("/");
    if (!parent || parent === dir) break;
    dir = parent;
    depth++;
  }
  return join(cwd, relPath);
}


/**
 * After backlog doc create succeeds, parse the doc path from CLI output, resolve it to an
 * absolute path, and append `body` while preserving the file's existing frontmatter.
 * Shared by docs/pr-canvas (and other doc-writing commands). `source` labels the notify
 * prefix (e.g. "docs" / "pr-canvas"). Returns the parsed rel/full paths, or null on
 * failure after notifying.
 */
export function writeBacklogBody(
  createResult: { ok: boolean; stdout: string },
  body: string,
  cwd: string,
  source: string,
  ctx: ExtensionCommandContext,
): { relPath: string; fullPath: string } | null {
  if (!createResult.ok) {
    ctx.ui.notify(`pstack ${source}: backlog doc create failed`, "error");
    return null;
  }
  const pathMatch = createResult.stdout.match(/Path:\s*(.+)$/m);
  if (!pathMatch) {
    ctx.ui.notify(`pstack ${source}: could not parse doc path from output`, "error");
    return null;
  }
  const relPath = pathMatch[1]!.trim();
  const fullPath = resolveDocPath(cwd, relPath);

  // Preserve frontmatter, append body
  const existing = readFileSync(fullPath, "utf-8");
  const frontmatterEnd = existing.indexOf("---", 1) + 3; // closing ---
  const frontmatter = existing.slice(0, frontmatterEnd);
  writeFileSync(fullPath, `${frontmatter}
${body}
`);
  return { relPath, fullPath };
}
