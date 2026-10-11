/**
 * SkillOpt validation gate — ported from skillopt_sleep/gate.py
 *
 * Upstream references:
   - Gate: https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/gate.py
   - select_gate_score: projects hard/soft/mixed with mixed_weight clamp 0..1
   - evaluate_gate: returns action accept_new_best|accept|reject comparing
     candidate score vs current+best
 *
 * doc-23 compliance: no LLM calls, no network calls in any shipped code path.
 * doc-5: root <agentDir>/agent-learning unchanged; no pre-turn memory injection.
 *
 * GateResult: { action, currentSkill, currentScore, bestSkill, bestScore, bestStep }
 *   - accept_new_best: candidate strictly improves the best observed score
 *   - accept: candidate meets or exceeds the current threshold (but not new best)
 *   - reject: candidate does not improve upon current
 */

export interface GateResult {
	action: "accept_new_best" | "accept" | "reject";
	currentSkill: string;
	currentScore: number;
	bestSkill: string;
	bestScore: number;
	bestStep: number;
}

/**
 * selectGateScore — project a score from hard/soft/mixed evidence,
 * clamping the mixed weight to [0,1].
 *
 * @param hard  Hard evidence score (e.g. hit count, pass rate)
 * @param soft  Soft evidence score (e.g. recency, confidence)
 * @param metric  "hard" | "soft" | "mixed"
 * @param mixedWeight  Weight given to hard evidence when metric="mixed" (clamped 0..1)
 * @returns Projected score clamped to non-negative range
 */
export function selectGateScore(
	hard: number,
	soft: number,
	metric: "hard" | "soft" | "mixed",
	mixedWeight: number = 0.5,
): number {
	const w = Math.max(0, Math.min(1, mixedWeight));
	switch (metric) {
		case "hard":
			return Math.max(0, hard);
		case "soft":
			return Math.max(0, soft);
		case "mixed":
			return Math.max(0, w * hard + (1 - w) * soft);
		default:
			return Math.max(0, soft);
	}
}

/**
 * evaluateGate — pure function: determine whether a candidate skill earns
 * promotion based on held-out scores vs current best.
 *
 * Rules (strict > comparison, no side effects):
 *   - If candScore > bestScore      → action = "accept_new_best"
 *   - If candScore > currentScore  → action = "accept"
 *   - If candScore <= currentScore → action = "reject"
 *   - If candScore <= bestScore but > currentScore is "accept"
 *   - candScore == currentScore    → "reject" (strict improvement required)
 *   - candScore == bestScore       → "accept_new_best" (strictly ties go to best)
 *
 * @param candidateSkill  Name of the candidate skill being evaluated
 * @param candHard        Hard evidence score for the candidate
 * @param candSoft        Soft evidence score for the candidate
 * @param metric          "hard" | "soft" | "mixed" — how to project candScore
 * @param mixedWeight     Weight for hard evidence in mixed mode (clamped 0..1)
 * @param currentSkill    Name of the currently promoted skill
 * @param currentScore    Current skill's held-out score
 * @param bestSkill       Name of the best skill seen so far
 * @param bestScore       Best held-out score observed so far
 * @param bestStep        Step at which bestScore was achieved
 * @param globalStep      Current global training/evaluation step (informational)
 * @param opts            Optional options object
 * @returns GateResult with action and score metadata
 */
export function evaluateGate(
	candidateSkill: string,
	candHard: number,
	candSoft: number,
	metric: "hard" | "soft" | "mixed",
	mixedWeight: number,
	currentSkill: string,
	currentScore: number,
	bestSkill: string,
	bestScore: number,
	bestStep: number,
	globalStep: number,
	opts?: Record<string, unknown>,
): GateResult {
	const candScore = selectGateScore(candHard, candSoft, metric, mixedWeight);

	let action: "accept_new_best" | "accept" | "reject";

	// Strict comparison: new best first, then accept if strictly above current, else reject
	if (candScore > bestScore) {
		action = "accept_new_best";
	} else if (candScore > currentScore) {
		action = "accept";
	} else {
		action = "reject";
	}

	return {
		action,
		currentSkill,
		currentScore,
		bestSkill,
		bestScore,
		bestStep,
	};
}