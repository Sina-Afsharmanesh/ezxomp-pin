/**
 * Read-side edge-schema normalization — plan decision: we own the only writer,
 * so write-side stays single-schema; read-side tolerance gives interop with
 * repos arriving with a gsd-core-built graph.json.
 *
 * Tolerance table (per edge): from←(from|source), to←(to|target),
 * type←(type|label|relation) with unknown relation strings ⇒ relates_to;
 * confidence←(confidence|confidence_score) normalized to a tier, unknown ⇒ INFERRED.
 * Node: type unknown ⇒ concept, label←(label|id). `links` accepted as edge array.
 * Unparseable JSON ⇒ treated as absent upstream (status {exists:false}, query/diff empty).
 */

import type {
  ConfidenceTier,
  EdgeType,
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  NodeType,
} from './types.js';
import { CONFIDENCE_TIERS, EDGE_TYPES, NODE_TYPES } from './types.js';

function toTier(raw: unknown): ConfidenceTier {
  if (typeof raw === 'string') {
    const upper = raw.toUpperCase();
    if ((CONFIDENCE_TIERS as readonly string[]).includes(upper)) return upper as ConfidenceTier;
  }
  return 'INFERRED';
}

function toNodeType(raw: unknown): NodeType {
  if (typeof raw === 'string' && (NODE_TYPES as readonly string[]).includes(raw)) {
    return raw as NodeType;
  }
  return 'concept';
}

function toEdgeType(raw: unknown): EdgeType {
  if (typeof raw === 'string' && (EDGE_TYPES as readonly string[]).includes(raw)) {
    return raw as EdgeType;
  }
  return 'relates_to';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse raw JSON text into a KnowledgeGraph, applying the tolerant reader
 * table. Returns null when the text is unparseable or lacks a node array —
 * callers treat null exactly like a missing file.
 */
export function parseGraph(raw: string | undefined | null): KnowledgeGraph | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  // FIX: structurally malformed JSON (missing nodes array) => null
  if (!Array.isArray(parsed.nodes)) {
    return null;
  }

  const rawNodes = parsed.nodes;
  const rawEdges = Array.isArray(parsed.edges)
    ? parsed.edges
    : Array.isArray(parsed.links)
      ? parsed.links
      : [];

  const nodes: GraphNode[] = [];
  for (const n of rawNodes) {
    if (!isRecord(n) || typeof n.id !== 'string') continue;
    const label = typeof n.label === 'string' ? n.label : typeof n.id === 'string' ? n.id : '';
    nodes.push({
      id: n.id,
      label,
      type: toNodeType(n.type),
      ...(typeof n.description === 'string' ? { description: n.description } : {}),
      confidence: toTier(n.confidence ?? n.confidence_score),
      ...(typeof n.sourceFile === 'string' ? { sourceFile: n.sourceFile } : {}),
    });
  }

  const edges: GraphEdge[] = [];
  for (const e of rawEdges) {
    if (!isRecord(e)) continue;
    const from = typeof e.from === 'string' ? e.from : typeof e.source === 'string' ? e.source : undefined;
    const to = typeof e.to === 'string' ? e.to : typeof e.target === 'string' ? e.target : undefined;
    if (!from || !to) continue;
    edges.push({
      from,
      to,
      type: toEdgeType(e.type ?? e.label ?? e.relation),
      confidence: toTier(e.confidence ?? e.confidence_score),
    });
  }

  const builtAt = typeof parsed.builtAt === 'string' ? parsed.builtAt : '';
  return { nodes, edges, builtAt };
}
