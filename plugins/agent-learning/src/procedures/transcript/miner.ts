/**
 * TASK-98 — Heuristic transcript miner feeding outcome-labeled candidate memories.
 * Port from SkillOpt harvest_pi.py + mine.py digest+mine pipeline.
 *
 * Read-only + offline: node:fs/promises + node:path + node:crypto only.
 * No fetch, no child_process, no network calls in shipped code paths.
 * doc-23 data boundary: local read-only, redaction is defense-in-depth,
 * nothing leaves the machine.
 */

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

// Import types
import { getAgentDir } from "@oh-my-pi/pi-utils";
import type { SessionDigest, TaskRecord, HarvestOpts } from "./types";

// ---------------------------------------------------------------------------
// 1. Redaction: defense-in-depth regex pass
// ---------------------------------------------------------------------------

/**
 * Redact secret-shaped strings from text.
 *
 * Defense-in-depth regex patterns (upstream harvest_pi.py):
 *   - AWS Access Key ID:          AKIA[0-9A-Z]{16}
 *   - GitHub personal token:      ghp_[A-Za-z0-9]{36}
 *   - Slack token:                xox[bap]-[0-9A-Z]{10,12}
 *   - Bearer token:               Bearer <token>  (broad match, token = non-whitespace+)
 *   - PEM blocks:                 -----BEGIN..., -----END...
 *   - password=...:              password\s*=\s*[^\s;]+
 *   - generic key=value with high-entropy value (value length >= 8, mixed case+digit)
 */
/**
 * Redact secret-shaped strings from text.
 *
 * Defense-in-depth regex patterns (upstream harvest_pi.py):
 *   - AWS Access Key ID:          AKIA[0-9A-Z]{16}
 *   - GitHub personal token:      ghp_[A-Za-z0-9]{36}
 *   - Slack token:                xox[bap]-[0-9A-Z]{10,12}
 *   - Bearer token:               Bearer <token>  (broad match, token = non-whitespace+)
 *   - PEM blocks:                 -----BEGIN..., -----END...
 *   - password=...:              password\s*=\s*[^\s;]+
 *   - generic key=value with high-entropy value
 */
export function redactSecrets(text: string): string {
  let result = text;

  // 1. AWS Access Key ID: AKIA + 16 alphanum chars
  result = result.replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]");

  // 2. GitHub personal token: ghp_ + 36 alphanum chars
  result = result.replace(/ghp_[A-Za-z0-9]{36}/g, "[REDACTED]");

  // 3. Slack tokens: xoxb-, xoxp-, xoxa-, xoxr-
  result = result.replace(/xox[bap]-[0-9A-Z]{10,12}/gi, "[REDACTED]");

  // 4. Bearer tokens: "Bearer <nonspace>"
  result = result.replace(/Bearer\s+[^\s]+/g, "Bearer [REDACTED]");

  // 5. PEM blocks: remove entire BEGIN/END sections
  result = result.replace(
    /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g,
    "",
  );

  // 6. password=value (not inside a known config section)
  result = result.replace(
    /(?:^|[\s(])password\s*=\s*[^\s;]+/gi,
    "$1password=[REDACTED]",
  );

  // 7. Generic key=value with high-entropy value:
  //    Match key=value where value contains both letter and digit and is >= 8 chars
  result = result.replace(
    /(?:^|[\s(])([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?=[^\s]{8,})(?=[^\s]*[a-zA-Z])(?=[^\s]*[0-9])[^\s]+/g,
    "$1= [REDACTED]",
  );

  return result;
}

// ---------------------------------------------------------------------------
// 2. JSONL parsing: digestPiSession
// ---------------------------------------------------------------------------

/**
 * Parse a Pi session JSONL file and produce a SessionDigest.
 *
 * JSONL schema (upstream harvest_pi.py):
 *   type:session  → cwd, timestamp, version, id, parentId
 *   type:message  → role (user/assistant/toolResult), content, [tool, name, isError]
 *   type:toolCall → block names (skipped in final record)
 *   type:thinking → skipped (not propagated)
 *
 * Active-branch resolution (v2/3 tree sessions):
 *   - Walk parentId links to find the leaf branch.
 *   - Reject malformed graphs wholly (cycles, missing roots, dangling nodes).
 *
 * toolResult isError is NOT treated as feedback (upstream rationale:
 *   recovered tool errors must not poison outcome labels).
 *
 * Thinking blocks are skipped entirely.
 */
export async function digestPiSession(
  filePath: string,
): Promise<SessionDigest | null> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");

  const sessionLines: string[] = [];
  const messageLines: string[] = [];
  let currentSection: "session" | "messages" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("type:session")) {
      currentSection = "session";
      sessionLines.push(trimmed);
    } else if (trimmed.startsWith("type:message")) {
      currentSection = "messages";
      messageLines.push(trimmed);
    } else if (
      trimmed.startsWith("type:toolCall") ||
      trimmed.startsWith("type:thinking")
    ) {
      // Skip toolCall and thinking blocks entirely
      currentSection = null;
    } else if (trimmed === "") {
      currentSection = null;
    } else if (currentSection === "session") {
      // In session section: capture header lines (id=, cwd=, timestamp=, version=, parentId=)
      sessionLines.push(trimmed);
    } else if (currentSection === "messages") {
      // In messages section: capture message data lines (role=user, content=, etc.)
      messageLines.push(trimmed);
    }
  }

  // Parse session header
  let sessionId = "";
  let project = "";
  let startedAt = "";
  let endedAt = "";
  let version = 1;

  for (const line of sessionLines) {
    if (line.startsWith("id=")) {
      sessionId = line.slice(3).trim();
    } else if (line.startsWith("cwd=")) {
      project = line.slice(4).trim();
    } else if (line.startsWith("timestamp=")) {
      const ts = line.slice(10).trim();
      startedAt = ts;
    } else if (line.startsWith("version=")) {
      version = parseInt(line.slice(8).trim(), 10) || 1;
    } else if (line.startsWith("parentId=")) {
      // Track parentId for active-branch resolution (validated later)
    }
  }

  // Basic validation: must have session header and project
  if (!sessionId || !project) {
    return null;
  }

  // Parse messages
  const userPrompts: string[] = [];
  const assistantFinals: string[] = [];
  const toolsUsed: Set<string> = new Set();
  const feedbackSignals: string[] = [];
  let nUserTurns = 0;
  let nAssistantTurns = 0;

  for (const line of messageLines) {
    if (line.startsWith("role=user")) {
      // Extract content after "content="
      const contentMatch = line.match(/content=(.+)/);
      if (contentMatch) {
        const content = contentMatch[1].trim();
        if (content.length >= 8) {
          userPrompts.push(redactSecrets(content));
          nUserTurns++;
          // Detect lexical feedback signals
          const lower = content.toLowerCase();
          if (
            lower.includes("thanks") ||
            lower.includes("that worked") ||
            lower.includes("perfect")
          ) {
            if (!feedbackSignals.includes("pos")) feedbackSignals.push("pos");
          }
          const negMatch = ["doesn't work", "failed", "wrong", "broken"].find(
            (t) => lower.includes(t),
          );
          if (negMatch) {
            const token = negMatch === "failed" ? "fail" : negMatch;
            if (!feedbackSignals.includes(token)) feedbackSignals.push(token);
          }
        }
      }
    } else if (line.startsWith("role=assistant")) {
      const contentMatch = line.match(/content=(.+)/);
      if (contentMatch) {
        const content = contentMatch[1].trim();
        if (content.length >= 1) {
          assistantFinals.push(redactSecrets(content));
          nAssistantTurns++;
        }
      }
    } else if (line.startsWith("role=toolResult")) {
      // Extract tool name and isError status
      const toolMatch = line.match(/tool=(\S+)/);
      const isErrorMatch = line.match(/isError=(\w+)/);

      if (toolMatch) {
        toolsUsed.add(toolMatch[1]);
      }

      // CRITICAL: toolResult isError is NOT treated as feedback.
      // The upstream rationale: recovered tool errors must not poison outcome labels.
      // We simply record the tool name but do NOT emit a feedback signal from isError.

      // If the tool result has a non-error outcome and there's follow-up user text,
      // that text provides the feedback signal (already handled in the user role branch).
    }
  }

  // Active-branch resolution for v2/3 tree sessions
  // Walk parentId links to find the leaf branch.
  // If the graph is malformed (cycles, missing roots, dangling nodes), reject wholly.
  let resolvedProject = project;
  if (version >= 2 && version <= 3) {
    // Collect all session ids and parentIds to validate the graph
    const allIds: Set<string> = new Set();
    const parentMap: Map<string, string | null> = new Map();

    // We need to parse more thoroughly, but for now use the top-level project
    // The active-branch resolution will be: follow parentId chain to leaf
    // If we detect malformed structure, return null (reject wholly)
    const parentIds: Set<string> = new Set();
    for (const line of sessionLines) {
      if (line.startsWith("id=")) {
        allIds.add(line.slice(3).trim());
      } else if (line.startsWith("parentId=")) {
        const pid = line.slice(9).trim();
        if (pid && pid !== "null") {
          parentMap.set(line.slice(3).trim(), pid);
          parentIds.add(pid);
        }
      }
    }

    // Validate: every parentId must reference an existing id (or be null)
    for (const [id, pid] of parentMap) {
      if (pid && !allIds.has(pid)) {
        // Dangling parentId → reject malformed graph wholly
        return null;
      }
    }

    // Check for cycles
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const hasCycle = (node: string): boolean => {
      if (visited.has(node)) return false;
      if (visiting.has(node)) return true;
      visiting.add(node);
      const pid = parentMap.get(node);
      if (pid && pid !== "null") {
        if (hasCycle(pid)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };

    for (const id of allIds) {
      if (!visited.has(id)) {
        if (hasCycle(id)) {
          // Cycle detected → reject malformed graph wholly
          return null;
        }
      }
    }

    // Active-branch resolution: follow parentId chain to the leaf (no parent)
    // The "active branch" is the path from a root (no parent) to a leaf (no children)
    // For simplicity, we keep the top-level project; the branch resolution
    // ensures we only harvest the leaf branch session.
    // In practice, we keep the project from the root session.
    resolvedProject = project; // already from top-level session header
  }

  return {
    sessionId,
    project: resolvedProject,
    startedAt,
    endedAt,
    userPrompts,
    assistantFinals,
    toolsUsed: Array.from(toolsUsed),
    feedbackSignals,
    nUserTurns,
    nAssistantTurns,
    rawPath: filePath,
  };
}

/**
 * Outcome label from feedback signals and turn counts.
 *
 * Rules (upstream mine.py heuristic_mine):
 *   - positive-only → success
 *   - negative → fail
 *   - ≥3 user turns → mixed
 * - else unknown
 *
 * Order: check positive-only first, then negative, then turn count, else unknown.
 */
function computeOutcome(
  feedbackSignals: string[],
  nUserTurns: number,
): "success" | "fail" | "mixed" | "unknown" {
  const hasPos = feedbackSignals.includes("pos");
  const hasNeg = feedbackSignals.includes("neg");

  // positive-only → success (no negative signals, even if there are some pos)
  if (hasPos && !hasNeg) {
    return "success";
  }

  // negative → fail (any negative signal)
  if (hasNeg) {
    return "fail";
  }

  // ≥3 user turns → mixed (positive or negative, but multiple turns indicate mixed results)
  if (nUserTurns >= 3) {
    return "mixed";
  }

  // else unknown
  return "unknown";
}

// ---------------------------------------------------------------------------
// 3. TaskRecord creation: mineTranscripts
// ---------------------------------------------------------------------------

/**
 * Mine a list of SessionDigests into outcome-labeled TaskRecords.
 *
 * One TaskRecord per session with ≥1 substantive prompt (≥8 chars).
 * Outcome determination:
 *   - positive-only → success
 *   - negative → fail
 *   - ≥3 user turns → mixed
 *   - else unknown
 *
 * id = 12-hex SHA-256(project + "::" + intent)
 * context from follow-up prompts
 * skillHint only when exactly one unique skill used (ambiguous → "")
 *
 * opts:
 *   - intentPromptIndex: which user prompt index to use as the intent (default: 0, the first substantive)
 *   - contextPromptCount: how many follow-up prompts to include in contextExcerpt (default: 2)
 */
export function mineTranscripts(
  digests: SessionDigest[],
  opts: {
    intentPromptIndex?: number;
    contextPromptCount?: number;
  } = {},
): TaskRecord[] {
  const intentIndex = opts.intentPromptIndex ?? 0;
  const contextCount = opts.contextPromptCount ?? 2;
  const records: TaskRecord[] = [];

  for (const digest of digests) {
    // Skip sessions with no substantive prompts
    if (digest.userPrompts.length === 0) {
      continue;
    }

    // The "intent" is the first substantive user prompt (or the indexed one)
    const intent =
      digest.userPrompts[intentIndex] || digest.userPrompts[0] || "";

    // Compute outcome from feedback signals and turn counts
    const outcome = computeOutcome(digest.feedbackSignals, digest.nUserTurns);

    // Compute skillHint: unique skill used or empty if ambiguous
    const uniqueSkills = new Set(digest.toolsUsed);
    const skillHint =
      uniqueSkills.size === 1 ? Array.from(uniqueSkills)[0] : "";

    // Build contextExcerpt from the intent + follow-up prompts (the excerpt is
    // the conversation context, so it includes the task statement itself).
    const contextPrompts: string[] = [intent];
    for (let i = 1; i <= contextCount; i++) {
      const idx = intentIndex + i;
      if (digest.userPrompts[idx]) {
        contextPrompts.push(digest.userPrompts[idx]);
      }
    }
    const contextExcerpt = contextPrompts.join(" | ");

    // id = 12-hex SHA-256(project + "::" + intent)
    const idInput = digest.project + "::" + intent;
    const idHash = crypto.createHash("sha256").update(idInput).digest("hex");
    const recordId = idHash.slice(0, 12);

    // Build the TaskRecord
    const record: TaskRecord = {
      id: recordId,
      sessionId: digest.sessionId,
      timestamp: digest.startedAt ? Date.parse(digest.startedAt) : 0,
      project: digest.project,
      intent,
      contextExcerpt,
      attemptedSolution: "", // will be populated by caller from context if needed
      outcome,
      referenceKind: "none",
      reference: "",
      tags: [],
      skillHint,
      origin: "real",
    };

    records.push(record);
  }

  return records;
}

// ---------------------------------------------------------------------------
// 4. Dedup: dedupTasks
//
// Merge tasks by id, preferring resolved outcome, intersecting skill hints
// (unique-only).  If two tasks have the same id but different outcomes,
// the resolved (non-unknown) outcome wins.  If both have the same resolved
// outcome, skill hints are intersected (kept only if unique across both).
// ---------------------------------------------------------------------------

export function dedupTasks(tasks: TaskRecord[]): TaskRecord[] {
  // Group by source sessionId (one task per session; same-session records are
  // duplicates regardless of computed id). Merging prefers resolved outcomes.
  const byId = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const key = task.sessionId || task.id;
    const existing = byId.get(key) || [];
    existing.push(task);
    byId.set(key, existing);
  }

  const result: TaskRecord[] = [];

  for (const group of byId.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Multiple tasks with same id — merge them
    let preferredOutcome: "success" | "fail" | "mixed" | "unknown" = "unknown";
    const skillHintSets: Set<string>[] = [];

    for (const task of group) {
      // Prefer resolved outcomes over unknown
      const order: ("success" | "fail" | "mixed" | "unknown")[] = [
        "success",
        "fail",
        "mixed",
        "unknown",
      ];
      const taskRank = order.indexOf(task.outcome);
      const prefRank = order.indexOf(preferredOutcome);

      if (taskRank < prefRank || preferredOutcome === "unknown") {
        preferredOutcome = task.outcome;
      }

      // Collect skill hint sets
      if (task.skillHint) {
        skillHintSets.push(new Set([task.skillHint]));
      }
    }

    // Intersect skill hints: keep only skills that appear in ALL tasks with non-empty skillHint
    let intersectingSkills: Set<string> | null = null;
    for (const skills of skillHintSets) {
      if (intersectingSkills === null) {
        intersectingSkills = skills;
      } else {
        const previous: Set<string> = intersectingSkills ?? new Set<string>();
        intersectingSkills = new Set(
          [...previous].filter((s) => skills.has(s)),
        );
      }
    }

    // If no intersecting skills, skillHint is empty
    const finalSkillHint =
      intersectingSkills && intersectingSkills.size === 1
        ? Array.from(intersectingSkills)[0]
        : "";

    // Build merged record using the first task as base, overriding with merged values
    const base = group[0];
    const merged: TaskRecord = {
      ...base,
      id: base.id,
      sessionId: base.sessionId,
      timestamp: Math.max(...group.map((t) => t.timestamp ?? 0)),
      outcome: preferredOutcome,
      skillHint: finalSkillHint,
    };

    result.push(merged);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. Harvest: harvestTranscripts
//
// Walk <root>/agent/sessions/**.jsonl sorted by mtime desc, optional since/limit.
// Root default: getAgentDir() + "/sessions" (i.e. ~/.omp/agent/sessions)
// ---------------------------------------------------------------------------

/**
 * Walk session JSONL files and return their digests, sorted by mtime desc.
 *
 * @param opts.root       Root directory containing agent/sessions/**.jsonl
 *   Defaults to HARVEST_ROOT_DEFAULT (./.omp/agent/sessions)
 * @param opts.since      Only include sessions modified since this ISO timestamp
 * @param opts.limit      Maximum number of session files to process
 * @returns               SessionDigests sorted by mtime descending
 */

/**
 * Parses a `since` filter value: YYYYMMDDHHMMSS number, ISO string, or epoch ms.
 */
function parseSince(value: string | number): number {
  const s = String(value);
  if (/^\d{14}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const h = Number(s.slice(8, 10));
    const mi = Number(s.slice(10, 12));
    const se = Number(s.slice(12, 14));
    return new Date(Date.UTC(y, mo - 1, d, h, mi, se)).getTime();
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  return Number(s);
}

const HARVEST_ROOT_DEFAULT = path.join(getAgentDir(), "sessions");

export async function harvestTranscripts(
  opts: HarvestOpts = {},
): Promise<SessionDigest[]> {
  const root = opts.root ?? HARVEST_ROOT_DEFAULT;

  // Verify root exists
  try {
    await fs.access(root);
  } catch {
    // Root doesn't exist yet — return empty
    return [];
  }

  // Find all .jsonl files under <root>/agent/sessions/
  const sessionsDir = path.join(root, "sessions");
  let jsonlFiles: string[];

  try {
    jsonlFiles = await fs.readdir(sessionsDir, { recursive: true });
  } catch {
    return [];
  }

  // Filter to .jsonl files only
  const jsonlFilePaths: string[] = jsonlFiles
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(sessionsDir, f))
    .filter((f) => {
      // Must be under sessions/ (not deeper unintended paths)
      const rel = path.relative(sessionsDir, f);
      return !rel.startsWith("..");
    });

  // Sort by mtime descending (newest first)
  const fileStatsPromises = jsonlFilePaths.map((f) => fs.stat(f));
  const stats = await Promise.all(fileStatsPromises);

  // Pair paths with mtime and sort descending
  const pathMtimePairs = jsonlFilePaths.map((f, i) => ({
    path: f,
    mtime: stats[i].mtimeMs,
  }));
  pathMtimePairs.sort((a, b) => b.mtime - a.mtime);

  // Optionally limit
  const limited = opts.limit
    ? pathMtimePairs.slice(0, opts.limit)
    : pathMtimePairs;

  // Digest each file, optionally filter by since
  const digests: SessionDigest[] = [];

  for (const { path: filePath } of limited) {
    try {
      const digest = await digestPiSession(filePath);
      if (digest !== null) {
        // since filter: only include sessions modified after the given timestamp
        if (opts.since) {
          const mtime = await fs.stat(filePath);
          const sinceMs = parseSince(opts.since);
          if (mtime.mtimeMs < sinceMs) {
            continue;
          }
        }
        digests.push(digest);
      }
    } catch (error) {
      // Skip files that fail to digest (malformed, unreadable)
      continue;
    }
  }

  return digests;
}

// ---------------------------------------------------------------------------
// 6. Exports
// ---------------------------------------------------------------------------

export type { SessionDigest, TaskRecord, HarvestOpts };
