/**
 * TASK-98 — Heuristic transcript miner feeding outcome-labeled candidate memories.
 * Port from SkillOpt harvest_pi.py + mine.py digest+mine pipeline.
 *
 * Data boundary (doc-23): local read-only, offline, redaction is defense-in-depth.
 * Nothing leaves the machine. No LLM calls, no network in shipped code paths.
 */

import path from "node:path";

/**
 * Parsed digest of a single Pi session JSONL file.
 *
 * Fields are derived from the upstream JSONL schema documented in harvest_pi.py:
 *   type:session  → cwd, timestamp, version, id, parentId
 *   type:message  → role (user/assistant/toolResult), content, tool/name/isError
 *   type:toolCall → block names (skipped in final record)
 *   type:thinking → skipped (not propagated)
 */
export interface SessionDigest {
  /** Unique session identifier (from JSONL type:session id) */
  sessionId: string;
  /** Project / cwd from the session header */
  project: string;
  /** Session start timestamp (from JSONL) */
  startedAt: string;
  /** Session end timestamp (from JSONL) */
  endedAt: string;
  /** Unique user prompt texts (deduplicated, in order) */
  userPrompts: string[];
  /** Assistant final response texts (deduplicated, in order) */
  assistantFinals: string[];
  /** Unique tool names used in the session */
  toolsUsed: string[];
  /** Lexical feedback signals extracted from user text */
  feedbackSignals: string[];
  /** Count of user-turn messages */
  nUserTurns: number;
  /** Count of assistant-turn messages */
  nAssistantTurns: number;
  /** Path to the raw JSONL file from which this was dug */
  rawPath: string;
}

/**
 * Outcome-labeled task record produced by the miner.
 *
 * One TaskRecord is produced per harvested session that has at least one
 * substantive user prompt (≥8 chars).  The `id` is a 12-hex SHA-256 of
 * `project + "::" + intent`.  `skillHint` is populated only when exactly
 * one unique skill name appears across the session; otherwise it is the
 * empty string.
 */
export interface TaskRecord {
  /** 12-hex SHA-256(project + "::" + intent) */
  id: string;
  /** Source session id (dedup/display key from the originating digest) */
  sessionId: string;
  /** Session start timestamp (ms epoch, from the digest) */
  timestamp: number;
  /** Project / cwd string */
  project: string;
  /** User-stated intent (from the most salient follow-up prompt) */
  intent: string;
  /** Short excerpt of the conversation context (2–3 follow-up prompts) */
  contextExcerpt: string;
  /** The attempted solution the user described */
  attemptedSolution: string;
  /** Outcome label: "success" | "fail" | "mixed" | "unknown" */
  outcome: "success" | "fail" | "mixed" | "unknown";
  /** Always "none" per the data boundary contract */
  referenceKind: "none";
  /** Placeholder reference (empty string per doc-23) */
  reference: string;
  /** Tag array (currently empty; reserved for future use) */
  tags: string[];
  /** Skill hint: unique skill name or "" if ambiguous / multiple */
  skillHint: string;
  /** Always "real" per the data boundary contract */
  origin: "real";
}

/**
 * Options passed to harvestTranscripts and mineTranscripts.
 */
export interface HarvestOpts {
  /** Only include sessions modified since this timestamp (ISO string, epoch ms, or YYYYMMDDHHMMSS) */
  since?: string | number;
  /** Maximum number of session files to process */
  limit?: number;
  /** Root directory containing agent/sessions/**.jsonl */
  root?: string;
}

/** Default root for harvestTranscripts: <agentDir>/sessions */
export const HARVEST_ROOT_DEFAULT = "./.omp/agent/sessions";
