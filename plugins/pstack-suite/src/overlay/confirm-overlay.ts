import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { PreflightResult } from "../run.js";
import type { Component } from "@oh-my-pi/pi-tui";
import { mountOverlay } from "./render.js";

export interface RenderSurface {
  render(text: string): void;
  onKey(callback: (key: string) => void): void;
  close(): void;
}

export interface ConfirmOverlayOpts {
  title: string;
  lines: string[];
  confirmLabel?: string;
  cancelLabel?: string;
}

const MAX_LINE_LEN = 100;
const MIN_WIDTH = 30;
const MAX_WIDTH = 80;

function truncateLine(line: string): string {
  return line.length <= MAX_LINE_LEN ? line : line.slice(0, MAX_LINE_LEN - 3) + "...";
}
function padRight(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}
function centerLine(s: string, boxWidth: number): string {
  const display = truncateLine(s);
  return " ".repeat(Math.max(0, Math.floor((boxWidth - display.length) / 2))) + display;
}
const TL = "┌", TR = "┐", BL = "└", BR = "┘", H = "─", V = "│";
function buildBox(title: string, bodyLines: string[], buttonLine: string): string {
  const contentWidth = Math.max(
    truncateLine(title).length,
    ...bodyLines.map((line) => truncateLine(line).length),
    truncateLine(buttonLine).length,
  );
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, contentWidth + 2));
  const lines = [TL + H.repeat(width) + TR];
  lines.push(V + padRight(" " + truncateLine(title) + " ", width) + V);
  lines.push(TL + H.repeat(width) + TR);
  for (const line of bodyLines) lines.push(V + padRight(" " + truncateLine(line), width) + V);
  lines.push(TL + H.repeat(width) + TR);
  lines.push(V + padRight(truncateLine(buttonLine), width) + V);
  lines.push(BL + H.repeat(width) + BR);
  return lines.join("\n");
}

export async function renderConfirmOverlay(surface: RenderSurface, opts: ConfirmOverlayOpts): Promise<boolean> {
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const boxText = buildBox(opts.title, opts.lines.map(truncateLine), `  ${V} ${confirmLabel} ${V}    ${V} ${cancelLabel} ${V} `);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      surface.close();
      resolve(result);
    };
    surface.render(boxText);
    surface.onKey((key) => {
      const normalized = key.toLowerCase();
      if (normalized === "enter" || normalized === "return" || normalized === "\r") finish(true);
      else if (normalized === "escape" || normalized === "esc" || normalized === "ctrl+c" || normalized === "ctrl-c" || normalized === String.fromCharCode(3)) finish(false);
    });
  });
}

const STATUS_GLYPH: Record<string, string> = { pass: "✓", warn: "⚠", block: "✗", unknown: "?" };
export /** Overlay input tolerates a missing overall (omits the Overall line then). */
type PreflightOverlayInput = Omit<PreflightResult, "overall"> & { overall?: PreflightResult["overall"] };

export function preflightToOverlayLines(pf: PreflightOverlayInput, extra: string[]): string[] {
  const lines: string[] = [];
  for (const check of pf.checks ?? []) {
    const detail = check.detail ? `: ${check.detail}` : "";
    lines.push(` ${STATUS_GLYPH[check.status] ?? "?"} ${check.name}${detail}`);
  }
  if ((pf.checks?.length ?? 0) > 0 && extra.length > 0) lines.push("");
  lines.push(...extra);
  if (pf.overall) {
    lines.push("");
    lines.push(`Overall: ${pf.overall.toUpperCase()}`);
  }
  return lines;
}

export async function showConfirmOverlay(ctx: any, opts: ConfirmOverlayOpts): Promise<boolean | undefined> {
  if (ctx.hasUI === false || typeof ctx.ui.custom !== "function") return undefined;
  const { Box, Spacer, Text, matchesKey } = await import("@oh-my-pi/pi-tui");
  const bodyLines = opts.lines.map(truncateLine);
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let doneBridge: ((result: boolean) => void) | undefined;
    let overlayHandle: { hide?(): void } | undefined;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      overlayHandle?.hide?.();
      doneBridge?.(result);
      resolve(result);
    };
    const custom = (ctx.ui as any).custom as (factory: any, options?: any) => Promise<unknown>;
    try {
      const customPromise = custom((tui: any, _theme: any, keybindingsOrDone: any, maybeDone: any) => {
        doneBridge = typeof maybeDone === "function" ? maybeDone : keybindingsOrDone;
        const box = new Box(1, 1) as Component & { addChild(c: unknown): void };
        box.addChild(new Text(` ${opts.title} `));
        box.addChild(new Text(H.repeat(Math.max(30, opts.title.length + 2))));
        for (const line of bodyLines) box.addChild(new Text(` ${line}`));
        box.addChild(new Text(H.repeat(Math.max(30, opts.title.length + 2))));
        box.addChild(new Text(`  ${confirmLabel}              ${cancelLabel}`));
        box.handleInput = (data: string) => {
          if (matchesKey(data, "enter") || matchesKey(data, "return")) finish(true);
          else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === String.fromCharCode(3)) finish(false);
        };
        mountOverlay(tui, box, {
          shouldSkip: () => settled,
          onMount: (handle) => { overlayHandle = handle; },
        });
        return new Spacer(0);
      }, { overlay: false });
      Promise.resolve(customPromise).catch(() => finish(false));
    } catch {
      finish(false);
    }
  });
}

export class InMemoryRenderSurface implements RenderSurface {
  public frames: string[] = [];
  private keyHandler: ((key: string) => void) | undefined;
  render(text: string): void { this.frames.push(text); }
  onKey(callback: (key: string) => void): void { this.keyHandler = callback; }
  close(): void {}
  pressKey(key: string): void { this.keyHandler?.(key); }
}

export { truncateLine, padRight, centerLine, buildBox };
