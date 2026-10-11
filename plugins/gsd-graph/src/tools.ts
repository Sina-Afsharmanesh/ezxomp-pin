/**
 * src/tools.ts — MCP tool surface for gsd-graph.
 *
 * Registers `gsd_graph` (knowledge-graph build/status/query/diff) and
 * `gsd_graph_run` (workflow run create/list/status/next/complete) using the
 * repo-standard envelope: {content:[{type:"text",text}], isError?, details}.
 * Parameter schemas use the typebox shim, matching the gsd-browser plugin.
 */
import { Type, type TSchema } from "typebox";
import { basename, join } from "node:path";
import { existsSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";

import { acquireBuildLock } from "./knowledge/build-lock.js";
import {
 buildGraph,
 graphDiff,
 graphQuery,
 graphStatus,
 formatGraphContextBlock,
 isFiniteBudget,
 resolveGsdRoot,
 writeGraph,
 writeSnapshot,
} from "./knowledge/index.js";
import {
 createRun,
 deriveState,
 listRuns,
 reconcile,
 resolveDispatch,
 runStatus,
 validateRunId,
} from "./engine/index.js";

interface ToolEnvelope {
 content: Array<{ type: "text"; text: string }>;
 isError?: boolean;
 details?: Record<string, unknown>;
}

function envelope(text: string, details?: Record<string, unknown>, isError?: boolean): ToolEnvelope {
 const result: ToolEnvelope = { content: [{ type: "text", text }] };
 if (details !== undefined) result.details = details;
 if (isError) result.isError = true;
 return result;
}

interface ToolSpec {
 name: string;
 description: string;
 approval: "read" | "exec";
 parameters: TSchema;
 handler: (args: Record<string, unknown>, ctx: { cwd: string }) => Promise<ToolEnvelope>;
}

/** Resolve `<workflow>/<timestamp>` via the canonical validator (confined). */
function resolveRunDir(projectDir: string, runId: string): string {
 const { runDir } = validateRunId(runId, projectDir);
 if (!existsSync(runDir)) throw new Error(`Run not found: ${runId}`);
 return runDir;
}


interface BuildResult {
 nodeCount: number;
 edgeCount: number;
}

async function graphBuild(projectDir: string, snapshot: boolean): Promise<BuildResult & { builtAt: string }> {
 const gsdRoot = resolveGsdRoot(projectDir);
 const graph = await buildGraph(projectDir);
 // Persist the build; without this, status/diff/query read a stale graph.
 await writeGraph(gsdRoot, graph);
 // Snapshot AFTER the write: it stamps the just-built graph for future diffs.
 if (snapshot) await writeSnapshot(gsdRoot);
 return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, builtAt: graph.builtAt };
}

/** projectDir must be an existing absolute directory — reject anything else. */
function resolveProjectDir(args: Record<string, unknown>, cwd: string): string | null {
 const raw = typeof args["projectDir"] === "string" ? (args["projectDir"] as string).trim() : cwd;
 if (!raw.startsWith("/")) return null;
 let resolved: string;
 try {
  resolved = realpathSync(raw);
 } catch {
  return null;
 }
 try {
  if (!statSync(resolved).isDirectory()) return null;
 } catch {
  return null;
 }
 return resolved;
}

const specs: ToolSpec[] = [
 {
  name: "gsd_graph",
  description:
   "GSD knowledge graph operations over .planning artifacts: build the graph, show build status/age, query by term under a token budget, or diff against the last snapshot.",
  approval: "exec",
  parameters: Type.Object({
   mode: Type.Union([Type.Literal("build"), Type.Literal("query"), Type.Literal("status"), Type.Literal("diff")]),
   projectDir: Type.Optional(Type.String({ description: "Project directory; defaults to session cwd." })),
   term: Type.Optional(Type.String({ description: "Search term for query mode (case-insensitive)." })),
   budget: Type.Optional(Type.Number({ description: "Token budget for query mode (default 4000; 0 valid)." })),
   snapshot: Type.Optional(Type.Boolean({ description: "Write a snapshot before build (for future diff)." })),
  }),
  handler: async (args, ctx) => {
   const resolvedDirArg = resolveProjectDir(args, ctx.cwd);
   if (!resolvedDirArg) {
    return envelope(`Error: projectDir must be an existing directory (got "${String(args["projectDir"])}")`, { reason: "invalid_project_dir" }, true);
   }
   const projectDir = resolvedDirArg;
   const mode = args["mode"];
   switch (mode) {
    case "build": {
     const release = await acquireBuildLock(join(resolveGsdRoot(projectDir), ".graph-build.lock"));
     try {
      const result = await graphBuild(projectDir, args["snapshot"] === true);
      return envelope(
       `Built knowledge graph: ${result.nodeCount} nodes, ${result.edgeCount} edges → .gsd/graphs/graph.json (builtAt ${result.builtAt})`,
       { ...result, built: true } as unknown as Record<string, unknown>,
      );
     } finally {
      release();
     }
    }
    case "status": {
     const status = graphStatus(projectDir);
     const text = status.exists
      ? `Knowledge graph exists\n- Last build: ${status.lastBuild}\n- Age: ${status.ageHours?.toFixed(1)} hours\n- Stale: ${status.stale ? "yes" : "no"}\n- Nodes: ${status.nodeCount}\n- Edges: ${status.edgeCount}`
      : "No knowledge graph. Build with /gsd-graph build.";
     return envelope(text, status as unknown as Record<string, unknown>);
    }
    case "query": {
     // Empty/absent term ⇒ empty result (upstream reader semantics), not an
     // error — the no-match line renders below.
     const term = typeof args["term"] === "string" ? (args["term"] as string) : "";
     const budget = typeof args["budget"] === "number" ? (args["budget"] as number) : 4000;
     if (!Number.isInteger(budget) || budget < 0) return envelope("Error: budget must be a non-negative integer", undefined, true);
     if (!isFiniteBudget(budget)) return envelope("Error: budget must be a finite number", undefined, true);
     const result = graphQuery(projectDir, term, budget);
     const status = graphStatus(projectDir);
     const block = formatGraphContextBlock(result, status, term);
     return envelope(block, result as unknown as Record<string, unknown>);
    }
    case "diff": {
     // Missing graph/snapshot is a distinct state from an empty diff.
     const statusPre = graphStatus(projectDir);
     if (!statusPre.exists) {
      return envelope("No knowledge graph to diff — build with {mode: \"build\"} first.", { reason: "no_graph" }, true);
     }
     const snapshotPath = join(resolveGsdRoot(projectDir), "graphs", ".last-build-snapshot.json");
     if (!existsSync(snapshotPath)) {
      return envelope("No snapshot to diff against — run build with snapshot:true first.", { reason: "no_snapshot" }, true);
     }
     const diff = graphDiff(projectDir);
     const lines: string[] = [];
     if (diff.nodes.added.length || diff.nodes.removed.length || diff.nodes.changed.length) {
      lines.push("Nodes:");
      if (diff.nodes.added.length) lines.push(`  Added: ${diff.nodes.added.join(", ")}`);
      if (diff.nodes.removed.length) lines.push(`  Removed: ${diff.nodes.removed.join(", ")}`);
      if (diff.nodes.changed.length) lines.push(`  Changed: ${diff.nodes.changed.join(", ")}`);
     }
     if (diff.edges.added.length || diff.edges.removed.length) {
      lines.push("Edges:");
      if (diff.edges.added.length) {
       lines.push("  Added:");
       for (const edge of diff.edges.added) lines.push(`    + ${edge}`);
      }
      if (diff.edges.removed.length) {
       lines.push("  Removed:");
       for (const edge of diff.edges.removed) lines.push(`    - ${edge}`);
      }
     }
     if (!lines.length) lines.push("No differences found");
     return envelope(lines.join("\n"), diff as unknown as Record<string, unknown>);
    }
    default:
     return envelope(`Unsupported mode: ${String(mode)}`, undefined, true);
   }
  },
 },
 {
  name: "gsd_graph_run",
  description:
   "GSD workflow run operations: create an isolated run from a .gsd/workflows definition, list runs, show run status, resolve the next dispatchable step, or complete a step.",
  approval: "exec",
  parameters: Type.Object({
   action: Type.Union([
    Type.Literal("create"),
    Type.Literal("list"),
    Type.Literal("status"),
    Type.Literal("next"),
    Type.Literal("complete"),
   ]),
   projectDir: Type.Optional(Type.String({ description: "Project directory; defaults to session cwd." })),
   workflow: Type.Optional(Type.String({ description: "Workflow definition name (required for create)." })),
   runId: Type.Optional(Type.String({ description: '"<workflow>/<timestamp>" (required for status|next|complete).' })),
   stepId: Type.Optional(Type.String({ description: "Step id (required for complete)." })),
   params: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: "param overrides for create." }),
   ),
  }),
  handler: async (args, ctx) => {
   try {
    return await runHandler(args, ctx);
   } catch (error) {
    return envelope(
     `ERROR: ${error instanceof Error ? error.message : String(error)}`,
     undefined,
     true,
    );
   }
  },
 },
];

async function runHandler(args: Record<string, unknown>, ctx: { cwd: string }): Promise<ToolEnvelope> {
 {
  const projectDirArg = resolveProjectDir(args, ctx.cwd);
  if (!projectDirArg) {
   return envelope(`Error: projectDir must be an existing directory (got "${String(args["projectDir"])}")`, { reason: "invalid_project_dir" }, true);
  }
  const projectDir = projectDirArg;
  const action = args["action"];
  switch (action) {
   case "create": {
    const workflow = args["workflow"];
    if (typeof workflow !== "string" || !workflow) {
     return envelope("workflow is required for create", undefined, true);
    }
    const overrides = (args["params"] && typeof args["params"] === "object"
     ? args["params"]
     : {}) as Record<string, string>;
    const runDir = createRun(projectDir, workflow, overrides);
    const graph = deriveState(runDir).raw;
    const runId = `${workflow}/${basename(runDir)}`;
    // Create contract: runId + FIRST dispatch descriptor (model advances
    // immediately without a second call).
    const first = await resolveDispatch(runDir);
    if (first.action !== "dispatch") {
     return envelope(`Created run ${runId} with ${graph.steps.length} steps — not dispatchable: ${first.reason}`, {
      runId,
      runDir,
      stepCount: graph.steps.length,
      kind: "stop",
      reason: first.reason,
      level: first.level,
     }, first.level === "error");
    }
    return envelope(`Created run ${runId} with ${graph.steps.length} steps. NEXT: ${first.step.unitId}

${first.step.prompt}`, {
     runId,
     runDir,
     stepCount: graph.steps.length,
     kind: "dispatch",
     next: first.step,
    });
   }
   case "list": {
    const workflow = typeof args["workflow"] === "string" ? (args["workflow"] as string) : undefined;
    const runs = listRuns(projectDir, workflow);
    const lines = runs.length
     ? runs.map((r) => `${r.name}/${r.timestamp} (${r.status}) — Step ${r.steps.completed}/${r.steps.total}`).join("\n")
     : "No runs found";
    return envelope(lines, {
     runs: runs.map((r) => ({
      runId: `${r.name}/${r.timestamp}`,
      workflow: r.name,
      createdAt: r.timestamp,
      runDir: r.runDir,
      phase: r.status,
      progress: `Step ${r.steps.completed}/${r.steps.total}`,
      completed: r.steps.completed,
      total: r.steps.total,
     })) as unknown as Record<string, unknown>,
    });
   }
   case "status": {
    const runId = args["runId"];
    if (typeof runId !== "string" || !runId) return envelope("runId is required for status", undefined, true);
    const runDir = resolveRunDir(projectDir, runId);
    const state = deriveState(runDir);
    const meta = runStatus(state);
    // Blocked reason surfaces WHY nothing is dispatchable (dependencies) —
    // required by the status contract when no step can run.
    const probe = await resolveDispatch(runDir);
    const blockedReason = probe.action === "stop" ? probe.reason : undefined;
    const progress = `Step ${meta.stepCount.completed}/${meta.stepCount.total}`;
    const lines = [
     `Run ${runId} — ${progress}, phase: ${meta.currentPhase}`,
     ...(blockedReason ? [blockedReason] : []),
     ...state.raw.steps.map(
      (s) => `- ${s.id} (${s.title}): ${s.status}` +
       (s.dependsOn?.length ? ` (depends on ${s.dependsOn.join(", ")})` : "") +
       (s.parentStepId ? ` [parent: ${s.parentStepId}]` : "") +
       (s.finishedAt ? ` finished ${s.finishedAt}` : s.startedAt ? ` started ${s.startedAt}` : ""),
     ),
    ];
    return envelope(lines.join("\n"), {
     runId,
     runDir,
     phase: meta.currentPhase,
     blockedReason,
     progress,
     completed: meta.stepCount.completed,
     total: meta.stepCount.total,
     steps: state.raw.steps.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      dependsOn: s.dependsOn ?? [],
      parentStepId: s.parentStepId,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
     })),
    } as unknown as Record<string, unknown>);
   }
   case "next": {
    const runId = args["runId"];
    if (typeof runId !== "string" || !runId) return envelope("runId is required for next", undefined, true);
    const runDir = resolveRunDir(projectDir, runId);
    const dispatch = await resolveDispatch(runDir);
    if (dispatch.action === "dispatch") {
     // Flat dispatch descriptor: unitType/unitId/prompt at the details top
     // level (no nested action/step wrapper).
     return envelope(
      `${dispatch.step.unitId}\n\n${dispatch.step.prompt}`,
      {
       kind: "dispatch",
       unitType: dispatch.step.unitType,
       unitId: dispatch.step.unitId,
       prompt: dispatch.step.prompt,
      } as unknown as Record<string, unknown>,
     );
    }
    return envelope(
     dispatch.reason,
     { kind: "stop", reason: dispatch.reason, level: dispatch.level } as unknown as Record<string, unknown>,
     dispatch.level === "error",
    );
   }
   case "complete": {
    const runId = args["runId"];
    const stepId = args["stepId"];
    if (typeof runId !== "string" || !runId) return envelope("runId is required for complete", undefined, true);
    if (typeof stepId !== "string" || !stepId) return envelope("stepId is required for complete", undefined, true);
    const runDir = resolveRunDir(projectDir, runId);
    const state = deriveState(runDir);
    const outcome = await reconcile(state, { unitId: `${runId.split("/")[0]}/${stepId}` }, runDir);
    if (outcome.outcome === "milestone-complete") {
     const finalGraph = deriveState(runDir).raw;
     const done = finalGraph.steps.filter((st) => st.status === "complete" || st.status === "expanded").length;
     return envelope(
      `Milestone complete. Step ${done}/${finalGraph.steps.length}.`,
      { outcome: "milestone-complete", progress: `Step ${done}/${finalGraph.steps.length}` } as unknown as Record<string, unknown>,
     );
    }
    // Composition contract: `next` is EXACTLY what a subsequent next call
    // would return — the full dispatch/stop descriptor.
    const nextDispatch = await resolveDispatch(runDir);
    const nextDescriptor =
     nextDispatch.action === "dispatch"
      ? {
         kind: "dispatch",
         unitType: nextDispatch.step.unitType,
         unitId: nextDispatch.step.unitId,
         prompt: nextDispatch.step.prompt,
        }
      : { kind: "stop", reason: nextDispatch.reason, level: nextDispatch.level };
    const details = { outcome: "continue", next: nextDescriptor };
    const text =
     nextDispatch.action === "dispatch"
      ? `Step completed. NEXT: ${nextDispatch.step.unitId}\n\n${nextDispatch.step.prompt}`
      : `Step completed. ${nextDispatch.reason}`;
    return envelope(text, details as unknown as Record<string, unknown>);
   }
   default:
    return envelope(`Unsupported action: ${String(action)}`, undefined, true);
  }
 }
}

/** Register both tools; no-op when the host lacks registerTool. */
export function registerGsdGraphTools(pi: unknown): void {
 if (typeof (pi as { registerTool?: unknown }).registerTool !== "function") return;
 const register = (pi as { registerTool: (tool: unknown) => void }).registerTool;
 for (const spec of specs) {
  register({
   name: spec.name,
   description: spec.description,
   approval: spec.approval,
   parameters: spec.parameters,
   execute: async (
    _toolCallId: string,
    params: Record<string, unknown>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: { cwd: string },
   ): Promise<ToolEnvelope> => {
    try {
     return await spec.handler(params, ctx);
    } catch (err) {
     return envelope(`Error: ${(err as Error).message}`, { reason: "handler_error" }, true);
    }
   },
  });
 }
}
