/**
 * engine.ts — workflow engine orchestration.
 *
 * Sequential port of gsd-pi src/resources/extensions/gsd/custom-workflow-engine.ts
 * (CustomWorkflowEngine) as free functions over a runDir.
 *
 * Loop per iteration: deriveState reads GRAPH.yaml, resolveDispatch picks the
 * next eligible step (active-resume first — single-active-step invariant),
 * reconcile marks a step complete and persists. All state reads/writes go
 * through graph.ts YAML I/O under withFileLock on GRAPH.yaml; reconcile
 * re-reads the graph from disk inside the lock so concurrent edits are never
 * clobbered by a stale in-memory snapshot.
 *
 * Hardening beyond upstream (deliberate, flagged in the plan): iterate.source
 * is resolved relative to runDir with a containment check — a frozen
 * definition cannot make the engine read outside the run directory.
 */

import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { withFileLock } from "../lock.js";
import {
 readGraph,
 writeGraph,
 getNextPendingStep,
 markStepActive,
 markStepComplete,
 expandIteration,
 isTerminalStepStatus,
 type GraphStep,
 type StepStatus,
 type WorkflowGraph,
} from "./graph.js";
import { readFrozenDefinition, injectContext } from "./context-injector.js";
import type { StepDefinition } from "./definition-loader.js";

// ─── Types ───────────────────────────────────────────────────────────────

export interface EngineState {
 phase: "running" | "complete";
 isComplete: boolean;
 raw: WorkflowGraph;
}

export interface DispatchStep {
 unitType: "custom-step";
 unitId: string;
 prompt: string;
}

export type DispatchAction =
 | { action: "dispatch"; step: DispatchStep }
 | { action: "stop"; reason: string; level: "info" | "error" };

export interface CompletedStep {
 unitId: string;
}

export interface ReconcileResult {
 outcome: "continue" | "milestone-complete";
}

export interface DisplayMetadata {
 engineLabel: string;
 currentPhase: string;
 progressSummary: string;
 stepCount: { completed: number; total: number };
}

// ─── Blocked-reason formatting ───────────────────────────────────────────

export function formatBlockedWorkflowReason(graph: WorkflowGraph): string {
 const statusById = new Map(graph.steps.map((step) => [step.id, step.status]));
 const blockedSteps = graph.steps
  .filter((step) => step.status === "pending")
  .map((step) => {
   const blockers = step.dependsOn
    .filter((depId) => !isTerminalStepStatus(statusById.get(depId)))
    .map((depId) => `${depId} (${statusById.get(depId) ?? "missing"})`);
   return blockers.length > 0
    ? `${step.id} waiting on ${blockers.join(", ")}`
    : `${step.id} has no runnable dependency path`;
  });

 return blockedSteps.length > 0
  ? `Workflow blocked: no pending steps are ready. Blocked steps: ${blockedSteps.join("; ")}`
  : "Workflow blocked: no pending steps are ready.";
}

// ─── State ───────────────────────────────────────────────────────────────

/** Derive engine state from GRAPH.yaml on disk. */
export function deriveState(runDir: string): EngineState {
 const graph = readGraph(runDir);
 const allDone = graph.steps.every((s) => s.status === "complete" || s.status === "expanded");
 return {
  phase: allDone ? "complete" : "running",
  isComplete: allDone,
  raw: graph,
 };
}

// ─── Iterate expansion ───────────────────────────────────────────────────

/** Hardening over upstream: iterate.source must resolve inside the run dir. */
function resolveIterateSource(runDir: string, source: string): string {
 const runDirResolved = resolve(runDir);
 const sourcePath = resolve(runDir, source);
 if (!sourcePath.startsWith(runDirResolved + sep) && sourcePath !== runDirResolved) {
  throw new Error(
   `Iterate source "${source}" resolves outside the run directory — refusing to read (step containment guard)`,
  );
 }
 return sourcePath;
}

/**
 * Expand an iterate step from its frozen definition config.
 * Returns the next step to dispatch after expansion, or null when the
 * expansion produced zero instances (caller emits a stop info action).
 *
 * @throws Error on missing source artifact or ReDoS-pattern timeout (5s).
 */
function expandIterateStep(
 runDir: string,
 def: { steps: StepDefinition[] },
 graph: WorkflowGraph,
 next: GraphStep,
): GraphStep | null {
 const stepDef = def.steps.find((s) => s.id === next.id);
 if (!stepDef?.iterate) return next;

 const iterate = stepDef.iterate;

 // Read source artifact (containment-checked)
 const sourcePath = resolveIterateSource(runDir, iterate.source);
 let sourceContent: string;
 try {
  sourceContent = readFileSync(sourcePath, "utf-8");
 } catch {
  throw new Error(
   `Iterate source artifact not found: ${sourcePath} (step "${next.id}", source: "${iterate.source}")`,
  );
 }

 // Extract items via regex with global+multiline flags, capture-group-1.
 // Guard against ReDoS: if matching takes too long on large inputs, bail.
 const regex = new RegExp(iterate.pattern, "gm");
 const items: string[] = [];
 const matchStart = Date.now();
 let match: RegExpExecArray | null;
 while ((match = regex.exec(sourceContent)) !== null) {
  if (match[1] !== undefined) items.push(match[1]);
  if (Date.now() - matchStart > 5_000) {
   throw new Error(
    `Iterate pattern "${iterate.pattern}" exceeded 5s timeout on step "${next.id}" — possible ReDoS`,
   );
  }
 }

 // Zero matches ⇒ stop info (no expansion, graph untouched)
 if (items.length === 0) {
  return null;
 }

 // Expand the graph and re-query for the first instance step
 const expandedGraph = expandIteration(graph, next.id, items, next.prompt);
 writeGraph(runDir, expandedGraph);

 return getNextPendingStep(expandedGraph);
}

// ─── Dispatch ────────────────────────────────────────────────────────────

/**
 * Resolve the next dispatch action from graph state, under the GRAPH.yaml
 * file lock. Active step → resume dispatch of that same step. Otherwise the
 * first ready pending step (iterate-expanded first). No ready step → stop
 * (blocked = error, all-done = info).
 */
export function resolveDispatch(runDir: string): Promise<DispatchAction> {
 const graphPath = join(runDir, "GRAPH.yaml");

 return withFileLock(graphPath, () => {
  let graph = readGraph(runDir);

  const active = graph.steps.find((step) => step.status === "active");
  if (active) {
   return {
    action: "dispatch" as const,
    step: {
     unitType: "custom-step" as const,
     unitId: `${graph.metadata.name}/${active.id}`,
     prompt: injectContext(runDir, active.id, active.prompt),
    },
   };
  }

  let next = getNextPendingStep(graph);

  if (!next) {
   const allDone = graph.steps.every((step) => step.status === "complete" || step.status === "expanded");
   if (!allDone) {
    return {
     action: "stop" as const,
     reason: formatBlockedWorkflowReason(graph),
     level: "error" as const,
    };
   }
   return { action: "stop" as const, reason: "All steps complete", level: "info" as const };
  }

  // Check the frozen DEFINITION.yaml for iterate config on this step
  const def = readFrozenDefinition(runDir);
  const expanded = expandIterateStep(runDir, def, graph, next);
  if (expanded === null) {
   return {
    action: "stop" as const,
    reason: "Iterate expansion produced no instances",
    level: "info" as const,
   };
  }
  if (expanded !== next) {
   graph = readGraph(runDir); // graph was rewritten by expansion
   next = expanded;
  }

  const activeGraph = markStepActive(graph, next.id);
  writeGraph(runDir, activeGraph);

  const activeStep = activeGraph.steps.find((s) => s.id === next.id);
  if (!activeStep) {
   throw new Error(`Active step not found after GRAPH.yaml update: ${next.id}`);
  }

  // Enrich prompt with context from prior step artifacts
  return {
   action: "dispatch" as const,
   step: {
    unitType: "custom-step" as const,
    unitId: `${activeGraph.metadata.name}/${activeStep.id}`,
    prompt: injectContext(runDir, activeStep.id, activeStep.prompt),
   },
  };
 });
}

// ─── Reconcile ───────────────────────────────────────────────────────────

/**
 * Reconcile state after a step completes: lock → re-read the graph from disk
 * (so concurrent workflow edits are never overwritten with a stale snapshot)
 * → mark the step complete → write.
 *
 * stepId is extracted from the unitId "<workflowName>/<stepId>".
 */
export function reconcile(_state: EngineState, completedStep: CompletedStep, runDir: string): Promise<ReconcileResult> {
 const graphPath = join(runDir, "GRAPH.yaml");

 return withFileLock(graphPath, async () => {
  const graph = readGraph(runDir);

  // Extract stepId from "<workflowName>/<stepId>"
  const [, stepId] = completedStep.unitId.split("/");

  // Single-active invariant: only the current dispatchable step may complete.
  // Completing a pending/complete/wrong step would bypass dependencies.
  const step = graph.steps.find((s) => s.id === stepId);
  if (!step) {
   throw new Error(`Step not found in run: ${stepId}`);
  }
  if (step.status !== "active") {
   // Only the dispatched (active) step may complete — allowing a pending
   // next-eligible step to complete would bypass the dispatch handshake.
   throw new Error(
    `Step "${stepId}" is not completable (status "${step.status}") — run next to dispatch the current step`,
   );
  }
  // Single-active invariant WITHOUT re-locking: resolveDispatch takes the same
  // GRAPH.yaml lock (non-reentrant), so derive the dispatchable step from the
  // Active-only completion (strict): the step under reconciliation must be
  // the dispatched step. Pending steps — even dependency-satisfied ones —
  // cannot complete before the dispatch handshake (enforced by the
  // status !== "active" guard above).
  const active = graph.steps.find((step) => step.status === "active");
  if (active && active.id !== stepId) {
   throw new Error(
    `Out-of-order completion: "${active.id}" is the active step, not "${stepId}"`,
   );
  }

  const updatedGraph = markStepComplete(graph, stepId);
  writeGraph(runDir, updatedGraph);

  const allDone = updatedGraph.steps.every((s) => s.status === "complete" || s.status === "expanded");
  return { outcome: allDone ? "milestone-complete" : "continue" };
 });
}

// ─── Status ──────────────────────────────────────────────────────────────

/** UI-facing progress metadata: "Step N/M" where N = completed count. */
export function runStatus(state: EngineState): DisplayMetadata {
 const graph = state.raw;
 const total = graph.steps.length;
 const completed = graph.steps.filter((s) => s.status === "complete").length;

 return {
  engineLabel: "WORKFLOW",
  currentPhase: state.phase,
  progressSummary: `Step ${completed}/${total}`,
  stepCount: { completed, total },
 };
}
