import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock @oh-my-pi/pi-coding-agent (virtual) — must be before any index import
// @ts-expect-error — virtual option not in these vitest types but supported at runtime
vi.mock("@oh-my-pi/pi-coding-agent", () => ({}), { virtual: true });

// Mock node:child_process — utils.isToolAvailable uses spawnSync("which", [tool])
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

// Fake skill bodies so router dispatch tests never touch the real skills tree
vi.mock("./playbook-dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./playbook-dispatch.js")>();
  return {
    ...actual,
    loadSkillBody: vi.fn((name: string) => {
      if (name === "mode") {
        return "Mode intro\n\n## Core Principles\n- principle one\n- principle two";
      }
      return `# ${name}\nFAKE-SKILL-BODY-MARKER for ${name}`;
    }),
  };
});

vi.mock("./commands/review.js", () => ({
  handleReview: vi.fn(),
}));

describe("index.ts — plugin registration coverage", () => {
  let tmpDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let spawnSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-idx-"));

    const cp = await import("node:child_process");
    spawnSync = cp.spawnSync as ReturnType<typeof vi.fn>;
    // Default: all tools available
    spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") {
        const tool = args[0];
        if (tool === "backlog" || tool === "gh") {
          return { status: 0 };
        }
      }
      return { status: 0 };
    });

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockPi(options: {
    registerCommandThrows?: string[];
    onThrows?: boolean;
    settings?: Record<string, unknown>;
  } = {}) {
    const registeredCommands: string[] = [];
    const registeredHandlers: Record<string, (...args: unknown[]) => unknown> = {};
    const toolCallHandlers: Array<(event: unknown) => unknown> = [];
    const sendUserMessage = vi.fn();

    const registerCommand = vi.fn((name: string, opts: { description: string; handler: unknown }) => {
      if (options.registerCommandThrows?.includes(name)) {
        throw new Error(`inject: ${name}`);
      }
      registeredCommands.push(name);
      registeredHandlers[name] = opts.handler as (...args: unknown[]) => unknown;
    });

    const on = vi.fn((event: string, handler: (e: unknown) => unknown) => {
      if (event === "tool_call" && options.onThrows) {
        throw new Error("inject on");
      }
      if (event === "tool_call") {
        toolCallHandlers.push(handler);
      }
    });

    return {
      registerCommand,
      on,
      sendUserMessage,
      ...(options.settings !== undefined ? { settings: options.settings } : {}),
      registeredCommands,
      registeredHandlers,
      toolCallHandlers,
    };
  }

  async function loadPlugin(pi: any) {
    const mod = await import("./index.js");
    const init = mod.default;
    if (typeof init === "function") {
      await init(pi);
    }
    return mod;
  }

  function makeCtx() {
    return {
      cwd: tmpDir,
      ui: { notify: vi.fn() },
      hasUI: false,
    } as any;
  }

  // ── Registration ──────────────────────────────────────────────

  it("registers exactly one command named 'pstack'", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(pi.registeredCommands.length).toBe(1);
    expect(pi.registeredCommands).toContain("pstack");
  });

  it("calls registerCommand exactly once with name 'pstack'", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(pi.registerCommand.mock.calls.length).toBe(1);
    expect(pi.registerCommand.mock.calls[0][0]).toBe("pstack");
  });

  it("registeredCommandCount goes 0 -> 1", async () => {
    const mod = await import("./index.js");
    mod.resetRegisteredCommandCount();
    expect(mod.getRegisteredCommandCount()).toBe(0);
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(mod.getRegisteredCommandCount()).toBe(1);
  });

  it("resets counter via resetRegisteredCommandCount", async () => {
    const pi = makeMockPi();
    const mod = await loadPlugin(pi);
    expect(mod.getRegisteredCommandCount()).toBeGreaterThan(0);
    mod.resetRegisteredCommandCount();
    expect(mod.getRegisteredCommandCount()).toBe(0);
  });

  // ── Registration failure (registerCommand throws) ────────────

  it("catches registerCommand throw and logs error via console.error", async () => {
    const pi = makeMockPi({ registerCommandThrows: ["pstack"] });
    await loadPlugin(pi);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to register "pstack"'),
    );
  });

  it("catches registerCommand throw with non-Error and logs String(error)", async () => {
    const pi = makeMockPi();
    pi.registerCommand.mockImplementation((name: string) => {
      if (name === "pstack") {
        throw "string error";
      }
      pi.registeredCommands.push(name);
    });
    await loadPlugin(pi);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("string error"),
    );
  });

  it("logs failures with console.warn when the pstack registration fails", async () => {
    const pi = makeMockPi({ registerCommandThrows: ["pstack"] });
    await loadPlugin(pi);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 command(s) failed to register"),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("pstack"),
    );
  });

  it("does not log console.warn when no commands fail", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("failed to register"),
    );
  });

  // ── Settings resolution branches ─────────────────────────────

  it("resolves settings from pi.settings when present", async () => {
    const pi = makeMockPi({ settings: { defaultModel: "claude-sonnet-4-20250514" } });
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    expect(handler).toBeDefined();
  });

  it("resolves empty settings when pi.settings is undefined", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(pi.registeredCommands).toContain("pstack");
  });

  // ── Backlog check wrapping ───────────────────────────────────

  it("with backlogOk=true a routed subcommand runs without backlog error", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("info", mockCtx);
    expect(mockCtx.ui.notify).toHaveBeenCalled();
    expect(mockCtx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("backlog.md CLI is required"),
    );
  });

  it("with backlog missing the handler notifies backlog error then routes setup", async () => {
    spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") {
        if (args[0] === "backlog") return { status: 1 };
        return { status: 0 };
      }
      return { status: 0 };
    });

    const pi = makeMockPi();
    await loadPlugin(pi);

    const handler = pi.registeredHandlers["pstack"]!;
    expect(handler).toBeDefined();

    const mockCtx = makeCtx();
    await handler!("setup", mockCtx);

    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("backlog.md CLI is required"),
      "error",
    );
  });

  it("notifies backlog missing only once (idempotent)", async () => {
    spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") {
        if (args[0] === "backlog") return { status: 1 };
        return { status: 0 };
      }
      return { status: 0 };
    });

    const pi = makeMockPi();
    await loadPlugin(pi);

    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();

    await handler!("deslop", mockCtx);
    await handler!("deslop", mockCtx);

    const backlogErrorCalls = mockCtx.ui.notify.mock.calls.filter(
      (call: any[]) =>
        call[0] && String(call[0]).includes("backlog.md CLI is required"),
    );
    expect(backlogErrorCalls.length).toBe(1);
  });

  // ── Router: help/info/menu ───────────────────────────────────

  it("'info' notifies merged help with version, plugin name, and playbooks line", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("info", mockCtx);
    const text = mockCtx.ui.notify.mock.calls[0]![0] as string;
    expect(text).toContain("pstack-suite v1.0.0");
    expect(text).toContain("@ezxomp/pstack-suite");
    expect(text).toContain("/pstack setup");
    expect(text).toContain("/pstack mode");
    expect(text).toContain("23 playbooks");
  });

  it("empty args shows the same help menu", async () => {
    const pi = makeMockPi({ settings: {} });
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("", mockCtx);
    const text = mockCtx.ui.notify.mock.calls[0]![0] as string;
    expect(text).toContain("not configured");
    expect(text).toContain("/pstack benny");
  });

  it("'help' routes to the menu too", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("help", mockCtx);
    const text = mockCtx.ui.notify.mock.calls[0]![0] as string;
    expect(text).toContain("23 playbooks");
  });

  // ── Router: explicit-task playbook dispatch via sendUserMessage ──

  it("'mode feature fix the login crash' sends one composed prompt", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("mode feature fix the login crash", mockCtx);
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const prompt = pi.sendUserMessage.mock.calls[0][0] as string;
    expect(prompt).toContain("PSTACK Playbook: feature");
    expect(prompt).toContain("FAKE-SKILL-BODY-MARKER for feature");
    expect(prompt).toContain("## Core Principles");
    expect(prompt).toContain("fix the login crash");
  });

  it("'bugfix patch the parser' routes via KEYWORD_MAP to bug-fix", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("bugfix patch the parser", mockCtx);
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const prompt = pi.sendUserMessage.mock.calls[0][0] as string;
    expect(prompt).toContain("PSTACK Playbook: bug-fix");
    expect(prompt).toContain("patch the parser");
  });

  it("'bogus stuff' sends nothing and errors with known subcommands/playbooks", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("bogus stuff", mockCtx);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(expect.any(String), "error");
    const text = mockCtx.ui.notify.mock.calls[0][0] as string;
    expect(text).toContain("bogus");
    expect(text).toContain("review");
    expect(text).toContain("feature");
  });

  it("'resume' exercises the mode resume path without sending", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("resume", mockCtx);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(mockCtx.ui.notify).toHaveBeenCalled();
    const text = mockCtx.ui.notify.mock.calls[0][0] as string;
    expect(text).toContain("Resume");
  });

  it("'review --deep' reaches the review handler with '--deep'", async () => {
    const review = await import("./commands/review.js");
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.registeredHandlers["pstack"]!;
    const mockCtx = makeCtx();
    await handler!("review --deep", mockCtx);
    expect(review.handleReview).toHaveBeenCalledWith("--deep", mockCtx);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  // ── Hook registration ────────────────────────────────────────

  it("registers tool_call listener via pi.on", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
    expect(pi.toolCallHandlers.length).toBe(1);
  });

  it("catches pi.on throw and logs error", async () => {
    const pi = makeMockPi({ onThrows: true });
    await loadPlugin(pi);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to register recall/reflect hook"),
    );
  });

  it("hook passes through non-recall/reflect tools", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.toolCallHandlers[0]!;
    const result = handler({
      toolName: "fs_read",
      input: { path: "/tmp/foo" },
    });
    expect(result).toBeUndefined();
  });

  it("hook passes through non-string query", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.toolCallHandlers[0]!;
    const result = handler({
      toolName: "recall",
      input: { query: 123 },
    });
    expect(result).toBeUndefined();
  });

  it("hook passes through recall query containing pstack keyword", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.toolCallHandlers[0]!;
    const result = handler({
      toolName: "recall",
      input: { query: "how does pstack mode work" },
    });
    expect(result).toBeUndefined();
  });

  it("hook revises recall query without pstack keyword", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.toolCallHandlers[0]!;
    const result = handler({
      toolName: "recall",
      input: { query: "tell me about the architecture" },
    });
    expect(result).toBeDefined();
    expect((result as { input: { query: string } }).input.query).toContain("tell me about the architecture");
    expect((result as { input: { query: string } }).input.query).toContain("pstack");
  });

  it("hook revises reflect query without pstack keyword", async () => {
    const pi = makeMockPi();
    await loadPlugin(pi);
    const handler = pi.toolCallHandlers[0]!;
    const result = handler({
      toolName: "reflect",
      input: { query: "what is the setup process" },
    });
    expect((result as { input: { query: string } }).input.query).toContain("pstack");
  });
});
