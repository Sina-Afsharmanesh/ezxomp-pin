import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const mockCp = { spawnSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn() };
vi.mock("node:child_process", () => mockCp);

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

describe("handleBenny", () => {
  let tmpDir: string;
  let ctx: any;
  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-benny-"));
    ctx = makeCtx(tmpDir);
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setup(availableTools: string[] = ["backlog", "gh", "glab"], gitRemote: string | null = null, backlogSearch: string = "", backlogCreate: { status: number; stdout: string; stderr: string } = { status: 0, stdout: "TASK-1", stderr: "" }, ghCreate: { status: number; stdout: string; stderr: string } = { status: 0, stdout: "https://github.com/owner/repo/issues/1", stderr: "" }, glabCreate: { status: number; stdout: string; stderr: string } = { status: 0, stdout: "https://gitlab.com/owner/repo/issues/1", stderr: "" }) {
    mockCp.spawnSync.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === "which") return { status: availableTools.includes(args?.[0] ?? "") ? 0 : 1 };
      if (cmd === "git") return gitRemote ? { status: 0, stdout: gitRemote, stderr: "" } : { status: 1, stdout: "", stderr: "" };
      if (cmd === "backlog") {
        if (args?.includes("search")) return { status: 0, stdout: backlogSearch, stderr: "" };
        return backlogCreate;
      }
      if (cmd === "gh") return ghCreate;
      if (cmd === "glab") return glabCreate;
      return { status: 1, stdout: "", stderr: "" };
    });
  }

  it("errors on empty args", async () => {
    setup();
    const { handleBenny } = await import("./benny.js");
    await handleBenny("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack benny: usage: pstack benny <title> [--yes]", "error");
  });

  it("errors when backlog CLI not found", async () => {
    setup(["gh", "glab"]);
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("backlog CLI not found"), "error");
  });

  it("finds existing duplicate task", async () => {
    setup(["backlog", "gh", "glab"], null, "[ TASK-1 ] Fix");
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate found"), "info");
  });

  it("creates task with needs-investigation label", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 0, stdout: "TASK-2", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(mockCp.spawnSync).toHaveBeenCalledWith(
      "backlog",
      expect.arrayContaining(["-l", "needs-investigation"]),
      expect.any(Object),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack benny: created backlog task: Fix (TASK-2)", "info");
  });

  it("creates task without needs-investigation for long title", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 0, stdout: "TASK-3", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix This is a very long description that is at least fifty characters long here", ctx);
    expect(mockCp.spawnSync).toHaveBeenCalledWith(
      "backlog",
      expect.not.arrayContaining(["-l", expect.stringContaining("needs-investigation")]),
      expect.any(Object),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack benny: created backlog task: Fix (TASK-3)", "info");
  });

  it("handles backlog task create failure", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 1, stdout: "", stderr: "create failed" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("failed to create backlog task"), "error");
  });

  it("no remote found skips remote issue", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 0, stdout: "TASK-4", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("no remote found"), "info");
  });

  it("github remote without --yes shows manual command", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-5", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("GitHub remote detected"), "info");
  });

  it("github remote with --yes creates issue", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-6", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created GitHub issue"), "info");
  });

  it("github remote with --yes but gh create fails", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-7", stderr: "" }, { status: 1, stdout: "", stderr: "auth failed" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("failed to create GitHub issue"), "error");
  });

  it("gitlab remote without --yes shows manual command", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-8", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("GitLab remote detected"), "info");
  });

  it("gitlab remote with --yes creates issue", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-9", stderr: "" }, { status: 0, stdout: "", stderr: "" }, { status: 0, stdout: "https://gitlab.com/owner/repo/issues/1", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created GitLab issue"), "info");
  });

  it("gitlab remote with --yes but glab not found", async () => {
    setup(["backlog", "gh"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-10", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("glab CLI not found"), "error");
  });

  it("github remote with --yes but gh not found", async () => {
    setup(["backlog", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-11", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("gh CLI not found"), "error");
  });

  it("github remote with .git extension strips it", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git.git (fetch)", "", { status: 0, stdout: "TASK-12", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("owner/repo"), "info");
  });

  it("detects github ssh remote format", async () => {
    setup(["backlog", "gh", "glab"], "origin\tgit@github.com:owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-13", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("owner/repo"), "info");
  });

  it("detects gitlab ssh remote format", async () => {
    setup(["backlog", "gh", "glab"], "origin\tgit@gitlab.com:owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-14", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("GitLab remote detected"), "info");
  });

  it("handles empty backlog search result", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 0, stdout: "TASK-15", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created backlog task"), "info");
  });

  it("gitlab remote with --yes but glab create fails", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-16", stderr: "" }, { status: 0, stdout: "", stderr: "" }, { status: 1, stdout: "", stderr: "network error" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("failed to create GitLab issue"), "error");
  });

  it("detectRemote returns null for non-GitHub/non-GitLab remote", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://bitbucket.org/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-17", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("no remote found"), "info");
  });

  it("findExistingTask returns null when search succeeds but no title match", async () => {
    setup(["backlog", "gh", "glab"], null, "[ TASK-99 ] Different Issue", { status: 0, stdout: "TASK-18", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created backlog task"), "info");
  });

  it("github issue success returns raw stdout when no URL match", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-19", stderr: "" }, { status: 0, stdout: "Created issue #42", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Created issue #42"), "info");
  });

  it("github issue failure uses stdout as error when stderr empty", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-20", stderr: "" }, { status: 1, stdout: "something went wrong", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("something went wrong"), "error");
  });

  it("gitlab issue success returns raw stdout when no URL match", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-21", stderr: "" }, { status: 0, stdout: "", stderr: "" }, { status: 0, stdout: "Issue created!", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Issue created!"), "info");
  });

  it("gitlab issue failure uses stdout as error when stderr empty", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-22", stderr: "" }, { status: 0, stdout: "", stderr: "" }, { status: 1, stdout: "permission denied", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("permission denied"), "error");
  });

  it("gitlab issue failure uses fallback message when both stdout and stderr empty", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://gitlab.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-23", stderr: "" }, { status: 0, stdout: "", stderr: "" }, { status: 1, stdout: "", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("glab issue create failed"), "error");
  });

  it("github issue failure uses fallback message when both stdout and stderr empty", async () => {
    setup(["backlog", "gh", "glab"], "origin\thttps://github.com/owner/repo.git (fetch)", "", { status: 0, stdout: "TASK-24", stderr: "" }, { status: 1, stdout: "", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix --yes", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("gh issue create failed"), "error");
  });

  it("findExistingTask skips blank lines in search results", async () => {
    setup(["backlog", "gh", "glab"], null, "[ TASK-99 ] Other\n\n", { status: 0, stdout: "TASK-25", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created backlog task"), "info");
  });

  it("createBacklogTask returns raw stdout when no TASK- id in output", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 0, stdout: "done", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack benny: created backlog task: Fix (done)", "info");
  });

  it("backlog task create failure uses stderr for error message", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 1, stdout: "", stderr: "stderr msg" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("stderr msg"), "error");
  });

  it("backlog task create failure uses stdout when stderr is empty", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 1, stdout: "stdout msg", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("stdout msg"), "error");
  });

  it("backlog task create failure uses unknown error fallback", async () => {
    setup(["backlog", "gh", "glab"], null, "", { status: 1, stdout: "", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("unknown error"), "error");
  });

  it("findExistingTask hits line 193 empty output after trim", async () => {
    setup(["backlog", "gh", "glab"], null, "   ", { status: 0, stdout: "TASK-26", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("created backlog task"), "info");
  });

  it("findExistingTask skips blank lines then matches title", async () => {
    setup(["backlog", "gh", "glab"], null, "\n[ TASK-99 ] Fix\n", { status: 0, stdout: "TASK-26", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate found"), "info");
  });

  it("findExistingTask skips internal blank lines in search results", async () => {
    setup(["backlog", "gh", "glab"], null, "[ TASK-99 ] Other\n\n[ TASK-99 ] Fix", { status: 0, stdout: "TASK-99", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate found"), "info");
  });

  it("findExistingTask returns raw trimmed line when no TASK- id", async () => {
    setup(["backlog", "gh", "glab"], null, "] Fix", { status: 0, stdout: "TASK-30", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate found"), "info");
  });

  it("findExistingTask no-ID path returns trimmed line as task id", async () => {
    setup(["backlog", "gh", "glab"], null, "] Fix", { status: 0, stdout: "TASK-30", stderr: "" });
    const { handleBenny } = await import("./benny.js");
    await handleBenny("Fix", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate found"), "info");
  });
});
