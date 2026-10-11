/**
 * Milestone/slice directory resolution over a .gsd/ root — port of
 * gsd-pi packages/mcp-server readers/paths.ts helpers used by the parsers
 * (findMilestoneIds, resolveMilestoneDir, resolveMilestoneFile, findSliceIds,
 * resolveSliceDir), without the MCP-server mtime caches.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export function milestonesDir(gsdRoot: string): string {
	return join(gsdRoot, 'milestones');
}

/** Find all milestone directory IDs (M001, …). Handles bare and descriptor naming. */
export function findMilestoneIds(gsdRoot: string): string[] {
	const dir = milestonesDir(gsdRoot);
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
	const ids: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const match = entry.isDirectory() ? entry.name.match(/^(M\d+)/) : null;
		if (match) ids.push(match[1]);
	}
	return ids.sort();
}

/** M001 might live in M001/ or M001-DESCRIPTOR/. */
export function resolveMilestoneDir(gsdRoot: string, milestoneId: string): string | null {
	const dir = milestonesDir(gsdRoot);
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
	const exact = join(dir, milestoneId);
	if (existsSync(exact) && statSync(exact).isDirectory()) return exact;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.startsWith(milestoneId)) {
			return join(dir, entry.name);
		}
	}
	return null;
}

/** Milestone-level file: M001-ROADMAP.md, then DIRNAME-ROADMAP.md, then ROADMAP.md. */
export function resolveMilestoneFile(gsdRoot: string, milestoneId: string, suffix: string): string | null {
	const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
	if (!mDir) return null;
	const dirName = basename(mDir);
	for (const c of [join(mDir, `${milestoneId}-${suffix}.md`), join(mDir, `${dirName}-${suffix}.md`), join(mDir, `${suffix}.md`)]) {
		if (existsSync(c)) return c;
	}
	return null;
}

/** Find all slice IDs within a milestone (S01, …). */
export function findSliceIds(gsdRoot: string, milestoneId: string): string[] {
	const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
	if (!mDir) return [];
	const slicesDir = join(mDir, 'slices');
	if (!existsSync(slicesDir)) return [];
	const ids: string[] = [];
	for (const entry of readdirSync(slicesDir, { withFileTypes: true })) {
		const match = entry.isDirectory() ? entry.name.match(/^(S\d+)/) : null;
		if (match) ids.push(match[1]);
	}
	return ids.sort();
}

/** Resolve the actual directory for a slice (exact or prefix match). */
export function resolveSliceDir(gsdRoot: string, milestoneId: string, sliceId: string): string | null {
	const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
	if (!mDir) return null;
	const slicesDir = join(mDir, 'slices');
	if (!existsSync(slicesDir)) return null;
	const exact = join(slicesDir, sliceId);
	if (existsSync(exact) && statSync(exact).isDirectory()) return exact;
	for (const entry of readdirSync(slicesDir, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.startsWith(sliceId)) {
			return join(slicesDir, entry.name);
		}
	}
	return null;
}
