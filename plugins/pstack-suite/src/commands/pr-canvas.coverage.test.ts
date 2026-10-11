import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
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

describe("pr-canvas coverage tests", () => {
  let tmpDir: string;
  let ctx: ExtensionCommandContext;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-pr-canvas-"));
    ctx = makeCtx(tmpDir);
    mockCp.spawnSync.mockReset();
    mockCp.execFile.mockReset();
    mockCp.spawn.mockReset();
  });

  function resetCpMocks(ghOk = true) {
    mockCp.spawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which") {
        const tool = args?.[0];
        if (tool === "gh") return ghOk ? { status: 0 } : { status: 1 };
        if (tool === "backlog") return { status: 0 };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    mockCp.spawn.mockReturnValue({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });
  }

  type ExecCb = (error: Error | null, stdout: string, stderr: string) => void;
  type QueuedFn = (cb: ExecCb) => void;
  function execCallbacks(...cbs: QueuedFn[]) {
    let queue = [...cbs];
    mockCp.execFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: ExecCb) => {
      setImmediate(() => {
        const fn = queue.shift();
        if (fn) fn(cb);
      });
    });
  }

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("gh pr view happy path: fetches PR and creates doc", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 42,
      title: "fix: handle edge case",
      body: "Fixes the null pointer in parser",
      files: [
        { path: "src/parser.ts", additions: 15, deletions: 3 },
        { path: "src/utils.ts", additions: 2, deletions: 1 },
      ],
    });
    const docPath = join(tmpDir, "PR-42-fix-handle-edge-case.md");
    writeFileSync(docPath, "---\nid: doc-1\ntype: other\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("42", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: fetching PR #42 ...",
      "info",
    );
    const calls = vi.mocked(ctx.ui.notify).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toContain("report created under reviews/");
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("## Summary");
    expect(content).toContain("- **PR:** #42");
    expect(content).toContain("- **Title:** fix: handle edge case");
    expect(content).toContain("- **Body:** Fixes the null pointer in parser");
    expect(content).toContain("- **Files changed:** 2");
    expect(content).toContain("+17 / -4");
    expect(content).toContain("| src/parser.ts | +15 | -3 |");
    expect(content).toContain("| src/utils.ts | +2 | -1 |");
    expect(content).toContain("## Review Notes");
  });

  it("empty body omits Body line in summary", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 1,
      title: "no body PR",
      body: "",
      files: [],
    });
    const docPath = join(tmpDir, "PR-1-no-body-PR.md");
    writeFileSync(docPath, "---\nid: doc-1\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("1", ctx);
    const content = readFileSync(docPath, "utf-8");
    expect(content).not.toContain("- **Body:**");
    expect(content).toContain("- **Files changed:** 0");
  });

  it("git diff fallback when gh not available", async () => {
    resetCpMocks(false);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const docPath = join(tmpDir, "PR-N-A-git-diff-HEAD-1.md");
    writeFileSync(docPath, "---\nid: doc-1\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, "10\t5\tsrc/main.ts\n2\t1\tREADME.md\n", ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: gh not found, falling back to git diff --stat",
      "info",
    );
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("- **PR:** #N/A");
    expect(content).toContain("+12 / -6");
    expect(content).toContain("| src/main.ts | +10 | -5 |");
    expect(content).toContain("| README.md | +2 | -1 |");
  });

  it("git diff with binary files shows 0 for dash values", async () => {
    resetCpMocks(false);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const docPath = join(tmpDir, "PR-N-A-git-diff-HEAD-1.md");
    writeFileSync(docPath, "---\nid: doc-1\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, "-\t-\tbinary.dat\n3\t2\ttext.txt\n", ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("", ctx);
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("| binary.dat | +0 | -0 |");
    expect(content).toContain("+3 / -2");
  });

  it("gh pr view by branch success path", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 55,
      title: "add feature X",
      body: "",
      files: [{ path: "feature.ts", additions: 100, deletions: 0 }],
    });
    const docPath = join(tmpDir, "PR-55-add-feature-X.md");
    writeFileSync(docPath, "---\nid: doc-1\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, "feat-X\n", ""),
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("", ctx);
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("#55");
    expect(content).toContain("add feature X");
    expect(content).toContain("+100 / -0");
  });

  it("resolves PR for current branch then falls back to git diff", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const docPath = join(tmpDir, "PR-N-A-branch-feature-my-branch.md");
    writeFileSync(docPath, "---\nid: doc-1\n---\n", "utf-8");
    execCallbacks(
      (cb) => cb(null, "feature/my-branch\n", ""),
      (cb) => cb(new Error("no PR"), "", "no PR found"),
      (cb) => cb(null, "5\t3\tCHANGE.md\n", ""),
      (cb) => cb(null, "Path: " + docPath + "\n", ""),
    );
    await handlePrCanvas("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: resolving PR for current branch ...",
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: no PR for branch feature/my-branch, falling back to git diff",
      "info",
    );
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("branch: feature/my-branch");
    expect(content).toContain("+5 / -3");
  });

  it("throws when gh pr view fails", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    execCallbacks(
      (cb) => cb(new Error("PR not found"), "", "PR not found"),
    );
    await expect(handlePrCanvas("999", ctx)).rejects.toThrow("PR not found");
  });

  it("backlog doc create failure shows error and returns", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 7,
      title: "small fix",
      body: "",
      files: [{ path: "a.txt", additions: 1, deletions: 0 }],
    });
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(new Error("doc create failed"), "", ""),
    );
    await handlePrCanvas("7", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: backlog doc create failed",
      "error",
    );
  });

  it("missing Path in backlog output returns early", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 10,
      title: "test PR",
      body: "",
      files: [{ path: "x.ts", additions: 1, deletions: 0 }],
    });
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Created doc OK\n", ""),
    );
    await handlePrCanvas("10", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack pr-canvas: could not parse doc path from output",
      "error",
    );
  });

  it("gh pr view JSON parse failure rejects", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    execCallbacks(
      (cb) => cb(null, "not valid json", ""),
    );
    await expect(handlePrCanvas("42", ctx)).rejects.toThrow();
  });

  it("gh pr view JSON parse failure: catch rejects (line 133)", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    execCallbacks(
      (cb) => cb(null, "{ invalid json }", ""),
    );
    // ghPrView catch(e) path → reject(e); no ui.notify in that branch
    await expect(handlePrCanvas("42", ctx)).rejects.toThrow();
  });

  it("gh pr view by branch JSON parse failure: catch rejects (line 164)", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    execCallbacks(
      (cb) => cb(null, "feature/branch\n", ""),
      (cb) => cb(null, "{ bad json here }", ""),
    );
    // ghPrViewByBranchOrFallback catch(e) path → reject(e)
    await expect(handlePrCanvas("", ctx)).rejects.toThrow();
  });

  it("resolveDocPath finds file at parent level via walk-up (lines 222-229)", async () => {
    resetCpMocks(true);
    const nestedCwd = join(tmpDir, "src", "nested");
    mkdirSync(nestedCwd, { recursive: true });
    const docPath = join(tmpDir, "reviews", "PR-42-test.md");
    mkdirSync(join(tmpDir, "reviews"), { recursive: true });
    writeFileSync(docPath, "---\nid: doc-test\n---\n", "utf-8");
    const ctxNested = makeCtx(nestedCwd);
    const prJson = JSON.stringify({
      number: 42,
      title: "test pr",
      body: "",
      files: [{ path: "f.ts", additions: 1, deletions: 0 }],
    });
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Path: reviews/PR-42-test.md\n", ""),
    );
    const { handlePrCanvas } = await import("./pr-canvas.js");
    await handlePrCanvas("42", ctxNested);
    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("## Summary");
  });

  it("resolveDocPath fallback: file not found returns cwd path (line 236)", async () => {
    resetCpMocks(true);
    const { handlePrCanvas } = await import("./pr-canvas.js");
    const prJson = JSON.stringify({
      number: 99,
      title: "fallback test",
      body: "",
      files: [{ path: "y.ts", additions: 1, deletions: 0 }],
    });
    execCallbacks(
      (cb) => cb(null, prJson, ""),
      (cb) => cb(null, "Path: no-such-dir/reviews/PR-99-fallback-test.md\n", ""),
    );
    await expect(handlePrCanvas("99", ctx)).rejects.toThrow();
  });
});
