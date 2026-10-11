/**
 * Durable per-lane policy-generation records and the process-local transition
 * boundary.
 *
 * Main and sub recovery authorities are INDEPENDENT records (TASK-55.7):
 *   - main-generation.json — main grants/hashes only; no profile paths.
 *   - sub-state.json       — byte-exact profile backups + hashes, bound to the
 *     canonical project owner cwd when project profiles exist.
 * Each lane can fail, restore, or delete without touching the other.
 *
 * The legacy shared `generation-state.json` is no longer recovery authority;
 * it is consumed only by migrateLegacySharedRecord(), which fans out
 * conservatively — every field must validate AND every project profile must
 * belong to the current authorized project cwd, otherwise the legacy record
 * is retained untouched and the migration fails closed.
 *
 * Records are deliberately boring JSON written with rename semantics so a
 * killed process leaves either the previous record or the complete new
 * record, never a partially parsed document.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { atomicWriteFile } from "./atomic.ts";
import {
  ompMainGenerationFile,
  ompGenerationStateFile,
  ompStateFile,
  ompAgentProfilesDir,
  projectAgentProfilesDir,
} from "./paths.ts";

export const GENERATION_SCHEMA_VERSION = 1;
export const EVO_POLICY_VERSION = "1";

export type GenerationStatus = "pending" | "active" | "restoring" | "failed";
export type ProfileScope = "global" | "project";

export interface GenerationProfile {
  canonicalPath: string;
  scope: ProfileScope;
  originalContent: string;
  originalHash: string;
  effectiveContentHash?: string;
  originalToolNames: string[];
  effectiveToolNames?: string[];
  phase: "pending" | "applied" | "restored" | "failed";
}

/** Main-lane record: tool grants/hashes only — never profile paths. */
export interface MainGenerationRecord {
  schemaVersion: typeof GENERATION_SCHEMA_VERSION;
  generationId: string;
  policyVersion: string;
  catalogHash: string;
  status: GenerationStatus;
  main: {
    originalToolNames: string[];
    effectiveToolNames?: string[];
    originalHash?: string;
    effectiveHash?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Sub-lane record: canonical project profiles bound to one owner cwd. */
export interface SubGenerationRecord {
  schemaVersion: typeof GENERATION_SCHEMA_VERSION;
  generationId: string;
  policyVersion: string;
  catalogHash: string;
  status: GenerationStatus;
  /** Canonical project cwd owning this record; set when project profiles exist. */
  ownerProjectCwd?: string;
  profiles: GenerationProfile[];
  createdAt: string;
  updatedAt: string;
  /** Legacy byte-exact backup surface (timestamp/toolListHash/files) merged
   *  into the record so substate readers and legacy snapshot hydration keep
   *  working. */
  timestamp: string;
  toolListHash: string;
  files: Array<{ path: string; originalContent: string }>;
  /** Project cwds whose .omp/agents profiles are covered by this record. */
  projectCwds?: string[];
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function under(root: string, candidate: string): boolean {
  const base = path.resolve(root);
  const value = path.resolve(candidate);
  return value.startsWith(`${base}${path.sep}`);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validNames(v: unknown): v is string[] {
  return Array.isArray(v) && v.length === new Set(v).size && v.every((x) => typeof x === "string" && x.length > 0);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validStatus(value: unknown): value is GenerationStatus {
  return ["pending", "active", "restoring", "failed"].includes(String(value));
}

function validMainBlock(value: unknown): value is MainGenerationRecord["main"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  if (!validNames(m.originalToolNames)) return false;
  if (m.effectiveToolNames !== undefined && !validNames(m.effectiveToolNames)) return false;
  if (m.originalHash !== undefined && !validHash(m.originalHash)) return false;
  if (m.effectiveHash !== undefined && !validHash(m.effectiveHash)) return false;
  return true;
}

function isValidMainRecord(value: unknown): value is MainGenerationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  return s.schemaVersion === GENERATION_SCHEMA_VERSION &&
    typeof s.generationId === "string" && !!s.generationId &&
    typeof s.policyVersion === "string" && !!s.policyVersion &&
    validHash(s.catalogHash) &&
    validStatus(s.status) &&
    validMainBlock(s.main) &&
    validTimestamp(s.createdAt) &&
    validTimestamp(s.updatedAt);
}

function isValidProfile(value: unknown, allowedProjectCwds: readonly string[]): value is GenerationProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  const scope = x.scope;
  const canonical = x.canonicalPath;
  const root = scope === "global" ? ompAgentProfilesDir() : undefined;
  // Project roots are not enumerable from state alone; require the standard
  // project profile shape and reject traversal outside an existing cwd root.
  const safeProject = scope === "project" && typeof canonical === "string" &&
    allowedProjectCwds.some((cwd) => path.resolve(canonical).startsWith(`${path.resolve(projectAgentProfilesDir(cwd))}${path.sep}`));
  if (scope === "global" && (typeof canonical !== "string" || !under(root!, canonical))) return false;
  if (!safeProject && scope !== "global") return false;
  return typeof canonical === "string" && typeof x.originalContent === "string" &&
    validHash(x.originalHash) && x.originalHash === contentHash(x.originalContent) &&
    validNames(x.originalToolNames) &&
    (x.effectiveContentHash === undefined || validHash(x.effectiveContentHash)) &&
    (x.effectiveToolNames === undefined || validNames(x.effectiveToolNames)) &&
    ["pending", "applied", "restored", "failed"].includes(String(x.phase));
}

function validFiles(v: unknown): v is Array<{ path: string; originalContent: string }> {
  return Array.isArray(v) && v.every((e) => !!e && typeof e === "object" && !Array.isArray(e) &&
    typeof (e as Record<string, unknown>).path === "string" &&
    typeof (e as Record<string, unknown>).originalContent === "string");
}

function isValidSubRecord(value: unknown, allowedProjectCwds: readonly string[]): value is SubGenerationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (s.schemaVersion !== GENERATION_SCHEMA_VERSION ||
    typeof s.generationId !== "string" || !s.generationId ||
    typeof s.policyVersion !== "string" || !s.policyVersion ||
    !validHash(s.catalogHash) ||
    !validStatus(s.status) ||
    !Array.isArray(s.profiles) ||
    !validTimestamp(s.createdAt) ||
    !validTimestamp(s.updatedAt) ||
    typeof s.timestamp !== "string" ||
    typeof s.toolListHash !== "string" ||
    !validFiles(s.files)) return false;
  if (s.ownerProjectCwd !== undefined && typeof s.ownerProjectCwd !== "string") return false;
  if (s.projectCwds !== undefined && (!Array.isArray(s.projectCwds) || s.projectCwds.some((c) => typeof c !== "string"))) return false;
  // Binding: when project profiles exist the record must name one canonical
  // owner cwd, and every project profile must live under that owner.
  const projectProfiles = (s.profiles as unknown[]).filter((p) => (p as Record<string, unknown>).scope === "project");
  if (projectProfiles.length > 0) {
    if (typeof s.ownerProjectCwd !== "string") return false;
    const owner = path.resolve(s.ownerProjectCwd);
    if (!projectProfiles.every((p) => path.resolve((p as Record<string, unknown>).canonicalPath as string)
      .startsWith(`${path.resolve(projectAgentProfilesDir(owner))}${path.sep}`))) return false;
  }
  if (s.projectCwds !== undefined && s.ownerProjectCwd !== undefined &&
    !(s.projectCwds as string[]).includes(s.ownerProjectCwd)) return false;
  return (s.profiles as unknown[]).every((p) => isValidProfile(p, allowedProjectCwds));
}

// ── Main lane ────────────────────────────────────────────────────────────────

export async function readMainGeneration(): Promise<MainGenerationRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(ompMainGenerationFile(), "utf8"));
    return isValidMainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeMainGeneration(state: MainGenerationRecord): Promise<void> {
  if (!isValidMainRecord(state)) throw new Error("EVO_GENERATION_INVALID");
  // Never replace evidence we cannot prove is a committed main generation.
  try {
    const existing: unknown = JSON.parse(await fs.readFile(ompMainGenerationFile(), "utf8"));
    if (!isValidMainRecord(existing)) throw new Error("EVO_GENERATION_INVALID");
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteFile(ompMainGenerationFile(), JSON.stringify(state, null, 2));
}

export async function deleteMainGeneration(): Promise<void> {
  await fs.rm(ompMainGenerationFile(), { force: true });
}

export function newMainGeneration(input: Omit<MainGenerationRecord, "schemaVersion" | "generationId" | "createdAt" | "updatedAt">): MainGenerationRecord {
  const now = new Date().toISOString();
  return { ...input, schemaVersion: 1, generationId: randomUUID(), createdAt: now, updatedAt: now };
}

// ── Sub lane ─────────────────────────────────────────────────────────────────

export async function readSubGeneration(allowedProjectCwds: readonly string[] = []): Promise<SubGenerationRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(ompStateFile(), "utf8"));
    return isValidSubRecord(parsed, allowedProjectCwds) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSubGeneration(state: SubGenerationRecord, allowedProjectCwds: readonly string[] = []): Promise<void> {
  if (!isValidSubRecord(state, allowedProjectCwds)) throw new Error("EVO_GENERATION_INVALID");
  // Never replace evidence we cannot prove is a committed sub generation.
  try {
    const existing: unknown = JSON.parse(await fs.readFile(ompStateFile(), "utf8"));
    if (!isValidSubRecord(existing, allowedProjectCwds)) throw new Error("EVO_GENERATION_INVALID");
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteFile(ompStateFile(), JSON.stringify(state, null, 2));
}

export async function deleteSubGeneration(): Promise<void> {
  await fs.rm(ompStateFile(), { force: true });
}

export function newSubGeneration(input: Omit<SubGenerationRecord, "schemaVersion" | "generationId" | "createdAt" | "updatedAt" | "timestamp" | "toolListHash" | "files">): SubGenerationRecord {
  const now = new Date().toISOString();
  return {
    ...input,
    schemaVersion: 1,
    generationId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    timestamp: now,
    toolListHash: contentHash(input.catalogHash),
    files: input.profiles.map((p) => ({ path: p.canonicalPath, originalContent: p.originalContent })),
    ...(input.ownerProjectCwd ? { projectCwds: [input.ownerProjectCwd] } : {}),
  };
}

// ── Legacy shared-record migration ──────────────────────────────────────────

/**
 * Conservative migration of the legacy shared generation-state.json.
 *
 * Fans out into lane records ONLY when:
 *   1. every legacy field validates under the previous shared schema, AND
 *   2. every project profile resolves under the CURRENT authorized project
 *      cwd (migration is project-lane-scoped; a globally-owned legacy record
 *      with foreign project paths cannot be proven to belong here).
 *
 * Otherwise the legacy record is retained untouched and migration fails
 * closed (never delete ambiguous evidence). Returns "migrated" | "none" |
 * "retained".
 */
export type LegacyMigrationResult = "migrated" | "none" | "retained";

async function laneFileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function migrateLegacySharedRecord(allowedProjectCwds: readonly string[] = []): Promise<LegacyMigrationResult> {
  let raw: string;
  try {
    raw = await fs.readFile(ompGenerationStateFile(), "utf8");
  } catch {
    return "none";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "retained";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "retained";
  const s = parsed as Record<string, unknown>;
  const profiles = Array.isArray(s.profiles) ? s.profiles : null;
  const mainBlock = s.main;
  if (s.schemaVersion !== GENERATION_SCHEMA_VERSION ||
    typeof s.generationId !== "string" || !s.generationId ||
    typeof s.policyVersion !== "string" || !s.policyVersion ||
    !validHash(s.catalogHash) ||
    !validStatus(s.status) ||
    !validTimestamp(s.createdAt) ||
    !validTimestamp(s.updatedAt) ||
    !Array.isArray(s.profiles) ||
    (s.main !== undefined && !validMainBlock(s.main))) return "retained";
  if (profiles === null) return "retained";

  const root = s.ownerProjectCwd && typeof s.ownerProjectCwd === "string" ? s.ownerProjectCwd : undefined;
  // All project profiles must belong to one current authorized project cwd.
  let ownerCwd: string | undefined;
  for (const p of profiles) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return "retained";
    const x = p as Record<string, unknown>;
    if (x.scope === "global") continue;
    if (x.scope !== "project" || typeof x.canonicalPath !== "string") return "retained";
    const matches = allowedProjectCwds.filter((cwd) =>
      path.resolve(x.canonicalPath as string).startsWith(`${path.resolve(projectAgentProfilesDir(cwd))}${path.sep}`));
    if (matches.length !== 1) return "retained";
    if (ownerCwd && ownerCwd !== matches[0]) return "retained";
    ownerCwd = matches[0];
  }
  if (root && ownerCwd && root !== ownerCwd) return "retained";
  const effectiveOwner = root ?? ownerCwd;
  const projectProfiles = profiles.filter((p) => (p as Record<string, unknown>).scope === "project");
  if (projectProfiles.length > 0 && !effectiveOwner) return "retained";
  if (profiles.some((p) => !isValidProfile(p, allowedProjectCwds))) return "retained";
  // Degenerate legacy record with neither authority: nothing provable to fan
  // out, keep it as ambiguous evidence.
  if (mainBlock === undefined && profiles.length === 0) return "retained";

  // Never overwrite any target lane record that already exists — a present
  // target may encode a newer or foreign lifecycle; idempotent equivalence is
  // not provable from the legacy file alone, so retain and fail closed.
  if (mainBlock !== undefined && await laneFileExists(ompMainGenerationFile())) return "retained";
  if (profiles.length > 0 && await laneFileExists(ompStateFile())) return "retained";

  // Fan out into the independent lane records. active stays active so the
  // persisted config flag stays recoverable; anything else maps to failed so
  // the lane evidence is never presented as a live generation.
  const laneStatus: "active" | "failed" = s.status === "active" ? "active" : "failed";
  const now = new Date().toISOString();
  if (mainBlock !== undefined) {
    const mainRecord: MainGenerationRecord = {
      schemaVersion: 1,
      generationId: randomUUID(),
      policyVersion: String(s.policyVersion),
      catalogHash: String(s.catalogHash),
      status: laneStatus,
      main: mainBlock as MainGenerationRecord["main"],
      createdAt: now,
      updatedAt: now,
    };
    await atomicWriteFile(ompMainGenerationFile(), JSON.stringify(mainRecord, null, 2));
  }
  if (profiles.length > 0) {
    const subRecord: SubGenerationRecord = {
      schemaVersion: 1,
      generationId: randomUUID(),
      policyVersion: String(s.policyVersion),
      catalogHash: String(s.catalogHash),
      status: laneStatus,
      ...(effectiveOwner ? { ownerProjectCwd: effectiveOwner } : {}),
      profiles: profiles as GenerationProfile[],
      createdAt: now,
      updatedAt: now,
      timestamp: now,
      toolListHash: contentHash(String(s.catalogHash)),
      files: (profiles as GenerationProfile[]).map((p) => ({ path: p.canonicalPath, originalContent: p.originalContent })),
      ...(effectiveOwner ? { projectCwds: [effectiveOwner] } : {}),
    };
    await atomicWriteFile(ompStateFile(), JSON.stringify(subRecord, null, 2));
  }
  // Both lane records are provable; the legacy file is no longer an
  // authority and is removed so it cannot confuse later reads.
  await fs.rm(ompGenerationStateFile(), { force: true });
  return "migrated";
}

// ── Shared process-local transition boundary ────────────────────────────────

let transition: Promise<unknown> = Promise.resolve();
export function serializeTransition<T>(work: () => Promise<T>): Promise<T> {
  const run = transition.then(work, work);
  transition = run.then(() => undefined, () => undefined);
  return run;
}

export const withTransitionLock = serializeTransition;
