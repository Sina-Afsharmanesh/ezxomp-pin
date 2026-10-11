/**
 * LEARNINGS.md parser — port of gsd-pi readers/graph.ts parseLearningsFiles /
 * parseSingleLearningsFile / parseLearningsSection (402-541).
 *
 * Parses *-LEARNINGS.md files in milestone directories. Sections: Decisions →
 * decision nodes, Lessons → lesson, Patterns → pattern, Surprises → lesson
 * (no distinct type). Item IDs: <prefix>:<MID>:<n> (1-based, keep-first dedupe
 * happens in build). Edge: milestone -relates_to→ learning node.
 */

import { join } from 'node:path';
import type { GraphEdge, GraphNode, NodeType } from '../types.js';
import { findMilestoneIds, milestonesDir, resolveMilestoneDir } from './paths.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

/** The milestones/ directory when it is a readable directory, else null. */
function resolveMilestoneIdsDir(gsdRoot: string): string | null {
	const dir = milestonesDir(gsdRoot);
	try {
		if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
		readdirSync(dir);
		return dir;
	} catch {
		return null;
	}
}

export function parseLearningsFiles(gsdRoot: string, nodes: GraphNode[], edges: GraphEdge[]): void {
	const dir = resolveMilestoneIdsDir(gsdRoot);
	if (!dir) return;
	for (const milestoneId of findMilestoneIds(gsdRoot)) {
		try {
			parseSingleLearningsFile(gsdRoot, milestoneId, nodes, edges);
		} catch {
			// Skip this milestone's LEARNINGS.md on any error
		}
	}
}

function parseSingleLearningsFile(gsdRoot: string, milestoneId: string, nodes: GraphNode[], edges: GraphEdge[]): void {
	const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
	if (!mDir) return;

	const learningsPath = join(mDir, `${milestoneId}-LEARNINGS.md`);
	if (!existsSync(learningsPath)) return;

	let content: string;
	try {
		content = readFileSync(learningsPath, 'utf-8');
	} catch {
		return;
	}

	// Strip YAML frontmatter if present
	const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');

	const milestoneNodeId = `milestone:${milestoneId}`;
	const sourceFile = `milestones/${milestoneId}/${milestoneId}-LEARNINGS.md`;

	// Parse each section: [sectionName, nodeType, idPrefix]
	const sections: Array<[string, NodeType, string]> = [
		['Decisions', 'decision', 'decision'],
		['Lessons', 'lesson', 'lesson'],
		['Patterns', 'pattern', 'pattern'],
		['Surprises', 'lesson', 'surprise'],
	];

	for (const [sectionName, nodeType, idPrefix] of sections) {
		const sectionMatch = withoutFrontmatter.match(
			new RegExp(`##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'),
		);
		if (!sectionMatch) continue;
		parseLearningsSection(sectionMatch[1], milestoneId, idPrefix, nodeType, milestoneNodeId, sourceFile, nodes, edges);
	}
}

function parseLearningsSection(
	sectionContent: string,
	milestoneId: string,
	idPrefix: string,
	nodeType: NodeType,
	milestoneNodeId: string,
	sourceFile: string,
	nodes: GraphNode[],
	edges: GraphEdge[],
): void {
	// Each item is a bullet line starting with "- " followed by optional
	// indented "Source: ..." line.
	const lines = sectionContent.split('\n');
	let itemIndex = 0;
	let currentText: string | null = null;
	let currentSource: string | null = null;

	const flushItem = (): void => {
		if (!currentText) return;
		itemIndex += 1;
		const nodeId = `${idPrefix}:${milestoneId}:${itemIndex}`;
		nodes.push({
			id: nodeId,
			label: currentText,
			type: nodeType,
			description: currentSource ?? undefined,
			confidence: 'EXTRACTED',
			sourceFile,
		});
		// Edge: milestone relates_to this learning node
		edges.push({ from: milestoneNodeId, to: nodeId, type: 'relates_to', confidence: 'EXTRACTED' });
		currentText = null;
		currentSource = null;
	};

	for (const line of lines) {
		const bulletMatch = line.match(/^[-*]\s+(.+)/);
		if (bulletMatch) {
			flushItem();
			currentText = bulletMatch[1].trim();
			continue;
		}

		// Indented source attribution: "  Source: ..."
		const sourceMatch = line.match(/^\s+Source:\s+(.+)/i);
		if (sourceMatch && currentText !== null) {
			currentSource = `Source: ${sourceMatch[1].trim()}`;
			continue;
		}

		// Continuation of current item text (indented non-source line)
		const continuationMatch = line.match(/^\s{2,}(.+)/);
		if (continuationMatch && currentText !== null && currentSource === null) {
			currentText += ' ' + continuationMatch[1].trim();
		}
	}

	flushItem();
}
