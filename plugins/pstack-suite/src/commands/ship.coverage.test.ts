import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach, afterEach } from "vitest";

// --- runner.js ---
const mockRunProcessSync = vi.fn();
const mockIsToolAvailable = vi.fn();

vi.mock("../runner.js", () => ({
  runProcessSync: function (...args: unknown[]) { return mockRunProcessSync(...args); },
  runProcess: vi.fn(),
  isToolAvailable: function (...args: unknown[]) { return mockIsToolAvailable(...args); },
}));

// --- utils.js ---
const mockHasGh = vi.fn();

vi.mock("../utils.js", () => ({
  hasGh: function (...args: unknown[]) { return mockHasGh(...args); },
  hasBacklogMd: vi.fn(),
  writeBacklogMd: vi.fn(),
}));

// --- run.js ---
const mockBeginRun = vi.fn();
const mockAddAction = vi.fn((...a: any[]) => {
  const [rec, action, result, detail] = a;
  return {
    ...rec, actions: [...(rec?.actions || []), { action, result, detail }],
  };
});
const mockFinishRun = vi.fn((...a: any[]) => {
  const [rec, status] = a;
  return { ...rec, status, finishedAt: "2026-01-01T00:00:00Z" };
});
const mockSaveRun = vi.fn();
const mockRunPreflight = vi.fn();
const mockPreflightSafe = vi.fn((...a: any[]) => true);
const mockAssertPreflightSafe = vi.fn((...a: any[]): string | null => null);
const mockEmitPreflight = vi.fn((...a: any[]): null => null);

vi.mock("../run.js", () => ({
  beginRun: function (...args: unknown[]) { return mockBeginRun(...args); },
  addAction: function (...args: unknown[]) { return mockAddAction(...args); },
  finishRun: function (...args: unknown[]) { return mockFinishRun(...args); },
  saveRun: function (...args: unknown[]) { return mockSaveRun(...args); },
  runPreflight: function (...args: unknown[]) { return mockRunPreflight(...args); },
  preflightSafe: function (...args: unknown[]) { return mockPreflightSafe(...args); },
  assertPreflightSafe: function (...args: unknown[]) { return mockAssertPreflightSafe(...args); },
  emitPreflight: function (...args: unknown[]) { return mockEmitPreflight(...args); },
}));

// --- ship-flow.js ---
const mockConfirmPhase = vi.fn();
const mockPushCommand = vi.fn((...a: any[]) => ["git", "push", "origin", "feature/ship"]);
const mockMergeCommand = vi.fn();
const mockVerifyMerge = vi.fn();
const mockVerifyPushRemote = vi.fn();
const mockParseMergeVerification = vi.fn();
const mockFindExistingPr = vi.fn();
const mockCreatePr = vi.fn();
const mockPrCreateCommand = vi.fn();
const mockRunTscVerify = vi.fn();
const mockIsTscFailure = vi.fn();
const mockGetDirtyTreeDetail = vi.fn();
const mockVerifyPrCreated = vi.fn();
const mockResolveRemote = vi.fn();

vi.mock("../ship-flow.js", () => ({
  parseShipArgs: vi.fn((raw: string) => {
    const dryRun = /--dry-run|--preview/.test(raw);
    const confirmPhases = new Set<string>();
    const mConfirm = raw.match(/--confirm=(\w+(?:,\w+)*)/);
    if (mConfirm) {
      for (const p of mConfirm[1]!.split(",")) confirmPhases.add(p.trim());
    } else if (/--confirm\b/.test(raw)) {
      confirmPhases.add("push");
      confirmPhases.add("merge");
    }
    const mBranch = raw.match(/--branch\s+(\S+)/);
    return { dryRun, confirmPhases, target: mBranch ? mBranch[1] : undefined };
  }),
  confirmPhase: function (...args: unknown[]) { return mockConfirmPhase(...args); },
  pushCommand: function (...args: unknown[]) { return mockPushCommand(...args); },
  mergeCommand: function (...args: unknown[]) { return mockMergeCommand(...args); },
  verifyMerge: function (...args: unknown[]) { return mockVerifyMerge(...args); },
  verifyPushRemote: function (...args: unknown[]) { return mockVerifyPushRemote(...args); },
  parseMergeVerification: function (...args: unknown[]) { return mockParseMergeVerification(...args); },
  findExistingPr: function (...args: unknown[]) { return mockFindExistingPr(...args); },
  createPr: function (...args: unknown[]) { return mockCreatePr(...args); },
  prCreateCommand: function (...args: unknown[]) { return mockPrCreateCommand(...args); },
  runTscVerify: function (...args: unknown[]) { return mockRunTscVerify(...args); },
  isTscFailure: function (...args: unknown[]) { return mockIsTscFailure(...args); },
  getDirtyTreeDetail: function (...args: unknown[]) { return mockGetDirtyTreeDetail(...args); },
  verifyPrCreated: function (...args: unknown[]) { return mockVerifyPrCreated(...args); },
  resolveRemote: function (...args: unknown[]) { return mockResolveRemote(...args); },
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
  runId: "test-run-1",
  playbook: "ship",
  phase: "preflight",
  target: "feature/ship",
  startedAt: "2026-01-01T00:00:00Z",
  status: "running" as const,
  actions: [],
};

function setupProcessMocks() {
  mockRunProcessSync.mockImplementation((argv: string[], _opts?: { cwd?: string }) => {
    if (argv[0] === "git" && argv[1] === "rev-parse") return mockResult(0, "feature/ship");
    if (argv[0] === "git" && argv[1] === "push") return mockResult(0, "");
    return mockResult();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockRunProcessSync.mockReset();
  setupProcessMocks();
  mockHasGh.mockReturnValue(true);
  mockIsToolAvailable.mockReturnValue(true);
  mockConfirmPhase.mockResolvedValue(true);
  mockPushCommand.mockReturnValue(["git", "push", "-u", "origin", "feature/ship"]);
  mockMergeCommand.mockReturnValue(["gh", "pr", "merge", "42", "--merge", "--auto"]);
  mockVerifyMerge.mockReturnValue(mockResult(0, JSON.stringify({ state: "MERGED", mergedAt: "2026-01-01T00:00:00Z" })));
  mockParseMergeVerification.mockReturnValue({ merged: true, mergedAt: "2026-01-01T00:00:00Z" });
  mockVerifyPushRemote.mockReturnValue(mockResult());
  mockResolveRemote.mockReturnValue("git@github.com:owner/repo.git");
  mockPrCreateCommand.mockReturnValue(["gh", "pr", "create", "--head", "feature/ship", "--title", "Ship: feature/ship", "--body", "Shipped via pstack"]);
  mockFindExistingPr.mockReturnValue("42");
  mockRunTscVerify.mockReturnValue(mockResult(0, "", ""));
  mockIsTscFailure.mockReturnValue(false);
  mockGetDirtyTreeDetail.mockReturnValue("");
  mockVerifyPrCreated.mockReturnValue({ url: "https://github.com/test/repo/pull/42", open: true });
  mockRunPreflight.mockResolvedValue(defaultPreflight);
  mockBeginRun.mockReturnValue(mockRun);
  setupProcessMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =====================================================================
// AC1: Stages
// =====================================================================

test("AC1: ship distinguishes preflight, verify, push, pr, merge, remote_confirm stages", async () => {
  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  const actions = mockAddAction.mock.calls.map((c) => c[1] as string);
  expect(actions).toContain("preflight");
  expect(actions).toContain("verify");
  expect(actions).toContain("push");
  expect(actions).toContain("pr");
  expect(actions).toContain("remote_confirm");
});

test("AC1: finishRun status is 'success' only after remote confirm", async () => {
  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

// =====================================================================
// AC2: Dry-run
// =====================================================================

test("AC2: dry-run prints preview and does NOT mutate", async () => {
  const { handleShip } = await import("./ship.js");
  await handleShip("--dry-run", mockCtx);

  // Dry-run should NOT call runProcessSync for push/merge/etc (only rev-parse for branch detection)
  const pushCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[1] === "push" || argv[1] === "merge";
  });
  expect(pushCalls).toHaveLength(0);
  expect(mockConfirmPhase).not.toHaveBeenCalled();

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");

  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("DRY-RUN"),
    "info",
  );
});

test("AC2: --preview is alias for --dry-run", async () => {
  const { handleShip } = await import("./ship.js");
  await handleShip("--preview", mockCtx);

  const pushCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[1] === "push";
  });
  expect(pushCalls).toHaveLength(0);

  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("DRY-RUN"),
    "info",
  );
});

// =====================================================================
// AC3: Confirmation required
// =====================================================================

test("AC3: no confirmation -> no push (cancelled/failed, not success)", async () => {
  mockConfirmPhase.mockResolvedValue(false);

  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  // No push should happen after confirm denied
  const pushCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[1] === "push";
  });
  expect(pushCalls).toHaveLength(0);

  // Status should not be success
  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).not.toBe("success");
});

test("AC3: --confirm=push,merge skips interactive confirm", async () => {
  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

// =====================================================================
// AC4: Truthful merge
// =====================================================================

test("AC4: push OK but merge not verified -> finishRun 'failed', NOT merged notify", async () => {
  mockParseMergeVerification.mockReturnValue({ merged: false });

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");

  const notifyCalls = (mockCtx.ui.notify as unknown as ReturnType<typeof vi.fn>).mock.calls;
  for (const [msg] of notifyCalls as string[][]) {
    expect(msg).not.toContain("merged ✓");
    expect(msg).not.toMatch(/merged.*\u2713/);
  }
});

test("AC4: push without merge never reports merged", async () => {
  mockParseMergeVerification.mockReturnValue({ merged: false, mergedAt: undefined });

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

// =====================================================================
// AC5: Dirty-tree + preflight
// =====================================================================

test("AC5: dirty-tree detected -> pause for confirmation", async () => {
  mockRunPreflight.mockResolvedValue({
    checks: [
      { name: "repository", status: "pass" as const },
      { name: "dirty_tree", status: "warn" as const, detail: "3 modified file(s)" },
    ],
    overall: "warn" as const,
    target: "/project",
    at: "2026-01-01T00:00:00Z",
  });
  mockPreflightSafe.mockReturnValue(true);
  mockConfirmPhase.mockResolvedValue(false);
  mockGetDirtyTreeDetail.mockReturnValue("M foo.txt\n");

  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  // Should have warned about dirty tree
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("dirty tree"),
    "warning",
  );

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).not.toBe("success");
});

test("AC5: preflight block stops flow", async () => {
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

  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");

  const pushCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[1] === "push";
  });
  expect(pushCalls).toHaveLength(0);
});

// =====================================================================
// FU6: tsc stderr with exit 0
// =====================================================================

test("FU6: tsc exit 0 with stderr warnings is NOT a failure", async () => {
  mockRunTscVerify.mockReturnValue(mockResult(0, "", "warning: unused var", true));
  mockIsTscFailure.mockReturnValue(false);

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

test("FU6: tsc non-zero exit IS a failure", async () => {
  mockRunTscVerify.mockReturnValue(mockResult(2, "", "", false));
  mockIsTscFailure.mockReturnValue(true);

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

// =====================================================================
// gh
// =====================================================================

test("ship: gh not available -> blocked", async () => {
  mockHasGh.mockReturnValue(false);

  const { handleShip } = await import("./ship.js");
  await handleShip("", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");
});

test("B1: empty ls-remote stdout -> push verification fails, no merge", async () => {
  // verifyPushRemote returns empty stdout -> ok=false by B1 fix
  mockVerifyPushRemote.mockReturnValue(mockResult(0, "", "", true)); // ok=true but empty stdout
  // After B1 fix: verifyPushRemote returns ok=false when stdout is empty
  // The mock returns what verifyPushRemote returns directly in ship.ts
  mockVerifyPushRemote.mockReturnValue({
    exitCode: 0, signal: null, stdout: "", stderr: "target ref refs/heads/feature/ship not found on remote",
    stdoutTruncated: false, stderrTruncated: false, durationMs: 10, timeout: false, cancelled: false,
    spawnError: null, ok: false,
  });

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("failed");

  // Verify no merge attempt was made
  const mergeCalls = mockRunProcessSync.mock.calls.filter((c: unknown[]) => {
    const argv = c[0] as string[];
    return argv[0] === "gh" && argv[1] === "pr" && argv[2] === "merge";
  });
  expect(mergeCalls.length).toBe(0);
});

test("B1: ls-remote with matching ref -> continues to merge", async () => {
  mockVerifyPushRemote.mockReturnValue({
    exitCode: 0, signal: null, stdout: "abc123\trefs/heads/feature/ship\n", stderr: "",
    stdoutTruncated: false, stderrTruncated: false, durationMs: 10, timeout: false, cancelled: false,
    spawnError: null, ok: true,
  });

  const { handleShip } = await import("./ship.js");
  await handleShip("--confirm=push,merge", mockCtx);

  const finishCalls = mockFinishRun.mock.calls;
  const lastStatus = finishCalls[finishCalls.length - 1]![1];
  expect(lastStatus).toBe("success");
});

test("B6: dry-run output contains remote and push argv", async () => {
  mockResolveRemote.mockReturnValue("git@github.com:owner/repo.git");

  const { handleShip } = await import("./ship.js");
  await handleShip("--dry-run", mockCtx);

  const notifyCalls = (mockCtx.ui.notify as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const dryRunCall = notifyCalls.find((c: string[]) =>
    c[0]?.includes("DRY-RUN")
  );
  expect(dryRunCall).toBeTruthy();
  const message = dryRunCall![0];
  expect(message).toContain("remote:   git@github.com:owner/repo.git");
  // Push argv must be present
  expect(message).toContain("git push -u origin feature/ship");
});
