import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("../runner.js", () => ({
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
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
} as unknown as ExtensionCommandContext;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isToolAvailable).mockReturnValue(true);
  vi.mocked(runProcessSync).mockReturnValue(mockSuccess());
});

test("review command with backlog not available", async () => {
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return false;
    return true;
  });
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "backlog CLI is required. Install: npm i -g backlog.md",
    "error",
  );
});

test("review command with successful doc creation", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("modified.ts | 10 ++++++-----"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);

  const calls = vi.mocked(runProcessSync).mock.calls;
  // First call: git diff --stat HEAD...main (with maxOutputBytes)
  expect(calls[0]![0]).toEqual(["git", "diff", "--stat", "HEAD...main"]);
  expect(calls[0]![1]).toHaveProperty("cwd", "/project");
  expect(calls[0]![1]).toHaveProperty("maxOutputBytes");

  // Second call: backlog doc create with -p reviews
  expect(calls[1]![0]![0]).toBe("backlog");
  expect(calls[1]![0]![2]).toBe("create");
  expect(calls[1]![0]![3]).toMatch(/^Review main \d{4}-\d{2}-\d{2}$/);
  expect(calls[1]![0]).toContain("-p");
  expect(calls[1]![0]).toContain("reviews");
  expect(calls[1]![0]).toContain("-t");
  expect(calls[1]![0]).toContain("report");

  // Third call: backlog doc update
  expect(calls[2]![0]![0]).toBe("backlog");
  expect(calls[2]![0]![2]).toBe("update");
  expect(calls[2]![0]![3]).toBe("doc-1");
  expect(calls[2]![0]![4]).toBe("--content");

  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Review report created"),
    "info",
  );
});

test("review command handles git diff failure", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockError("git not found"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  expect(runProcessSync).toHaveBeenNthCalledWith(1,
    ["git", "diff", "--stat", "HEAD...main"],
    expect.objectContaining({ cwd: "/project", maxOutputBytes: expect.any(Number) }),
  );
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Review report created"),
    "info",
  );
});

test("review command with backlog doc create failure", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("modified.ts"))
    .mockReturnValueOnce(mockError("backlog error"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Failed to create"),
    "error",
  );
});

test("review command with backlog doc update failure", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("modified.ts"))
    .mockReturnValueOnce(mockSuccess("doc-1"))
    .mockReturnValueOnce(mockError("update failed"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("Failed to update"),
    "error",
  );
});

test("review command uses git diff", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("modified.ts | 5 +++"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  expect(runProcessSync).toHaveBeenCalledWith(
    ["git", "diff", "--stat", "HEAD...main"],
    expect.objectContaining({ cwd: "/project", maxOutputBytes: expect.any(Number) }),
  );
});

test("review command git diff fallback with reversed range", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockError("fatal"))
    .mockReturnValueOnce(mockSuccess("modified.ts | 3 +"));
  const { handleReview } = await import("./review.js");
  await handleReview("feature", mockCtx);
  expect(runProcessSync).toHaveBeenNthCalledWith(2,
    ["git", "diff", "--stat", "feature..HEAD"],
    expect.objectContaining({ cwd: "/project", maxOutputBytes: expect.any(Number) }),
  );
});

test("review command with empty args defaults to HEAD", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("changed.ts"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleReview } = await import("./review.js");
  await handleReview("", mockCtx);
  const calls = vi.mocked(runProcessSync).mock.calls;
  expect(calls[1]![0]![3]).toMatch(/^Review HEAD \d{4}-\d{2}-\d{2}$/);
});

test("review command calls are sequential", async () => {
  vi.mocked(runProcessSync)
    .mockReturnValueOnce(mockSuccess("file.ts"))
    .mockReturnValueOnce(mockSuccess("doc-1"));
  const { handleReview } = await import("./review.js");
  await handleReview("main", mockCtx);
  const calls = vi.mocked(runProcessSync).mock.calls;
  expect(calls.length).toBe(3);
  expect(calls[0]![0]).toEqual(["git", "diff", "--stat", "HEAD...main"]);
  expect(calls[1]![0]![0]).toBe("backlog");
  expect(calls[1]![0]![2]).toBe("create");
  expect(calls[2]![0]![0]).toBe("backlog");
  expect(calls[2]![0]![2]).toBe("update");
});
