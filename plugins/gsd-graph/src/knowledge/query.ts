/**
 * graphQuery — port of readers/graph.ts applyBudget + graphQuery.
 *
 * Case-insensitive seed match on label+description → forward-only BFS →
 * budget trim: AMBIGUOUS edges first, then INFERRED, then hard-trim to
 * seed nodes + EXTRACTED seed edges. Token heuristics: 1 node ≈ 20 tokens,
 * 1 edge ≈ 10 tokens. Missing/malformed graph or empty term ⇒ empty result.
 * Never throws.
 */

import { existsSync, readFileSync } from 'node:fs';

import { gsdPaths, resolveGsdRoot } from './paths.js';
import { parseGraph } from './normalize.js';
import type { GraphQueryResult, KnowledgeGraph } from './types.js';

/** Rough token estimate: 1 node ≈ 20 tokens, 1 edge ≈ 10 tokens. */
export const TOKENS_PER_NODE = 20;
export const TOKENS_PER_EDGE = 10;

function applyBudget(
  graph: KnowledgeGraph,
  seedIds: Set<string>,
  budget: number,
): { nodes: GraphQueryResult['nodes']; edges: GraphQueryResult['edges'] } {
  // Forward-only BFS to collect reachable nodes (start from seeds)
  const reachable = new Set<string>(seedIds);
  const queue = [...seedIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.from === current && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  let resultNodes = graph.nodes.filter((n) => reachable.has(n.id));
  let resultEdges = graph.edges.filter(
    (e) => reachable.has(e.from) && reachable.has(e.to),
  );

  const estimate = (): number => resultNodes.length * TOKENS_PER_NODE + resultEdges.length * TOKENS_PER_EDGE;

  // Trim AMBIGUOUS edges first, then INFERRED, then hard-trim to seeds.
  if (estimate() > budget) {
    resultEdges = resultEdges.filter((e) => e.confidence !== 'AMBIGUOUS');
  }
  if (estimate() > budget) {
    resultEdges = resultEdges.filter((e) => e.confidence !== 'INFERRED');
  }
  if (estimate() > budget) {
    // Hard trim — keep only seed nodes and their EXTRACTED seed edges
    const seedNodes = resultNodes.filter((n) => seedIds.has(n.id));
    const seedEdges = resultEdges.filter(
      (e) => seedIds.has(e.from) && e.confidence === 'EXTRACTED',
    );
    return { nodes: seedNodes, edges: seedEdges };
  }

  return { nodes: resultNodes, edges: resultEdges };
}

/**
 * Non-finite budgets are a caller usage error: the tool surface converts
 * this to isError. Exported so the tool layer and tests share the contract.
 */
export function isFiniteBudget(budget: number): boolean {
  return Number.isFinite(budget);
}

export function graphQuery(projectDir: string, term: string, budget = 4000): GraphQueryResult {
  const empty: GraphQueryResult = { nodes: [], edges: [], term, budget };

  if (!isFiniteBudget(budget)) {
    // Upstream would compute against any number; a non-finite budget is a
    // usage error surfaced by the tool layer. Read side returns the empty shape.
    return empty;
  }

  const gsdRoot = resolveGsdRoot(projectDir);
  const graphPath = gsdPaths.graphJsonPath(gsdRoot);

  if (!existsSync(graphPath)) {
    return empty;
  }

  let graph: ReturnType<typeof parseGraph>;
  try {
    graph = parseGraph(readFileSync(graphPath, 'utf-8'));
  } catch {
    return empty;
  }
  if (!graph) return empty;

  if (!term || term.trim() === '') {
    return empty;
  }

  const lower = term.toLowerCase();

  // Find seed nodes that match the term (case-insensitive on label + description)
  const seedIds = new Set<string>(
    graph.nodes
      .filter((n) => {
        const labelMatch = n.label.toLowerCase().includes(lower);
        const descMatch = n.description?.toLowerCase().includes(lower) ?? false;
        return labelMatch || descMatch;
      })
      .map((n) => n.id),
  );

  if (seedIds.size === 0) {
    return empty;
  }

  const result = applyBudget(graph, seedIds, budget);
  return { ...result, term, budget };
}
