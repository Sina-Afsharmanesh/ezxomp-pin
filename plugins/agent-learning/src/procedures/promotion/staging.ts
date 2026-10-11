/**
 * TASK-99 staging utilities for SkillPatchProposal apply flows.
 * Backs up skill files before mutation and appends structured evidence entries.
 * Ported from microsoft/SkillOpt (MIT) staging/apply pipeline; no network, no LLM calls.
 */
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join, dirname, basename } from "node:path";

export interface EvidenceEntry {
  ts: string;
  action: "backup" | "apply" | "reject" | "unmatched";
  proposalId?: string;
  skill?: string;
  gateAction?: string;
  appliedEdits?: number;
  unmatchedEdits?: string[];
  backupPath?: string;
  detail?: string;
}

/**
 * Backs up the skill file to a timestamped file in the backup directory.
 * @param skillPath - The path to the skill file to back up.
 * @param opts - Optional backup root directory.
 * @returns The path to the backup file.
 * @throws If the backup directory cannot be created or the file cannot be copied.
 */
export async function backupSkillFile(
  skillPath: string,
  opts: { backupRoot?: string } = {},
): Promise<string> {
  const backupRoot =
    opts.backupRoot ?? join(dirname(skillPath), ".agent-learning-backups");
  const timestamp =
    new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  // Collision guard: same-second applies must not overwrite the earlier backup.
  let backupFilePath = join(backupRoot, `${timestamp}-${basename(skillPath)}`);
  let seq = 1;
  while (existsSync(backupFilePath)) {
    backupFilePath = join(
      backupRoot,
      `${timestamp}-${seq++}-${basename(skillPath)}`,
    );
  }

  try {
    await mkdir(backupRoot, { recursive: true });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "EEXIST"
    ) {
      try {
        await mkdir(backupRoot, { recursive: true });
      } catch (err2) {
        throw err2;
      }
    } else {
      throw err;
    }
  }

  const data = await readFile(skillPath);
  await writeFile(backupFilePath, data);

  return backupFilePath;
}

/**
 * Appends an evidence entry to the evidence log file (JSONL).
 * @param logPath - The path to the evidence log file.
 * @param entry - The evidence entry to append.
 */
export async function appendEvidenceLog(
  logPath: string,
  entry: EvidenceEntry,
): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  await appendFile(logPath, line, { encoding: "utf8" });
}

/**
 * Lists backup files for a given skill path, sorted descending by timestamp.
 * @param skillPath - The path to the skill file.
 * @param backupRoot - Optional backup root directory.
 * @returns An array of backup file paths (strings), sorted descending.
 */
export async function listBackups(
  skillPath: string,
  backupRoot?: string,
): Promise<string[]> {
  const root =
    backupRoot ?? join(dirname(skillPath), ".agent-learning-backups");
  try {
    const files = await readdir(root);
    const basenameOnly = basename(skillPath);
    const backupFiles = files
      .filter((f) => f.endsWith(`-${basenameOnly}`))
      .sort()
      .reverse();
    return backupFiles.map((f) => join(root, f));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
}
