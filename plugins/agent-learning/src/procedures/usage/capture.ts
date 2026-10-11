/**
 * Lean-ctx / eval usage-pattern capture (skillforge procedures lane).
 *
 * Pure core: analyze a sequence of observed tool calls, flag inefficient
 * patterns, and render durable records / promotion proposals. Storage layout
 * is preserved: pattern memories go through the existing global
 * memory/global/patterns directory; promotion proposals go to the legacy
 * <agentDir>/skillforge/promotions directory per TASK-25.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface UsageCall {
	tool: string;
	args?: Record<string, unknown>;
	error?: string | null;
}

export interface EfficiencyFlags {
	searchReadSearchChain: boolean;
	sequentialEvals: boolean;
	redundantImports: boolean;
	composeBypassed: boolean;
}

export interface UsagePattern {
	sequence: string[];
	efficient: boolean;
	flags: EfficiencyFlags;
	errors: string[];
	errorCount: number;
	estimatedTokenSavings: number;
	summary: string;
}

const LEAN_CTX_TOOLS = new Set(["ctx_read", "ctx_search", "ctx_compose", "ctx_shell"]);
const PATTERN_THRESHOLD = 2;

function isEvalCall(tool: string): boolean {
	return tool === "eval" || tool === "ctx_execute";
}

function argString(args: Record<string, unknown> | undefined, key: string): string {
	const value = args?.[key];
	return typeof value === "string" ? value : "";
}

/** Detect a ctx_search -> ctx_read -> ctx_search chain on overlapping targets. */
function hasSearchReadSearchChain(calls: UsageCall[]): boolean {
	for (let i = 0; i + 2 < calls.length; i++) {
		if (calls[i].tool !== "ctx_search") continue;
		if (!calls.slice(i + 1, i + 3).some((c) => c.tool === "ctx_read")) continue;
		for (let j = i + 2; j < calls.length; j++) {
			if (calls[j].tool !== "ctx_search") continue;
			const first = argString(calls[i].args, "pattern") || argString(calls[i].args, "query");
			const again = argString(calls[j].args, "pattern") || argString(calls[j].args, "query");
			if (first && first === again) return true;
		}
	}
	return false;
}

/** Two or more eval calls in sequence that could have been parallel(thunks). */
function hasSequentialEvals(calls: UsageCall[]): boolean {
	let run = 0;
	for (const call of calls) {
		run = isEvalCall(call.tool) ? run + 1 : 0;
		if (run >= 2) return true;
	}
	return false;
}

/** Same import statement repeated across separate eval cells. */
export function extractImports(code: string): string[] {
	const matches = code.matchAll(/(?:^|\n)\s*(?:import|const\s+\{[^}]*\}\s*=\s*require)\b[^\n]*/g);
	return [...matches].map((m) => m[0].trim());
}

function hasRedundantImports(calls: UsageCall[]): boolean {
	const seen = new Set<string>();
	for (const call of calls) {
		if (!isEvalCall(call.tool)) continue;
		for (const imp of extractImports(argString(call.args, "code"))) {
			if (seen.has(imp)) return true;
			seen.add(imp);
		}
	}
	return false;
}

/** ctx_read/ctx_search used where a single ctx_compose would have sufficed. */
function hasComposeBypass(calls: UsageCall[]): boolean {
	const reads = calls.filter((c) => c.tool === "ctx_read").length;
	const searches = calls.filter((c) => c.tool === "ctx_search").length;
	return reads + searches >= 3 && !calls.some((c) => c.tool === "ctx_compose");
}

function estimateSavings(flags: EfficiencyFlags): number {
	let savings = 0;
	if (flags.searchReadSearchChain) savings += 800;
	if (flags.sequentialEvals) savings += 400;
	if (flags.redundantImports) savings += 300;
	if (flags.composeBypassed) savings += 1200;
	return savings;
}

export function analyzeUsage(calls: UsageCall[]): UsagePattern {
	const flags: EfficiencyFlags = {
		searchReadSearchChain: hasSearchReadSearchChain(calls),
		sequentialEvals: hasSequentialEvals(calls),
		redundantImports: hasRedundantImports(calls),
		composeBypassed: hasComposeBypass(calls),
	};
	const errors = calls
		.filter((c) => c.error)
		.map((c) => `${c.tool}: ${c.error}`);
	const relevant = calls.filter(
		(c) => LEAN_CTX_TOOLS.has(c.tool) || isEvalCall(c.tool),
	);
	const flagsSet = Object.values(flags).filter(Boolean).length;
	return {
		sequence: relevant.map((c) => c.tool),
		efficient: flagsSet === 0 && errors.length === 0 && relevant.length > 0,
		flags,
		errors,
		errorCount: errors.length,
		estimatedTokenSavings: estimateSavings(flags),
		summary: describePattern(flags),
	};
}

export function describePattern(flags: EfficiencyFlags): string {
	const parts: string[] = [];
	if (flags.searchReadSearchChain) parts.push("search-read-search chain: run ctx_compose once instead of ctx_search -> ctx_read -> ctx_search");
	if (flags.sequentialEvals) parts.push("sequential eval cells: batch independent work with parallel(thunks)");
	if (flags.redundantImports) parts.push("redundant imports: reuse imports across eval cells instead of re-importing");
	if (flags.composeBypassed) parts.push("orientation via scattered reads: prefer one ctx_compose over 3+ ctx_read/ctx_search calls");
	return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Durable records
// ---------------------------------------------------------------------------

export interface PatternRecord extends UsagePattern {
	id: string;
	capturedAt: string;
	callCount: number;
	recoveryActions: string[];
}

export interface PromotionProposal {
	id: string;
	title: string;
	patternSummary: string;
	before: string;
	after: string;
	occurrences: number;
	estimatedTokenSavingsPerOccurrence: number;
	evidence: { totalCalls: number; errorCount: number };
	createdAt: string;
}

export function buildPromotionProposal(
	occurrences: number,
	pattern: UsagePattern,
	now = new Date(),
): PromotionProposal {
	const id = `usage-${slugify(pattern.summary || "inefficient-tool-sequence")}`;
	return {
		id,
		title: `Adopt: ${describeFix(pattern.flags)}`,
		patternSummary: pattern.summary,
		before: `Observed ${occurrences}x: [${pattern.sequence.join(" -> ")}] with flags ${JSON.stringify(pattern.flags)}`,
		after: describeFix(pattern.flags),
		occurrences,
		estimatedTokenSavingsPerOccurrence: pattern.estimatedTokenSavings,
		evidence: { totalCalls: pattern.sequence.length, errorCount: pattern.errorCount },
		createdAt: now.toISOString(),
	};
}

function describeFix(flags: EfficiencyFlags): string {
	return (
		describePattern(flags) ||
		"Keep current tool-call discipline."
	);
}

export function shouldProposePromotion(occurrences: number, pattern: UsagePattern): boolean {
	return !pattern.efficient && occurrences >= PATTERN_THRESHOLD;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64) || "pattern";
}

export function formatPatternMarkdown(record: PatternRecord): string {
	return [
		"---",
		`id: ${record.id}`,
		"type: pattern",
		`title: ${JSON.stringify(record.summary || record.id)}`,
		"confidence: draft",
		`hits: ${record.callCount}`,
		`created_at: ${record.capturedAt.slice(0, 10)}`,
		`updated_at: ${record.capturedAt.slice(0, 10)}`,
		"trigger:",
		`  - ${JSON.stringify(`eval/tool usage: ${record.sequence.join(", ")}`)}`,
		"symptom:",
		`  - ${JSON.stringify(`inefficient flags: ${JSON.stringify(record.flags)}; errors: ${record.errorCount}`)}`,
		"root_cause:",
		`  - ${JSON.stringify(record.summary || "no inefficiency detected")}`,
		"fix:",
		`  - ${JSON.stringify(describeFix(record.flags))}`,
		"verification:",
		`  - ${JSON.stringify(`measured from ${record.callCount} tool calls; est. savings ${record.estimatedTokenSavings} tokens`)}`,
		"---",
		"",
	].join("\n");
}

export function formatProposalMarkdown(proposal: PromotionProposal): string {
	return [
		`# ${proposal.title}`,
		"",
		"- status: pending",
		`- id: ${proposal.id}`,
		`- created_at: ${proposal.createdAt}`,
		`- occurrences: ${proposal.occurrences}`,
		`- estimated token savings per occurrence: ~${proposal.estimatedTokenSavingsPerOccurrence}`,
		`- evidence: ${proposal.evidence.totalCalls} calls observed, ${proposal.evidence.errorCount} errors`,
		"",
		"## Before",
		"",
		proposal.before,
		"",
		"## After",
		"",
		proposal.after,
		"",
	].join("\n");
}

export async function writePatternRecord(
	patternsDir: string,
	record: PatternRecord,
): Promise<string> {
	await mkdir(patternsDir, { recursive: true });
	const file = path.join(patternsDir, `${record.id}.md`);
	await writeFile(file, formatPatternMarkdown(record), "utf8");
	return file;
}

export async function writeProposal(
	promotionsDir: string,
	proposal: PromotionProposal,
): Promise<string> {
	await mkdir(promotionsDir, { recursive: true });
	const file = path.join(promotionsDir, `${proposal.id}.md`);
	await writeFile(file, formatProposalMarkdown(proposal), "utf8");
	return file;
}
