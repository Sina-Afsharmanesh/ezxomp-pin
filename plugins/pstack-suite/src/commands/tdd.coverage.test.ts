import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { expect, test, vi, beforeEach } from "vitest";

const mockRunProcess = vi.fn();

vi.mock("../runner.js", () => ({
  runProcess: function (...args: unknown[]) { return mockRunProcess(...args); },
  runProcessSync: vi.fn(),
  isToolAvailable: vi.fn(),
}));

const mockHasBacklogMd = vi.fn();

vi.mock("../utils.js", () => ({
  hasBacklogMd: function (...args: unknown[]) { return mockHasBacklogMd(...args); },
  hasGh: vi.fn(),
  writeBacklogMd: vi.fn(),
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { readFileSync } from "node:fs";

function mockResult(exitCode = 0, stdout = "", stderr = "", ok = exitCode === 0) {
  return {
    exitCode, signal: null, stdout, stderr,
    stdoutTruncated: false, stderrTruncated: false,
    durationMs: 0, timeout: false, cancelled: false, spawnError: null, ok,
  };
}

const mockCtx = {
  cwd: "/project",
  ui: { notify: vi.fn() },
  hasUI: true,
} as unknown as ExtensionCommandContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockHasBacklogMd.mockReturnValue(false);
  mockRunProcess.mockResolvedValue(mockResult());
  vi.mocked(readFileSync).mockImplementation(() => {
    throw new Error("ENOENT: no such file");
  });
});

test("tdd command with no test framework found", async () => {
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack tdd: no test framework found (vitest/jest not in package.json).",
    "error",
  );
});

test("tdd command uses runProcess for vitest", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
  );
  mockRunProcess.mockResolvedValueOnce(mockResult(0));
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockRunProcess).toHaveBeenCalledWith(
    ["npx", "vitest", "run", "--reporter=dot"],
    expect.objectContaining({ cwd: "/project", timeoutMs: 120000, signal: expect.any(AbortSignal), runId: expect.any(String) }),
  );
});

test("tdd command reports GREEN", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
  );
  mockRunProcess.mockResolvedValueOnce(mockResult(0, "Tests passed"));
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("GREEN"),
    "info",
  );
});

test("tdd command reports RED", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
  );
  mockRunProcess.mockResolvedValueOnce(
    mockResult(1, "Tests failed", "1 test failed", false)
  );
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    expect.stringContaining("RED"),
    "error",
  );
});

test("tdd command with --go flag and RED tests", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
  );
  mockRunProcess.mockResolvedValueOnce(
    mockResult(1, "Tests failed", "1 test failed", false)
  );
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("--go", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack tdd: --go flag set, tests are RED \u2014 fix and re-run manually.",
    "info",
  );
});

test("tdd command detects jest framework", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ devDependencies: { jest: "^29.0.0" } })
  );
  mockRunProcess.mockResolvedValueOnce(mockResult(0));
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack tdd: found jest (runner: npx)",
    "info",
  );
  expect(mockRunProcess).toHaveBeenCalledWith(
    ["npx", "jest", "--passWithNoTests"],
    expect.objectContaining({ cwd: "/project", timeoutMs: 120000, signal: expect.any(AbortSignal), runId: expect.any(String) }),
  );
});

test("tdd command detects npm-test fallback", async () => {
  mockHasBacklogMd.mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ scripts: { test: "echo test" } })
  );
  mockRunProcess.mockResolvedValueOnce(mockResult(0));
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockRunProcess).toHaveBeenCalledWith(
    ["npm", "test"],
    expect.objectContaining({ cwd: "/project", timeoutMs: 120000, signal: expect.any(AbortSignal), runId: expect.any(String) }),
  );
});

test("tdd command handles ENOENT on package.json", async () => {
  vi.mocked(readFileSync).mockImplementation(() => {
    throw new Error("ENOENT: no such file or directory");
  });
  const { handleTdd } = await import("./tdd.js");
  await handleTdd("", mockCtx);
  expect(mockCtx.ui.notify).toHaveBeenCalledWith(
    "pstack tdd: no test framework found (vitest/jest not in package.json).",
    "error",
  );
});
