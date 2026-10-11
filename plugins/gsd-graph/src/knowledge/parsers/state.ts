/**
 * STATE.md parser — port of gsd-pi readers/graph.ts parseStateFile (125-165).
 * Extracts the active milestone and the current phase as a concept node.
 * Never throws: missing/unreadable file is silently skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphEdge, GraphNode } from '../types.js';

export function parseStateFile(gsdRoot: string, nodes: GraphNode[], _edges: GraphEdge[]): void {
	const statePath = join(gsdRoot, 'STATE.md');
	if (!existsSync(statePath)) return;

	let content: string;
	try {
		content = readFileSync(statePath, 'utf-8');
	} catch {
		return;
	}

	// Extract active milestone
	const activeMilestoneMatch = content.match(/\*\*Active Milestone:\*\*\s+([A-Z]\d+):\s+(.+)/i);
	if (activeMilestoneMatch) {
		const [, milestoneId, title] = activeMilestoneMatch;
		const id = `milestone:${milestoneId}`;
		if (!nodes.some((n) => n.id === id)) {
			nodes.push({
				id,
				label: `${milestoneId}: ${title.trim()}`,
				type: 'milestone',
				description: `Active milestone: ${milestoneId}`,
				confidence: 'EXTRACTED',
				sourceFile: 'STATE.md',
			});
		}
	}

	// Extract phase as concept
	const phaseMatch = content.match(/\*\*Phase:\*\*\s+(\S+)/i);
	if (phaseMatch) {
		const phase = phaseMatch[1].trim();
		nodes.push({
			id: `concept:phase:${phase}`,
			label: `Phase: ${phase}`,
			type: 'concept',
			confidence: 'EXTRACTED',
			sourceFile: 'STATE.md',
		});
	}
}
