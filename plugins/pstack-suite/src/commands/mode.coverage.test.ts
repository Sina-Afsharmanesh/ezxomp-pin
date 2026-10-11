import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeCtx(cwd: string) {
  return {
    cwd,
    ui: { notify: vi.fn() },
    hasUI: true,
  } as any;
}

describe("mode coverage", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-mode-cov-"));
    ctx = makeCtx(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("keyword-map substring fallback (lines 87-93)", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("review", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("model config display when role has config (line 103-104)", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "claude-sonnet", reviewer: "claude-opus", architect: "claude-sonnet-4-5-20250514" },
      default: "claude-sonnet",
    }));

    const { handleMode } = await import("./mode.js");
    await handleMode("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("invalid input path - no mode found (lines 114-117)", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("nonexistent-mode-that-does-not-exist", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Unknown playbook");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("mode without model override works", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("implement", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("help mode (lines 45-68)", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("help", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("PSTACK MODE");
    expect(output).toContain("Available playbooks");
  });

  it("selected playbook shows confirmation (lines 114-117)", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("feature", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Selected: feature");
    expect(output).toContain("Confirm with: /pstack mode feature");
  });

  // ---- TASK-6: Selection writes run file ----
  it("selection writes a run file", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("feature", ctx);

    const runDir = join(tmpDir, ".omp", "pstack-runs");
    expect(existsSync(runDir)).toBe(true);

    const files = readdirSync(runDir);
    expect(files.length).toBeGreaterThan(0);

    const file = files[0];
    if (!file) throw new Error("no run files found");
    const raw = readFileSync(join(runDir, file), "utf-8");
    const runData = JSON.parse(raw as string);
    expect(runData.playbook).toBe("feature");
    expect(runData.phase).toBe("selected");
    expect(runData.target).toBe(tmpDir);
    expect(runData.status).toBe("running");
  });

  // ---- TASK-6: Unknown playbook errors + no run started ----
  it("unknown playbook errors + no run file", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("totally-unknown-playbook", ctx);

    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Unknown playbook");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Unknown playbook"), "error");

    const runDir = join(tmpDir, ".omp", "pstack-runs");
    expect(existsSync(runDir)).toBe(false);
  });

  // ---- TASK-6: Resume prints last confirmed action / next action ----
  it("resume prints last confirmed action and next safe action", async () => {
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    mkdirSync(runDir, { recursive: true });
    const runData = {
      runId: "test-run-001",
      playbook: "ship",
      phase: "verify",
      target: tmpDir,
      startedAt: "2025-01-01T00:00:00.000Z",
      finishedAt: "2025-01-01T01:00:00.000Z",
      status: "failed",
      actions: [
        { action: "verify", at: "2025-01-01T00:10:00.000Z", result: "ok", detail: "tsc passed" },
        { action: "push", at: "2025-01-01T00:20:00.000Z", result: "failed", detail: "network error" },
      ],
      lastConfirmedAction: "verify",
    };
    writeFileSync(join(runDir, "test-run-001.json"), JSON.stringify(runData, null, 2));

    const { handleMode } = await import("./mode.js");
    await handleMode("--resume", ctx);

    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("PSTACK MODE — Resume");
    expect(output).toContain("Playbook: ship");
    expect(output).toContain("Phase: verify");
    expect(output).toContain("Last confirmed action: verify");
    expect(output).toContain("Next safe action: push");
    expect(output).toContain("Run ID: test-run-001");
  });

  it("resume with no previous run shows helpful message", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("--resume", ctx);

    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("PSTACK MODE — Resume");
    expect(output).toContain("No previous run found");
  });

  // ---- TASK-6: Menu still works when no arg ----
  it("menu still works when no arg", async () => {
    const { handleMode } = await import("./mode.js");
    await handleMode("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("PSTACK MODE — Engineering Playbook Routing");
    expect(output).toContain("Available playbooks");
    expect(output).toContain("Select: /pstack mode <playbook>");
    expect(output).toContain("Resume: /pstack mode --resume");
  });

  // ---- TASK-6: nextSafeAction mapping ----
  it("nextSafeAction maps correctly", async () => {
    const { nextSafeAction } = await import("./mode.js");
    expect(nextSafeAction(undefined, "feature")).toBe("select/start");
    expect(nextSafeAction("verify", "ship")).toBe("push");
    expect(nextSafeAction("push", "opening-a-pr")).toBe("pr");
    expect(nextSafeAction("push", "ship")).toBe("pr/merge");
    expect(nextSafeAction("pr", "opening-a-pr")).toBe("merge");
    expect(nextSafeAction("branch", "opening-a-pr")).toBe("continue");
  });
  // ---- TASK-6: Non-implementer playbook resolves correct role ----
  it("shipping playbook resolves with reviewer role", async () => {
    // Setup config with reviewer role
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { reviewer: "claude-opus", implementer: "claude-sonnet" },
    }));

    const { handleMode, PLAYBOOK_ROLES } = await import("./mode.js");

    // Verify PLAYBOOK_ROLES mapping is correct
    expect(PLAYBOOK_ROLES["shipping"]).toBe("reviewer");
    expect(PLAYBOOK_ROLES["opening-a-pr"]).toBe("reviewer");
    expect(PLAYBOOK_ROLES["eval"]).toBe("reviewer");
    expect(PLAYBOOK_ROLES["feature"]).toBe("implementer");
    expect(PLAYBOOK_ROLES["multi-phase-plan"]).toBe("architect");
    expect(PLAYBOOK_ROLES["authoring-a-skill"]).toBe("writer");

    // Verify shipping resolves through reviewer role
    await handleMode("shipping", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Selected: shipping");
    expect(output).toContain("Role: reviewer");
    expect(output).toContain("Model: claude-opus (source: role)");
  });

  // ---- TASK-6: Menu default still uses implementer role ----
  it("menu mode with no playbook defaults to implementer role", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "claude-sonnet", reviewer: "claude-opus" },
    }));

    const { handleMode } = await import("./mode.js");
    await handleMode("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    // Menu mode shows raw "Models:" config line (not individual "Model:" — that is selection-only)
    expect(output).toContain("Models: implementer=claude-sonnet, reviewer=claude-opus");
  });


  // ---- TASK-32: parseModeArgs unit cases ----
  it("parseModeArgs: empty args -> empty task, no playbook", async () => {
    const { parseModeArgs } = await import("./mode.js");
    expect(parseModeArgs("")).toEqual({ task: "" });
    expect(parseModeArgs("   ")).toEqual({ task: "" });
  });

  it("parseModeArgs: single token -> playbook candidate, empty task", async () => {
    const { parseModeArgs } = await import("./mode.js");
    expect(parseModeArgs("feature")).toEqual({ playbook: "feature", task: "" });
  });

  it("parseModeArgs: multi-space task preserved trimmed", async () => {
    const { parseModeArgs } = await import("./mode.js");
    expect(parseModeArgs("  FEATURE   fix   the   crash  ")).toEqual({
      playbook: "feature",
      task: "fix the crash",
    });
  });

  it("parseModeArgs: uppercase playbook lowercased", async () => {
    const { parseModeArgs } = await import("./mode.js");
    expect(parseModeArgs("BugFix patch parser")).toEqual({ playbook: "bugfix", task: "patch parser" });
  });

  it("parseModeArgs: resume strings pass through untouched", async () => {
    const { parseModeArgs } = await import("./mode.js");
    expect(parseModeArgs("--resume")).toEqual({ task: "--resume" });
    expect(parseModeArgs("resume")).toEqual({ task: "resume" });
  });

  // ---- TASK-32: explicit-task dispatch sends composed prompt ----
  it("explicit task sends composed prompt, writes dispatched receipt, emits event", async () => {
    const events = await import("../events.js");
    const seen: any[] = [];
    events.onPstackEvent((e) => seen.push(e));

    const send = vi.fn();
    const fakeBody = (name: string) =>
      name === "mode"
        ? "intro\n## Core Principles\n- principle A\n- principle B"
        : "# Feature\n\n### Phase 1\n- x\n\n**Gate:** g";
    const { handleMode } = await import("./mode.js");

    await handleMode("feature fix the login crash", ctx, { send, loadSkillBody: fakeBody });

    expect(send).toHaveBeenCalledTimes(1);
    const prompt = send.mock.calls[0][0] as string;
    expect(prompt).toContain("# PSTACK Playbook: feature");
    expect(prompt).toContain("Role: implementer");
    expect(prompt).toContain("### Phase 1");
    expect(prompt).toContain("**Gate:** g");
    expect(prompt).toContain("## Core Principles");
    expect(prompt).toContain("- principle A");
    expect(prompt).toContain("fix the login crash");
    expect(prompt).toContain("Execute every phase above in order");

    // receipt persisted with phase="dispatched"
    const runDir = join(tmpDir, ".omp", "pstack-runs");
    expect(existsSync(runDir)).toBe(true);
    const files = readdirSync(runDir);
    const raw = readFileSync(join(runDir, files[0]!), "utf-8");
    const runData = JSON.parse(raw as string);
    expect(runData.playbook).toBe("feature");
    expect(runData.phase).toBe("dispatched");

    // phase event emitted
    expect(seen.some((e) => e.type === "phase" && e.payload?.phase === "dispatched" && e.meta?.playbook === "feature")).toBe(true);

    // confirm overlay skipped — only the dispatch confirmation notify fires
    expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
    expect(String(ctx.ui.notify.mock.calls[0][0])).toContain("feature");
  });

  it("explicit task with keyword token routes through KEYWORD_MAP", async () => {
    const send = vi.fn();
    const { handleMode } = await import("./mode.js");
    await handleMode("bugfix patch the parser", ctx, {
      send,
      loadSkillBody: (name: string) => `# ${name} body`,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const prompt = send.mock.calls[0][0] as string;
    expect(prompt).toContain("PSTACK Playbook: bug-fix");
    expect(prompt).toContain("patch the parser");
  });

  // ---- TASK-32: missing skill body errors without sending ----
  it("loadSkillBody returning null errors naming skills/<pb>/SKILL.md and never sends", async () => {
    const send = vi.fn();
    const { handleMode } = await import("./mode.js");
    await handleMode("feature fix the login crash", ctx, {
      send,
      loadSkillBody: () => null,
    });
    expect(send).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "error");
    const output = ctx.ui.notify.mock.calls[0][0] as string;
    expect(output).toContain("skills/feature/SKILL.md");
  });

  it("unknown playbook token with explicit task errors without sending", async () => {
    const send = vi.fn();
    const { handleMode } = await import("./mode.js");
    await handleMode("bogus do the thing", ctx, { send, loadSkillBody: () => "# x" });
    expect(send).not.toHaveBeenCalled();
    const output = ctx.ui.notify.mock.calls[0][0] as string;
    expect(output).toContain("Unknown playbook");
  });

  // ---- TASK-32: resume precedence over playbook parse ----
  it("'resume' takes precedence over playbook parsing (no dispatch)", async () => {
    const send = vi.fn();
    const { handleMode } = await import("./mode.js");
    await handleMode("resume", ctx, { send, loadSkillBody: () => "# x" });
    expect(send).not.toHaveBeenCalled();
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("PSTACK MODE — Resume");
    expect(output).toContain("No previous run found");
  });
});
