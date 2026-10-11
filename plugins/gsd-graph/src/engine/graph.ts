/**
 * graph.ts — Pure data module for GRAPH.yaml workflow step tracking.
 * Sequential port of gsd-pi src/resources/extensions/gsd/graph.ts.
 *
 * GRAPH.yaml lives in a run directory and tracks step statuses
 * (pending → active → complete) with optional dependency edges.
 *
 * YAML keys are snake_case (depends_on, parent_step_id, started_at,
 * finished_at, created_at); TypeScript types camelCase. YAML via the
 * vendored js-yaml (load/dump) — marketplace installs never run npm install.
 *
 * All mark and expand operations are immutable — callers always get a new graph.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as yaml from '../../vendor/js-yaml.mjs';

// ─── Types ───────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'active' | 'complete' | 'expanded';

export interface GraphStep {
 /** Unique step identifier within the workflow. */
 id: string;
 /** Human-readable step title. */
 title: string;
 /** Current status: pending → active → complete → expanded (iterate parent). */
 status: StepStatus;
 /** The prompt to dispatch for this step. */
 prompt: string;
 /** IDs of steps that must be terminal before this step can run. */
 dependsOn: string[];
 /** For iteration instances: ID of the parent step that was expanded. */
 parentStepId?: string;
 /** ISO timestamp when the step started executing. */
 startedAt?: string;
 /** ISO timestamp when the step finished executing. */
 finishedAt?: string;
}

export interface WorkflowGraph {
 /** Ordered list of steps in the workflow. */
 steps: GraphStep[];
 /** Workflow metadata. */
 metadata: {
  name: string;
  createdAt: string;
 };
}

// ─── YAML schema mapping ─────────────────────────────────────────────────

const GRAPH_FILENAME = 'GRAPH.yaml';

/**
 * Internal YAML shape — uses snake_case for YAML keys.
 * Converted to/from the camelCase TypeScript types on read/write.
 */
interface YamlStep {
 id: string;
 title: string;
 status: string;
 prompt: string;
 depends_on?: string[];
 parent_step_id?: string;
 started_at?: string;
 finished_at?: string;
}

interface YamlGraph {
 steps: YamlStep[];
 metadata: { name: string; created_at: string };
}

// ─── Functions ───────────────────────────────────────────────────────────

/**
 * Read and parse GRAPH.yaml from a run directory.
 *
 * @param runDir — directory containing GRAPH.yaml
 * @returns Parsed workflow graph
 * @throws Error if file doesn't exist or YAML is malformed
 */
export function readGraph(runDir: string): WorkflowGraph {
 const filePath = join(runDir, GRAPH_FILENAME);
 if (!existsSync(filePath)) {
  throw new Error(`GRAPH.yaml not found: ${filePath}`);
 }
 const raw = readFileSync(filePath, 'utf-8');
 const parsed = yaml.load(raw) as YamlGraph | null;

 if (!parsed?.steps || !Array.isArray(parsed.steps)) {
  throw new Error(`Invalid GRAPH.yaml: missing or invalid 'steps' array in ${filePath}`);
 }
 if (parsed.metadata && typeof parsed.metadata !== 'object') {
  throw new Error(`Invalid GRAPH.yaml: 'metadata' must be an object, not a scalar in ${filePath}`);
 }

 // Strict step validation: scalar or partial entries (e.g. `[nope]`, `{id:1}`)
 // would map into undefined/corrupt GraphStep fields — reject with the entry
 // index so the broken YAML is actionable.
 return {
  steps: parsed.steps.map((s, index) => {
   if (s === null || typeof s !== 'object' || Array.isArray(s)) {
    throw new Error(
     `Invalid GRAPH.yaml: steps[${index}] is ${s === null ? 'null' : typeof s}, expected a step object with id/status/prompt in ${filePath}`,
    );
   }
   if (typeof s.id !== 'string' || !s.id) {
    throw new Error(`Invalid GRAPH.yaml: steps[${index}].id must be a non-empty string in ${filePath}`);
   }
   if (typeof s.title !== 'string') {
    throw new Error(`Invalid GRAPH.yaml: steps[${index}].title must be a string in ${filePath}`);
   }
   if (typeof s.prompt !== 'string') {
    throw new Error(`Invalid GRAPH.yaml: steps[${index}].prompt must be a string in ${filePath}`);
   }
   if (typeof s.status !== 'string') {
    throw new Error(`Invalid GRAPH.yaml: steps[${index}].status must be a string in ${filePath}`);
   }
   return {
    id: s.id,
    title: s.title,
    status: s.status as GraphStep['status'],
    prompt: s.prompt,
    dependsOn: s.depends_on ?? [],
    ...(s.parent_step_id != null ? { parentStepId: s.parent_step_id } : {}),
    ...(s.started_at != null ? { startedAt: s.started_at } : {}),
    ...(s.finished_at != null ? { finishedAt: s.finished_at } : {}),
   };
  }),
  metadata: parsed.metadata && typeof parsed.metadata === 'object'
   ? {
    name: parsed.metadata.name ?? 'unnamed',
    createdAt: parsed.metadata.created_at ?? new Date().toISOString(),
   }
   : {
    name: 'unnamed',
    createdAt: new Date().toISOString(),
   },
 };
}

/**
 * Write a workflow graph to GRAPH.yaml in a run directory.
 * Creates the directory if it doesn't exist. Write is atomic (tmp + rename).
 *
 * @param runDir — directory to write GRAPH.yaml into
 * @param graph — the workflow graph to serialize
 */
export function writeGraph(runDir: string, graph: WorkflowGraph): void {
 if (!existsSync(runDir)) {
  mkdirSync(runDir, { recursive: true });
 }

 const yamlData: YamlGraph = {
  steps: graph.steps.map((s) => ({
   id: s.id,
   title: s.title,
   status: s.status,
   prompt: s.prompt,
   depends_on: s.dependsOn.length > 0 ? s.dependsOn : undefined,
   parent_step_id: s.parentStepId ?? undefined,
   started_at: s.startedAt ?? undefined,
   finished_at: s.finishedAt ?? undefined,
  })) as YamlStep[],
  metadata: {
   name: graph.metadata.name,
   created_at: graph.metadata.createdAt,
  },
 };

 const filePath = join(runDir, GRAPH_FILENAME);
 const tmpPath = `${filePath}.tmp`;
 const content = yaml.dump(yamlData);
 writeFileSync(tmpPath, content, 'utf-8');
 // Atomic rename for crash safety
 renameSync(tmpPath, filePath);
}

/**
 * Return whether a graph step status satisfies dependency edges.
 */
export function isTerminalStepStatus(status: GraphStep['status'] | undefined): boolean {
 return status === 'complete' || status === 'expanded';
}

/**
 * Get the next pending step whose dependencies are all terminal.
 *
 * Returns the first step (in array order) with status "pending" where
 * every step in its `dependsOn` list has status "complete" or "expanded".
 *
 * @param graph — the workflow graph to query
 * @returns The next dispatchable step, or null if none available
 */
export function getNextPendingStep(graph: WorkflowGraph): GraphStep | null {
 const statusMap = new Map(graph.steps.map((s) => [s.id, s.status]));

 for (const step of graph.steps) {
  if (step.status !== 'pending') continue;
  const depsComplete = step.dependsOn.every((depId) =>
   isTerminalStepStatus(statusMap.get(depId)),
  );
  if (depsComplete) return step;
 }

 return null;
}

/**
 * Return a new graph with the specified step marked as "complete".
 * Immutable — does not mutate the input graph.
 *
 * @param graph — the current workflow graph
 * @param stepId — ID of the step to mark complete
 * @returns New graph with the step's status set to "complete"
 * @throws Error if stepId is not found in the graph
 */
export function markStepComplete(graph: WorkflowGraph, stepId: string): WorkflowGraph {
 const found = graph.steps.some((s) => s.id === stepId);
 if (!found) {
  throw new Error(`Step not found: ${stepId}`);
 }

 return {
  ...graph,
  steps: graph.steps.map((s) =>
   s.id === stepId
    ? { ...s, status: 'complete' as const, finishedAt: new Date().toISOString() }
    : s,
  ),
 };
}

/**
 * Return a new graph with the specified step marked as "active".
 * Immutable — does not mutate the input graph. `startedAt` is sticky:
 * re-activating a previously-started step keeps the original stamp.
 *
 * @param graph — the current workflow graph
 * @param stepId — ID of the step to mark active
 * @returns New graph with the step's status set to "active"
 * @throws Error if stepId is not found in the graph
 */
export function markStepActive(graph: WorkflowGraph, stepId: string): WorkflowGraph {
 const found = graph.steps.some((s) => s.id === stepId);
 if (!found) {
  throw new Error(`Step not found: ${stepId}`);
 }

 const startedAt = new Date().toISOString();
 return {
  ...graph,
  steps: graph.steps.map((s) =>
   s.id === stepId
    ? {
     ...s,
     status: 'active' as const,
     startedAt: s.startedAt ?? startedAt,
    }
    : s,
  ),
 };
}

// ─── Iteration expansion ─────────────────────────────────────────────────

/**
 * Expand an iterate step into concrete instances. Pure and deterministic —
 * identical inputs always produce identical output.
 *
 * Given a parent step with status "pending" and an array of matched items,
 * creates one instance step per item, marks the parent as "expanded", and
 * rewrites any downstream dependsOn references from the parent ID to the
 * full set of instance IDs.
 *
 * @param graph — the current workflow graph (not mutated)
 * @param stepId — ID of the iterate step to expand
 * @param items — matched items from the source artifact
 * @param promptTemplate — template with {{item}} placeholders
 * @returns New WorkflowGraph with instances inserted and deps rewritten
 * @throws Error if stepId not found or step is not pending
 */
export function expandIteration(
 graph: WorkflowGraph,
 stepId: string,
 items: string[],
 promptTemplate: string,
): WorkflowGraph {
 const parentIndex = graph.steps.findIndex((s) => s.id === stepId);
 if (parentIndex === -1) {
  throw new Error(`expandIteration: step not found: ${stepId}`);
 }
 const parentStep = graph.steps[parentIndex];
 if (parentStep.status !== 'pending') {
  throw new Error(
   `expandIteration: step "${stepId}" has status "${parentStep.status}", expected "pending"`,
  );
 }

 // Create instance steps: <stepId>--<NNN> zero-padded to 3
 const instanceIds: string[] = [];
 const instances: GraphStep[] = items.map((item, i) => {
  const instanceId = `${stepId}--${String(i + 1).padStart(3, '0')}`;
  instanceIds.push(instanceId);
  return {
   id: instanceId,
   title: `${parentStep.title}: ${item}`,
   status: 'pending' as const,
   prompt: promptTemplate.replace(/\{\{item\}\}/g, () => item),
   dependsOn: [...parentStep.dependsOn],
   parentStepId: stepId,
  };
 });

 // Build new steps array: copy everything, mark parent as expanded,
 // insert instances right after the parent, rewrite downstream deps.
 const newSteps: GraphStep[] = [];
 for (let i = 0; i < graph.steps.length; i++) {
  if (i === parentIndex) {
   // Mark parent as expanded
   newSteps.push({ ...parentStep, status: 'expanded' as const });
   // Insert instances immediately after parent
   newSteps.push(...instances);
  } else {
   const step = graph.steps[i];
   // Rewrite dependsOn: replace parent ID with all instance IDs
   const hasDep = step.dependsOn.includes(stepId);
   if (hasDep) {
    const rewritten = step.dependsOn.flatMap((dep) =>
     dep === stepId ? instanceIds : [dep],
    );
    newSteps.push({ ...step, dependsOn: rewritten });
   } else {
    newSteps.push(step);
   }
  }
 }

 return {
  ...graph,
  steps: newSteps,
 };
}

// ─── Definition → Graph conversion ──────────────────────────────────────

/**
 * Convert a parsed WorkflowDefinition into a WorkflowGraph with all
 * steps in "pending" status. Used by run-manager to generate the initial
 * GRAPH.yaml for a new run.
 *
 * @param def — a validated WorkflowDefinition from definition-loader
 * @returns WorkflowGraph with pending steps and metadata from the definition
 */
export function initializeGraph(def: {
 name: string;
 steps: { id: string; name: string; prompt: string; requires?: string[] }[];
}): WorkflowGraph {
 return {
  steps: def.steps.map((s) => ({
   id: s.id,
   title: s.name,
   status: 'pending' as const,
   prompt: s.prompt,
   dependsOn: s.requires ?? [],
  })),
  metadata: {
   name: def.name,
   createdAt: new Date().toISOString(),
  },
 };
}
