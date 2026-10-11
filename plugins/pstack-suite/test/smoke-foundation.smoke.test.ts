import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkRepository,
  checkRequiredDependencies,
  checkDirtyTree,
  checkAuth,
  checkVcsBackend,
  runPreflight,
  preflightSafe,
  assertPreflightSafe,
  beginRun,
  addAction,
  finishRun,
  saveRun,
  loadRun,
  latestRun,
  runStoreDir,
} from "../src/run.js";
import { runProcessSync, runProcess, isToolAvailable } from "../src/runner.js";
import { parseGhChecks } from "../src/commands/ci.js";

// Gate: skip entire suite unless RUN_SMOKE=1
const runSmoke = process.env.RUN_SMOKE === "1";

// ===========================================================================
// Helpers
// ===========================================================================

function gitInit(dir: string): void {
  spawnSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.name", "SmokeTest"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["remote", "add", "origin", "https://github.com/test/repo.git"], { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# test", "utf-8");
  spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
}

const suite = describe;
suite("smoke: preflight foundation (RUN_SMOKE=1)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-smoke-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- AC2: Missing dependency (backlog absent → preflight block) ---
  (runSmoke ? it : it.skip)("missing dependency blocks preflight", () => {
    const gitDir = join(tmpDir, "no-deps");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const pf = checkRequiredDependencies(gitDir, ["nonexistent-tool-xyz"]);
    expect(pf.status).toBe("block");
    expect(pf.detail).toContain("nonexistent-tool-xyz");
  });

  // --- AC2: Auth failure with fake gh → block ---
  (runSmoke ? it : it.skip)("auth failure: fake gh exits 1 with auth error → block", () => {
    const originalPath = process.env.PATH;
    const tmpDirLocal = mkdtempSync(join(tmpdir(), "pstack-auth-fake-"));
    const fakeBinDir = join(tmpDirLocal, "fake-gh");
    mkdirSync(fakeBinDir);
    const fakeGh = join(fakeBinDir, "gh");
    writeFileSync(fakeGh, "#!/bin/sh\necho 'Please log in with your browser.' >&2\nexit 1", { mode: 0o755 });
    try {
      process.env.PATH = fakeBinDir + ":" + originalPath;
      const result = checkAuth(tmpDirLocal);
      expect(result.status).toBe("block");
      expect(result.detail!.toLowerCase()).toMatch(/log in|auth/);
    } finally {
      process.env.PATH = originalPath;
      rmSync(tmpDirLocal, { recursive: true, force: true });
    }
  });

  // --- AC2: Network failure with fake gh → block ---
  (runSmoke ? it : it.skip)("network failure: fake gh exits 1 with connection refused → block", () => {
    const originalPath = process.env.PATH;
    const tmpDirLocal = mkdtempSync(join(tmpdir(), "pstack-net-fake-"));
    const fakeBinDir = join(tmpDirLocal, "fake-gh");
    mkdirSync(fakeBinDir);
    const fakeGh = join(fakeBinDir, "gh");
    writeFileSync(fakeGh, "#!/bin/sh\necho 'error: Failed to connect to api.github.com: connection refused' >&2\nexit 1", { mode: 0o755 });
    try {
      process.env.PATH = fakeBinDir + ":" + originalPath;
      const result = checkAuth(tmpDirLocal);
      expect(result.status).toBe("block");
      expect(result.detail!.toLowerCase()).toMatch(/connection|connect|refused/);
    } finally {
      process.env.PATH = originalPath;
      rmSync(tmpDirLocal, { recursive: true, force: true });
    }
  });

  // --- AC2: Real gh auth pass when available ---
  (runSmoke ? it : it.skip)("auth pass: real gh when available", () => {
    if (!isToolAvailable("gh")) {
      return;
    }
    const gitDir = join(tmpDir, "auth-real");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const result = checkAuth(gitDir);
    expect(["pass", "warn"]).toContain(result.status);
  });

  // --- AC2: Dirty state → warn + detail ---
  (runSmoke ? it : it.skip)("dirty state warns in preflight", () => {
    const gitDir = join(tmpDir, "dirty");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    writeFileSync(join(gitDir, "modified.txt"), "dirty content", "utf-8");
    spawnSync("git", ["add", "modified.txt"], { cwd: gitDir, stdio: "pipe" });

    const result = checkDirtyTree(gitDir);
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("modified");
  });

  // --- AC2: Cancellation → cancelled:true ---
  (runSmoke ? it : it.skip)("cancellation: runProcess abort → cancelled:true", async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 50);

    const result = await runProcess(
      ["sleep", "30"],
      { signal: abort.signal, timeoutMs: 0 }
    );
    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.signal).toBe("SIGTERM");
  });

  // --- AC2: Pending checks classification + successful git path ---
  (runSmoke ? it : it.skip)("successful git path: runPreflight passes", async () => {
    const gitDir = join(tmpDir, "good-git");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const pf = await runPreflight(gitDir, {
      requestedAction: "verify",
      required: [],
    });

    const repoCheck = pf.checks.find((c) => c.name === "repository");
    expect(repoCheck?.status).toBe("pass");

    const vcsCheck = pf.checks.find((c) => c.name === "vcs_backend");
    expect(vcsCheck?.status).toBe("pass");

    const branchCheck = pf.checks.find((c) => c.name === "branch");
    expect(branchCheck?.status).toBe("pass");

    const remoteCheck = pf.checks.find((c) => c.name === "remote");
    expect(remoteCheck?.status).toBe("pass");

    const reqAction = pf.checks.find((c) => c.name === "requested_action");
    expect(reqAction?.status).toBe("pass");
  });
  // --- AC2: pending checks parse ---
  (runSmoke ? it : it.skip)("pending checks: parseGhChecks classifies in_progress as pending", () => {
    const checkJson = JSON.stringify([
      { name: "test", state: "in_progress", conclusion: null },
      { name: "build", state: "completed", conclusion: "success" },
    ]);
    const parsed = parseGhChecks(checkJson) as Array<{ name: string; state?: string; conclusion?: string | null }>;
    expect(parsed).toHaveLength(2);
    const testItem = parsed.find((p) => String(p.name) === "test");
    expect(testItem?.state).toBe("in_progress");
    const buildItem = parsed.find((p) => String(p.name) === "build");
    expect(buildItem?.conclusion).toBe("success");
  });

  // --- AC2: Non-repository blocks ---
  (runSmoke ? it : it.skip)("checkRepository blocks on non-repository", () => {
    const plainDir = join(tmpDir, "plain");
    mkdirSync(plainDir, { recursive: true });
    const result = checkRepository(plainDir);
    expect(result.status).toBe("block");
  });

  // --- AC2: PreflightSafe classification ---
  (runSmoke ? it : it.skip)("preflightSafe classification", () => {
    const blockPf = {
      checks: [{ name: "x", status: "block" as const }],
      overall: "block" as const,
      target: "/test",
      at: new Date().toISOString(),
    };
    expect(preflightSafe(blockPf)).toBe(false);
    expect(assertPreflightSafe(blockPf)).toContain("blocked");

    const warnPf = {
      checks: [{ name: "x", status: "warn" as const }],
      overall: "warn" as const,
      target: "/test",
      at: new Date().toISOString(),
    };
    expect(preflightSafe(warnPf)).toBe(true);
    expect(assertPreflightSafe(warnPf)).toBe(null);

    const passPf = {
      checks: [{ name: "x", status: "pass" as const }],
      overall: "pass" as const,
      target: "/test",
      at: new Date().toISOString(),
    };
    expect(preflightSafe(passPf)).toBe(true);
  });

  // ==========================================================================
  // AC3: Receipt proof — ship receipt serialized and loadable
  // ==========================================================================

  // --- AC3: saveRun + loadRun roundtrip ---
  (runSmoke ? it : it.skip)("AC3: saveRun writes JSON receipt loadable by loadRun", () => {
    const gitDir = join(tmpDir, "receipt-test");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const rec = beginRun({ playbook: "ship", phase: "preflight", target: "main" });
    const withAction = addAction(rec, "verify", "ok", "tsc passed");
    const finished = finishRun(withAction, "success");
    saveRun(finished, gitDir);

    const loaded = loadRun(gitDir, rec.runId);
    expect(loaded).toBeDefined();
    expect(loaded!.runId).toBe(rec.runId);
    expect(loaded!.status).toBe("success");
    expect(loaded!.actions).toHaveLength(1);
    expect(loaded!.actions[0]!.action).toBe("verify");
    expect(loaded!.actions[0]!.result).toBe("ok");
    expect(loaded!.actions[0]!.detail).toBe("tsc passed");
    expect(loaded!.finishedAt).toBeDefined();
  });

  // --- AC3: latestRun returns most recent receipt ---
  (runSmoke ? it : it.skip)("AC3: latestRun returns most recent receipt", () => {
    const gitDir = join(tmpDir, "latest-test");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    // Save two runs with slight delay
    const rec1 = beginRun({ playbook: "verify", phase: "preflight", target: "main" });
    saveRun(finishRun(rec1, "success"), gitDir);

    // Small delay to ensure different timestamps
    const start = Date.now();
    while (Date.now() - start < 50) {}

    const rec2 = beginRun({ playbook: "ship", phase: "preflight", target: "main" });
    saveRun(finishRun(addAction(rec2, "push", "ok", "pushed"), "success"), gitDir);

    const latest = latestRun(gitDir);
    expect(latest).toBeDefined();
    expect(latest!.runId).toBe(rec2.runId);
    expect(latest!.playbook).toBe("ship");
  });

  // --- AC3: runStoreDir creates .pstack/runs ---
  (runSmoke ? it : it.skip)("AC3: runStoreDir returns .pstack/runs path", () => {
    const gitDir = join(tmpDir, "store-dir");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const storeDir = runStoreDir(gitDir);
    expect(storeDir).toContain("pstack-runs");

    // After saveRun, directory exists and contains JSON
    const rec = beginRun({ playbook: "ship", phase: "preflight", target: "main" });
    saveRun(finishRun(rec, "success"), gitDir);

    const files = readdirSync(storeDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]!.endsWith(".json")).toBe(true);
  });

  // ==========================================================================
  // AC4: Headless parity confirmed
  // ==========================================================================

  // --- AC4: runProcess + runProcessSync both work (headless = no UI, just processes) ---
  (runSmoke ? it : it.skip)("AC4: runProcessSync executes and captures stdout/stderr", () => {
    const result = runProcessSync(["echo", "hello-headless"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello-headless");
  });

  // --- AC4: runProcess async also works ---
  (runSmoke ? it : it.skip)("AC4: runProcess async executes and captures output", async () => {
    const result = await runProcess(["echo", "async-headless"], { timeoutMs: 5000 });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("async-headless");
  });

  // --- AC4: preflight + receipt works in headless context (no UI deps) ---
  (runSmoke ? it : it.skip)("AC4: full headless preflight + receipt cycle", async () => {
    const gitDir = join(tmpDir, "headless-cycle");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    // Run preflight
    const pf = await runPreflight(gitDir, {
      requestedAction: "verify",
      required: [],
    });

    // Assert safe
    expect(preflightSafe(pf)).toBe(true);

    // Build receipt
    const rec = beginRun({ playbook: "verify", phase: "preflight", target: "main" });
    const withPf = { ...rec, preflight: pf };
    const withAction = addAction(withPf, "verify", "ok", `preflight: ${pf.overall}`);
    const finished = finishRun(withAction, "success");

    // Save and load
    saveRun(finished, gitDir);
    const loaded = loadRun(gitDir, rec.runId);

    expect(loaded).toBeDefined();
    expect(loaded!.status).toBe("success");
    expect(loaded!.preflight).toBeDefined();
    expect(loaded!.preflight!.checks.length).toBeGreaterThan(0);
  });

  // --- AC6: resolvedModel persisted in receipt ---
  (runSmoke ? it : it.skip)("AC6: resolvedModel persisted in receipt", () => {
    const gitDir = join(tmpDir, "resolved-model");
    mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);

    const rec = beginRun({
      playbook: "ship",
      phase: "selected",
      target: "main",
      resolvedModel: { role: "implementer", model: "gpt-4", source: "role" },
    });
    const finished = finishRun(rec, "success");
    saveRun(finished, gitDir);

    const loaded = loadRun(gitDir, rec.runId);
    expect(loaded).toBeDefined();
    expect(loaded!.resolvedModel).toEqual({
      role: "implementer",
      model: "gpt-4",
      source: "role",
    });
  });
});
