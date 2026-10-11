import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// Mock the external dependency BEFORE any import
vi.mock("@oh-my-pi/pi-coding-agent", () => ({}));

describe("recall/reflect hook", () => {
  let toolCallHandler: any = null;
  let registeredCommands: string[] = [];

  function makeMockPi() {
    return {
      registerCommand: vi.fn((_name: string) => { registeredCommands.push(_name); }),
      on: vi.fn((event: string, handler: (event: { toolName: string; input: { query?: string } }) => unknown) => {
        if (event === "tool_call") toolCallHandler = handler;
      }),
      settings: {},
    };
  }

  beforeEach(() => {
    toolCallHandler = null;
    registeredCommands = [];
  });

  async function loadPlugin() {
    const pi = makeMockPi();
    // Import and call default export
    const mod = await import("./index.js");
    // Get the exported test helpers
    const init = mod.default || mod;
    if (typeof init === "function") {
      await init(pi as unknown as ExtensionAPI);
    }
    return pi;
  }

  it("registers tool_call listener via pi.on", async () => {
    const pi = await loadPlugin();
    expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
    expect(toolCallHandler).toBeDefined();
  });

  it("appends context to recall queries without pstack keyword", async () => {
    const pi = await loadPlugin();
    toolCallHandler = null;
    // Re-read handler from pi.on calls
    const calls = pi.on.mock.calls;
    for (const call of calls) {
      if (call[0] === "tool_call") toolCallHandler = call[1];
    }
    const result = toolCallHandler({
      toolName: "recall",
      input: { query: "tell me about the architecture" },
    });
    expect(result).toBeDefined();
    expect(result.input.query).toContain("pstack");
    expect(result.input.query).toContain("tell me about the architecture");
  });

  it("appends context to reflect queries without pstack keyword", async () => {
    const pi = await loadPlugin();
    toolCallHandler = null;
    const calls = pi.on.mock.calls;
    for (const call of calls) {
      if (call[0] === "tool_call") toolCallHandler = call[1];
    }
    const result = toolCallHandler({
      toolName: "reflect",
      input: { query: "what is the setup process" },
    });
    expect(result.input.query).toContain("pstack");
  });

  it("passes through non-recall/reflect tools unchanged", async () => {
    const pi = await loadPlugin();
    toolCallHandler = null;
    const calls = pi.on.mock.calls;
    for (const call of calls) {
      if (call[0] === "tool_call") toolCallHandler = call[1];
    }
    const result = toolCallHandler({
      toolName: "fs_write",
      input: { path: "/tmp/foo" },
    });
    expect(result).toBeUndefined();
  });

  it("passes through recall with pstack keyword unchanged", async () => {
    const pi = await loadPlugin();
    toolCallHandler = null;
    const calls = pi.on.mock.calls;
    for (const call of calls) {
      if (call[0] === "tool_call") toolCallHandler = call[1];
    }
    const result = toolCallHandler({
      toolName: "recall",
      input: { query: "how does pstack mode work" },
    });
    expect(result).toBeUndefined();
  });

  it("registers a single unified pstack command", async () => {
    const pi = await loadPlugin();
    expect(registeredCommands.length).toBe(1);
    expect(registeredCommands).toContain("pstack");
  });
});
