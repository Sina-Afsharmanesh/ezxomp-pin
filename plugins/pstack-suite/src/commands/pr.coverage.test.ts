import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach, afterEach } from "vitest";

const mockRunProcessSync = vi.fn();

vi.mock("../runner.js", () => ({
  runProcessSync: function (...args: any[]) { return mockRunProcessSync(...args); },
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(() => true),
}));

const mockHasGh = vi.fn();

vi.mock("../utils.js", () => ({
  hasGh: function (...args: any[]) { return mockHasGh(...args); },
  hasBacklogMd: vi.fn(),
  writeBacklogMd: vi.fn(),
}));

const mockBeginRun = vi.fn();
const mockAddAction = vi.fn((...a: any[]) => {
  const [rec, action, result, detail] = a;
  return { ...rec, actions: [...(rec?.actions || []), { action, result, detail }] };
});
const mockFinishRun = vi.fn((...a: any[]) => {
  const [rec, status] = a;
  return { ...rec, status, finishedAt: "2026-01-01T00:00:00Z" };
});
const mockSaveRun = vi.fn();
const mockRunPreflight = vi.fn();
const mockPreflightSafe = vi.fn((...a: any[]) => true);
const mockAssertPreflightSafe = vi.fn((...a: any[]): string | null => null);

vi.mock("../run.js", () => ({
  beginRun: function (...args: any[]) { return mockBeginRun(...args); },
  addAction: function (...args: any[]) { return mockAddAction(...args); },
  finishRun: function (...args: any[]) { return mockFinishRun(...args); },
  saveRun: function (...args: any[]) { return mockSaveRun(...args); },
  runPreflight: function (...args: any[]) { return mockRunPreflight(...args); },
  preflightSafe: function (...args: any[]) { return mockPreflightSafe(...args); },
  assertPreflightSafe: function (...args: any[]) { return mockAssertPreflightSafe(...args); },
  emitPreflight: function (...args: any[]) { return mockEmitPreflight(...args); },
}));

const mockEmitPreflight = vi.fn();
const mockVerifyPrCreated = vi.fn();
const mockParseMergeVerification = vi.fn();

const mockSlugify = vi.fn((...a: any[]) => { const s: string = a[0]; return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
const mockConfirmPhase = vi.fn().mockResolvedValue(true);

vi.mock("../ship-flow.js", () => ({
  verifyPrCreated: function (...args: any[]) { return mockVerifyPrCreated(...args); },
  parseMergeVerification: function (...args: any[]) { return mockParseMergeVerification(...args); },
  findExistingPr: vi.fn(),
  createPr: vi.fn(),
  slugify: function (...args: any[]) { return mockSlugify(...args); },
  confirmPhase: function (...args: any[]) { return mockConfirmPhase(...args); },
}));

function mockResult(exitCode = 0, stdout = "", stderr = "", ok = exitCode === 0) {
  return {
    exitCode, signal: null, stdout, stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError: null, ok,
  };
}

const defaultPreflight = {
  checks: [{ name: "gh", status: "pass" as const }],
  overall: "pass" as const,
  target: "/project",
  at: "2026-01-01T00:00:00Z",
};

const mockCtx = {
  cwd: "/project",
  ui: { notify: vi.fn() },
  hasUI: true,
} as unknown as ExtensionCommandContext;

const mockRun = {
  runId: "test-run-pr",
  playbook: "pr",
  phase: "preflight",
  target: "main",
  startedAt: "2026-01-01T00:00:00Z",
  status: "running" as const,
  actions: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockHasGh.mockReturnValue(true);
  mockRunProcessSync.mockReturnValue(mockResult());
  mockVerifyPrCreated.mockReturnValue({ url: "https://github.com/test/repo/pull/42", open: true });
  mockParseMergeVerification.mockReturnValue({ merged: true, mergedAt: "2026-01-01T00:00:00Z" });
  mockRunPreflight.mockResolvedValue(defaultPreflight);
  mockBeginRun.mockReturnValue(mockRun);
  mockConfirmPhase.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =====================================================================
// NFS: No full-tree staging
// =====================================================================

test("NFS: pr.ts never stages full tree with `git add .`", async () => {
  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", mockCtx);

  for (const call of mockRunProcessSync.mock.calls) {
    const argv = call[0] as string[];
    const joined = argv.join(" ");
    expect(joined).not.toMatch(/^git add \.$/);
  }
});

test("NFS: pr.ts requires --paths or --all (error if neither)", async () => {
  const { handlePr } = await import("./pr.js");
  await handlePr("", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");

  const pushCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[1] === "push";
  });
  expect(pushCalls).toHaveLength(0);
});

test("NFS: --paths specifies explicit files for staging", async () => {
  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts src/bar.ts", mockCtx);

  const syncCalls = mockRunProcessSync.mock.calls;
  const gitAddCall = syncCalls.find((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[0] === "git" && argv[1] === "add";
  });

  expect(gitAddCall).toBeDefined();
  const argv = gitAddCall![0] as string[];
  expect(argv).toContain("src/foo.ts");
  expect(argv).toContain("src/bar.ts");
});

test("NFS: --all with --confirm flag stages all files", async () => {
  const { handlePr } = await import("./pr.js");
  await handlePr("--all --confirm", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

test("NFS: --all without --confirm requires interactive confirm", async () => {
  const ctxWithUI = {
    ...mockCtx,
    hasUI: true,
    ui: { notify: vi.fn(), confirm: vi.fn().mockResolvedValue(true) },
  } as unknown as ExtensionCommandContext;

  const { handlePr } = await import("./pr.js");
  await handlePr("--all", ctxWithUI);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

// =====================================================================
// TPC: Truthful PR creation
// =====================================================================

test("TPC: truthful PR create - verify PR exists after creation", async () => {
  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", mockCtx);

  expect(mockVerifyPrCreated).toHaveBeenCalled();

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

test("TPC: PR creation fails if PR not found after create", async () => {
  mockVerifyPrCreated.mockReturnValue(null);

  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

// =====================================================================
// PFR: Preflight required
// =====================================================================

test("PFR: preflight required - gh missing blocks", async () => {
  mockHasGh.mockReturnValue(false);

  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

test("PFR: preflight required - block status stops flow", async () => {
  mockRunPreflight.mockResolvedValue({
    checks: [
      { name: "auth", status: "block" as const, detail: "not authenticated" },
    ],
    overall: "block" as const,
    target: "/project",
    at: "2026-01-01T00:00:00Z",
  });
  mockPreflightSafe.mockReturnValue(false);
  mockAssertPreflightSafe.mockReturnValue("Preflight blocked: auth: not authenticated");

  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

// =====================================================================
// CNF: Confirmation
// =====================================================================

test("CNF: confirmation before push (no --confirm -> cancelled)", async () => {
  mockConfirmPhase.mockResolvedValue(false);

  const ctxNoConfirm = {
    ...mockCtx,
    hasUI: true,
    ui: { notify: vi.fn(), confirm: vi.fn().mockResolvedValue(false) },
  } as unknown as ExtensionCommandContext;

  const { handlePr } = await import("./pr.js");
  await handlePr("--paths src/foo.ts", ctxNoConfirm);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("cancelled");
});
