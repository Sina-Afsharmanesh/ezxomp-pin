import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

function mockCommandResult(exitCode = 0, stdout = "", stderr = "", ok = true, spawnError: any = null) {
  return {
    exitCode, signal: null, stdout, stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError, ok,
  };
}

// Mutable mock dispatchers
let runnerDispatch: (argv: string[]) => any = () => mockCommandResult();
let hasGhValue = true;
let hasBacklogMdValue = false;

vi.mock("../runner.js", () => ({
  runProcessSync: vi.fn((argv) => runnerDispatch(argv)),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));
vi.mock("../utils.js", () => ({
  hasGh: vi.fn(() => hasGhValue),
  hasBacklogMd: vi.fn(() => hasBacklogMdValue),
}));

describe("ci coverage — fail-closed", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-ci-cov-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    vi.clearAllMocks();
    runnerDispatch = () => mockCommandResult();
    hasGhValue = true;
    hasBacklogMdValue = false;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns unknown when gh not available (AC2)", async () => {
    hasGhValue = false;
    const { handleCi } = await import("./ci.js");
    await handleCi("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[1] === "error")).toBe(true);
  });

  it("returns all-pass when all checks success", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([
        { name: "ci", state: "completed", conclusion: "success" },
        { name: "lint", state: "completed", conclusion: "success" },
      ]));
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("all-pass");
    expect(result.failures).toHaveLength(0);
  });

  it("returns failure when checks have failures", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([
        { name: "ci", state: "completed", conclusion: "failure" },
      ]));
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("failure");
    expect(result.failures).toHaveLength(1);
  });

  it("non-zero gh exit => unknown, NOT all-pass (AC1, BUGFIX)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "no active PR", false);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).not.toBe("all-pass");
    expect(result.status).toBe("unknown");
    expect(result.failures).toHaveLength(0);
  });

  it("no active PR detected from gh stderr", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "no active pull request", false);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
    expect(result.error).toContain("no active PR");
  });

  it("gh auth failure => unknown", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "not authenticated", false);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
    expect(result.error).toContain("auth:");
  });

  it("gh network error => unknown", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "Connection refused", false);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
    expect(result.error).toContain("network:");
  });

  it("spawnError => unknown", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "gh: not found", false, new Error("spawnError"));
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
  });

  it("pending checks => pending status", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([
        { name: "ci", state: "completed", conclusion: "success" },
        { name: "test", state: "in_progress" },
      ]));
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("pending");
  });

  it("empty output + exit 0 => unknown (AC1, BUGFIX)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, "", "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).not.toBe("all-pass");
    expect(result.status).toBe("unknown");
  });

  it("malformed JSON => unknown", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, "not json", "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
  });

  it("--fix creates tasks for failures", async () => {
    hasBacklogMdValue = true;
    runnerDispatch = (argv) => {
      if (argv[0] === "backlog") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([
        { name: "ci", state: "completed", conclusion: "failure" },
      ]));
    };
    const { handleCi } = await import("./ci.js");
    await handleCi("--fix", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("failure"))).toBe(true);
  });

  it("--watch with gh ok => all checks passed notification", async () => {
    const mockRunProcess = vi.fn().mockResolvedValue(mockCommandResult(0, "all passed", "", true));
    const runnerMod = await import("../runner.js");
    vi.spyOn(runnerMod, "runProcess").mockResolvedValue(mockCommandResult(0, "all passed", "", true));
    const { handleCi } = await import("./ci.js");
    await handleCi("--watch", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(true);
  });

  it("--watch non-SIGINT exit => error notification (AC1, BUGFIX)", async () => {
    const runnerMod = await import("../runner.js");
    vi.spyOn(runnerMod, "runProcess").mockResolvedValue(mockCommandResult(1, "", "error", false));
    const { handleCi } = await import("./ci.js");
    await handleCi("--watch", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[1] === "error")).toBe(true);
    expect(calls.some((c: any[]) => c[0].includes("could not determine"))).toBe(true);
  });

  it("--watch exits cleanly on SIGINT (no error notification)", async () => {
    const runnerMod = await import("../runner.js");
    vi.spyOn(runnerMod, "runProcess").mockResolvedValue(mockCommandResult(130, "", "", false));
    const { handleCi } = await import("./ci.js");
    await handleCi("--watch", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[1] === "error")).toBe(false);
  });

  // --- Judge Finding #1: parseGhChecks rejects non-JSON-array output ---
  it("single object JSON from gh => unknown (Judge F1: JSON array only)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify({ name: "ci", state: "completed", conclusion: "success" }), "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
  });

  it("NDJSON from gh => unknown (Judge F1: no NDJSON fallback)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, '{"name":"ci","state":"completed","conclusion":"success"}\n{"name":"lint","state":"completed","conclusion":"success"}', "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
  });

  // --- Judge Finding #2: completed without conclusion => unknown ---
  it("completed state without conclusion => not all-pass (Judge F2)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([{ name: "ci", state: "completed" }]), "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).not.toBe("all-pass");
  });

  // --- Judge Finding #3: CI gh-unavailable creates receipt ---
  it("gh-unavailable creates run receipt (Judge F3)", async () => {
    hasGhValue = false;
    const { handleCi } = await import("./ci.js");
    await handleCi("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.actions).toBeDefined();
    expect(runData.actions.length).toBeGreaterThanOrEqual(1);
    expect(runData.status).toBe("failed");
  });

  // --- Judge Finding #1b: [null] member validation ---
  it("[null] array from gh => unknown (Judge F1b: null member validation)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([null]), "", true);
    };
    const { runChecks } = await import("./ci.js");
    const result = await runChecks(tmpDir, ctx);
    expect(result.status).toBe("unknown");
  });

  // --- Judge Finding #4: pending/unknown receipt must not be green ---
  it("pending CI receipt has blocked action result + unknown run status (Judge F4)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(0, JSON.stringify([
        { name: "ci", state: "completed", conclusion: "success" },
        { name: "test", state: "in_progress" },
      ]));
    };
    const { handleCi } = await import("./ci.js");
    await handleCi("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("unknown");
    expect(runData.actions.some((a: any) => a.result === "blocked")).toBe(true);
  });

  it("unknown CI receipt has blocked action result + unknown run status (Judge F4)", async () => {
    runnerDispatch = (argv) => {
      return mockCommandResult(1, "", "exit error", false);
    };
    const { handleCi } = await import("./ci.js");
    await handleCi("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("unknown");
    expect(runData.actions.some((a: any) => a.result === "blocked")).toBe(true);
  });
});
