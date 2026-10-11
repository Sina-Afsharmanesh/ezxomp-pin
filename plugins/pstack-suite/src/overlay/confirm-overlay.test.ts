import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock pi-tui before any imports that might trigger the lazy import
vi.mock("@oh-my-pi/pi-tui", () => {
  const FakeBox = class {
    children: unknown[] = [];
    handleInput?: (key: string) => void;
    addChild(c: unknown) { this.children.push(c); }
  };
  const FakeSpacer = class { constructor(_s?: unknown) {} };
  const FakeText = class { constructor(_t?: unknown, _px?: unknown, _py?: unknown) {} };
  const fakeMatchesKey = (data: string, key: string): boolean => {
    const d = data.toLowerCase();
    if (key === "enter" && (d === "enter" || d === "return" || d === "\r")) return true;
    if (key === "escape" && (d === "escape" || d === "esc")) return true;
    if (key === "ctrl+c" && (d === "ctrl+c" || d === "\u0003" || d === "\x03")) return true;
    return false;
  };
  return {
    Box: FakeBox,
    Text: FakeText,
    Spacer: FakeSpacer,
    matchesKey: fakeMatchesKey,
  };
});

import {
  renderConfirmOverlay,
  InMemoryRenderSurface,
  truncateLine,
  padRight,
  centerLine,
  buildBox,
  showConfirmOverlay,
  preflightToOverlayLines,
} from "./confirm-overlay.js";

describe("confirm-overlay — helpers", () => {
  it("truncateLine keeps short lines", () => {
    expect(truncateLine("short")).toBe("short");
  });

  it("truncateLine truncates long lines with ellipsis", () => {
    const long = "x".repeat(120);
    const t = truncateLine(long);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(t.endsWith("...")).toBe(true);
  });

  it("padRight pads short strings", () => {
    expect(padRight("hi", 5)).toBe("hi   ");
  });

  it("padRight truncates long strings", () => {
    expect(padRight("hello world", 5)).toBe("hello");
  });

  it("centerLine centers text within box width", () => {
    const centered = centerLine("hi", 10);
    expect(centered.length).toBeLessThanOrEqual(10);
    expect(centered.trim()).toBe("hi");
  });

  it("buildBox returns box-drawing unicode", () => {
    const box = buildBox("Title", ["line1"], " [ Confirm ]  [ Cancel ] ");
    expect(box).toContain("┌");
    expect(box).toContain("┐");
    expect(box).toContain("└");
    expect(box).toContain("┘");
    expect(box).toContain("Title");
    expect(box).toContain("line1");
  });
});

describe("confirm-overlay — renderConfirmOverlay", () => {
  it("Enter resolves true", async () => {
    const surface = new InMemoryRenderSurface();
    const p = renderConfirmOverlay(surface, {
      title: "Confirm",
      lines: ["Are you sure?"],
    });
    expect(surface.frames.length).toBeGreaterThanOrEqual(1);
    surface.pressKey("Enter");
    const result = await p;
    expect(result).toBe(true);
  });

  it("Escape resolves false", async () => {
    const surface = new InMemoryRenderSurface();
    const p = renderConfirmOverlay(surface, {
      title: "Confirm",
      lines: ["Cancel?"],
    });
    surface.pressKey("Escape");
    const result = await p;
    expect(result).toBe(false);
  });

  it("Ctrl-C resolves false", async () => {
    const surface = new InMemoryRenderSurface();
    const p = renderConfirmOverlay(surface, {
      title: "Confirm",
      lines: ["Cancel with ctrl+c?"],
    });
    surface.pressKey("Ctrl-C");
    const result = await p;
    expect(result).toBe(false);
  });

  it("custom labels appear in rendered frame", async () => {
    const surface = new InMemoryRenderSurface();
    const p = renderConfirmOverlay(surface, {
      title: "Ship",
      lines: ["Push to remote"],
      confirmLabel: "Ship It",
      cancelLabel: "Abort",
    });
    const frame = surface.frames[0]!;
    expect(frame).toContain("Ship It");
    expect(frame).toContain("Abort");
    surface.pressKey("Escape");
    await p;
  });

  it("narrow width truncates long lines", async () => {
    const surface = new InMemoryRenderSurface();
    const longLine = "x".repeat(200);
    const p = renderConfirmOverlay(surface, {
      title: "Truncate",
      lines: [longLine],
    });
    const frame = surface.frames[0]!;
    const frameLines = frame.split("\n");
    for (const fl of frameLines) {
      expect(fl.length).toBeLessThanOrEqual(110);
    }
    surface.pressKey("Enter");
    await p;
  });

  it("cancel does not call confirm callback — pure boolean return", async () => {
    const surface = new InMemoryRenderSurface();
    const p = renderConfirmOverlay(surface, {
      title: "Pure",
      lines: ["No side effects"],
    });
    surface.pressKey("Escape");
    const result = await p;
    expect(result).toBe(false);
  });
});

describe("confirm-overlay — preflightToOverlayLines", () => {
  it("renders checks with status glyphs", () => {
    const lines = preflightToOverlayLines({
      target: "main",
      at: new Date().toISOString(),
      checks: [
        { name: "branch", status: "pass", detail: "main" },
        { name: "dirty_tree", status: "warn", detail: "2 files" },
        { name: "auth", status: "block", detail: "missing" },
      ],
      overall: "warn",
    }, []);
    expect(lines.some((l) => l.includes("branch: main"))).toBe(true);
    expect(lines.some((l) => l.includes("dirty_tree: 2 files"))).toBe(true);
    expect(lines.some((l) => l.includes("auth: missing"))).toBe(true);
    expect(lines.at(-1)).toBe("Overall: WARN");
  });

  it("includes extra lines separated from checks", () => {
    const lines = preflightToOverlayLines(
      {
        target: "main",
        at: new Date().toISOString(),
        checks: [{ name: "repo", status: "pass" }],
        overall: "pass",
      },
      ["$ git push origin main", "Irreversible: branch will be pushed"],
    );
    const extraIdx = lines.indexOf("$ git push origin main");
    expect(extraIdx).toBeGreaterThan(0);
    expect(lines[extraIdx - 1]).toBe("");
  });

  it("handles empty checks", () => {
    const lines = preflightToOverlayLines({ target: "main", at: new Date().toISOString(), checks: [], overall: "pass" }, ["just extra"]);
    expect(lines).toContain("just extra");
  });

  it("omits overall line when pf.overall is undefined", () => {
    const lines = preflightToOverlayLines({ target: "main", at: new Date().toISOString(), checks: [] }, []);
    expect(lines.some((l) => l.startsWith("Overall:"))).toBe(false);
  });
});

describe("confirm-overlay — showConfirmOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when ctx.hasUI is false (headless)", async () => {
    const ctx = { hasUI: false, ui: {} };
    const result = await showConfirmOverlay(ctx, { title: "T", lines: ["x"] });
    expect(result).toBeUndefined();
  });

  it("returns undefined when ctx.ui.custom is not a function", async () => {
    const ctx = { hasUI: true, ui: { custom: undefined } };
    const result = await showConfirmOverlay(ctx, { title: "T", lines: ["x"] });
    expect(result).toBeUndefined();
  });

  it("Enter resolves true via fake TUI", async () => {
    let capturedComponent: { handleInput(key: string): void } | null = null;
    const fakeTUI = {
      showOverlay: (comp: { handleInput(key: string): void }) => { capturedComponent = comp; return { dismiss: () => {} }; },
      setFocus: () => {},
      requestRender: () => {},
    };

    const ctx = {
      hasUI: true,
      ui: {
        custom: async (factory: (tui: unknown, a: never, b: never, c: () => void) => Promise<unknown>) => {
          const result = await factory(fakeTUI, {} as never, {} as never, () => {});
          return result;
        },
      },
    };

    const p = showConfirmOverlay(ctx, { title: "Test", lines: ["Confirm?"] });
    await new Promise((r) => setTimeout(r, 10));
    capturedComponent!.handleInput("enter");
    const result = await p;
    expect(result).toBe(true);
  });

  it("Escape resolves false via fake TUI", async () => {
    let capturedComponent: { handleInput(key: string): void } | null = null;
    const fakeTUI = {
      showOverlay: (comp: { handleInput(key: string): void }) => { capturedComponent = comp; return { dismiss: () => {} }; },
      setFocus: () => {},
      requestRender: () => {},
    };

    const ctx = {
      hasUI: true,
      ui: {
        custom: async (factory: (tui: unknown, a: never, b: never, c: () => void) => Promise<unknown>) => {
          const result = await factory(fakeTUI, {} as never, {} as never, () => {});
          return result;
        },
      },
    };

    const p = showConfirmOverlay(ctx, { title: "Test", lines: ["Cancel?"] });
    await new Promise((r) => setTimeout(r, 10));
    capturedComponent!.handleInput("escape");
    const result = await p;
    expect(result).toBe(false);
  });

  it("Ctrl-C resolves false via fake TUI", async () => {
    let capturedComponent: { handleInput(key: string): void } | null = null;
    const fakeTUI = {
      showOverlay: (comp: { handleInput(key: string): void }) => { capturedComponent = comp; return { dismiss: () => {} }; },
      setFocus: () => {},
      requestRender: () => {},
    };

    const ctx = {
      hasUI: true,
      ui: {
        custom: async (factory: (tui: unknown, a: never, b: never, c: () => void) => Promise<unknown>) => {
          const result = await factory(fakeTUI, {} as never, {} as never, () => {});
          return result;
        },
      },
    };

    const p = showConfirmOverlay(ctx, { title: "Test", lines: ["Ctrl-C?"] });
    await new Promise((r) => setTimeout(r, 10));
    capturedComponent!.handleInput("\u0003");
    const result = await p;
    expect(result).toBe(false);
  });

  it("custom rejection resolves false (safe cancel)", async () => {
    const ctx = {
      hasUI: true,
      ui: { custom: async () => { throw new Error("TUI error"); } },
    };
    const result = await showConfirmOverlay(ctx, { title: "T", lines: ["x"] });
    expect(result).toBe(false);
  });

  it("settled guard prevents double resolve", async () => {
    let capturedComponent: { handleInput(key: string): void } | null = null;
    const fakeTUI = {
      showOverlay: (comp: { handleInput(key: string): void }) => { capturedComponent = comp; return { dismiss: () => {} }; },
      setFocus: () => {},
      requestRender: () => {},
    };

    const ctx = {
      hasUI: true,
      ui: {
        custom: async (factory: (tui: unknown, a: never, b: never, c: () => void) => Promise<unknown>) => {
          const result = await factory(fakeTUI, {} as never, {} as never, () => {});
          return result;
        },
      },
    };

    const p = showConfirmOverlay(ctx, { title: "Test", lines: ["Double?"] });
    await new Promise((r) => setTimeout(r, 10));
    capturedComponent!.handleInput("enter");
    capturedComponent!.handleInput("escape");
    const result = await p;
    expect(result).toBe(true); // first key wins
  });
});
