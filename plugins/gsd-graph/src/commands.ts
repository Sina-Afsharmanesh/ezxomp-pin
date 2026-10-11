/**
 * src/commands.ts — /gsd-graph slash command.
 *
 * Thin CLI wrapper over the same knowledge + engine surfaces the tools use.
 * All output goes through ctx.ui.notify; errors are reported, never thrown.
 */
import { basename, join } from "node:path";
import { realpathSync, existsSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import {
 buildGraph,
 graphDiff,
 graphQuery,
 graphStatus,
 isFiniteBudget,
 resolveGsdRoot,
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
import { formatGraphContextBlock } from "./knowledge/index.js";
import { writeGraph } from "./knowledge/index.js";
import { acquireBuildLock } from "./knowledge/build-lock.js";

const HELP_TEXT = `Usage: /gsd-graph <subcommand> [options]

Subcommands:
  build [--snapshot]              Build knowledge graph
  status                          Show knowledge graph status
  query <term> [--budget N]       Query knowledge graph
  diff                            Show graph diff since last snapshot
  run <subcommand> [args]         Workflow execution

Run subcommands:
  create <name> [param=value...]  Create new run
  list [name]                     List runs
  status <runId>                  Show run status
  next <runId>                    Get next step to execute
  complete <runId> <stepId>       Complete a step`;

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "error"): void {
 ctx.ui.notify(message, level);
}

/** Resolve `<workflow>/<timestamp>` via the canonical validator (confined). */
function resolveRunDir(projectDir: string, runId: string): string {
 const { runDir } = validateRunId(runId, projectDir);
 if (!existsSync(runDir)) throw new Error(`Run not found: ${runId}`);
 return runDir;
}

export function registerGsdGraphCommand(pi: ExtensionAPI): void {
 pi.registerCommand("gsd-graph", {
  description: "GSD knowledge graph and workflow runs (build/status/query/diff/run)",
  handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
   const parts = args.trim().split(/\s+/).filter(Boolean);
   const subcommand = (parts[0] ?? "").toLowerCase();
   const rest = parts.slice(1);
   // Commands use the session cwd by design, but a vanished session dir must
   // be a typed error, not an ENOENT crash.
   let projectDir: string;
   try {
    projectDir = realpathSync(ctx.cwd);
   } catch (error) {
    notify(ctx, `Error: session directory does not exist: ${ctx.cwd} (${(error as Error).message})`, "error");
    return;
   }

   try {
    switch (subcommand) {
     case "": {
      notify(ctx, HELP_TEXT, "info");
      return;
     }
     case "build": {
      const snapshot = rest.includes("--snapshot");
      const gsdRoot = resolveGsdRoot(projectDir);
      const release = await acquireBuildLock(join(gsdRoot, ".graph-build.lock"));
      try {
       if (snapshot) await writeSnapshot(gsdRoot);
       const graph = await buildGraph(projectDir);
       await writeGraph(gsdRoot, graph);
       notify(
        ctx,
        `Built knowledge graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → .gsd/graphs/graph.json`,
        "info",
       );
      } finally {
       release();
      }
      return;
     }
     case "status": {
      const status = graphStatus(projectDir);
      const text = status.exists
       ? `Knowledge graph exists\n- Last build: ${status.lastBuild}\n- Age: ${status.ageHours?.toFixed(1)} hours\n- Stale: ${status.stale ? "yes" : "no"}\n- Nodes: ${status.nodeCount}\n- Edges: ${status.edgeCount}`
       : "No knowledge graph. Build with /gsd-graph build.";
      notify(ctx, text, "info");
      return;
     }
     case "query": {
      const budgetIndex = rest.indexOf("--budget");
      const termParts =
       budgetIndex === -1 ? rest : rest.slice(0, budgetIndex);
      const term = termParts.join(" ");
      if (!term) {
       notify(ctx, "Error: query requires a search term", "error");
       return;
      }
      let budget = 4000;
      if (budgetIndex !== -1) {
       if (budgetIndex + 1 >= rest.length) {
        notify(ctx, "Error: --budget requires a number", "error");
        return;
       }
       const parsed = Number(rest[budgetIndex + 1]);
       if (!Number.isInteger(parsed) || parsed < 0) {
        notify(ctx, "Error: --budget requires a non-negative integer", "error");
        return;
       }
       budget = parsed;
      }
      if (!isFiniteBudget(budget)) {
       notify(ctx, "Error: budget must be a finite number", "error");
       return;
      }
      const result = graphQuery(projectDir, term, budget);
      const status = graphStatus(projectDir);
      notify(ctx, formatGraphContextBlock(result, status, term), "info");
      return;
     }
     case "diff": {
      const statusPre = graphStatus(projectDir);
      if (!statusPre.exists) {
       notify(ctx, "No knowledge graph to diff — run /gsd-graph build first.", "error");
       return;
      }
      const snapshotPath = join(resolveGsdRoot(projectDir), "graphs", ".last-build-snapshot.json");
      if (!existsSync(snapshotPath)) {
       notify(ctx, "No snapshot to diff against — run /gsd-graph build with a snapshot first.", "error");
       return;
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
      notify(ctx, lines.join("\n"), "info");
      return;
     }
     case "run": {
      const [runSubcommand, ...runArgs] = rest;
      switch ((runSubcommand ?? "").toLowerCase()) {
       case "create": {
        const workflow = runArgs[0];
        if (!workflow) {
         notify(ctx, "Error: run create requires a workflow name", "error");
         return;
        }
        const overrides: Record<string, string> = {};
        for (const arg of runArgs.slice(1)) {
         const eq = arg.indexOf("=");
         if (eq > 0) overrides[arg.slice(0, eq)] = arg.slice(eq + 1);
        }
        const runDir = createRun(projectDir, workflow, overrides);
        const graph = deriveState(runDir).raw;
        const runId = `${workflow}/${basename(runDir)}`;
        const dispatch = await resolveDispatch(runDir);
        if (dispatch.action === "dispatch") {
         notify(
          ctx,
          `Created run ${runId} with ${graph.steps.length} steps.\n\nNEXT: ${dispatch.step.unitId}\n\n${dispatch.step.prompt}`,
          "info",
         );
        } else {
         notify(
          ctx,
          `Created run ${runId} with ${graph.steps.length} steps. ${dispatch.reason}`,
          dispatch.level === "error" ? "error" : "info",
         );
        }
        return;
       }
       case "list": {
        const workflow = runArgs[0];
        const runs = listRuns(projectDir, workflow);
        const text = runs.length
         ? runs.map((r) => `${r.name}/${r.timestamp} (${r.status}, created ${r.timestamp}) — Step ${r.steps.completed}/${r.steps.total}`).join("\n")
         : "No runs found";
        notify(ctx, text, "info");
        return;
       }
       case "status": {
        const runId = runArgs[0];
        if (!runId) {
         notify(ctx, "Error: run status requires a runId", "error");
         return;
        }
        const runDir = resolveRunDir(projectDir, runId);
        const state = deriveState(runDir);
        const meta = runStatus(state);
        const probe = await resolveDispatch(runDir);
        const lines = [
         `Run ${runId} — ${meta.progressSummary}, phase: ${meta.currentPhase}`,
         ...(probe.action === "stop" ? [probe.reason] : []),
         ...state.raw.steps.map(
          (s) =>
           `- ${s.id} (${s.title}): ${s.status}` +
           (s.dependsOn?.length ? ` depends on ${s.dependsOn.join(", ")}` : "") +
           (s.parentStepId ? ` [parent: ${s.parentStepId}]` : "") +
           (s.finishedAt ? ` finished ${s.finishedAt}` : s.startedAt ? ` started ${s.startedAt}` : ""),
         ),
        ];
        notify(ctx, lines.join("\n"), "info");
        return;
       }
       case "next": {
        const runId = runArgs[0];
        if (!runId) {
         notify(ctx, "Error: run next requires a runId", "error");
         return;
        }
        const runDir = resolveRunDir(projectDir, runId);
        const dispatch = await resolveDispatch(runDir);
        if (dispatch.action === "dispatch") {
         notify(ctx, `[${dispatch.step.unitType}] ${dispatch.step.unitId}\n\n${dispatch.step.prompt}`, "info");
        } else {
         notify(ctx, `Run stopped: ${dispatch.reason}`, dispatch.level === "error" ? "error" : "info");
        }
        return;
       }
       case "complete": {
        if (runArgs.length < 2) {
         notify(ctx, "Error: run complete requires runId and stepId", "error");
         return;
        }
        const runId = runArgs[0];
        const stepId = runArgs[1];
        const runDir = resolveRunDir(projectDir, runId);
        const state = deriveState(runDir);
        const outcome = await reconcile(state, { unitId: `${runId.split("/")[0]}/${stepId}` }, runDir);
        if (outcome.outcome === "milestone-complete") {
         const finalGraph = deriveState(runDir).raw;
         const done = finalGraph.steps.filter((st) => st.status === "complete" || st.status === "expanded").length;
         notify(ctx, `Milestone complete. Step ${done}/${finalGraph.steps.length}.`, "info");
         return;
        }
        const nextDispatch = await resolveDispatch(runDir);
        if (nextDispatch.action === "dispatch") {
         notify(
          ctx,
          `Step completed. NEXT: ${nextDispatch.step.unitId}\n\n${nextDispatch.step.prompt}`,
          "info",
         );
        } else {
         notify(ctx, `Step completed. ${nextDispatch.reason}`, nextDispatch.level === "error" ? "error" : "info");
        }
        return;
       }
       default:
        notify(
         ctx,
         `Error: Unknown run subcommand "${runSubcommand ?? ""}". Use: create|list|status|next|complete`,
         "error",
        );
      }
      return;
     }
     default:
      notify(ctx, `Error: Unknown subcommand "${subcommand}". Use: build|status|query|diff|run`, "error");
    }
   } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notify(ctx, `Error: ${message}`, "error");
   }
  },
 });
}
