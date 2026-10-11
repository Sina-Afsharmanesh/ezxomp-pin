/**
 * @ezxomp/agent-learning — unified agent learning extension.
 *
 * One plugin, four lanes, native substrate:
 *   - surface    → read_skills tool scoped to the ezxomp catalog + skills.sh
 *                  adapter; catalog exposed via resources_discover so OMP's
 *                  native discovery lists each entry (skill:// + /skill: work).
 *   - facts      → thin adapter over the native memory backend (no own store).
 *   - procedures → skillforge evidence pipeline (capture → promote → review),
 *                  stored under <agentDir>/agent-learning; recall injection
 *                  removed (native recall covers it).
 *   - habits     → provided by the companion @ezxomp/experiences package
 *                  (/experience); this extension does NOT re-register it to
 *                  avoid duplicate command/tool registration when both are
 *                  installed. /learning routes to it.
 *   - gate       → optional learning.review guidance (env LEARNING_REVIEW or
 *                  <agentDir>/agent-learning.json {"review": true}).
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { once } from "./once.ts";
import {
	registerResourcesDiscover,
	registerSkillLoader,
} from "./read-skills.ts";
import { proceduresExtension } from "./procedures/extension.ts";
import { registerLearningCommand } from "./learning-command.ts";
import { registerReviewGate } from "./review-gate.ts";

export { catalogRoot } from "./read-skills.ts";
export { laneForLesson } from "./facts.ts";
export { isReviewGateEnabled, LEARNING_GATE_GUIDANCE } from "./review-gate.ts";

export default function agentLearningExtension(pi: ExtensionAPI): void {
	once(pi, "agent-learning", () => {
		registerResourcesDiscover(pi);
		registerSkillLoader(pi);
		registerReviewGate(pi);
		proceduresExtension(pi);
		registerLearningCommand(pi);
	});
}
