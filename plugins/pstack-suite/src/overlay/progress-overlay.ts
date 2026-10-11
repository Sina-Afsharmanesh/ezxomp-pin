import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { Component } from "@oh-my-pi/pi-tui";
import { onPstackEvent, redactSecrets, type PstackEvent } from "../events.js";
import { randomUUID } from "node:crypto";

/** Target for rendering overlay content. */
export interface RenderTarget {
  render(content: string): void;
  restore?(): void;
}

/** Options for the progress overlay. */
export interface ProgressOverlayOpts {
  /** Called when user requests cancellation. */
  onCancelRequest?(): void;
  /** Maximum output lines to display. Default 5. */
  maxOutputLines?: number;
  /** Playbook name for display. Default "pstack". */
  playbook?: string;
  /** Run ID to correlate with emitted events. Default: generated for this controller. */
  runId?: string;
  /** Called once when a terminal event is observed. */
  onTerminal?(status: string): void;
}

/** Controller returned by startProgressOverlay. */
export interface ProgressController {
  readonly runId: string;
  requestCancel(): void;
  close(): void;
  /** Flush any pending render — exposed for test synchronization. */
  flush?(): void;
}

/** Internal progress state. */
interface ProgressState {
  runId: string;
  playbook: string;
  phase: string;
  command: string;
  status: string;
  elapsedMs: number;
  outputLines: string[];
  startTime: number;
}

/** Shorten runId for display. */
function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

/** Format elapsed ms as m:ss. */
function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Truncate string to max length with ellipsis. */
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}



/** Unicode status symbol. */
function sym(status: string): string {
  const map: Record<string, string> = {
    pass: "\u2713", ok: "\u2713",
    fail: "\u2717", failed: "\u2717", blocked: "\u2717",
    warn: "\u26a0",
    skip: "\u25CE", skipped: "\u25CE",
    timed_out: "\u29d7",
    cancelled: "\u29c4",
    cancelling: "\u25CE",
    pending: "\u25CB",
  };
  return map[status] ?? "?";
}

/** Render overlay frame from state. */
function _frame(st: ProgressState): string {
  const { playbook, phase, command, status, elapsedMs, outputLines } = st;
  const s = sym(status);
  const lines: string[] = [
    ` ${s} pstack: ${shortId(st.runId)} \u2014 ${trunc(playbook, 20)}`,
    ` phase: ${trunc(phase, 30)}  elapsed: ${elapsed(elapsedMs)}`,
  ];
  if (command) lines.push(`  cmd: ${trunc(redactSecrets(command), 52)}`);
  if (outputLines.length > 0) {
    lines.push("");
    for (const line of outputLines) {
      lines.push(`  | ${trunc(line, 54)}`);
    }
  }
  if (status === "cancelling") {
    lines.push("");
    lines.push("  cancelled \u2014 waiting for cleanup");
  } else if (status === "cancelled") {
    lines.push("");
    lines.push("  cancelled by user");
  } else if (status === "timed_out") {
    lines.push("");
    lines.push("  command timed out");
  } else if (status === "fail" || status === "failed") {
    lines.push("");
    lines.push(`  ${phase} failed`);
  }
  lines.push("");
  lines.push("  [Esc/Ctrl-C] cancel  \u2022  auto-close on finish");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Public startProgressOverlay — accepts any RenderTarget              */
/* ------------------------------------------------------------------ */

/**
 * Start a TUI progress overlay that listens for pstack events.
 *
 * Renders to the given RenderTarget. Returns a ProgressController
 * for cancellation and cleanup. Fire-and-forget: never blocks the
 * calling command flow.
 */
export function startProgressOverlay(
  target: RenderTarget,
  opts?: ProgressOverlayOpts,
): ProgressController {
  const maxLines = opts?.maxOutputLines ?? 5;
  const now = Date.now();
  const state: ProgressState = {
    runId: opts?.runId ?? randomUUID(),
    playbook: opts?.playbook ?? "pstack",
    phase: "preflight",
    command: "",
    status: "pending",
    elapsedMs: 0,
    outputLines: [],
    startTime: now,
  };

  let closed = false;
  let terminalScheduled = false;
  let burstScheduled = false;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let terminalTimer: ReturnType<typeof setTimeout> | undefined;
  const explicitRunId = opts?.runId !== undefined;

  const renderNow = (): void => {
    if (closed) return;
    state.elapsedMs = Date.now() - state.startTime;
    target.render(_frame(state));
  };

  // Render the first event immediately, then cap subsequent event-driven renders
  // to one flush per 100ms window. The timer still updates elapsed time every 500ms.
  const scheduleRender = (): void => {
    if (closed) return;
    if (!burstScheduled) {
      burstScheduled = true;
      renderNow();
    }
    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        burstScheduled = false;
        renderNow();
      }, 100);
    }
  };

  const scheduleTerminalClose = (): void => {
    if (terminalScheduled || closed) return;
    terminalScheduled = true;
    terminalTimer = setTimeout(() => {
      terminalTimer = undefined;
      if (closed) return;
      opts?.onTerminal?.(state.status);
      ctrl.close();
    }, 800);
  };

  const timerId = setInterval(renderNow, 500);
  renderNow();

  const unsubscribe = onPstackEvent((evt: PstackEvent) => {
    if (closed) return;
    const evtRunId = typeof evt.meta?.runId === "string" ? evt.meta.runId : undefined;
    if (explicitRunId && evtRunId !== undefined && evtRunId !== state.runId) return;
    if (!explicitRunId && evtRunId !== undefined) {
      state.runId = evtRunId;
    }

    let terminal = false;
    if (evt.type === "phase") {
      state.playbook = typeof evt.meta?.playbook === "string" ? evt.meta.playbook : state.playbook;
      state.phase = typeof evt.payload?.phase === "string" ? evt.payload.phase : state.phase;
      state.status = typeof evt.payload?.status === "string" ? evt.payload.status : "pending";
      terminal = isTerminalStatus(state.status);
    } else if (evt.type === "command") {
      const argv = evt.payload?.argv;
      if (Array.isArray(argv) && argv.length > 0) state.command = argv.join(" ");
      if (evt.payload?.settled === true) {
        const exitCode = typeof evt.payload?.exitCode === "number" ? evt.payload.exitCode : null;
        const signal = typeof evt.payload?.signal === "string" ? evt.payload.signal : null;
        const timedOut = evt.payload?.timeout === true || (signal === "SIGTERM" && exitCode === null);
        const cancelled = evt.payload?.cancelled === true;
        if (state.status === "cancelling" || cancelled) state.status = "cancelled";
        else if (timedOut) state.status = "timed_out";
        else if (exitCode === 0) state.status = "pass";
        else state.status = "fail";
        terminal = true;
      }
    } else if (evt.type === "cancellation") {
      const reason = typeof evt.payload?.reason === "string" ? evt.payload.reason : "cancel";
      state.status = reason === "timeout" ? "timed_out" : "cancelled";
      terminal = true;
    } else if (evt.type === "check") {
      const detail = typeof evt.payload?.detail === "string" ? evt.payload.detail : undefined;
      if (detail) {
        state.outputLines.push(detail);
        if (state.outputLines.length > maxLines) state.outputLines.splice(0, state.outputLines.length - maxLines);
      }
      // Checks are progress updates, not terminal receipts.
      if (evt.payload?.status === "failed" || evt.payload?.status === "block") state.status = String(evt.payload.status);
    } else if (evt.type === "receipt") {
      state.status = normalizeStatus(evt.payload?.status);
      terminal = true;
    }

    scheduleRender();
    if (terminal) scheduleTerminalClose();
  });

  const ctrl: ProgressController = {
    get runId() { return state.runId; },
    requestCancel() {
      if (closed || state.status === "cancelling" || isTerminalStatus(state.status)) return;
      state.status = "cancelling";
      scheduleRender();
      opts?.onCancelRequest?.();
    },
    flush() {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      burstScheduled = false;
      renderNow();
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timerId);
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      if (terminalTimer !== undefined) clearTimeout(terminalTimer);
      unsubscribe();
      target.restore?.();
    },
  };

  return ctrl;

}

function normalizeStatus(status: unknown): string {
  if (status === "success") return "pass";
  if (status === "running") return "pending";
  if (status === "unknown") return "blocked";
  return typeof status === "string" ? status : "pending";
}

function isTerminalStatus(status: string): boolean {
  return ["pass", "success", "fail", "failed", "cancelled", "timed_out", "blocked"].includes(status);
}

/* ------------------------------------------------------------------ */
/*  ctx.ui.custom bridge — headless-safe, lazy TUI deps                 */
/* ------------------------------------------------------------------ */

/**
 * Start a progress overlay wired to ExtensionCommandContext using
 * real pi-tui render surface via ctx.ui.custom bridge.
 *
 * Only creates when ctx.hasUI is true. Returns a controller or
 * undefined if headless.
 */
export function startProgressOverlayForCtx(
  ctx: Pick<ExtensionCommandContext, "hasUI" | "ui">,
  playbook: string,
  opts?: Omit<ProgressOverlayOpts, "playbook">,
): ProgressController | undefined {
  if (!ctx?.hasUI || typeof ctx.ui?.custom !== "function") return undefined;

  const runId = opts?.runId ?? randomUUID();
  let closed = false;
  let overlayCtrl: ProgressController | undefined;
  let finishBridge: ((result: boolean) => void) | undefined;

  const ctrl: ProgressController = {
    runId,
    requestCancel() {
      overlayCtrl?.requestCancel();
    },
    flush() {
      overlayCtrl?.flush?.();
    },
    close() {
      if (closed) return;
      closed = true;
      finishBridge?.(false);
      overlayCtrl?.close();
    },
  };

  type CustomFactory = (tui: any, theme: any, keybindingsOrDone: any, maybeDone?: (result: boolean) => void) => unknown;
  type CustomFn = <T>(factory: CustomFactory, options?: { overlay?: boolean }) => Promise<T>;

  void import("@oh-my-pi/pi-tui").then(({ Box, Spacer, Text, matchesKey }) => {
    if (closed) return;
    const custom = (ctx.ui as unknown as { custom: CustomFn }).custom;
    try {
      const customPromise = custom<boolean>((tui, _theme, keybindingsOrDone, maybeDone) => {
        const done = typeof maybeDone === "function" ? maybeDone : keybindingsOrDone as (result: boolean) => void;
        let finished = false;
        let overlayHandle: { hide?(): void } | undefined;
        let currentBox: Component & { addChild(c: unknown): void; clear(): void };

        const finish = (result: boolean): void => {
          if (finished) return;
          finished = true;
          overlayHandle?.hide?.();
          done(result);
        };
        finishBridge = finish;

        const buildBox = (content: string) => {
          const box = new Box(1, 0) as Component & { addChild(c: unknown): void; clear(): void };
          for (const line of content.split("\n")) box.addChild(new Text(line));
          return box;
        };
        currentBox = buildBox([
          ` ${sym("pending")} pstack: ${shortId(runId)} — ${trunc(playbook, 20)}`,
          " phase: preflight  elapsed: 0:00",
          "",
          "  [Esc/Ctrl-C] cancel  •  auto-close on finish",
        ].join("\n"));

        const tuiTarget: RenderTarget = {
          render(content: string) {
            if (finished || closed) return;
            currentBox.clear();
            for (const line of content.split("\n")) currentBox.addChild(new Text(line));
            tui.requestRender?.();
          },
          restore() {
            finish(false);
          },
        };

        overlayCtrl = startProgressOverlay(tuiTarget, {
          ...(opts?.maxOutputLines !== undefined ? { maxOutputLines: opts.maxOutputLines } : {}),
          ...(opts?.onTerminal !== undefined ? { onTerminal: opts.onTerminal } : {}),
          runId,
          playbook,
          ...(opts?.onCancelRequest !== undefined ? { onCancelRequest: opts.onCancelRequest } : {}),
          onTerminal(status) {
            finish(normalizeStatus(status) === "pass");
          },
        });

        currentBox.handleInput = (data: string) => {
          if (finished || closed) return;
          if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "\u0003" || data === "esc") {
            overlayCtrl?.requestCancel();
          }
        };

        Promise.resolve().then(() => Promise.resolve().then(() => {
          if (finished || closed) return;
          overlayHandle = tui.showOverlay(currentBox, {
            anchor: "center",
            maxHeight: "80%",
            margin: { top: 2, bottom: 2, left: 2, right: 2 },
          });
          tui.setFocus(currentBox);
          tui.requestRender();
        }));

        if (closed) finish(false);
        return new Spacer(0);
      }, { overlay: false });
      Promise.resolve(customPromise).catch(() => finishBridge?.(false));
    } catch {
      finishBridge?.(false);
      closed = true;
    }
  }).catch(() => {
    closed = true;
  });

  return ctrl;
}
// Internal helpers (_frame, shortId, elapsed, trunc, redact, sym) — not exported.
