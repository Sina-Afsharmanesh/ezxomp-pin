import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("../runner.js", () => ({
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => "doc content"),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

import { isToolAvailable, runProcessSync } from "../runner.js";

function mockSuccess(stdout = "doc-1") {
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

test("why command with backlog not available", async () => {
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return false;
    return true;
  });
  const { handleWhy } = await import("./why.js");
  await handleWhy("MyComponent", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack why: backlog CLI not found.",
    "error",
  );
});

test("why command with no symbol argument", async () => {
  const { handleWhy } = await import("./why.js");
  await handleWhy("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack why: usage: pstack why <symbol>",
    "error",
  );
});

test("why command with successful doc creation", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("commit 12345 touching MyComponent"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleWhy } = await import("./why.js");
  await handleWhy("MyComponent", mockCtx);
  expect(runProcessSync).toHaveBeenCalledWith(
    ["git", "log", "-20", "--pretty=format:%h %ai %s%n%b%n---"],
    { cwd: "/project" },
  );
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Why does MyComponent exist"),
    "info",
  );
});

test("why command with backlog doc create failure", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("commit 12345"))
    .mockReturnValueOnce(mockError("doc create failed"));
  const { handleWhy } = await import("./why.js");
  await handleWhy("MyComponent", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("backlog document"),
    "error",
  );
});

test("why command grepCommits finds matching commits", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("---commit abc MyComponent changed---commit def other thing---"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleWhy } = await import("./why.js");
  await handleWhy("MyComponent", mockCtx);
  expect(runProcessSync).toHaveBeenCalled();
});

test("why command grepCommits returns empty for no matches", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("---commit abc totally unrelated---"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleWhy } = await import("./why.js");
  await handleWhy("MyComponent", mockCtx);
  expect(runProcessSync).toHaveBeenCalled();
});
