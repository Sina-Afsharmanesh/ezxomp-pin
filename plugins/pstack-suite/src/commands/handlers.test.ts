import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

const mockCp = {
  spawnSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
};
vi.mock("node:child_process", () => mockCp);

function makeCtx(cwd: string): ExtensionCommandContext {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as unknown as ExtensionCommandContext;
}

describe("command handlers smoke tests", () => {
  let tmpDir: string;
  let ctx: ExtensionCommandContext;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-handlers-"));
    ctx = makeCtx(tmpDir);
  });

  function resetCpMocks(ghOk = true, backlogOk = true) {
    mockCp.spawnSync.mockReset();
    mockCp.spawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which") {
        const tool = args?.[0];
        if (tool === "gh") return ghOk ? { status: 0 } : { status: 1 };
        if (tool === "backlog") return backlogOk ? { status: 0 } : { status: 1 };
        return { status: 0 };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    mockCp.execFile.mockReset();
    mockCp.execFile.mockImplementation((_, __, ___, cb) => {
      setImmediate(() => { if (typeof cb === "function") cb(null, "", ""); });
    });
    mockCp.spawn.mockReset();
    mockCp.spawn.mockReturnValue({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } });
  }

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("handleSetup creates config and notifies", async () => {
    resetCpMocks();
    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleMode lists playbooks and notifies", async () => {
    resetCpMocks();
    const { handleMode } = await import("./mode.js");
    await handleMode("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleVerify notifies result", async () => {
    resetCpMocks();
    const { handleVerify } = await import("./verify.js");
    await handleVerify("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleReview creates review doc", async () => {
    resetCpMocks(true, true);
    const { handleReview } = await import("./review.js");
    await handleReview("feature/test", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleQuality creates quality doc", async () => {
    resetCpMocks(true, true);
    const { handleQuality } = await import("./quality.js");
    await handleQuality("feature/test", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleDocs notifies", async () => {
    resetCpMocks();
    const { handleDocs } = await import("./docs.js");
    await handleDocs("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handlePrCanvas handles gh missing", async () => {
    resetCpMocks(false, true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    await handlePrCanvas("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleShip runs tsc + commit + push", async () => {
    resetCpMocks(true, true);
    const { handleShip } = await import("./ship.js");
    await handleShip("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleCi runs checks", async () => {
    resetCpMocks(true, true);
    const { handleCi } = await import("./ci.js");
    await handleCi("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handlePr notifies", async () => {
    resetCpMocks(false, true);
    const { handlePr } = await import("./pr.js");
    await handlePr("my title", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleDeslop scans", async () => {
    resetCpMocks();
    const srcDir = join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "test.ts"), "const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleWeekly creates summary", async () => {
    resetCpMocks(true, true);
    const { handleWeekly } = await import("./weekly.js");
    await handleWeekly("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleWhy notifies", async () => {
    resetCpMocks();
    const { handleWhy } = await import("./why.js");
    await handleWhy("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleHow creates critique", async () => {
    resetCpMocks(true, true);
    const { handleHow } = await import("./how.js");
    await handleHow("my design decision", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleArena creates arena", async () => {
    resetCpMocks(true, true);
    const { handleArena } = await import("./arena.js");
    await handleArena("topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleBlast notifies", async () => {
    resetCpMocks();
    const { handleBlast } = await import("./blast.js");
    await handleBlast("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleTdd runs detection", async () => {
    resetCpMocks(true, true);
    const { handleTdd } = await import("./tdd.js");
    await handleTdd("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("handleBenny notifies", async () => {
    resetCpMocks(true, true);
    const { handleBenny } = await import("./benny.js");
    await handleBenny("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });
});
