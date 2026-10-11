/**
 * src/units.ts — Unit model + queue ops (WU-6).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { GsdLoopState } from "./state.js";

export type UnitStatus = "pending" | "running" | "complete" | "failed" | "crashed" | "skipped";

export interface Unit {
 id: string;
 title: string;
 brief: string | null;
 briefFile: string | null;
 verifyCommand: string | null;
 maxRetries: number | null;
 dispatch: "inline" | "subagent";
 subagentAgent: string | null;
 status: UnitStatus;
 attempts: number;
 verifyAttempts: number;
 lastError: string | null;
 failureHash: string | null;
 startedAt: string | null;
 completedAt: string | null;
 failedAt: string | null;
 resultSummary: string | null;
}

export class UnitError extends Error { }

/** Unique id, non-empty title, brief XOR briefFile; briefFile must resolve inside cwd and be readable. */
export function enqueue(state: GsdLoopState, unit: Unit, cwd?: string): void {
 if (!unit.id || unit.id.trim() === "") throw new UnitError("unit id is required");
 if (state.queue.some((u) => u.id === unit.id)) {
  throw new UnitError(`duplicate unit id: ${unit.id}`);
 }
 if (!unit.title || unit.title.trim() === "") {
  throw new UnitError(`unit ${unit.id}: title is required`);
 }
 if (unit.brief !== null && unit.briefFile !== null) {
  throw new UnitError(
   `unit ${unit.id}: brief and briefFile are mutually exclusive — provide exactly one`,
  );
 }
 if ((unit.brief === null || unit.brief.trim() === "") && unit.briefFile === null) {
  throw new UnitError(`unit ${unit.id}: exactly one of brief or briefFile is required`);
 }
 if (unit.briefFile !== null) {
  if (!cwd) throw new UnitError(`unit ${unit.id}: briefFile requires a cwd to resolve against`);
  const resolved = path.resolve(cwd, unit.briefFile);
  // Symlinks resolve outside: check the REAL path, not the lexical one.
  let real = resolved;
  try {
   real = fs.realpathSync(resolved);
  } catch (e) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} is not readable (${resolved}): ${(e as Error).message}`,
   );
  }
  const root = fs.realpathSync(path.resolve(cwd));
  const rel = path.relative(root, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} resolves outside the project root (${real})`,
   );
  }
  try {
   fs.readFileSync(real, "utf8");
  } catch (e) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} is not readable (${real}): ${(e as Error).message}`,
   );
  }
 }
 state.queue.push(unit);
}

export function listQueue(state: GsdLoopState): Unit[] {
 return state.queue;
}

/** Inline brief verbatim, or briefFile content read against cwd. */
export function renderBrief(unit: Unit, cwd?: string): string {
 if (unit.brief !== null) return unit.brief;
 if (unit.briefFile !== null) {
  if (!cwd) throw new UnitError(`unit ${unit.id}: briefFile requires a cwd to resolve against`);
  const resolved = path.resolve(cwd, unit.briefFile);
  // Re-validate containment on read: a symlink swapped after enqueue must not escape.
  let real = resolved;
  try {
   real = fs.realpathSync(resolved);
  } catch (e) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} is not readable (${resolved}): ${(e as Error).message}`,
   );
  }
  const rel = path.relative(fs.realpathSync(path.resolve(cwd)), real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} resolves outside the project root (${real})`,
   );
  }
  try {
   return fs.readFileSync(real, "utf8");
  } catch (e) {
   throw new UnitError(
    `unit ${unit.id}: briefFile ${unit.briefFile} is not readable (${real}): ${(e as Error).message}`,
   );
  }
 }
 throw new UnitError(`unit ${unit.id}: no brief or briefFile`);
}
