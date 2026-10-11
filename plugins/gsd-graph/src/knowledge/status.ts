/**
 * graphStatus — port of readers/graph.ts graphStatus (24h stale window).
 * Malformed graph.json ⇒ { exists:false }; never throws.
 */

import { existsSync, readFileSync } from 'node:fs';

import { gsdPaths, resolveGsdRoot } from './paths.js';
import { parseGraph } from './normalize.js';
import type { GraphStatusResult } from './types.js';

export function graphStatus(projectDir: string): GraphStatusResult {
  const gsdRoot = resolveGsdRoot(projectDir);
  const graphPath = gsdPaths.graphJsonPath(gsdRoot);

  if (!existsSync(graphPath)) {
    return { exists: false };
  }

  try {
    const graph = parseGraph(readFileSync(graphPath, 'utf-8'));
    if (!graph) return { exists: false };

    const builtAtMs = Date.parse(graph.builtAt);
    if (!Number.isFinite(builtAtMs)) {
      return {
        exists: true,
        lastBuild: graph.builtAt || undefined,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    }

    const ageHours = (Date.now() - builtAtMs) / (1000 * 60 * 60);
    const stale = ageHours > 24;

    return {
      exists: true,
      lastBuild: graph.builtAt,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      stale,
      ageHours,
    };
  } catch {
    return { exists: false };
  }
}
