import { runProcessSync } from "../runner.js";

/** Options for the shared VCS diff-stat capture. */
export interface DiffStatOptions {
  /** Abort signal forwarded to runProcessSync (review uses it for cancellation). */
  signal?: AbortSignal;
  /** Correlates runner events with the owning pstack run. */
  runId?: string;
  /** Override max captured output bytes. Defaults to the runner default (32 KiB). */
  maxOutputBytes?: number;
}

/**
 * Capture the diff stat for a branch from Git.
 * Shared by the review and quality commands; reports "(no changes)" for empty diffs.
 */
export function runDiffStat(
  branch: string,
  cwd: string,
  options: DiffStatOptions = {},
): string {
  const { signal, runId, maxOutputBytes } = options;
  const runOpts = {
    cwd,
    ...(maxOutputBytes !== undefined ? { maxOutputBytes } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(runId !== undefined ? { runId } : {}),
  };
  let result: string = "";

  const r = runProcessSync(["git", "diff", "--stat", "HEAD..." + branch], runOpts);
  if (r.ok) {
    result = r.stdout || "(no changes)";
  } else {
    const r2 = runProcessSync(["git", "diff", "--stat", branch + "..HEAD"], runOpts);
    result = r2.ok ? (r2.stdout || "(no changes)") : `(git diff failed: ${r2.stderr || "unknown error"})`;
  }

  return result;
}

/** Minimal notification surface used by the shared doc-view action. */
export interface DocViewNotifier {
  notify(message: string, kind?: "info" | "error"): void;
}

/**
 * Create the shared "open backlog doc" action used by both the review and
 * quality commands' findings overlays. Views the doc via the backlog CLI and
 * surfaces the result through the UI notifier.
 */
export function createOpenDocAction(
  docId: string,
  cwd: string,
  ui: DocViewNotifier,
): () => Promise<void> {
  return async (): Promise<void> => {
    const r = runProcessSync(["backlog", "doc", "view", docId], { cwd });
    if (r.exitCode !== 0) ui.notify(`Could not open ${docId}: ${r.stderr || "unknown"}`, "error");
    else ui.notify(r.stdout.slice(0, 2000), "info");
  };
}

/**
 * Parse the doc id from backlog CLI --plain output.
 * Returns the last "doc-*" line, falling back to the final non-empty line.
 */
export function parseDocId(output: string): string {
  if (!output) return "";
  const lines = output.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    if (trimmed && trimmed.startsWith("doc-")) return trimmed;
  }
  return lines[lines.length - 1]?.trim() || "";
}
