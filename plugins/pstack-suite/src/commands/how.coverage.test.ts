import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

describe("how coverage", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-how-cov-"));
    ctx = makeCtx(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("notifies error when backlog CLI not found (lines 16-17)", async () => {
    vi.doMock("../utils.js", () => ({
      hasBacklogMd: () => false,
    }));

    const { handleHow } = await import("./how.js");
    await handleHow("my topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack how: backlog CLI not found.", "error");
  });

  it("succeeds when backlog doc create works (happy path)", async () => {
    vi.doMock("../utils.js", () => ({
      hasBacklogMd: () => true,
    }));
    vi.doMock("node:child_process", () => ({
      execFile(
        command: string,
        args: string[],
        options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) {
        callback(null, "ok", "");
      },
    }));

    const { handleHow } = await import("./how.js");
    await handleHow("my topic", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack how: created 'Design critique: my topic'", "info");
  });

  it("notifies error when backlog doc create fails (lines 27-28)", async () => {
    vi.doMock("../utils.js", () => ({
      hasBacklogMd: () => true,
    }));
    vi.doMock("node:child_process", () => ({
      execFile(
        command: string,
        args: string[],
        options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) {
        const err: any = new Error("EACCES");
        err.code = "EACCES";
        callback(err, "", "backlog: permission denied");
      },
    }));

    const { handleHow } = await import("./how.js");
    await handleHow("my topic", ctx);
    const errorCalls = ctx.ui.notify.mock.calls.filter((c: unknown[]) => c[1] === "error");
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    // lines 27-28: "pstack how: failed to create backlog document."
    const docFail = errorCalls.find((c: unknown[]) => (c[0] as string | undefined)?.includes("failed to create backlog document"));
    expect(docFail).toBeDefined();
  });
});
