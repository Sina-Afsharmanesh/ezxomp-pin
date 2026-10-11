import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockCp = {
  execFile: vi.fn(),
  spawnSync: vi.fn(),
};
vi.mock("node:child_process", () => mockCp);

const mockUtils = { hasBacklogMd: vi.fn(() => true) };
vi.mock("../utils.js", () => mockUtils);

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

function execSuccess() {
  mockCp.execFile.mockImplementation((_cmd, _args, _opts, cb) => {
    setImmediate(() => cb(null, "", ""));
  });
}
function execFail(stderrMsg = "error") {
  mockCp.execFile.mockImplementation((_cmd, _args, _opts, cb) => {
    setImmediate(() => cb(new Error(stderrMsg), "", stderrMsg));
  });
}

describe("arena coverage", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-arena-"));
    ctx = makeCtx(tmpDir);
    mockUtils.hasBacklogMd.mockReturnValue(true);
    mockCp.execFile.mockClear();
    execSuccess();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("happy path with default n=3", async () => {
    execSuccess();
    const { handleArena } = await import("./arena.js");
    await handleArena("my-topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack arena: created 'Alternatives arena: my-topic' with 3 alternatives",
      "info",
    );
  });

  it("parses --n flag (lines 16)", async () => {
    execSuccess();
    const { handleArena } = await import("./arena.js");
    await handleArena("my-topic --n 5", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack arena: created 'Alternatives arena: my-topic' with 5 alternatives",
      "info",
    );
  });

  it("hasBacklogMd false path (lines 22-23)", async () => {
    mockUtils.hasBacklogMd.mockReturnValue(false);
    const { handleArena } = await import("./arena.js");
    await handleArena("my-topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack arena: backlog CLI not found.",
      "error",
    );
  });

  it("createBacklogDoc fails (lines 33-34)", async () => {
    execFail("backlog failed");
    const { handleArena } = await import("./arena.js");
    await handleArena("my-topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack arena: failed to create backlog document.",
      "error",
    );
  });
});
