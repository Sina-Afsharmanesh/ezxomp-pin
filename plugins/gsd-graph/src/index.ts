/**
 * gsd-graph — OMP extension entry point.
 *
 * Port of the gsd-core "graphify" surfaces for OMP:
 *   - Knowledge graph build/query/status/diff over .planning artifacts
 *   - Workflow run engine (create/list/status/next/complete)
 *   - Optional session-start auto-rebuild of a stale graph
 *     (settings key: autoRebuild)
 */

import type { ExtensionAPI, SessionStartEvent } from "@oh-my-pi/pi-coding-agent";
import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/manager";
import { buildGraph, graphStatus, resolveGsdRoot, writeGraph } from "./knowledge/index.js";
import { acquireBuildLock } from "./knowledge/build-lock.js";
import { join } from "node:path";
import { resolveGsdGraphSettings } from "./settings.js";
import { registerGsdGraphTools } from "./tools.js";
import { registerGsdGraphCommand } from "./commands.js";

export default function gsdGraphExtension(pi: ExtensionAPI): void {
 pi.setLabel("GSD Graph");

 // Register MCP surface tools
 registerGsdGraphTools(pi);

 // Register slash command
 registerGsdGraphCommand(pi);

 // Session start hook for optional auto-rebuild
 pi.on("session_start", async (_event: SessionStartEvent, ctx: { cwd: string }) => {
  try {
   const projectDir = ctx.cwd;
   const raw = await new PluginManager(projectDir)
    .getPluginSettings("@ezxomp/gsd-graph")
    .catch(() => ({} as Record<string, unknown>));
   const resolved = resolveGsdGraphSettings((raw ?? {}) as Record<string, unknown>);

   if (!resolved.autoRebuild) return;
   // Guard: only rebuild if graph exists and is stale (>24h)
   const status = graphStatus(projectDir);
   if (status.exists && status.stale) {
    try {
     const gsdRoot = resolveGsdRoot(projectDir);
     const release = await acquireBuildLock(join(gsdRoot, ".graph-build.lock"));
     try {
      const graph = await buildGraph(projectDir);
      await writeGraph(gsdRoot, graph); // auto-rebuild persists (no snapshot)
     } finally {
      release();
     }
    } catch {
     // Silent failure per spec — never crash session on auto-rebuild error
    }
   }
  } catch {
   // Session start hook errors are swallowed per WU6 spec
   // Never allow extension registration to fail session start
  }
 });
}
