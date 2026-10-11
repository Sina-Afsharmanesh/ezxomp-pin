import { statSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path, { join, dirname, resolve } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import type { RetrievedMemory } from "../memory/retrieve.js";
import type { MemoryEntry } from "../shared/types.js";
import {
  ensureStore,
  formatDisplayPath,
  getGlobalSkillforgeRoot,
  type MemoryPartition,
  writeAtomicFile,
} from "../store/storage.js";
import {
  backupSkillFile,
  appendEvidenceLog,
  EvidenceEntry,
} from "./staging.js";
import { evaluateGate, type GateResult } from "./gate.js";
import {
  applyEditsDetailed,
  currentLearnedLines,
  extractLearned,
  setLearned,
} from "./edit-engine.js";

const PROMOTION_HIT_THRESHOLD = 3;
const PROMOTION_VERSION = 1;

type ProposalStatus = "pending" | "applied";

export interface SkillPatchProposal {
  version: 1;
  id: string;
  status: ProposalStatus;
  partition: MemoryPartition;
  project_id?: string;
  target_skill: string;
  target_path?: string;
  source_memory_id: string;
  source_memory_path: string;
  memory_title: string;
  memory_type: string;
  proposed_guidance: string;
  rationale: string;
  verification: string[];
  created_at: string;
  updated_at: string;
  applied_at?: string;
  unmatchedEdits?: string[];
  gate?: GateResult;
  proposal_path?: string;
}

export interface PromotionCandidate {
  entry: MemoryEntry;
  partition: MemoryPartition;
  projectId?: string;
  memoryPath: string;
}

export interface PromotionOptions {
  skillPaths?: Map<string, string>;
}

export async function promoteMemoryIfEligible(
  cwd: string,
  candidate: PromotionCandidate,
  options: PromotionOptions = {},
): Promise<SkillPatchProposal[]> {
  if (!isPromotionEligible(candidate.entry)) return [];
  const proposals: SkillPatchProposal[] = [];
  for (const skill of candidate.entry.skills ?? []) {
    const targetSkill = skill.trim();
    if (!targetSkill) continue;
    const paths = await ensureStore(cwd, candidate.partition);
    // --- Gate check (TASK-95: SkillOpt validation) ---
    // Placeholder scoring: candHard = candidate.entry.hits; metric = "hard".
    // Held-out replay scorer lands with TASK-97/99; the gate machinery is complete now.
    // A reject must NOT create a proposal for this skill.
    const candHard = candidate.entry.hits;
    const candSoft = 0;
    const metric: "hard" | "soft" | "mixed" = "hard";
    const mixedWeight = 0.5;
    const gateResult = evaluateGate(
      targetSkill,
      candHard,
      candSoft,
      metric,
      mixedWeight,
      targetSkill, // currentSkill
      0, // currentScore placeholder
      targetSkill, // bestSkill
      0, // bestScore placeholder
      0, // bestStep placeholder
      0, // globalStep placeholder
    );
    if (gateResult.action === "reject") {
      continue;
    }
    const proposal = createProposal(
      { ...candidate, projectId: candidate.projectId ?? paths.projectId },
      targetSkill,
      options.skillPaths,
      gateResult,
    );
    const proposalPath = path.join(paths.promotions, `${proposal.id}.json`);
    if (await fileExists(proposalPath)) continue;
    try {
      await writeAtomicFile(
        proposalPath,
        `${JSON.stringify(proposal, null, "\t")}\n`,
        {
          overwrite: false,
        },
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") continue;
      throw error;
    }
    await appendPromotionLog(
      `created ${proposal.id} for ${targetSkill} from ${candidate.entry.id}`,
    );
    proposals.push({ ...proposal, proposal_path: proposalPath });
  }
  return proposals;
}

export async function promoteRetrievedMemories(
  cwd: string,
  memories: RetrievedMemory[],
  options: PromotionOptions = {},
): Promise<SkillPatchProposal[]> {
  const candidates: PromotionCandidate[] = memories.map((memory) => ({
    entry: memory.entry,
    partition: memory.partition,
    projectId: memory.projectId,
    memoryPath: memory.path,
  }));
  const results = await Promise.all(
    candidates.map((candidate) =>
      promoteMemoryIfEligible(cwd, candidate, options),
    ),
  );
  return results.flat();
}

export async function listPendingProposals(
  skillName: string,
): Promise<SkillPatchProposal[]> {
  const files = await listProposalFiles(
    path.join(getGlobalSkillforgeRoot(), "promotions"),
  );
  const proposals = await Promise.all(files.map(readProposalFile));
  return proposals
    .filter(
      (proposal): proposal is SkillPatchProposal =>
        proposal !== undefined &&
        proposal.status === "pending" &&
        normalizeSkillName(proposal.target_skill) ===
          normalizeSkillName(skillName),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function applyProposal(
  proposal: SkillPatchProposal,
): Promise<SkillPatchProposal> {
  const canonicalPath = canonicalSkillPath(proposal.target_skill);
  const targetPath = proposal.target_path
    ? resolve(proposal.target_path)
    : findSkillPath(proposal.target_skill);
  if (
    proposal.target_path &&
    !isCanonicalTargetPath(targetPath, canonicalPath)
  ) {
    throw new Error(
      `Cannot apply ${proposal.id}: target_path is outside canonical target path`,
    );
  }
  if (!targetPath) {
    throw new Error(
      `Cannot apply ${proposal.id}: no target_path for ${proposal.target_skill}`,
    );
  }
  if (!(await fileExists(targetPath))) {
    throw new Error(
      `Cannot apply ${proposal.id}: target skill file not found at ${targetPath}`,
    );
  }

  const current = await readFile(targetPath, "utf8");
  const guidance = proposal.proposed_guidance.trim();

  // Backward compat: docs with legacy "## Skillforge learnings" sections still
  // dedup correctly via the normalized-content check: add is skipped when
  // guidance already appears anywhere in the document.
  const guidanceNormalized = guidance.toLowerCase().replace(/\s+/g, " ").trim();
  const currentNormalized = current.toLowerCase().replace(/\s+/g, " ").trim();
  if (currentNormalized.includes(guidanceNormalized)) {
    // Content already present — skip modification, mark as applied.
    const evidencePath = join(dirname(targetPath), "agent-learning-evidence.jsonl");
    await appendEvidenceLog(evidencePath, {
      ts: new Date().toISOString(),
      action: "reject",
      proposalId: proposal.id,
      skill: proposal.target_skill,
      detail: "no-op",
    });
    const updated: SkillPatchProposal = {
      ...proposal,
      status: "applied",
      target_path: targetPath,
      updated_at: today(),
      applied_at: today(),
      unmatchedEdits: [],
    };
    if (proposal.proposal_path) {
      await writeAtomicFile(
        proposal.proposal_path,
        `${JSON.stringify(stripRuntimePath(updated), null, "\t")}\n`,
      );
    }
    await appendPromotionLog(
      `applied ${proposal.id} to ${targetPath} (already present)`,
    );
    return updated;
  }

  // Use the bounded edit engine to apply the guidance as an "add" operation
  // within the protected learned region. Preserve the legacy section header
  // above the region when the document lacks it (e2e contract: patched file
  // must contain "## Skillforge learnings").
  const headerPrefix = current.includes("## Skillforge learnings")
    ? ""
    : "## Skillforge learnings\n";
  const {
    nextDoc: engineDoc,
    applied,
    unmatched,
  } = applyEditsDetailed(current, [
    {
      op: "add",
      content: guidance,
    },
  ]);
  const nextDoc = headerPrefix
    ? `${current}\n${headerPrefix}\n${engineDoc.slice(current.length).replace(/^\n+/, "")}`
    : engineDoc;

  // Backup before mutation, then write the modified document back.
  const backupPath = await backupSkillFile(targetPath);
  await writeAtomicFile(targetPath, nextDoc);

  // Evidence log after the write (TASK-99 staging).
  const unmatchedEdits: string[] = unmatched.map((e) => e.content ?? "");
  const logPath = join(dirname(targetPath), "agent-learning-evidence.jsonl");
  await appendEvidenceLog(logPath, {
    ts: new Date().toISOString(),
    action: "apply",
    proposalId: proposal.id,
    skill: proposal.target_skill,
    appliedEdits: applied.length,
    unmatchedEdits,
    backupPath,
  });

  const updated: SkillPatchProposal = {
    ...proposal,
    status: "applied",
    target_path: targetPath,
    updated_at: today(),
    applied_at: today(),
    unmatchedEdits,
  };
  if (proposal.proposal_path) {
    await writeAtomicFile(
      proposal.proposal_path,
      `${JSON.stringify(stripRuntimePath(updated), null, "\t")}\n`,
    );
  }
  await appendPromotionLog(`applied ${proposal.id} to ${targetPath}`);
  return updated;
}

export async function confirmApplyProposal(options: {
  proposal: SkillPatchProposal;
  confirm: (title: string, body: string) => Promise<boolean>;
  applyProposal: (proposal: SkillPatchProposal) => Promise<SkillPatchProposal>;
  notify: (message: string, level: string) => void;
}): Promise<SkillPatchProposal | undefined> {
  const approved = await options.confirm(
    "Apply Skillforge patch?",
    `Apply ${options.proposal.id} to ${options.proposal.target_skill}?`,
  );
  if (!approved) return undefined;
  const applied = await options.applyProposal(options.proposal);
  options.notify(`Applied ${applied.id} to ${applied.target_path}.`, "info");
  return applied;
}

export function formatProposalForReview(proposal: SkillPatchProposal): string {
  return [
    `Skill patch proposal: ${proposal.id}`,
    `Target skill: ${proposal.target_skill}`,
    `Target path: ${proposal.target_path ? formatDisplayPath(proposal.target_path) : "(not found)"}`,
    `Source memory: ${proposal.source_memory_id} (${proposal.memory_type})`,
    `Source path: ${formatProposalSourcePath(proposal.source_memory_path)}`,
    "",
    "Proposed change:",
    proposal.proposed_guidance,
    "",
    "Rationale:",
    proposal.rationale,
    "",
    "Verification evidence:",
    ...proposal.verification.map((item) => `- ${item}`),
  ].join("\n");
}

export function createSkillPathMap(
  skills: Array<{ name: string; filePath?: string }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const skill of skills ?? []) {
    if (skill.filePath) map.set(normalizeSkillName(skill.name), skill.filePath);
  }
  return map;
}

function createProposal(
  candidate: PromotionCandidate,
  targetSkill: string,
  skillPaths?: Map<string, string>,
  gateResult?: GateResult,
): SkillPatchProposal {
  const date = today();
  const guidance = `- ${firstSentence(candidate.entry.fix[0] ?? candidate.entry.title)}`;
  return {
    version: PROMOTION_VERSION,
    id: `${sanitizeId(targetSkill)}__${candidate.entry.id}`,
    status: "pending",
    partition: candidate.partition,
    project_id: candidate.projectId,
    target_skill: targetSkill,
    target_path:
      skillPaths?.get(normalizeSkillName(targetSkill)) ??
      findSkillPath(targetSkill),
    source_memory_id: candidate.entry.id,
    source_memory_path: candidate.memoryPath,
    memory_title: candidate.entry.title,
    memory_type: candidate.entry.type,
    proposed_guidance: guidance,
    rationale: `${candidate.entry.type} memory '${candidate.entry.title}' is confirmed, has ${candidate.entry.hits} hit(s), and targets the ${targetSkill} skill.`,
    verification: candidate.entry.verification,
    created_at: date,
    updated_at: date,
    gate: gateResult,
  };
}

function isPromotionEligible(entry: MemoryEntry): boolean {
  return (
    entry.confidence === "confirmed" &&
    entry.hits >= PROMOTION_HIT_THRESHOLD &&
    (entry.skills?.length ?? 0) > 0
  );
}

async function listProposalFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listProposalFiles(fullPath);
        if (entry.isFile() && entry.name.endsWith(".json")) return [fullPath];
        return [];
      }),
    );
    return nested.flat();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function readProposalFile(
  file: string,
): Promise<SkillPatchProposal | undefined> {
  try {
    const proposal = JSON.parse(
      await readFile(file, "utf8"),
    ) as SkillPatchProposal;
    if (proposal.version !== PROMOTION_VERSION || !proposal.id)
      return undefined;
    return { ...proposal, proposal_path: file };
  } catch {
    return undefined;
  }
}

async function appendPromotionLog(message: string): Promise<void> {
  const logPath = path.join(getGlobalSkillforgeRoot(), "promotion-log.md");
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(
    logPath,
    `- ${new Date().toISOString()} ${message}\n`,
    "utf8",
  );
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function canonicalSkillPath(skillName: string): string {
  const skillsRoot = path.resolve(getAgentDir(), "skills");
  const candidate = path.resolve(skillsRoot, skillName, "SKILL.md");
  if (!isWithinDirectory(candidate, skillsRoot)) {
    throw new Error("target skill path is outside canonical target path");
  }
  return candidate;
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isCanonicalTargetPath(
  targetPath: string | undefined,
  canonicalPath: string,
): boolean {
  return targetPath === canonicalPath;
}

function formatProposalSourcePath(sourcePath: string): string {
  if (path.isAbsolute(sourcePath)) return "(redacted)";
  return formatDisplayPath(sourcePath);
}

function findSkillPath(skillName: string): string | undefined {
  const candidate = canonicalSkillPath(skillName);
  return statSyncIsFile(candidate) ? candidate : undefined;
}

function statSyncIsFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function stripRuntimePath(proposal: SkillPatchProposal): SkillPatchProposal {
  const { proposal_path: _proposalPath, ...rest } = proposal;
  return rest;
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase();
}

function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 240
    ? `${normalized.slice(0, 237)}...`
    : normalized;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
