import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const mockCp = { spawnSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn() };
vi.mock("node:child_process", () => mockCp);

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

describe("handleBlast", () => {
  let tmpDir: string;
  let ctx: any;
  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-blast-"));
    ctx = makeCtx(tmpDir);
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  function mockWhich(available: string[]) {
    mockCp.spawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which") return available.includes(args?.[0]) ? { status: 0 } : { status: 1 };
      return { status: 0, stdout: "", stderr: "" };
    });
  }

  function mockExecFile(cbFn?: (cmd: string, args: string[]) => { out: string, err: string, error?: Error }) {
    mockCp.execFile.mockImplementation((_cmd, _args, _opts, callback) => {
      setImmediate(() => {
        if (typeof callback === "function") {
          const result = cbFn ? cbFn(_cmd, _args) : { out: "", err: "" };
          callback(result.error, result.out, result.err);
        }
      });
    });
  }

  it("errors on empty args", async () => {
    mockWhich(["backlog"]);
    const { handleBlast } = await import("./blast.js");
    await handleBlast("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: usage: pstack blast <file-or-dir>", "error");
  });

  it("errors when backlog CLI not found", async () => {
    mockWhich([]);
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: backlog CLI not found.", "error");
  });

  it("scans src/ and creates doc when no importers", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "created", err: "" }));
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "target.ts"), "export const x = 1;");
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: created 'Blast radius: target.ts' -- 0 importer(s) found", "info");
  });

  it("scans src/ and finds importers", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "created", err: "" }));
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "target.ts"), "export const x = 1;");
    writeFileSync(join(tmpDir, "src", "user.ts"), "import { x } from './target.ts';");
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: created 'Blast radius: target.ts' -- 1 importer(s) found", "info");
  });

  it("scans .ts .tsx .js files", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "created", err: "" }));
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "target.ts"), "export const x = 1;");
    writeFileSync(join(tmpDir, "src", "a.tsx"), "import { x } from './target.ts';");
    writeFileSync(join(tmpDir, "src", "b.js"), "import { x } from './target.ts';");
    writeFileSync(join(tmpDir, "src", "c.ts"), "import { x } from './target.ts';");
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: created 'Blast radius: target.ts' -- 3 importer(s) found", "info");
  });

  it("skips node_modules .git dist directories", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "created", err: "" }));
    mkdirSync(join(tmpDir, "src"));
    mkdirSync(join(tmpDir, "src", "node_modules"));
    mkdirSync(join(tmpDir, "src", ".git"));
    mkdirSync(join(tmpDir, "src", "dist"));
    writeFileSync(join(tmpDir, "src", "target.ts"), "export const x = 1;");
    writeFileSync(join(tmpDir, "src", "node_modules", "dep.ts"), "import from target.ts");
    writeFileSync(join(tmpDir, "src", ".git", "config"), "import from target.ts");
    writeFileSync(join(tmpDir, "src", "dist", "out.js"), "import from target.ts");
    writeFileSync(join(tmpDir, "src", "user.ts"), "import from target.ts");
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: created 'Blast radius: target.ts' -- 1 importer(s) found", "info");
  });

  it("handles backlog doc create failure", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "", err: "backlog failed", error: new Error("fail") }));
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "target.ts"), "export const x = 1;");
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("pstack blast"), "error");
  });

  it("handles nonexistent src/ directory gracefully", async () => {
    mockWhich(["backlog"]);
    mockExecFile(() => ({ out: "created", err: "" }));
    const { handleBlast } = await import("./blast.js");
    await handleBlast("target.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack blast: created 'Blast radius: target.ts' -- 0 importer(s) found", "info");
  });
});
