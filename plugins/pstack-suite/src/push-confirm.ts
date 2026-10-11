// push-confirm.ts — shared cancellation receipt for push confirmation gates.
// Extracted from commands/pr.ts and commands/ship.ts (Fallow clone group).
// Local module — not exported from index. Used by pr.ts and ship.ts only.

import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { RunRecord } from "./run.js";
import { addAction, finishRun, saveRun } from "./run.js";

/**
 * Persist a cancelled push receipt and finish the run as "cancelled".
 * Used when the push confirmation gate is declined (overlay cancel) or
 * awaiting explicit confirmation (headless / RPC without --confirm).
 * The notification message is caller-specific, so it stays at the call site.
 */
export function recordPushCancelled(run: RunRecord, cwd: string, detail: string): void {
  saveRun(finishRun(addAction(run, "push", "cancelled", detail), "cancelled"), cwd);
}


/** Run the common push-confirmation state machine; callers supply their messages and receipt. */
async function confirmPushGate(options: {
  pushOverlay: boolean | undefined;
  confirm: () => Promise<boolean>;
  addConfirmedPhase: () => void;
  notify: (message: string) => void;
  recordCancelled: (detail: string) => void;
  close?: () => void;
  cancelledMessage: string;
  awaitingMessage: string;
}): Promise<boolean> {
  if (options.pushOverlay === false) {
    options.notify(options.cancelledMessage);
    options.recordCancelled("user cancelled: push");
    options.close?.();
    return false;
  }
  if (options.pushOverlay === true) options.addConfirmedPhase();
  if (!(await options.confirm())) {
    options.notify(options.awaitingMessage);
    options.recordCancelled("awaiting confirmation: push");
    options.close?.();
    return false;
  }
  return true;
}


type ShowPushOverlay = (
  ctx: ExtensionCommandContext,
  options: { title: string; lines: string[]; confirmLabel: string; cancelLabel: string },
) => Promise<boolean | undefined>;

/** Shared push-overlay construction; callers supply command-specific title and lines. */
function showPushConfirmation(
  show: ShowPushOverlay,
  ctx: ExtensionCommandContext,
  title: string,
  lines: string[],
): Promise<boolean | undefined> {
  return show(ctx, { title, lines, confirmLabel: "Push", cancelLabel: "Cancel" });
}


/** Show and resolve a push confirmation using the shared gate lifecycle. */
export async function runPushConfirmation(options: {
  show: ShowPushOverlay;
  ctx: ExtensionCommandContext;
  title: string;
  lines: string[];
  confirm: () => Promise<boolean>;
  addConfirmedPhase: () => void;
  notify: (message: string) => void;
  recordCancelled: (detail: string) => void;
  close?: () => void;
  cancelledMessage: string;
  awaitingMessage: string;
}): Promise<boolean> {
  const pushOverlay = await showPushConfirmation(options.show, options.ctx, options.title, options.lines);
  return confirmPushGate({
    pushOverlay,
    confirm: options.confirm,
    addConfirmedPhase: options.addConfirmedPhase,
    notify: options.notify,
    recordCancelled: options.recordCancelled,
    ...(options.close !== undefined ? { close: options.close } : {}),
    cancelledMessage: options.cancelledMessage,
    awaitingMessage: options.awaitingMessage,
  });
}
