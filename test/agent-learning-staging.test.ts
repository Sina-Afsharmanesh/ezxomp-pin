import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import {
  backupSkillFile,
  appendEvidenceLog,
  listBackups,
  EvidenceEntry,
} from "../plugins/agent-learning/src/procedures/promotion/staging";
import {
  applyProposal,
  type SkillPatchProposal,
} from "../plugins/agent-learning/src/procedures/promotion/promotion";
import type { MemoryPartition } from "../plugins/agent-learning/src/procedures/store/storage";
import { getAgentDir } from "@oh-my-pi/pi-utils";
// pi-utils caches agentDir per-process (first access wins; later env writes ignored) and
// bun test runs all files in one process, so wiring tests must target the REAL agent dir.
const MODULE_AGENT_DIR = getAgentDir();

const ROOT = resolve(import.meta.dirname, "..");

describe("backupSkillFile", () => {
  let testDir: string;
  let skillFilePath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "backup-test-"));
    skillFilePath = join(testDir, "test-skill.md");
    writeFileSync(skillFilePath, "original content", "utf8");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates a backup file with the original content", async () => {
    const backupPath = await backupSkillFile(skillFilePath);
    expect(existsSync(backupPath)).toBe(true);
    const backupContent = readFileSync(backupPath, "utf8");
    expect(backupContent).toBe("original content");
  });

  it("lands in the expected directory (default backup root)", async () => {
    const backupPath = await backupSkillFile(skillFilePath);
    expect(backupPath).toContain(
      join(dirname(skillFilePath), ".agent-learning-backups"),
    );
  });

  it("allows specifying a custom backup root", async () => {
    const customRoot = join(testDir, "custom-backups");
    const backupPath = await backupSkillFile(skillFilePath, {
      backupRoot: customRoot,
    });
    expect(backupPath).toContain(customRoot);
  });

  it("retries once if backup directory creation races", async () => {
    const backupRoot = join(dirname(skillFilePath), ".agent-learning-backups");
    mkdirSync(backupRoot, { recursive: true });
    const backupPath = await backupSkillFile(skillFilePath);
    expect(existsSync(backupPath)).toBe(true);
  });
});

describe("appendEvidenceLog", () => {
  let logPath: string;

  beforeEach(() => {
    logPath = join(tmpdir(), "evidence.log");
  });

  afterEach(() => {
    rmSync(logPath, { force: true });
  });

  it("appends a single JSONL line", async () => {
    const entry: EvidenceEntry = {
      ts: new Date().toISOString(),
      action: "apply",
      proposalId: "test-proposal",
      skill: "test-skill",
      appliedEdits: 1,
      unmatchedEdits: [],
      backupPath: "/path/to/backup",
    };
    await appendEvidenceLog(logPath, entry);
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject(entry);
  });

  it("appends multiple lines", async () => {
    const entry1: EvidenceEntry = {
      ts: new Date().toISOString(),
      action: "apply",
      proposalId: "test-proposal",
      skill: "test-skill",
      appliedEdits: 1,
      unmatchedEdits: [],
      backupPath: "/path/to/backup1",
    };
    const entry2: EvidenceEntry = {
      ts: new Date().toISOString(),
      action: "reject",
      proposalId: "test-proposal",
      skill: "test-skill",
      detail: "no-op",
    };
    await appendEvidenceLog(logPath, entry1);
    await appendEvidenceLog(logPath, entry2);
    const content = readFileSync(logPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject(entry1);
    expect(JSON.parse(lines[1])).toMatchObject(entry2);
  });
});

describe("listBackups", () => {
  let testDir: string;
  let skillFilePath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "list-backups-test-"));
    skillFilePath = join(testDir, "test-skill.md");
    writeFileSync(skillFilePath, "original content", "utf8");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns an empty list when no backups exist", async () => {
    const backups = await listBackups(skillFilePath);
    expect(backups).toEqual([]);
  });

  it("returns backup files sorted descending by timestamp", async () => {
    const backupRoot = join(dirname(skillFilePath), ".agent-learning-backups");
    await mkdir(backupRoot, { recursive: true });

    const now = new Date();
    const earlier = new Date(now.getTime() - 10000);
    const later = now;

    const timestampEarlier =
      earlier.toISOString().replace(/[.:-]/g, "").slice(0, 15) + "Z";
    const timestampLater =
      later.toISOString().replace(/[.:-]/g, "").slice(0, 15) + "Z";

    const backupFileNameEarlier = `${timestampEarlier}-${basename(skillFilePath)}`;
    const backupFileNameLater = `${timestampLater}-${basename(skillFilePath)}`;

    await writeFile(join(backupRoot, backupFileNameEarlier), "earlier", "utf8");
    await writeFile(join(backupRoot, backupFileNameLater), "later", "utf8");

    const backups = await listBackups(skillFilePath);
    expect(backups).toHaveLength(2);
    expect(backups[0]).toEndWith(backupFileNameLater);
    expect(backups[1]).toEndWith(backupFileNameEarlier);
  });

  it("works with a custom backup root", async () => {
    const customRoot = join(testDir, "custom-backups");
    await mkdir(customRoot, { recursive: true });
    const backupFileName = "20260906T120000Z-test-skill.md";
    await writeFile(join(customRoot, backupFileName), "content", "utf8");

    const backups = await listBackups(skillFilePath, customRoot);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toEndWith(backupFileName);
  });
});

describe("applyProposal wiring with backup and evidence log", () => {
  let agentDir: string;
  let skillDir: string;
  let skillFilePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Skill file lives under the MODULE-LEVEL agent dir: canonicalSkillPath() resolves
    // against the cached getAgentDir() value, so per-test env changes are invisible to it.
    skillDir = join(MODULE_AGENT_DIR, "skills", "target-skill");
    mkdirSync(skillDir, { recursive: true });
    skillFilePath = join(skillDir, "SKILL.md");
    writeFileSync(skillFilePath, "# Target Skill\n\nExisting content.", "utf8");
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(skillDir, { recursive: true, force: true });
  });

  it("creates a backup and evidence log entry on apply", async () => {
    const proposal: SkillPatchProposal = {
      version: 1,
      id: "test-proposal-apply",
      status: "pending",
      partition: "project",
      project_id: undefined,
      target_skill: "target-skill",
      // explicit path: getAgentDir() is cached at module load (module-level env), so
      // the per-test agentDir env change below is invisible to it.
      target_path: skillFilePath,
      source_memory_id: "test-memory",
      source_memory_path: join(
        MODULE_AGENT_DIR,
        "agent-learning",
        "memory",
        "gotchas",
        "test-memory.json",
      ),
      memory_title: "Test Memory",
      memory_type: "gotcha",
      proposed_guidance: "This is the guidance to apply.",
      rationale: "Test rationale",
      verification: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await applyProposal(proposal);

    const updatedContent = readFileSync(skillFilePath, "utf8");
    expect(updatedContent).toContain("This is the guidance to apply.");
    expect(updatedContent).toContain("This is the guidance to apply.");

    const backupRoot = join(dirname(skillFilePath), ".agent-learning-backups");
    const backupFiles = readdirSync(backupRoot);
    expect(backupFiles).toHaveLength(1);
    const backupFilePath = join(backupRoot, backupFiles[0]);
    const backupContent = readFileSync(backupFilePath, "utf8");
    expect(backupContent).toBe("# Target Skill\n\nExisting content.");

    const logPath = join(
      dirname(skillFilePath),
      "agent-learning-evidence.jsonl",
    );
    const logContent = readFileSync(logPath, "utf8");
    const logLines = logContent.trim().split("\n");
    expect(logLines).toHaveLength(1);
    const logEntry = JSON.parse(logLines[0]) as EvidenceEntry;
    expect(logEntry.action).toBe("apply");
    expect(logEntry.proposalId).toBe(proposal.id);
    expect(logEntry.skill).toBe(proposal.target_skill);
    expect(logEntry.appliedEdits).toBe(1);
    expect(logEntry.unmatchedEdits).toEqual([]);
    expect(logEntry.backupPath).toBe(backupFilePath);
  });

  it("logs a reject entry and does not create a backup on no-op", async () => {
    const proposal1: SkillPatchProposal = {
      version: 1,
      id: "test-proposal-apply-first",
      status: "pending",
      partition: "project",
      project_id: undefined,
      target_skill: "target-skill",
      target_path: undefined, // let it find the skill path
      source_memory_id: "test-memory-1",
      source_memory_path: join(
        MODULE_AGENT_DIR,
        "agent-learning",
        "memory",
        "gotchas",
        "test-memory-1.json",
      ),
      memory_title: "Test Memory 1",
      memory_type: "gotcha",
      proposed_guidance: "This is the guidance to apply.",
      rationale: "Test rationale",
      verification: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await applyProposal(proposal1);

    const proposal2: SkillPatchProposal = {
      version: 1,
      id: "test-proposal-apply-second",
      status: "pending",
      partition: "project",
      project_id: undefined,
      target_skill: "target-skill",
      target_path: undefined, // let it find the skill path
      source_memory_id: "test-memory-2",
      source_memory_path: join(
        MODULE_AGENT_DIR,
        "agent-learning",
        "memory",
        "gotchas",
        "test-memory-2.json",
      ),
      memory_title: "Test Memory 2",
      memory_type: "gotcha",
      proposed_guidance: "This is the guidance to apply.",
      rationale: "Test rationale",
      verification: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await applyProposal(proposal2);

    const contentAfter = readFileSync(skillFilePath, "utf8");
    const guidanceLines = contentAfter
      .split("\n")
      .filter((line) => line.replace(/^[-*] /, "").trim() === "This is the guidance to apply.");
    expect(guidanceLines).toHaveLength(1);

    const backupRoot = join(dirname(skillFilePath), ".agent-learning-backups");
    const backupFiles = readdirSync(backupRoot);
    expect(backupFiles).toHaveLength(1);

    const logPath = join(
      dirname(skillFilePath),
      "agent-learning-evidence.jsonl",
    );
    const logContent = readFileSync(logPath, "utf8");
    const logLines = logContent.trim().split("\n");
    expect(logLines).toHaveLength(2);

    const firstLog = JSON.parse(logLines[0]) as EvidenceEntry;
    expect(firstLog.action).toBe("apply");
    expect(firstLog.proposalId).toBe(proposal1.id);

    const secondLog = JSON.parse(logLines[1]) as EvidenceEntry;
    expect(secondLog.action).toBe("reject");
    expect(secondLog.proposalId).toBe(proposal2.id);
    expect(secondLog.detail).toBe("no-op");
    expect(secondLog.backupPath).toBeUndefined();
  });
});
