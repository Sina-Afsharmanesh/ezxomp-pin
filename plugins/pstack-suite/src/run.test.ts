import { expect, test, describe, vi, beforeEach, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as childProcess from "node:child_process";
import { spawnSync } from "node:child_process";
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

// Mock runner before importing run module
vi.mock("./runner.js", () => ({
  isToolAvailable: vi.fn(),
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
}));

import {
  createRunId,
  beginRun,
  addAction,
  finishRun,
  runStoreDir,
  saveRun,
  loadRun,
  latestRun,
  truncateTail,
  preflightSafe,
  assertPreflightSafe,
  checkRepository,
  checkVcsBackend,
  checkBranch,
  checkDirtyTree,
  checkRemote,
  checkAuth,
  checkRequiredDependencies,
  checkRequestedAction,
  runPreflight,
} from "./run.js";
import { isToolAvailable } from "./runner.js";

// ===========================================================================
// Utility
// ===========================================================================

function gitInit(dir: string) {
  spawnSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["remote", "add", "origin", "https://github.com/test/repo.git"], { cwd: dir, stdio: "pipe" });
}

function hasGit(): boolean {
  const r = spawnSync("which", ["git"], { stdio: "ignore", encoding: "utf-8" });
  return r.status === 0;
}

function mockResult(exitCode = 0, stdout = "", stderr = "", ok = true) {
  return {
    exitCode, signal: null, stdout, stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError: null, ok,
  };
}

// ===========================================================================
// Run ID & Record lifecycle
// ===========================================================================

describe("createRunId", () => {
  test("returns a stable UUID format", () => {
    const id = createRunId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set([createRunId(), createRunId(), createRunId(), createRunId(), createRunId()]);
    expect(ids.size).toBe(5);
  });
});

describe("beginRun", () => {
  test("sets all required fields", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/project" });
    expect(rec.playbook).toBe("ship");
    expect(rec.phase).toBe("verify");
    expect(rec.target).toBe("/project");
    expect(rec.status).toBe("running");
    expect(rec.actions).toEqual([]);
    expect(rec.runId).toBeDefined();
    expect(rec.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rec.finishedAt).toBeUndefined();
    expect(rec.lastConfirmedAction).toBeUndefined();
  });

  test("accepts custom runId", () => {
    const rec = beginRun({ playbook: "pr", phase: "branch", target: "/p", runId: "custom-123" });
    expect(rec.runId).toBe("custom-123");
  });
});

describe("addAction", () => {
  test("appends action immutably", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
    const rec2 = addAction(rec, "verify", "ok");
    expect(rec.actions.length).toBe(0);
    expect(rec2.actions.length).toBe(1);
    expect(rec2.actions[0]).toEqual({ action: "verify", at: expect.any(String), result: "ok" });
  });

  test("updates lastConfirmedAction on ok", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
    const rec2 = addAction(rec, "verify", "ok");
    expect(rec2.lastConfirmedAction).toBe("verify");
    const rec3 = addAction(rec2, "push", "ok");
    expect(rec3.lastConfirmedAction).toBe("push");
  });

  test("does not update lastConfirmedAction on failure", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
    const rec2 = addAction(rec, "verify", "ok");
    expect(rec2.lastConfirmedAction).toBe("verify");
    const rec3 = addAction(rec2, "push", "failed", "network error");
    expect(rec3.lastConfirmedAction).toBe("verify");
    expect(rec3.actions[1]!.result).toBe("failed");
    expect(rec3.actions[1]!.detail).toBe("network error");
  });

  test("preserves original record", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
    const rec2 = addAction(rec, "step", "ok");
    expect(rec.actions).not.toBe(rec2.actions);
    expect(rec.status).toBe("running");
    expect(rec2.status).toBe("running");
  });
});

describe("finishRun", () => {
  test("sets final status and timestamp for success", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
    const finished = finishRun(rec, "success");
    expect(finished.status).toBe("success");
    expect(finished.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("sets final status for failed", () => {
    const rec = beginRun({ playbook: "pr", phase: "push", target: "/p" });
    const finished = finishRun(rec, "failed");
    expect(finished.status).toBe("failed");
    expect(finished.finishedAt).toBeDefined();
  });

  test("supports all terminal statuses", () => {
    for (const s of ["success", "failed", "cancelled", "timed_out", "unknown"]) {
      const rec = beginRun({ playbook: "ship", phase: "verify", target: "/p" });
      const finished = finishRun(rec, s as "success" | "failed" | "cancelled" | "timed_out" | "unknown");
      expect(finished.status).toBe(s);
    }
  });
});

// ===========================================================================
// Run store (save/load/latest)
// ===========================================================================

describe("run store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "pstack-run-"));
  });

  afterAll(() => {
    if (tmpDir) try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test("runStoreDir returns .omp/pstack-runs", () => {
    expect(runStoreDir("/project")).toBe(path.join("/project", ".omp", "pstack-runs"));
  });

  test("saveRun writes JSON file", () => {
    const rec = finishRun(beginRun({ playbook: "ship", phase: "verify", target: tmpDir }), "success");
    saveRun(rec, tmpDir);
    const storePath = runStoreDir(tmpDir);
    expect(fs.existsSync(storePath)).toBe(true);
    const file = path.join(storePath, rec.runId + ".json");
    expect(fs.existsSync(file)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(loaded.runId).toBe(rec.runId);
    expect(loaded.status).toBe("success");
  });

  test("loadRun reads back a saved record", () => {
    const rec = finishRun(beginRun({ playbook: "pr", phase: "branch", target: tmpDir }), "success");
    saveRun(rec, tmpDir);
    const loaded = loadRun(tmpDir, rec.runId);
    expect(loaded).toBeDefined();
    expect(loaded!.runId).toBe(rec.runId);
    expect(loaded!.playbook).toBe("pr");
    expect(loaded!.status).toBe("success");
  });

  test("loadRun returns undefined for missing runId", () => {
    const loaded = loadRun(tmpDir, "nonexistent-id");
    expect(loaded).toBeUndefined();
  });

  test("latestRun returns most recently finished record", async () => {
    const rec1 = finishRun(
      beginRun({ playbook: "ship", phase: "verify", target: tmpDir, runId: "run-1" }),
      "success",
    );
    saveRun(rec1, tmpDir);

    // Delay so rec2 gets a later finishedAt timestamp
    await new Promise((r) => setTimeout(r, 11));

    const rec2 = finishRun(
      beginRun({ playbook: "pr", phase: "branch", target: tmpDir, runId: "run-2" }),
      "failed",
    );
    saveRun(rec2, tmpDir);

    const latest = latestRun(tmpDir);
    expect(latest).toBeDefined();
    // rec2 has later finishedAt
    expect(latest!.runId).toBe("run-2");
  });

  test("latestRun returns undefined for empty store", () => {
    const latest = latestRun(tmpDir);
    expect(latest).toBeUndefined();
  });

  test("save/load round-trip preserves all fields", () => {
    const rec = beginRun({ playbook: "ship", phase: "verify", target: tmpDir });
    const rec2 = addAction(rec, "verify", "ok", "passed");
    const rec3 = addAction(rec2, "push", "failed", "network");
    const finished = finishRun(rec3, "failed");
    saveRun(finished, tmpDir);
    const loaded = loadRun(tmpDir, finished.runId);
    expect(loaded).toEqual(finished);
  });
});

// ===========================================================================
// truncateTail
// ===========================================================================

describe("truncateTail", () => {
  test("returns text unchanged when within limit", () => {
    const short = "hello";
    expect(truncateTail(short, 100)).toBe(short);
  });

  test("truncates and appends suffix when over limit", () => {
    const long = "a".repeat(2000);
    const result = truncateTail(long, 500);
    expect(result).toContain("… (truncated)");
    // suffix "\u2026 (truncated) " = 14 chars prepended to tail of 500 = 514
  });

  test("uses default max of 1000", () => {
    const long = "x".repeat(2000);
    const result = truncateTail(long);
    expect(result).toContain("… (truncated)");
    // 14 chars prefix + 1000 tail = 1014
  });

  test("keeps tail portion of text", () => {
    const text = "prefix-" + "x".repeat(5000);
    const result = truncateTail(text, 1000);
    expect(result.endsWith("x".repeat(1000))).toBe(true); // tail is last maxChars chars
  });
});

// ===========================================================================
// preflightSafe / assertPreflightSafe
// ===========================================================================

describe("preflightSafe", () => {
  test("returns true for pass", () => {
    expect(preflightSafe({ checks: [], overall: "pass", target: "/p", at: "2025-01-01T00:00:00Z" })).toBe(true);
  });

  test("returns true for warn", () => {
    expect(preflightSafe({ checks: [], overall: "warn", target: "/p", at: "2025-01-01T00:00:00Z" })).toBe(true);
  });

  test("returns false for block", () => {
    expect(preflightSafe({ checks: [], overall: "block", target: "/p", at: "2025-01-01T00:00:00Z" })).toBe(false);
  });

  test("returns false for unknown", () => {
    expect(preflightSafe({ checks: [], overall: "unknown", target: "/p", at: "2025-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("assertPreflightSafe", () => {
  test("returns null when pass", () => {
    const pf = { checks: [], overall: "pass" as const, target: "/p", at: "2025-01-01T00:00:00Z" };
    expect(assertPreflightSafe(pf)).toBeNull();
  });

  test("returns null when warn", () => {
    const pf = { checks: [], overall: "warn" as const, target: "/p", at: "2025-01-01T00:00:00Z" };
    expect(assertPreflightSafe(pf)).toBeNull();
  });

  test("returns message when block", () => {
    const pf = {
      checks: [{ name: "auth", status: "block" as const, detail: "not authenticated" }],
      overall: "block" as const,
      target: "/p",
      at: "2025-01-01T00:00:00Z",
    };
    const msg = assertPreflightSafe(pf);
    expect(msg).not.toBeNull();
    expect(msg!).toContain("auth");
  });

  test("returns message when unknown", () => {
    const pf = { checks: [], overall: "unknown" as const, target: "/p", at: "2025-01-01T00:00:00Z" };
    const msg = assertPreflightSafe(pf);
    expect(msg).not.toBeNull();
    expect(msg!).toContain("unknown");
  });
});

// ===========================================================================
// Per-check helpers — individual unit tests
// ===========================================================================

describe("checkRepository", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), "pstack-repo-")); });
  afterAll(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  test("blocks when no .git", () => {
    const result = checkRepository(tmpDir);
    expect(result.status).toBe("block");
  });

  test("passes with .git directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    const result = checkRepository(tmpDir);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("git");
  });
});

describe("checkVcsBackend", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), "pstack-vcs-")); });
  afterAll(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  test("blocks with no VCS", () => {
    expect(checkVcsBackend(tmpDir).status).toBe("block");
  });

  test("detects git backend", () => {
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    const result = checkVcsBackend(tmpDir);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("git");
  });
});

describe("checkBranch (real git)", () => {
  test.skipIf(!hasGit)("passes on a clean git repo on main", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-branch-"));
    try {
      gitInit(dir);
      const result = checkBranch(dir);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("main");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test.skipIf(!hasGit)("blocks on detached HEAD", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-detached-"));
    try {
      gitInit(dir);
      // Create initial commit to detach from
      writeFileSync(path.join(dir, "README.md"), "# test");
      spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
      // Detach
      spawnSync("git", ["checkout", "--detach"], { cwd: dir, stdio: "pipe" });
      const result = checkBranch(dir);
      expect(result.status).toBe("block");
      expect(result.detail).toContain("detached");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("checkDirtyTree (real git)", () => {
  test.skipIf(!hasGit)("passes on clean repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-clean-"));
    try {
      gitInit(dir);
      writeFileSync(path.join(dir, "README.md"), "# test");
      spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
      const result = checkDirtyTree(dir);
      expect(result.status).toBe("pass");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test.skipIf(!hasGit)("warns when files are modified", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-dirty-"));
    try {
      gitInit(dir);
      writeFileSync(path.join(dir, "file.txt"), "content");
      spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
      // Modify a file
      writeFileSync(path.join(dir, "file.txt"), "modified content");
      const result = checkDirtyTree(dir);
      expect(result.status).toBe("warn");
      expect(result.detail).toContain("modified");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("checkRemote (real git)", () => {
  test.skipIf(!hasGit)("passes when remote configured", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-remote-"));
    try {
      gitInit(dir);
      const result = checkRemote(dir);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("origin");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test.skipIf(!hasGit)("warns with no remotes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-no-remote-"));
    try {
      spawnSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["config", "user.email", "t@t.com"], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["config", "user.name", "T"], { cwd: dir, stdio: "pipe" });
      const result = checkRemote(dir);
      expect(result.status).toBe("warn");
      expect(result.detail).toContain("No remotes");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("checkAuth", () => {
  test("returns unknown when gh not available", () => {
    vi.mocked(isToolAvailable).mockReturnValue(false);
    const result = checkAuth("/any/path");
    expect(result.status).toBe("unknown");
    expect(result.detail).toContain("gh CLI not available");
  });

  test("returns block when gh auth status fails", () => {
    vi.mocked(isToolAvailable).mockReturnValue(true);
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 1, signal: null, output: [], pid: 1,
      stdout: "", stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);
    const result = checkAuth("/tmp");
    expect(result.status).toBe("block");
    expect(result.detail).toContain("not authenticated");
    vi.mocked(childProcess.spawnSync).mockClear();
  });

  test("returns warn when auth ok but API fails", () => {
    vi.mocked(isToolAvailable).mockReturnValue(true);
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 0, signal: null, output: [], pid: 1,
      stdout: "ok", stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 1, signal: null, output: [], pid: 1,
      stdout: "", stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);
    const result = checkAuth("/tmp");
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("API call failed");
    vi.mocked(childProcess.spawnSync).mockClear();
  });

  test("returns pass when gh auth and api succeed", () => {
    vi.mocked(isToolAvailable).mockReturnValue(true);
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 0, signal: null, output: [], pid: 1,
      stdout: "ok", stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 0, signal: null, output: [], pid: 1,
      stdout: '{"login":"octocat"}', stderr: "",
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);
    const result = checkAuth("/tmp");
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("octocat");
    vi.mocked(childProcess.spawnSync).mockClear();
  });

});

describe("checkRequiredDependencies", () => {
  test("blocks when required tools are missing", () => {
    vi.mocked(isToolAvailable).mockReturnValue(false);
    const result = checkRequiredDependencies("/p", ["foo", "bar"]);
    expect(result.status).toBe("block");
    expect(result.detail).toContain("foo");
    expect(result.detail).toContain("bar");
  });

  test("passes when all required tools are available", () => {
    vi.mocked(isToolAvailable).mockReturnValue(true);
    const result = checkRequiredDependencies("/p", ["gh", "git"]);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("2");
  });

  test("passes with no required tools", () => {
    vi.mocked(isToolAvailable).mockReturnValue(false);
    const result = checkRequiredDependencies("/p", []);
    expect(result.status).toBe("pass");
  });
});

describe("checkRequestedAction", () => {
  test("records requested action as pass with detail", () => {
    const result = checkRequestedAction("/p", "ship --verify");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("ship --verify");
  });
});

// ===========================================================================
// runPreflight integration (real git tmp dirs)
// ===========================================================================

describe("runPreflight", () => {
  test.skipIf(!hasGit)("reports pass for clean repo with remote", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-pf-"));
    try {
      gitInit(dir);
      writeFileSync(path.join(dir, "README.md"), "# test");
      spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });

      vi.mocked(isToolAvailable).mockReturnValue(false); // gh unavailable -> unknown

      const pf = await runPreflight(dir, { requestedAction: "ship" });
      expect(pf.overall).not.toBe("block");
      expect(pf.checks.some((c) => c.name === "repository")).toBe(true);
      expect(pf.checks.some((c) => c.name === "requested_action")).toBe(true);
      expect(pf.target).toBe(dir);
      expect(pf.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test.skipIf(!hasGit)("warns on dirty tree", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pstack-dirty-pf-"));
    try {
      gitInit(dir);
      writeFileSync(path.join(dir, "f.txt"), "a");
      spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
      writeFileSync(path.join(dir, "f.txt"), "modified");

      vi.mocked(isToolAvailable).mockReturnValue(false);
      const pf = await runPreflight(dir, { requestedAction: "pr" });
      const dirtyCheck = pf.checks.find((c) => c.name === "dirty_tree");
      expect(dirtyCheck?.status).toBe("warn");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("missing required tool blocks", async () => {
    vi.mocked(isToolAvailable).mockReturnValue(false);
    const pf = await runPreflight("/fake/path", {
      requestedAction: "ship",
      required: ["nonexistent-tool-xyz"],
    });
    expect(pf.overall).toBe("block");
    const depCheck = pf.checks.find((c) => c.name === "dependencies");
    expect(depCheck?.status).toBe("block");
  });
});

// ===========================================================================
// Ship + PR receipt integration tests (mocked)
// ===========================================================================

describe("ship receipt integration (mocked)", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), "pstack-ship-int-")); });
  afterAll(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  test("beginRun + addAction + finishRun + saveRun round-trip for ship", () => {
    const run = beginRun({ playbook: "ship", phase: "verify", target: tmpDir });
    expect(run.status).toBe("running");

    const run2 = addAction(run, "verify", "ok", "tsc passed");
    expect(run2.actions.length).toBe(1);
    expect(run2.lastConfirmedAction).toBe("verify");

    const run3 = addAction(run2, "push", "ok", "git push");
    expect(run3.actions.length).toBe(2);
    expect(run3.lastConfirmedAction).toBe("push");

    const finished = finishRun(run3, "success");
    expect(finished.status).toBe("success");
    expect(finished.finishedAt).toBeDefined();

    saveRun(finished, tmpDir);
    const loaded = loadRun(tmpDir, finished.runId);
    expect(loaded).toEqual(finished);
  });

  test("failed ship preserves lastConfirmedAction", () => {
    const run = beginRun({ playbook: "ship", phase: "verify", target: tmpDir });
    const run2 = addAction(run, "verify", "ok");
    const run3 = addAction(run2, "push", "failed", "push rejected");
    const finished = finishRun(run3, "failed");
    expect(finished.lastConfirmedAction).toBe("verify");
    expect(finished.status).toBe("failed");
  });
});

describe("pr receipt integration (mocked)", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), "pstack-pr-int-")); });
  afterAll(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  test("pr playbook tracks branch, push, pr phases", () => {
    const run = beginRun({ playbook: "pr", phase: "branch", target: tmpDir });
    const run2 = addAction(run, "branch", "ok");
    const run3 = addAction(run2, "push", "ok");
    const run4 = addAction(run3, "pr", "ok");
    const finished = finishRun(run4, "success");

    saveRun(finished, tmpDir);
    const loaded = loadRun(tmpDir, finished.runId);
    expect(loaded).toBeDefined();
    expect(loaded!.actions.length).toBe(3);
    expect(loaded!.lastConfirmedAction).toBe("pr");
  });

  test("resumed run identifies last confirmed action", () => {
    const run = beginRun({ playbook: "pr", phase: "branch", target: tmpDir, runId: "pr-001" });
    const run2 = addAction(run, "branch", "ok");
    const run3 = addAction(run2, "push", "failed", "network error");
    const finished = finishRun(run3, "failed");
    saveRun(finished, tmpDir);

    // Simulate retry — load and check lastConfirmedAction
    const loaded = loadRun(tmpDir, "pr-001");
    expect(loaded).toBeDefined();
    expect(loaded!.lastConfirmedAction).toBe("branch");
    expect(loaded!.status).toBe("failed");

    // New run with same runId — branch is already confirmed
    const retry = beginRun({ playbook: "pr", phase: "push", target: tmpDir, runId: "pr-001" });
    const retry2 = addAction(retry, "push", "ok");
    const retryFinished = finishRun(retry2, "success");
    expect(retryFinished.lastConfirmedAction).toBe("push");
  });
});
