/**
 * Usage-capture extension wiring (TASK-25).
 *
 * Observes eval/ctx-style tool calls, analyzes each agent run for inefficient
 * patterns, stores pattern memories in the existing global patterns directory,
 * and writes promotion proposals to the legacy <agentDir>/skillforge/promotions
 * directory once a pattern repeats. At session start it injects previously
 * captured eval/tool-usage patterns into context via before_agent_start.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import {
	analyzeUsage,
	buildPromotionProposal,
	shouldProposePromotion,
	slugify,
	writePatternRecord,
	writeProposal,
	type PatternRecord,
	type UsageCall,
} from "./capture.js";
import { getSkillforgePaths } from "../store/storage.js";

const CAPTURED_TOOLS = new Set([
	"ctx_read",
	"ctx_search",
	"ctx_compose",
	"ctx_shell",
	"eval",
	"ctx_execute",
]);

export const PROMOTION_OCCURRENCE_THRESHOLD = 2;

interface CaptureState {
	calls: UsageCall[];
	occurrences: Map<string, number>;
}

export function createCaptureState(): CaptureState {
	return { calls: [], occurrences: new Map() };
}

export function observeToolCall(state: CaptureState, tool: string, args?: Record<string, unknown>, error?: string | null): void {
	if (!CAPTURED_TOOLS.has(tool)) return;
	state.calls.push({ tool, args, error: error ?? null });
}

/** Analyze the observed calls; persist record and maybe a proposal. Returns written file paths. */
export async function finalizeUsage(
	state: CaptureState,
	cwd: string,
	now = new Date(),
): Promise<{ recordPath: string | null; proposalPath: string | null }> {
	if (state.calls.length === 0) return { recordPath: null, proposalPath: null };
	const pattern = analyzeUsage(state.calls);
	const paths = await getSkillforgePaths(cwd, "global");
	let recordPath: string | null = null;
	if (!pattern.efficient || pattern.errors.length > 0) {
		const record: PatternRecord = {
			...pattern,
			id: `usage-${slugify(pattern.summary || pattern.sequence.join("-"))}`,
			capturedAt: now.toISOString(),
			callCount: state.calls.length,
			recoveryActions: pattern.errors.map((e) => `retry after: ${e}`),
		};
		recordPath = await writePatternRecord(paths.patterns, record);
	}
	let proposalPath: string | null = null;
	const key = pattern.summary;
	if (key) {
		const count = (state.occurrences.get(key) ?? 0) + 1;
		state.occurrences.set(key, count);
		if (shouldProposePromotion(count, pattern)) {
			const proposal = buildPromotionProposal(count, pattern, now);
			const promotionsDir = join(getAgentDir(), "skillforge", "promotions");
			proposalPath = await writeProposal(promotionsDir, proposal);
		}
	}
	state.calls = [];
	return { recordPath, proposalPath };
}

/** Collect stored eval/tool-usage pattern records relevant at session start. */
export async function collectRelevantPatterns(cwd: string): Promise<string[]> {
	try {
		const paths = await getSkillforgePaths(cwd, "global");
		const files = (await readdir(paths.patterns)).filter((f) => f.endsWith(".md"));
		const relevant: string[] = [];
		for (const file of files) {
			if (!/ctx_|eval|lean-ctx|^usage-/i.test(file)) continue;
			const text = await readFile(join(paths.patterns, file), "utf8");
			const fix = text.match(/^fix:\n  - (.+)$/m)?.[1];
			if (fix) relevant.push(`- ${JSON.parse(fix)} (${file})`);
		}
		return relevant.slice(0, 5);
	} catch {
		return [];
	}
}

export function registerUsageCapture(pi: ExtensionAPI): void {
	const state = createCaptureState();
	pi.on("tool_call", async (event) => {
			observeToolCall(state, event.toolName, event.input as Record<string, unknown> | undefined);
		return undefined;
	});
	pi.on("tool_result", async (event) => {
		if (!CAPTURED_TOOLS.has(event.toolName)) return undefined;
		if (event.isError) {
			observeToolCall(state, event.toolName, undefined, "tool_result error");
		}
		return undefined;
	});
	pi.on("agent_end", async () => {
		await finalizeUsage(state, process.cwd());
	});
	pi.on("before_agent_start", async () => {
		const patterns = await collectRelevantPatterns(process.cwd());
		if (patterns.length === 0) return undefined;
		return {
			message: {
				customType: "omp-skillforge-usage-patterns",
				content: [
					"Captured eval/tool-usage efficiency patterns from prior sessions:",
					...patterns,
				].join("\n"),
				display: false,
				details: { source: "skillforge usage capture", count: patterns.length },
			},
		};
	});
}
