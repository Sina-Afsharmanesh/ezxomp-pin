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
import { buildGraph, graphStatus, resolveGsdRoot, writeGraph } from "./knowledge/index.js";
import { acquireBuildLock } from "./knowledge/build-lock.js";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolveGsdGraphSettings } from "./settings.js";
import { registerGsdGraphTools } from "./tools.js";
import { registerGsdGraphCommand } from "./commands.js";

/**
 * Local fix (omp 18.2.4): the host subpath import
 * "@oh-my-pi/pi-coding-agent/extensibility/plugins/manager" is not resolvable from an
 * installed plugin's extension graph, which aborted the whole extension load with
 * "undefined is not an object (evaluating 'this.extension')". Read the persisted
 * settings map from the plugins lockfile instead (same data PluginManager exposes).
 */
function readPluginSettings(): Record<string, unknown> {
	const candidates = [
		process.env.OMP_PLUGINS_DIR
			? join(process.env.OMP_PLUGINS_DIR, "omp-plugins.lock.json")
			: undefined,
		process.env.XDG_DATA_HOME
			? join(process.env.XDG_DATA_HOME, "omp", "plugins", "omp-plugins.lock.json")
			: undefined,
		join(homedir(), ".omp", "plugins", "omp-plugins.lock.json"),
	].filter((p): p is string => typeof p === "string");
	for (const file of candidates) {
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8")) as {
				settings?: Record<string, Record<string, unknown>>;
			};
			const entry = parsed?.settings?.["@ezxomp/gsd-graph"];
			if (entry && typeof entry === "object") return entry;
		} catch {
			// try the next candidate
		}
	}
	return {};
}

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
   const raw = readPluginSettings();
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
