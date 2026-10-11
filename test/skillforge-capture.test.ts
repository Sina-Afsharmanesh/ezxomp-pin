import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	analyzeUsage,
	buildPromotionProposal,
	shouldProposePromotion,
	writePatternRecord,
	writeProposal,
	type UsageCall,
} from "../plugins/agent-learning/src/procedures/usage/capture.ts";
import { createMemoryEntry } from "../plugins/agent-learning/src/procedures/memory/capture.ts";
import {
	collectRelevantPatterns,
	createCaptureState,
	finalizeUsage,
	observeToolCall,
} from "../plugins/agent-learning/src/procedures/usage/extension.ts";

const CHAIN: UsageCall[] = [
	{ tool: "ctx_search", args: { pattern: "registerTool" } },
	{ tool: "ctx_read", args: { path: "src/index.ts" } },
	{ tool: "ctx_search", args: { pattern: "registerTool" } },
];

describe("skillforge usage capture (TASK-25)", () => {
	it("captures lean-ctx pattern with sequence, efficiency flags and error info", () => {
		const calls: UsageCall[] = [
			...CHAIN,
			{ tool: "ctx_read", args: { mode: "signatures", path: "b.ts" }, error: "triage filtered" },
			{ tool: "ctx_shell", args: { command: "bun test" } },
		];
		const pattern = analyzeUsage(calls);
		expect(pattern.sequence).toEqual(["ctx_search", "ctx_read", "ctx_search", "ctx_read", "ctx_shell"]);
		expect(pattern.flags.searchReadSearchChain).toBe(true);
		expect(pattern.efficient).toBe(false);
		expect(pattern.errorCount).toBe(1);
		expect(pattern.errors[0]).toContain("triage filtered");
	});

	it("flags sequential evals that could be parallel(thunks) and redundant imports", () => {
		const pattern = analyzeUsage([
			{ tool: "eval", args: { code: 'import { readFile } from "node:fs/promises";' } },
			{ tool: "eval", args: { code: 'import { readFile } from "node:fs/promises";\nawait readFile("x")' } },
		]);
		expect(pattern.flags.sequentialEvals).toBe(true);
		expect(pattern.flags.redundantImports).toBe(true);
		expect(pattern.estimatedTokenSavings).toBeGreaterThan(0);
	});

	it("efficient usage produces no flags", () => {
		const pattern = analyzeUsage([{ tool: "ctx_compose", args: { task: "wire capture" } }]);
		expect(pattern.efficient).toBe(true);
		expect(Object.values(pattern.flags).every((f) => !f)).toBe(true);
	});

	it("repeated inefficient pattern yields a promotion proposal with before/after on disk", async () => {
		const dir = mkdtempSync(join(tmpdir(), "task25-"));
		const prevAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = dir;
		try {
			const patternsDir = join(dir, "memory", "global", "patterns");
			const promotionsDir = join(dir, "skillforge", "promotions");
			const state = createCaptureState();
			for (const call of CHAIN) observeToolCall(state, call.tool, call.args);
			const first = await finalizeUsage(state, dir);
			expect(first.proposalPath).toBeNull();
			expect(first.recordPath).toContain(join("memory", "global", "patterns"));

			for (const call of CHAIN) observeToolCall(state, call.tool, call.args);
			const second = await finalizeUsage(state, dir);
			expect(second.proposalPath).not.toBeNull();

			const proposalText = readFileSync(second.proposalPath!, "utf8");
			expect(proposalText).toContain("## Before");
			expect(proposalText).toContain("## After");
			expect(proposalText).toContain("ctx_search -> ctx_read -> ctx_search");
			expect(proposalText).toMatch(/estimated token savings per occurrence: ~\d+/);

			// before_agent_start injection surface finds the stored record
			const relevant = await collectRelevantPatterns(dir);
			expect(relevant.length).toBeGreaterThan(0);
			expect(relevant[0]).toContain("ctx_compose");

			// pure helpers agree
			const pattern = analyzeUsage(CHAIN);
			expect(shouldProposePromotion(2, pattern)).toBe(true);
			const proposal = buildPromotionProposal(2, pattern);
			await writePatternRecord(patternsDir, {
				...pattern, id: proposal.id, capturedAt: new Date().toISOString(),
				callCount: 3, recoveryActions: [],
			});
			await writeProposal(promotionsDir, proposal);
			expect(readdirSync(promotionsDir).length).toBeGreaterThanOrEqual(1);
		} finally {
			if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("importing capture module has no side effects; existing memory entry API unchanged", () => {
		const entry = createMemoryEntry({
			type: "pattern",
			title: "existing behavior",
			scope: {},
			trigger: ["t"],
			symptom: ["s"],
			root_cause: ["r"],
			fix: ["f"],
			verification: ["v"],
		});
		expect(entry.type).toBe("pattern");
		expect(entry.id).toMatch(/^pattern-existing-behavior/);
	});
});
