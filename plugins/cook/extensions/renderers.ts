/**
 * Shared Cook tool renderers and the DAG status overlay.
 *
 * These helpers only format already-produced values. They deliberately do not
 * execute tools, mutate Cook state, or change the result payload.
 */
import {
   Key,
   replaceTabs,
   truncateToWidth,
   visibleWidth,
   wrapTextWithAnsi,
} from "@oh-my-pi/pi-tui";
import type {
   Component,
   Focusable,
   KeybindingsManager,
   TUI,
} from "@oh-my-pi/pi-tui";
import type { CookState, TaskInfo } from "./types.ts";
import type { WidgetCounts } from "./state.ts";

export type CookRenderKind =
   | "planner"
   | "scout"
   | "researcher"
   | "worker"
   | "validator"
   | "judge"
   | "next"
   | "ready"
   | "claim"
   | "release"
   | "claims"
   | "snapshot"
   | "record"
   | "journal"
   | "refute"
   | "audit";

interface RenderMeta {
   operation: string;
   role: string;
   stage: string;
}

const RENDER_META: Record<CookRenderKind, RenderMeta> = {
   planner: { operation: "cook_dispatch_planner", role: "planner", stage: "plan" },
   scout: { operation: "cook_dispatch_scout", role: "scout", stage: "scout" },
   researcher: { operation: "cook_dispatch_researcher", role: "researcher", stage: "research" },
   worker: { operation: "cook_dispatch_worker", role: "worker", stage: "implement" },
   validator: { operation: "cook_dispatch_validator", role: "validator", stage: "validate" },
   judge: { operation: "cook_dispatch_judge", role: "judge", stage: "review" },
   audit: { operation: "cook_dispatch_audit", role: "audit", stage: "audit" },
   next: { operation: "cook_next", role: "dag", stage: "claim" },
   ready: { operation: "cook_ready", role: "dag", stage: "claim" },
   claim: { operation: "cook_claim", role: "dag", stage: "claim" },
   release: { operation: "cook_release", role: "dag", stage: "claim" },
   claims: { operation: "cook_claims", role: "dag", stage: "claim" },
   snapshot: { operation: "cook_snapshot", role: "dag", stage: "status" },
   record: { operation: "cook_record_result", role: "orchestrator", stage: "result" },
   journal: { operation: "cook_journal", role: "orchestrator", stage: "journal" },
   refute: { operation: "cook_dispatch_refute", role: "judge", stage: "refute" },
};

/** Keep control characters from reaching a terminal while retaining ANSI. */
export function sanitizeCookText(value: unknown): string {
   return replaceTabs(String(value ?? ""))
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
}

function safeWidth(width: number): number {
   return Number.isFinite(width) ? Math.max(1, Math.trunc(width)) : 1;
}

/**
 * Wrap and cap rows using pi-tui's ANSI-aware utilities. The fallback is
 * intentionally defensive for malformed escape sequences from a partial
 * tool result.
 */
export function fitCookRows(lines: readonly string[], width: number): string[] {
   const maxWidth = safeWidth(width);
   const rows: string[] = [];
   for (const input of lines.length ? lines : [""]) {
      const logical = sanitizeCookText(input);
      try {
         const wrapped = wrapTextWithAnsi(logical, maxWidth);
         for (const row of wrapped.length ? wrapped : [""]) {
            rows.push(visibleWidth(row) > maxWidth ? truncateToWidth(row, maxWidth) : row);
         }
      } catch {
         const plain = logical.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "");
         rows.push(truncateToWidth(plain, maxWidth));
      }
   }
   return rows;
}

/** Component whose rows obey the stable-array contract from pi-tui. */
export class StableCookRows implements Component {
   #source = "";
   #width = 0;
   #rows: readonly string[] = [];
   readonly #build: (width: number) => readonly string[];

   constructor(build: (width: number) => readonly string[]) {
      this.#build = build;
   }

   render(width: number): readonly string[] {
      const normalized = safeWidth(width);
      const next = this.#build(normalized);
      const source = next.join("\n");
      if (this.#width === normalized && source === this.#source) return this.#rows;
      this.#width = normalized;
      this.#source = source;
      this.#rows = next.slice();
      return this.#rows;
   }

   invalidate(): void {
      this.#width = 0;
      this.#source = "";
   }
}

function argsRecord(args: unknown): Record<string, unknown> {
   return typeof args === "object" && args !== null ? args as Record<string, unknown> : {};
}

function taskFromArgs(args: unknown): string | undefined {
   const record = argsRecord(args);
   for (const key of ["task_id", "taskId", "task"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
   }
   return undefined;
}

function firstText(result: unknown): string {
   const record = argsRecord(result);
   const content = record.content;
   if (!Array.isArray(content)) return "";
   return content
      .map((part) => {
         if (typeof part === "string") return part;
         if (typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string") {
            return (part as Record<string, unknown>).text as string;
         }
         return "";
      })
      .filter(Boolean)
      .join("\n");
}

function resultDetails(result: unknown): unknown {
   return argsRecord(result).details;
}

function resultError(result: unknown): boolean {
   return argsRecord(result).isError === true;
}

function resultState(kind: CookRenderKind, text: string, partial: boolean, error: boolean): string {
   if (error) return "ERROR";
   if (partial) return "RUNNING";
   const upper = text.toUpperCase();
   if (kind === "next") {
      if (upper.includes("ALL_SUBTICKETS_DONE")) return "DONE";
      if (upper.includes("NO READY") || upper.includes("BLOCKED")) return "BLOCKED";
      if (upper.includes("NEXT:")) return "CLAIMED";
   }
   if (upper.includes("BLOCKED")) return "BLOCKED";
   if (upper.includes("DISPATCH")) return "READY";
   return "OK";
}

function countSummary(text: string, details: unknown): string | undefined {
   const values: string[] = [];
   const patterns: Array<[string, RegExp]> = [
      ["blocked", /\((\d+)\s+blocked[^)]*\)/i],
      ["ready", /(\d+)\s+more\s+ready/i],
      ["sub-tickets", /(\d+)\s+sub-tickets/i],
      ["ready", /ready\s*[:=]\s*(\d+)/i],
      ["done", /done\s*[:=]\s*(\d+)/i],
   ];
   for (const [label, pattern] of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) values.push(`${label} ${match[1]}`);
   }
   if (typeof details === "object" && details !== null) {
      const record = details as Record<string, unknown>;
      for (const key of ["ready", "done", "total", "remaining", "blocked"]) {
         if (typeof record[key] === "number" && Number.isFinite(record[key])) values.push(`${key} ${record[key]}`);
      }
   }
   return values.length ? values.slice(0, 3).join(" · ") : undefined;
}

function nextAction(text: string): string | undefined {
   const line = text.split(/\r?\n/).find((candidate) => /(?:next action|^next:|dispatch the|resolve blockers|close the parent)/i.test(candidate));
   if (!line) return undefined;
   const value = line.replace(/^\s*(?:next action|next)\s*:\s*/i, "").trim();
   return value || undefined;
}

function usefulResultLines(kind: CookRenderKind, result: unknown, options: { isPartial?: boolean }): string[] {
   const text = firstText(result);
   const details = resultDetails(result);
   const error = resultError(result);
   const state = resultState(kind, text, options.isPartial === true, error);
   const lines = [`${RENDER_META[kind].operation} · ${state}`];
   if (text.trim()) lines.push(...text.split(/\r?\n/).map(sanitizeCookText));
   if (details !== undefined) {
      try {
         lines.push("Details:", ...JSON.stringify(details, null, 2).split("\n"));
      } catch {
         lines.push("Details: unavailable");
      }
   }
   if (!text.trim() && options.isPartial) lines.push("Waiting for result…");
   return lines;
}

function compactResultLine(kind: CookRenderKind, result: unknown, options: { isPartial?: boolean }): string {
   const meta = RENDER_META[kind];
   const text = firstText(result);
   const details = resultDetails(result);
   const state = resultState(kind, text, options.isPartial === true, resultError(result));
   const parts = [`${meta.operation}`, state];
   const task = text.match(/(?:NEXT|TASK|task(?:_id| id)?)\s*[:=→-]\s*([A-Za-z]+-\d+(?:\.\d+)?)/i)?.[1]
      ?? text.match(/\b[A-Za-z]+-\d+(?:\.\d+)?\b/)?.[0];
   if (task) parts.push(task);
   const counts = countSummary(text, details);
   if (counts) parts.push(counts);
   const action = nextAction(text);
   if (action) parts.push(`next: ${action}`);
   else if (state === "READY") parts.push("next: execute dispatch");
   else if (state === "BLOCKED") parts.push("next: resolve blockers");
   else if (state === "DONE") parts.push("next: close parent");
   else if (state === "CLAIMED") parts.push("next: dispatch worker");
   else if (state === "RUNNING") parts.push("next: wait");
   if (state === "ERROR" && !action) {
      const errorDetail = text.split(/\r?\n/).find(Boolean);
      if (errorDetail) parts.push(errorDetail);
   }
   return parts.join(" · ");
}

function compactCallLine(kind: CookRenderKind, args: unknown): string {
   const meta = RENDER_META[kind];
   const record = argsRecord(args);
   const task = taskFromArgs(args);
   const parts = [`${meta.operation}`, `role: ${meta.role}`, `stage: ${meta.stage}`];
   if (task) parts.push(`task: ${task}`);
   if (!task && typeof record.query === "string" && record.query.trim()) parts.push(`query: ${record.query.trim()}`);
   return parts.join(" · ");
}

/** Build OMP renderCall/renderResult callbacks for one Cook tool. */
export function cookToolRenderers(kind: CookRenderKind): {
   renderCall: (args: unknown, _options: unknown, _theme: unknown) => Component;
   renderResult: (result: unknown, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown) => Component;
} {
   return {
      renderCall: (args) => new StableCookRows((width) => fitCookRows([compactCallLine(kind, args)], width)),
      renderResult: (result, options) => new StableCookRows((width) => fitCookRows(
         options?.expanded ? usefulResultLines(kind, result, options ?? {}) : [compactResultLine(kind, result, options ?? {})],
         width,
      )),
   };
}

function taskKey(id: unknown): string {
   return String(id ?? "").trim().toUpperCase();
}

function terminalTask(task: Pick<TaskInfo, "status">): boolean {
   const normalized = String(task.status ?? "").trim().toLowerCase();
   return normalized === "done" || normalized === "archived";
}

function currentParent(state: CookState, tasks: readonly TaskInfo[]): TaskInfo | undefined {
   const currentId = state.currentTaskId ?? state.taskIds[0];
   if (!currentId) return undefined;
   const current = tasks.find((task) => taskKey(task.id) === taskKey(currentId));
   const parentId = current?.parent_task_id?.trim() || current?.id || currentId;
   return tasks.find((task) => taskKey(task.id) === taskKey(parentId)) ?? current;
}

export interface CookDagRow {
   id?: string;
   title?: string;
   status?: string;
   readiness?: "ready" | "blocked" | "done";
   dependencies?: string[];
   text: string;
}

function childReadiness(child: TaskInfo, terminalIds: ReadonlySet<string>, parentId: string): "ready" | "blocked" | "done" {
   if (terminalTask(child)) return "done";
   const dependencies = (child.dependencies ?? []).filter((dependency) => taskKey(dependency) !== taskKey(parentId));
   return dependencies.every((dependency) => terminalIds.has(taskKey(dependency))) ? "ready" : "blocked";
}

/** Return the pure, shared DAG row model used by the widget and overlay. */
export function composeCookDagRows(
   state: CookState,
   tasks: readonly TaskInfo[] | undefined,
   counts?: WidgetCounts,
): CookDagRow[] {
   const rows: CookDagRow[] = [];
   if (!tasks) {
      rows.push({ text: "Parent: unavailable (Backlog read failed)" });
      rows.push({ text: "Children: unavailable" });
      return rows;
   }
   const parent = currentParent(state, tasks);
   if (!parent) {
      rows.push({ text: "No active workflow chain." });
      return rows;
   }
   const parentId = taskKey(parent.id);
   const children = tasks.filter((task) => task.parent_task_id !== undefined && taskKey(task.parent_task_id) === parentId);
   const terminalIds = new Set(tasks.filter(terminalTask).map((task) => taskKey(task.id)));
   rows.push({ text: `Parent: ${parent.id} — ${parent.title || "(untitled)"}`, id: parent.id, title: parent.title, status: parent.status });
   rows.push({ text: `Chain: ${state.chain.length ? state.chain.join(" → ") : "none"}` });
   const ready = children.filter((child) => childReadiness(child, terminalIds, parent.id) === "ready").length;
   const done = children.filter(terminalTask).length;
   const summary = counts ?? { ready, done, total: children.length };
   rows.push({ text: `Children: ready ${summary.ready} · done ${summary.done}/${summary.total}` });
   if (!children.length) {
      rows.push({ text: "No child sub-tickets." });
      rows.push({ text: "No ready sub-tickets." });
      return rows;
   }
   for (const child of children) {
      const readiness = childReadiness(child, terminalIds, parent.id);
      const marker = readiness === "done" ? "✓" : readiness === "ready" ? "○" : "·";
      const deps = child.dependencies?.length ? child.dependencies.join(", ") : "none";
      rows.push({
         id: child.id,
         title: child.title,
         status: child.status,
         readiness,
         dependencies: child.dependencies ?? [],
         text: `${marker} ${child.id} — ${child.title || "(untitled)"} · ${child.status || "unknown"} · ${readiness} · deps: ${deps}`,
      });
   }
   if (ready === 0) rows.push({ text: "No ready sub-tickets." });
   else rows.push({ text: "Enter: claim the next ready sub-ticket · Esc: close" });
   return rows;
}

/** Fit the pure DAG rows to a physical viewport without overflowing it. */
export function composeCookDagLines(
   state: CookState,
   tasks: readonly TaskInfo[] | undefined,
   width: number,
   height = 20,
   counts?: WidgetCounts,
): string[] {
   const maxHeight = Number.isFinite(height) ? Math.max(1, Math.trunc(height)) : 1;
   const fitted = fitCookRows(composeCookDagRows(state, tasks, counts).map((row) => row.text), width);
   if (fitted.length <= maxHeight) return fitted;
   const clipped = fitted.slice(0, maxHeight);
   const hidden = fitted.length - maxHeight;
   clipped[maxHeight - 1] = truncateToWidth(`… ${hidden} more rows`, safeWidth(width));
   return clipped;
}

export type CookDagOverlayResult =
   | { action: "closed" }
   | { action: "claimed"; result: unknown }
   | { action: "error"; error: string };

export interface CookDagOverlayData {
   state: CookState;
   tasks: readonly TaskInfo[] | undefined;
   counts?: WidgetCounts;
   onClaim: () => unknown | Promise<unknown>;
   maxHeight?: number;
}

/** Focusable, timer-free DAG overlay component. */
export class CookDagOverlay implements Component, Focusable {
   focused = false;
   #data: CookDagOverlayData;
   readonly #tui: TUI;
   readonly #keybindings: KeybindingsManager;
   readonly #done: (result: CookDagOverlayResult | undefined) => void;
   #finished = false;
   #disposed = false;
   #claiming = false;

   constructor(data: CookDagOverlayData, tui: TUI, keybindings: KeybindingsManager, done: (result: CookDagOverlayResult | undefined) => void) {
      this.#data = data;
      this.#tui = tui;
      this.#keybindings = keybindings;
      this.#done = done;
   }

   render(width: number): readonly string[] {
      const terminalRows = Number((process.stdout as unknown as { rows?: number }).rows);
      const maxHeight = this.#data.maxHeight ?? (Number.isFinite(terminalRows) && terminalRows > 0 ? Math.max(1, terminalRows - 4) : 20);
      const lines = composeCookDagLines(this.#data.state, this.#data.tasks, width, maxHeight, this.#data.counts);
      if (this.#claiming) lines.push(...fitCookRows(["Claiming next ready sub-ticket…"], width));
      return lines.slice(0, maxHeight);
   }

   invalidate(): void {
      this.#tui.requestRender();
   }

   handleInput(input: string): void {
      const matches = (binding: "tui.select.cancel" | "tui.select.confirm"): boolean => {
         try {
            return this.#keybindings.matches(input, binding);
         } catch {
            return false;
         }
      };
      if (matches("tui.select.cancel") || input === Key.escape || input === "\u001b") {
         this.finish({ action: "closed" });
         return;
      }
      if (!matches("tui.select.confirm") && input !== Key.enter && input !== "\r") return;
      if (this.#finished || this.#disposed || this.#claiming) return;
      this.#claiming = true;
      this.#tui.requestRender();
      void Promise.resolve()
         .then(() => this.#data.onClaim())
         .then((result) => this.finish({ action: "claimed", result }))
         .catch((error: unknown) => this.finish({ action: "error", error: error instanceof Error ? error.message : String(error) }));
   }

   dispose(): void {
      if (this.#disposed) return;
      this.#disposed = true;
      this.finish(undefined);
   }

   private finish(result: CookDagOverlayResult | undefined): void {
      if (this.#finished) return;
      this.#finished = true;
      this.#done(result);
   }
}
