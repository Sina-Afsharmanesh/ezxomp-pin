/**
 * KNOWLEDGE.md parser — port of gsd-pi readers/graph.ts parseKnowledgeFile
 * (170-243). Extracts Rules (K#), Patterns (P#), and Lessons (L#) tables.
 * Never throws: missing/unreadable file is silently skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphEdge, GraphNode } from '../types.js';

export function parseKnowledgeFile(gsdRoot: string, nodes: GraphNode[], _edges: GraphEdge[]): void {
	const knowledgePath = join(gsdRoot, 'KNOWLEDGE.md');
	if (!existsSync(knowledgePath)) return;

	let content: string;
	try {
		content = readFileSync(knowledgePath, 'utf-8');
	} catch {
		return;
	}

	// Parse Rules table
	const rulesMatch = content.match(/## Rules\s*\n([\s\S]*?)(?=\n## |$)/i);
	if (rulesMatch) {
		for (const line of rulesMatch[1].split('\n')) {
			if (!line.includes('|')) continue;
			const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
			if (cells.length < 3) continue;
			if (cells[0].startsWith('#') || cells[0].startsWith('-')) continue;
			const id = cells[0];
			if (!/^K\d+$/i.test(id)) continue;
			nodes.push({
				id: `rule:${id}`,
				label: id,
				type: 'rule',
				description: cells[2] ?? '',
				confidence: 'EXTRACTED',
				sourceFile: 'KNOWLEDGE.md',
			});
		}
	}

	// Parse Patterns table
	const patternsMatch = content.match(/## Patterns\s*\n([\s\S]*?)(?=\n## |$)/i);
	if (patternsMatch) {
		for (const line of patternsMatch[1].split('\n')) {
			if (!line.includes('|')) continue;
			const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
			if (cells.length < 2) continue;
			if (cells[0].startsWith('#') || cells[0].startsWith('-')) continue;
			const id = cells[0];
			if (!/^P\d+$/i.test(id)) continue;
			nodes.push({
				id: `pattern:${id}`,
				label: id,
				type: 'pattern',
				description: cells[1] ?? '',
				confidence: 'EXTRACTED',
				sourceFile: 'KNOWLEDGE.md',
			});
		}
	}

	// Parse Lessons Learned table
	const lessonsMatch = content.match(/## Lessons Learned\s*\n([\s\S]*?)(?=\n## |$)/i);
	if (lessonsMatch) {
		for (const line of lessonsMatch[1].split('\n')) {
			if (!line.includes('|')) continue;
			const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
			if (cells.length < 2) continue;
			if (cells[0].startsWith('#') || cells[0].startsWith('-')) continue;
			const id = cells[0];
			if (!/^L\d+$/i.test(id)) continue;
			nodes.push({
				id: `lesson:${id}`,
				label: id,
				type: 'lesson',
				description: cells[1] ?? '',
				confidence: 'EXTRACTED',
				sourceFile: 'KNOWLEDGE.md',
			});
		}
	}
}
