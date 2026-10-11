/**
 * formatGraphContextBlock — verbatim port of gsd-pi graph-context.ts
 * inlineGraphSubgraph markdown assembly (prompt-side formatter, not the API).
 *
 * Shape:
 *   ### Knowledge Graph Context (term: "…")
 *   Source: `.gsd/graphs/graph.json`
 *   [> ⚠ Graph last built {N}h ago — context may be outdated]   (only when stale)
 *   **Nodes (N):**
 *   - **label** (`type`, confidence) — desc
 *   [**Relations (N):**
 *   - `from` →[type]→ `to`]                                      (only when edges exist)
 */

import type { GraphQueryResult, GraphStatusResult } from './types.js';

export function formatGraphContextBlock(
  result: GraphQueryResult,
  status: GraphStatusResult,
  term: string,
): string {
  let staleAnnotation = '';
  if (status.exists && status.stale && status.ageHours !== undefined) {
    const hours = Math.round(status.ageHours);
    staleAnnotation = `\n> ⚠ Graph last built ${hours}h ago — context may be outdated`;
  }

  // Format nodes as a compact list
  const nodeLines = result.nodes.map((node) => {
    const desc = node.description ? ` — ${node.description}` : '';
    return `- **${node.label}** (\`${node.type}\`, ${node.confidence})${desc}`;
  });

  // Format edges as relations (only if present)
  const edgeLines = result.edges.length > 0
    ? result.edges.map((edge) => `- \`${edge.from}\` →[${edge.type}]→ \`${edge.to}\``)
    : [];

  const sections: string[] = [
    `### Knowledge Graph Context (term: "${term}")`,
    `Source: \`.gsd/graphs/graph.json\``,
    staleAnnotation,
    '',
  ];

  if (result.nodes.length === 0) {
    // Explicit no-match contract: consumers must be able to distinguish a
    // real miss from an empty/absent graph.
    sections.push(status.exists ? `No matches for "${term}".` : `No knowledge graph — build with /gsd-graph build.`);
    return sections.join('\n');
  }

  sections.push(`**Nodes (${result.nodes.length}):**`, ...nodeLines);

  if (edgeLines.length > 0) {
    sections.push('', `**Relations (${result.edges.length}):**`, ...edgeLines);
  }

  return sections.join('\n');
}
