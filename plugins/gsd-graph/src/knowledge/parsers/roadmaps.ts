/**
 * Milestone ROADMAP.md + slice PLAN.md parsers — port of gsd-pi readers/graph.ts
 * parseMilestoneFiles / parseSingleMilestone / parseSingleSlice /
 * parseTasksFromPlan (248-396). IDs: milestone:<MID>, slice:<MID>:<SID>,
 * task:<MID>:<SID>:<TID>; edges milestone-contains-slice, slice-contains-task.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { GraphEdge, GraphNode } from '../types.js';
import { findMilestoneIds, findSliceIds, resolveMilestoneDir, resolveMilestoneFile, resolveSliceDir } from './paths.js';

export function parseMilestoneFiles(gsdRoot: string, nodes: GraphNode[], edges: GraphEdge[]): void {
	let milestoneIds: string[];
	try {
		milestoneIds = findMilestoneIds(gsdRoot);
	} catch {
		// Unreadable milestones/ directory — treat as no milestones (upstream
		// isolates crashes at the parser level; the per-milestone try below
		// covers everything after this probe)
		throw new Error(`Cannot read milestones directory under ${gsdRoot}`);
	}
	for (const milestoneId of milestoneIds) {
		try {
			parseSingleMilestone(gsdRoot, milestoneId, nodes, edges);
		} catch {
			// Skip this milestone on any error
		}
	}
}

function parseSingleMilestone(gsdRoot: string, milestoneId: string, nodes: GraphNode[], edges: GraphEdge[]): void {
	const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
	if (!mDir) return;

	const milestoneNodeId = `milestone:${milestoneId}`;

	// Try to read the roadmap file. Accept both canonical M###-ROADMAP.md and
	// legacy ROADMAP.md via the shared resolver.
	const roadmapPath = resolveMilestoneFile(gsdRoot, milestoneId, 'ROADMAP');
	let roadmapContent: string | null = null;
	if (roadmapPath && existsSync(roadmapPath)) {
		try {
			roadmapContent = readFileSync(roadmapPath, 'utf-8');
		} catch {
			// Skip
		}
	}

	// Extract milestone title from roadmap
	let milestoneTitle = milestoneId;
	if (roadmapContent) {
		const titleMatch = roadmapContent.match(/^#\s+[A-Z]\d+:\s+(.+)/m);
		if (titleMatch) milestoneTitle = `${milestoneId}: ${titleMatch[1].trim()}`;
	}

	// Ensure milestone node exists
	if (!nodes.some((n) => n.id === milestoneNodeId)) {
		nodes.push({
			id: milestoneNodeId,
			label: milestoneTitle,
			type: 'milestone',
			confidence: 'EXTRACTED',
			sourceFile: roadmapContent ? `milestones/${milestoneId}/${basename(roadmapPath!)}` : undefined,
		});
	}

	// Parse slices from roadmap table or filesystem
	for (const sliceId of findSliceIds(gsdRoot, milestoneId)) {
		try {
			parseSingleSlice(gsdRoot, milestoneId, sliceId, milestoneNodeId, nodes, edges);
		} catch {
			// Skip this slice on any error
		}
	}
}

function parseSingleSlice(
	gsdRoot: string,
	milestoneId: string,
	sliceId: string,
	milestoneNodeId: string,
	nodes: GraphNode[],
	edges: GraphEdge[],
): void {
	const sDir = resolveSliceDir(gsdRoot, milestoneId, sliceId);
	if (!sDir) return;

	const sliceNodeId = `slice:${milestoneId}:${sliceId}`;

	// Try to read the slice plan
	const planPath = join(sDir, `${sliceId}-PLAN.md`);
	let sliceTitle = `${milestoneId}/${sliceId}`;
	let planContent: string | null = null;

	if (existsSync(planPath)) {
		try {
			planContent = readFileSync(planPath, 'utf-8');
			const titleMatch = planContent.match(/^#\s+[A-Z]\d+:\s+(.+)/m);
			if (titleMatch) sliceTitle = `${sliceId}: ${titleMatch[1].trim()}`;
		} catch {
			// Use default title
		}
	}

	nodes.push({
		id: sliceNodeId,
		label: sliceTitle,
		type: 'slice',
		confidence: 'EXTRACTED',
		sourceFile: planContent ? `milestones/${milestoneId}/slices/${sliceId}/${sliceId}-PLAN.md` : undefined,
	});

	// Edge: milestone contains slice
	edges.push({ from: milestoneNodeId, to: sliceNodeId, type: 'contains', confidence: 'EXTRACTED' });

	// Parse tasks from the slice plan
	if (planContent) {
		parseTasksFromPlan(planContent, milestoneId, sliceId, sliceNodeId, nodes, edges);
	}
}

function parseTasksFromPlan(
	content: string,
	milestoneId: string,
	sliceId: string,
	sliceNodeId: string,
	nodes: GraphNode[],
	edges: GraphEdge[],
): void {
	// Match lines like: - [ ] **T01: Title** — description
	const taskPattern = /[-*]\s+\[[ x]\]\s+\*\*(T\d+):\s*([^*]+)\*\*/g;
	let match: RegExpExecArray | null;

	while ((match = taskPattern.exec(content)) !== null) {
		const [, taskId, taskTitle] = match;
		const taskNodeId = `task:${milestoneId}:${sliceId}:${taskId}`;

		nodes.push({
			id: taskNodeId,
			label: `${taskId}: ${taskTitle.trim()}`,
			type: 'task',
			confidence: 'EXTRACTED',
		});

		edges.push({ from: sliceNodeId, to: taskNodeId, type: 'contains', confidence: 'EXTRACTED' });
	}
}
