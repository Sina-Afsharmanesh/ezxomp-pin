import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

function mockCommandResult(exitCode = 0, stdout = "", stderr = "", ok = true, spawnError = null) {
  return {
    exitCode, signal: null, stdout, stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError, ok,
  };
}

// Mutable mock dispatchers — changed per-test, shared across module imports
let runnerDispatch: (argv: string[]) => any = () => mockCommandResult();
let hasGhValue = true;

vi.mock("../runner.js", () => ({
  runProcessSync: vi.fn((argv) => runnerDispatch(argv)),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));
vi.mock("../utils.js", () => ({
  hasGh: vi.fn(() => hasGhValue),
  hasBacklogMd: vi.fn(() => false),
}));

describe("verify coverage — fail-closed", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-verify-cov-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    vi.clearAllMocks();
    runnerDispatch = () => mockCommandResult();
    hasGhValue = true;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports PASSED when tsc passes (AC3)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([{ name: "ci", state: "completed", conclusion: "success" }]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack verify: all checks passed ✓", "info");
  });

  it("reports FAILED when tsc fails (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(2, "", "error TS6059: File not found", false);
      return mockCommandResult(0, JSON.stringify([{ name: "ci", conclusion: "success" }]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    const errorCall = calls.find((c: any[]) => c[1] === "error");
    expect(errorCall).toBeDefined();
    expect(errorCall[0]).toContain("FAILED");
    expect(errorCall[0]).toContain("tsc");
  });

  it("tsc fail + provider unknown => overall fail (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(2, "", "tsc error", false);
      return mockCommandResult(1, "", "no active PR", false);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("FAILED"))).toBe(true);
  });

  it("tsc pass + provider skipped (no gh) => pass overall (AC3)", async () => {
    hasGhValue = false;
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, "", "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack verify: all checks passed ✓", "info");
  });
  it("skipped provider-check yields success receipt (receipt status mapping)", async () => {
    hasGhValue = false;
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, "", "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("success");
    const verifyAction = runData.actions.find((a: any) => a.action === "verify");
    expect(verifyAction).toBeDefined();
    expect(verifyAction.result).toBe("ok");
  });

  it("tsc pass + provider unknown (gh error) => unknown overall, NOT green (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(1, "", "exit 1", false);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
    expect(calls.some((c: any[]) => c[0].includes("could not determine"))).toBe(true);
  });

  it("provider-check with gh auth failure => unknown detail auth: (AC2)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(1, "", "not authenticated", false);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("auth:"))).toBe(true);
  });

  it("provider-check with network error => unknown detail network: (AC2)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(1, "", "Connection refused", false);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("network:"))).toBe(true);
  });

  it("provider-check with pending checks => pending overall (AC3)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([
        { name: "lint", state: "completed", conclusion: "success" },
        { name: "test", state: "in_progress" },
      ]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("pending"))).toBe(true);
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
  });

  it("provider-check with failure => fail overall (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([
        { name: "build", state: "completed", conclusion: "failure" },
      ]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("FAILED"))).toBe(true);
  });

  it("empty gh output with exit 0 => unknown (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, "", "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
    expect(calls.some((c: any[]) => c[0].includes("could not determine"))).toBe(true);
  });

  it("malformed JSON from gh => unknown (AC1)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, "not json at all", "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
    expect(calls.some((c: any[]) => c[0].includes("could not determine"))).toBe(true);
  });

  it("gh pr checks --json with expanded fields (AC4)", async () => {
    const spyFn = vi.fn((argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([{ name: "ci", state: "completed", conclusion: "success", link: "https://example.com", startedAt: "2024-01-01" }]));
    });
    runnerDispatch = spyFn;
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack verify: all checks passed ✓", "info");
  });

  // --- Judge Finding #1: parseGhChecksOutput must reject non-JSON-array output ---
  it("single object JSON from gh => unknown (Judge F1: JSON array contract)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      // gh only emits arrays on --json; a single object is invalid
      return mockCommandResult(0, JSON.stringify({ name: "ci", state: "completed", conclusion: "success" }), "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    // Must NOT be green — malformed provider output stays unknown
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
  });

  it("NDJSON from gh => unknown (Judge F1: no NDJSON fallback)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      // Line-delimited JSON was a fallback that hid parse errors
      return mockCommandResult(0, '{"name":"ci","state":"completed","conclusion":"success"}\n{"name":"lint","state":"completed","conclusion":"success"}', "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
  });

  // --- Judge Finding #2: completed without conclusion => unknown, not pass ---
  it("completed state without conclusion => unknown (Judge F2)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([{ name: "ci", state: "completed" }]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
  });

  it("classifyGhCheck: completed w/o conclusion is unknown (Judge F2)", async () => {
    const { classifyGhCheck } = await import("./verify.js");
    expect(classifyGhCheck({ state: "completed" })).toBe("unknown");
    expect(classifyGhCheck({ state: "completed", conclusion: "success" })).toBe("pass");
    expect(classifyGhCheck({ state: "completed", conclusion: "failure" })).toBe("fail");
  });

  // --- Judge Finding #1b: [null] member validation ---
  it("[null] array from gh => unknown (Judge F1b: null member validation)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([null]), "", true);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.some((c: any[]) => c[0].includes("all checks passed"))).toBe(false);
  });

  // --- Judge Finding #4: pending/unknown receipt must not be green ---
  it("pending receipt has blocked action result + unknown run status (Judge F4)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([{ name: "test", state: "in_progress" }]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("unknown");
    expect(runData.actions.some((a: any) => a.result === "blocked")).toBe(true);
  });

  it("unknown receipt has blocked action result + unknown run status (Judge F4)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(1, "", "exit error", false);
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("unknown");
    expect(runData.actions.some((a: any) => a.result === "blocked")).toBe(true);
  });

  it("pass receipt has ok action result + success run status (Judge F4)", async () => {
    runnerDispatch = (argv) => {
      if (argv[0] === "tsc") return mockCommandResult(0, "", "", true);
      return mockCommandResult(0, JSON.stringify([{ name: "ci", state: "completed", conclusion: "success" }]));
    };
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    const { readdirSync, readFileSync } = require("node:fs");
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const runData = JSON.parse(readFileSync(join(runDir, files[0]), "utf-8"));
    expect(runData.status).toBe("success");
    expect(runData.actions.some((a: any) => a.result === "ok")).toBe(true);
  });
});
