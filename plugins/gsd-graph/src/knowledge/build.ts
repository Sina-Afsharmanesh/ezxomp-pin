/**
 * Knowledge-graph write side — port of gsd-pi readers/graph.ts buildGraph /
 * writeGraph / writeSnapshot (553-642).
 *
 * buildGraph fans out over the four parsers, each crash-isolated: a parser
 * that throws contributes exactly one AMBIGUOUS error node `error:<name>:<ts>`
 * and never stops the others. Nodes dedupe keep-first by id. writeGraph is
 * atomic (graph.tmp.json → rename, JSON 2-space). writeSnapshot stamps
 * snapshotAt onto a copy of the current graph.json.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { GraphEdge, GraphNode, KnowledgeGraph } from './types.js';
import { gsdPaths, resolveGsdRoot } from './paths.js';
import { parseStateFile } from './parsers/state.js';
import { parseKnowledgeFile } from './parsers/knowledge-file.js';
import { parseMilestoneFiles } from './parsers/roadmaps.js';
import { parseLearningsFiles } from './parsers/learnings.js';

type GraphParser = (gsdRoot: string, nodes: GraphNode[], edges: GraphEdge[]) => void;

const PARSERS: Array<{ name: string; fn: GraphParser }> = [
	{ name: 'parseStateFile', fn: parseStateFile },
	{ name: 'parseKnowledgeFile', fn: parseKnowledgeFile },
	{ name: 'parseMilestoneFiles', fn: parseMilestoneFiles },
	{ name: 'parseLearningsFiles', fn: parseLearningsFiles },
];

export async function buildGraph(projectDir: string): Promise<KnowledgeGraph> {
	const gsdRoot = resolveGsdRoot(projectDir);

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	// Each parser is crash-isolated: a parser that throws never stops the others
	for (const { name, fn } of PARSERS) {
		try {
			fn(gsdRoot, nodes, edges);
		} catch {
			nodes.push({
				id: `error:${name}:${Date.now()}`,
				label: `Parse error in ${name}`,
				type: 'concept',
				confidence: 'AMBIGUOUS',
			});
		}
	}

	// Deduplicate nodes by id (keep first occurrence)
	const seen = new Set<string>();
	const dedupedNodes = nodes.filter((n) => {
		if (seen.has(n.id)) return false;
		seen.add(n.id);
		return true;
	});

	return { nodes: dedupedNodes, edges, builtAt: new Date().toISOString() };
}

export async function writeGraph(gsdRoot: string, graph: KnowledgeGraph): Promise<void> {
	const dir = gsdPaths.graphsDir(gsdRoot);
	mkdirSync(dir, { recursive: true });
	const tmp = gsdPaths.graphTmpPath(gsdRoot);
	writeFileSync(tmp, JSON.stringify(graph, null, 2), 'utf-8');
	renameSync(tmp, gsdPaths.graphJsonPath(gsdRoot));
}

export async function writeSnapshot(gsdRoot: string): Promise<void> {
	const src = gsdPaths.graphJsonPath(gsdRoot);
	if (!existsSync(src)) return;

	mkdirSync(gsdPaths.graphsDir(gsdRoot), { recursive: true });
	let graph: KnowledgeGraph;
	try {
		graph = JSON.parse(readFileSync(src, 'utf-8')) as KnowledgeGraph;
	} catch {
		return;
	}
	const snapshot = { ...graph, snapshotAt: new Date().toISOString() };
	writeFileSync(gsdPaths.snapshotPath(gsdRoot), JSON.stringify(snapshot, null, 2), 'utf-8');
}
