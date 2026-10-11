/**
 * Knowledge-graph types — port of gsd-pi packages/mcp-server readers/graph.ts:30-96.
 *
 * Canonical schema (single writer): nodes:[{id,label,type,description?,confidence,sourceFile?}],
 * edges:[{from,to,type,confidence}], top-level builtAt; confidence tiers EXTRACTED|INFERRED|AMBIGUOUS.
 */

export type NodeType =
  | 'milestone'
  | 'slice'
  | 'task'
  | 'rule'
  | 'pattern'
  | 'lesson'
  | 'concept'
  | 'decision';

export type EdgeType =
  | 'contains'
  | 'depends_on'
  | 'relates_to'
  | 'implements';

export type ConfidenceTier = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  description?: string;
  confidence: ConfidenceTier;
  sourceFile?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  confidence: ConfidenceTier;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  builtAt: string;
}

export interface GraphStatusResult {
  exists: boolean;
  lastBuild?: string;
  nodeCount?: number;
  edgeCount?: number;
  stale?: boolean;
  ageHours?: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  term: string;
  budget: number;
}

export interface GraphDiffResult {
  nodes: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  edges: {
    added: string[];
    removed: string[];
  };
}

export const NODE_TYPES: readonly NodeType[] = [
  'milestone',
  'slice',
  'task',
  'rule',
  'pattern',
  'lesson',
  'concept',
  'decision',
] as const;

export const EDGE_TYPES: readonly EdgeType[] = [
  'contains',
  'depends_on',
  'relates_to',
  'implements',
] as const;

export const CONFIDENCE_TIERS: readonly ConfidenceTier[] = [
  'EXTRACTED',
  'INFERRED',
  'AMBIGUOUS',
] as const;
