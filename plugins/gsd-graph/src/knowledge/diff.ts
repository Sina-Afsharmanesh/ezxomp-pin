/**
 * graphDiff — port of readers/graph.ts graphDiff.
 *
 * Compare current graph.json with .last-build-snapshot.json. Nodes: added/
 * removed/changed (changed = label or description drift). Edges keyed
 * `from->to:type`. Either side missing or malformed ⇒ empty arrays. Never throws.
 */

import { existsSync, readFileSync } from 'node:fs';

import { gsdPaths, resolveGsdRoot } from './paths.js';
import { parseGraph } from './normalize.js';
import type { GraphDiffResult, KnowledgeGraph } from './types.js';

const EMPTY: GraphDiffResult = {
  nodes: { added: [], removed: [], changed: [] },
  edges: { added: [], removed: [] },
};

/**
 * Canonical edge identity key — the same key format the tool surface prints.
 * Normalization upstream of this function makes gsd-core-spelled snapshots
 * diff-stable against canonical current graphs.
 */
export function edgeKey(e: { from: string; to: string; type: string }): string {
  return `${e.from}->${e.to}:${e.type}`;
}

function readGraphAt(path: string): KnowledgeGraph | null {
  if (!existsSync(path)) return null;
  try {
    return parseGraph(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function graphDiff(projectDir: string): GraphDiffResult {
  const gsdRoot = resolveGsdRoot(projectDir);

  const current = readGraphAt(gsdPaths.graphJsonPath(gsdRoot));
  const snapshot = readGraphAt(gsdPaths.snapshotPath(gsdRoot));
  if (!current || !snapshot) return EMPTY;

  const currentNodeIds = new Set(current.nodes.map((n) => n.id));
  const snapshotNodeIds = new Set(snapshot.nodes.map((n) => n.id));

  const added = current.nodes.filter((n) => !snapshotNodeIds.has(n.id)).map((n) => n.id);
  const removed = snapshot.nodes.filter((n) => !currentNodeIds.has(n.id)).map((n) => n.id);

  // Changed: same id but different label or description
  const snapshotNodeMap = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const changed = current.nodes
    .filter((n) => {
      const snap = snapshotNodeMap.get(n.id);
      if (!snap) return false;
      return n.label !== snap.label || n.description !== snap.description;
    })
    .map((n) => n.id);

  // Edges — compare by string key "from->to:type"
  const currentEdgeKeys = new Set(current.edges.map(edgeKey));
  const snapshotEdgeKeys = new Set(snapshot.edges.map(edgeKey));

  const edgesAdded = current.edges.filter((e) => !snapshotEdgeKeys.has(edgeKey(e))).map(edgeKey);
  const edgesRemoved = snapshot.edges.filter((e) => !currentEdgeKeys.has(edgeKey(e))).map(edgeKey);

  return {
    nodes: { added, removed, changed },
    edges: { added: edgesAdded, removed: edgesRemoved },
  };
}
