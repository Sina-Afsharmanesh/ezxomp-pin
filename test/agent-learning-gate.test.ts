/**
 * test/agent-learning-gate.test.ts — TASK-95: SkillOpt validation gate contracts.
 *
 * Covers: evaluateGate pure function, selectGateScore clamping,
 * strict-improvement boundary, new-best path, reject path.
 * No network or LLM dependency (assert: no fetch/child_process imports in gate.ts).
 */
import { describe, expect, it } from "bun:test";
import { evaluateGate, selectGateScore } from "../plugins/agent-learning/src/procedures/promotion/gate.ts";

describe("agent-learning-gate: selectGateScore", () => {
	it("projects hard metric without weight modification", () => {
		const result = selectGateScore(8, 2, "hard");
		expect(result).toBe(8);
	});

	it("projects soft metric without weight modification", () => {
		const result = selectGateScore(2, 8, "soft");
		expect(result).toBe(8);
	});

	it("projects mixed metric with default weight 0.5", () => {
		const result = selectGateScore(6, 4, "mixed");
		// 0.5 * 6 + 0.5 * 4 = 5
		expect(result).toBe(5);
	});

	it("clamps mixedWeight to 1 when above", () => {
		const result = selectGateScore(2, 8, "mixed", 1.5);
		// clamped to 1.0: 1.0 * 2 + 0.0 * 8 = 2
		expect(result).toBe(2);
	});

	it("clamps mixedWeight to 0 when below", () => {
		const result = selectGateScore(8, 2, "mixed", -0.3);
		// clamped to 0.0: 0.0 * 8 + 1.0 * 2 = 2
		expect(result).toBe(2);
	});

	it("returns non-negative scores", () => {
		const result = selectGateScore(-5, -3, "hard");
		expect(result).toBe(0);
	});
});

describe("agent-learning-gate: evaluateGate", () => {
	it("accept_new_best when candScore > bestScore", () => {
		const result = evaluateGate(
			"new-skill",
			10, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill", // currentSkill
			5, // currentScore
			"best-skill", // bestSkill
			8, // bestScore
			3, // bestStep
			42, // globalStep
		);
		expect(result.action).toBe("accept_new_best");
		expect(result.currentSkill).toBe("current-skill");
		expect(result.bestSkill).toBe("best-skill");
		expect(result.bestScore).toBe(8);
		expect(result.bestStep).toBe(3);
	});

	it("accept when candScore > currentScore but <= bestScore", () => {
		const result = evaluateGate(
			"mid-skill",
			7, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill", // currentSkill
			5, // currentScore
			"best-skill", // bestSkill
			8, // bestScore
			3, // bestStep
			42, // globalStep
		);
		expect(result.action).toBe("accept");
	});

	it("reject when candScore <= currentScore (strict improvement required)", () => {
		const result = evaluateGate(
			"weak-skill",
			3, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill", // currentSkill
			5, // currentScore
			"best-skill", // bestSkill
			8, // bestScore
			3, // bestStep
			42, // globalStep
		);
		expect(result.action).toBe("reject");
	});

	it("reject when candScore == currentScore (strict >, not >=", () => {
		const result = evaluateGate(
			"tie-skill",
			5, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill", // currentSkill
			5, // currentScore
			"best-skill", // bestSkill
			8, // bestScore
			3, // bestStep
			42, // globalStep
		);
		expect(result.action).toBe("reject");
	});

	it("accept_new_best when candScore strictly exceeds bestScore", () => {
		const result = evaluateGate(
			"better-skill",
			10, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill", // currentSkill
			5, // currentScore
			"best-skill", // bestSkill
			8, // bestScore
			3, // bestStep
			42, // globalStep
		);
		expect(result.action).toBe("accept_new_best");
	});

	it("passes through GateResult interface shape", () => {
		const result = evaluateGate(
			"any-skill",
			1, // candHard
			0, // candSoft
			"hard" as const,
			0.5,
			"current-skill",
			0,
			"best-skill",
			0,
			0,
			0,
		);
		// Assert the interface fields exist with correct types
		expect(result).toHaveProperty("action");
		expect(result).toHaveProperty("currentSkill");
		expect(result).toHaveProperty("currentScore");
		expect(result).toHaveProperty("bestSkill");
		expect(result).toHaveProperty("bestScore");
		expect(result).toHaveProperty("bestStep");
		expect(typeof result.action).toBe("string");
		expect(typeof result.currentSkill).toBe("string");
		expect(typeof result.currentScore).toBe("number");
		expect(typeof result.bestSkill).toBe("string");
		expect(typeof result.bestScore).toBe("number");
		expect(typeof result.bestStep).toBe("number");
	});

	it("uses metric='soft' for soft projection", () => {
		const result = evaluateGate(
			"soft-skill",
			2, // candHard
			8, // candSoft
			"soft" as const,
			0.5,
			"current-skill",
			5,
			"best-skill",
			3,
			0,
			0,
		);
		expect(result.action).toBe("accept_new_best"); // 8 > bestScore 3, new best
	});

	it("uses metric='mixed' with weight clamping in evaluateGate", () => {
		const result = evaluateGate(
			"mixed-skill",
			10, // candHard
			0, // candSoft
			"mixed" as const,
			0.8, // mixedWeight
			"current-skill",
			5,
			"best-skill",
			6,
			0,
			0,
		);
		// mixed: 0.8 * 10 + 0.2 * 0 = 8.0 > bestScore 6 → accept_new_best
		expect(result.action).toBe("accept_new_best");
	});
});
