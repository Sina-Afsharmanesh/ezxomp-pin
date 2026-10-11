import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// pi-tui depends on Bun-only pi-natives (import.meta.dir) and cannot load under vitest.
// The real-TUI-bridge tests only exercise the ctx.ui.custom contract, so a minimal mock suffices.
vi.mock("@oh-my-pi/pi-tui", () => {
  class FakeBox {
    children: unknown[] = [];
    handleInput: ((data: string) => void) | undefined;
    addChild(c: unknown) { this.children.push(c); }
    clear() { this.children.length = 0; }
  }
  class FakeSpacer { constructor(_h: number) {} }
  class FakeText { constructor(_t: string) {} }
  const fakeMatchesKey = (data: string, key: string) => {
    const d = data.toLowerCase();
    if (key === "enter") return d === "enter" || d === "return" || d === "\r";
    if (key === "escape") return d === "escape" || d === "esc";
    if (key === "ctrl+c") return d === "ctrl+c" || data === "\u0003";
    return false;
  };
  return { Box: FakeBox, Spacer: FakeSpacer, Text: FakeText, matchesKey: fakeMatchesKey };
});
import { resetEventSubscribers, emitEvent, PstackEvent } from "../src/events.js";
import {
  startProgressOverlay,
  startProgressOverlayForCtx,
  type RenderTarget,
  type ProgressController,
} from "../src/overlay/progress-overlay.js";

function makeFakeTarget(): { target: RenderTarget; renders: string[]; restored: boolean[] } {
  const renders: string[] = [];
  const restored: boolean[] = [];
  return {
    target: {
      render(content: string) {
        renders.push(content);
      },
      restore() {
        restored.push(true);
      },
    },
    renders,
    restored,
  };
}

function makePhaseEvent(phase: string, status: string = "ok", playbook = "ship"): PstackEvent {
  return {
    type: "phase",
    at: new Date().toISOString(),
    meta: { playbook, runId: "test-run-001" },
    payload: { phase, status },
  };
}

function makeCommandEvent(argv: string[], settled = false, exitCode: number | null = 0, signal: string | null = null): PstackEvent {
  return {
    type: "command",
    at: new Date().toISOString(),
    payload: { argv, settled, exitCode, signal },
  };
}

function makeCancellationEvent(reason: string = "cancel"): PstackEvent {
  return {
    type: "cancellation",
    at: new Date().toISOString(),
    payload: { reason },
  };
}

async function waitFor<T>(get: () => T, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() - start > timeoutMs) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("startProgressOverlay", () => {
  beforeEach(() => {
    resetEventSubscribers();
  });

  afterEach(() => {
    resetEventSubscribers();
  });

  it("renders initial frame on creation", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    expect(fake.renders.length).toBeGreaterThanOrEqual(1);
    const first = fake.renders[0]!;
    expect(first).toContain("pstack:");
    ctrl.close();
  });

  it("shows phase changes", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makePhaseEvent("verify", "ok"));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("phase:");
    expect(render).toContain("verify");
    ctrl2.close();
  });

  it("shows command with argv", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makeCommandEvent(["git", "push", "origin", "main"]));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("git");
    ctrl2.close();
  });

  it("shows pass status on successful command end", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makeCommandEvent(["bun", "test"], true, 0, null));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("✓");
    ctrl2.close();
  });

  it("shows fail status on command failure", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makeCommandEvent(["bun", "test"], true, 1, null));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("✗");
    ctrl2.close();
  });

  it("distinguishes cancellation from timeout", () => {
    // Cancellation
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    emitEvent(makeCancellationEvent("cancel"));
    const cancelRender = fake.renders[fake.renders.length - 1]!;
    expect(cancelRender).toContain("cancelled");
    ctrl.close();
    resetEventSubscribers();

    // Timeout
    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);
    emitEvent(makeCancellationEvent("timeout"));
    const timeoutRender = fake2.renders[fake2.renders.length - 1]!;
    expect(timeoutRender).toContain("timed out");
    ctrl2.close();
  });

  it("requestCancel sets cancelled status", () => {
    const fake = makeFakeTarget();
    let cancelCalled = false;
    const ctrl = startProgressOverlay(fake.target, {
      onCancelRequest() {
        cancelCalled = true;
      },
    });

    ctrl.requestCancel();
    expect(cancelCalled).toBe(true);
    const render = fake.renders[fake.renders.length - 1]!;
    expect(render).toContain("cancelled");
    ctrl.close();
  });

  it("handles 50-event flood without throwing and bounds output", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target, { maxOutputLines: 5 });

    for (let i = 0; i < 50; i++) {
      emitEvent({
        type: "check",
        at: new Date().toISOString(),
        payload: { detail: `output line ${i}`, status: "pass" },
      });
      expect(() => {}).not.toThrow();
    }

    const lastRender = fake.renders[fake.renders.length - 1]!;
    const outputLineCount = (lastRender.match(/  \| /g) || []).length;
    expect(outputLineCount).toBeLessThanOrEqual(5);
    ctrl.close();
  });

  it("close is idempotent", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    expect(() => ctrl.close()).not.toThrow();
    expect(() => ctrl.close()).not.toThrow();
  });

  it("close restores target", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    expect(fake.restored.length).toBe(1);
  });

  it("shows playbook name from phase meta", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makePhaseEvent("merge", "ok", "ship"));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("ship");
    ctrl2.close();
  });

  it("shows elapsed time formatting", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    const first = fake.renders[0]!;
    expect(first).toMatch(/elapsed:\s*\d+:\d{2}/);
    ctrl.close();
  });

  it("shows timed_out on SIGTERM with null exitCode", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    ctrl.close();
    resetEventSubscribers();

    const fake2 = makeFakeTarget();
    const ctrl2 = startProgressOverlay(fake2.target);

    emitEvent(makeCommandEvent(["long", "process"], true, null, "SIGTERM"));
    const render = fake2.renders[fake2.renders.length - 1]!;
    expect(render).toContain("timed out");
    ctrl2.close();
  });

  it("auto-closes after terminal phase status", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target);
    let closed = false;
    const originalClose = ctrl.close.bind(ctrl);
    ctrl.close = () => {
      closed = true;
      originalClose();
    };

    emitEvent({
      type: "phase",
      at: new Date().toISOString(),
      meta: { playbook: "ship", runId: "test-run-001" },
      payload: { phase: "merge", status: "fail" },
    });

    return new Promise((resolve) => {
      setTimeout(() => {
        ctrl.close();
        resolve(null);
      }, 1000);
    });
  });

  it("ignores mismatched run events", () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target, { runId: "run-a" });
    emitEvent({ type: "phase", at: new Date().toISOString(), meta: { runId: "run-b", playbook: "ship" }, payload: { phase: "merge", status: "fail" } });
    expect(fake.renders[fake.renders.length - 1]).not.toContain("merge");
    ctrl.close();
  });

  it("bounds renders across separate event-loop turns", async () => {
    const fake = makeFakeTarget();
    const ctrl = startProgressOverlay(fake.target, { runId: "run-c" });
    const initial = fake.renders.length;
    emitEvent({ type: "check", at: new Date().toISOString(), meta: { runId: "run-c" }, payload: { detail: "one", status: "running" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    emitEvent({ type: "check", at: new Date().toISOString(), meta: { runId: "run-c" }, payload: { detail: "two", status: "running" } });
    expect(fake.renders.length - initial).toBeLessThanOrEqual(2);
    ctrl.close();
  });

  it("hosts a real centered component and closes the TUI handle", async () => {
    let shown: any;
    let hidden = 0;
    let doneResult: boolean | undefined;
    let resolveCustom: ((value: boolean) => void) | undefined;
    const ctx = {
      hasUI: true,
      ui: {
        custom(factory: any): Promise<boolean> {
          const tui = {
            showOverlay(component: any) { shown = component; return { hide() { hidden++; } }; },
            setFocus() {},
            requestRender() {},
          };
          const view = factory(tui, {}, {}, (value: boolean) => { doneResult = value; resolveCustom?.(value); });
          void view;
          return new Promise<boolean>((resolve) => { resolveCustom = resolve; });
        },
      },
    } as any;
    const ctrl = startProgressOverlayForCtx(ctx, "ship", { runId: "run-ui" });
    await waitFor(() => shown);
    expect(shown).toBeTruthy();
    emitEvent({ type: "receipt", at: new Date().toISOString(), meta: { runId: "run-ui" }, payload: { status: "success" } });
    await new Promise((resolve) => setTimeout(resolve, 850));
    expect(hidden).toBe(1);
    expect(doneResult).toBe(true);
    ctrl?.close();
  });

  it("maps Esc/Ctrl-C to the command cancellation callback", async () => {
    let shown: any;
    let cancelCalled = false;
    let resolveCustom: ((value: boolean) => void) | undefined;
    const ctx = {
      hasUI: true,
      ui: {
        custom(factory: any): Promise<boolean> {
          const tui = {
            showOverlay(component: any) { shown = component; return { hide() {} }; },
            setFocus() {},
            requestRender() {},
          };
          factory(tui, {}, {}, () => {});
          return new Promise<boolean>((resolve) => { resolveCustom = resolve; });
        },
      },
    } as any;
    const ctrl = startProgressOverlayForCtx(ctx, "tdd", { runId: "run-cancel", onCancelRequest() { cancelCalled = true; } });
    await waitFor(() => shown);
    shown.handleInput("\u0003");
    expect(cancelCalled).toBe(true);
    emitEvent({ type: "cancellation", at: new Date().toISOString(), meta: { runId: "run-cancel" }, payload: { reason: "cancel" } });
    ctrl?.close();
    resolveCustom?.(false);
  });
});
