import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("../runner.js", () => ({
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));

import { isToolAvailable, runProcessSync } from "../runner.js";

function mockSuccess(stdout = "id-doc-1") {
  return {
    exitCode: 0, signal: null, stdout, stderr: "",
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError: null, ok: true,
  };
}

function mockError(stderr = "error") {
  return {
    exitCode: 1, signal: null, stdout: "", stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError: null, ok: false,
  };
}

const mockCtx = {
  cwd: "/project",
  ui: { notify: vi.fn() },
  hasUI: true,
} as unknown as ExtensionCommandContext;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isToolAvailable).mockReturnValue(true);
  vi.mocked(runProcessSync).mockReturnValue(mockSuccess());
});

test("weekly command with backlog not available", async () => {
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return false;
    return true;
  });
  const { handleWeekly } = await import("./weekly.js");
  await handleWeekly("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack weekly: backlog CLI not found.",
    "error",
  );
});

test("weekly command with successful doc creation", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("abc commit 1\ndef commit 2"))
    .mockReturnValueOnce(mockSuccess());
  const { handleWeekly } = await import("./weekly.js");
  await handleWeekly("7d", mockCtx);
  expect(runProcessSync).toHaveBeenCalledWith(
    ["git", "log", "--since=7 days ago", "--oneline", "--no-decorate"],
    { cwd: "/project" },
  );
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Weekly status"),
    "info",
  );
});

test("weekly command with backlog doc create failure", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("abc commit 1"))
    .mockReturnValueOnce(mockError("doc create failed"));
  const { handleWeekly } = await import("./weekly.js");
  await handleWeekly("7d", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("backlog document"),
    "error",
  );
});

test("weekly command with empty args defaults to 7d", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("abc commit 1"))
    .mockReturnValueOnce(mockSuccess());
  const { handleWeekly } = await import("./weekly.js");
  await handleWeekly("", mockCtx);
  expect(runProcessSync).toHaveBeenCalledWith(
    ["git", "log", "--since=7 days ago", "--oneline", "--no-decorate"],
    { cwd: "/project" },
  );
});

test("weekly command with custom range", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("abc commit 1"))
    .mockReturnValueOnce(mockSuccess());
  const { handleWeekly } = await import("./weekly.js");
  await handleWeekly("14d", mockCtx);
  expect(runProcessSync).toHaveBeenCalledWith(
    ["git", "log", "--since=14 days ago", "--oneline", "--no-decorate"],
    { cwd: "/project" },
  );
});
