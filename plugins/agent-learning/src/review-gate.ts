/**
 * Unified learning review gate (`learning.review`).
 *
 * When ON, pre-turn guidance steers captures into the reviewed lanes instead
 * of unreviewed managed-skill writes:
 *   - facts            → native memory backend (recall/retain) — no review
 *   - gotchas/patterns → skillforge_capture_memory (evidence + promotion)
 *   - behaviors/habits → /experience capture + analyze pipeline
 *
 * Opt-in via either:
 *   - env LEARNING_REVIEW=1 (or true/yes/on)
 *   - <agentDir>/agent-learning.json with { "review": true }
 *
 * Explicit non-goal: mutating native `autolearn` settings or intercepting the
 * native learn/manage_skill tools — this gate is advisory wiring only.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { getAgentDir } from "@oh-my-pi/pi-utils";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isReviewGateEnabled(): boolean {
	const env = process.env.LEARNING_REVIEW?.trim().toLowerCase();
	if (env && TRUE_VALUES.has(env)) return true;
	if (env && env === "0") return false;
	try {
		const configPath = join(getAgentDir(), "agent-learning.json");
		if (!existsSync(configPath)) return false;
		const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
			review?: unknown;
		};
		return parsed.review === true;
	} catch {
		return false;
	}
}

export const LEARNING_GATE_GUIDANCE = [
	"Agent learning review gate is ON. Route reusable lessons deliberately:",
	"- Durable facts → native memory (learn/retain); no review needed.",
	"- Verified gotchas/decisions/patterns with evidence → skillforge_capture_memory.",
	"- Behavioral preferences/habits → /experience capture, then /experience analyze for review.",
	"Do not rely on unreviewed auto-generated managed skills while the gate is on.",
].join("\n");

export const LEARNING_GATE_CONFIG_NOTE =
	"Config when this gate is ON: set autolearn.autoContinue:false in the OMP agent config (~/.omp/agent/config.yml, or /settings -> Auto-Learn -> Auto-run capture at stop OFF). Keep autolearn.enabled:true so manual learn/retain stays available. Optional hard freeze: tools.approval.manage_skill: deny.";

export function registerReviewGate(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async () => {
		if (!isReviewGateEnabled()) return undefined;
		return {
			message: {
				customType: "omp-agent-learning-gate",
				content: LEARNING_GATE_GUIDANCE + "\n" + LEARNING_GATE_CONFIG_NOTE,
				display: false,
				details: { gate: "learning.review", enabled: true },
			},
		};
	});
}
