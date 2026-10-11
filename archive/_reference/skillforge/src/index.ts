/**
 * skillforge — thin backward-compatibility publisher.
 *
 * Superseded by @ezxomp/agent-learning, which owns the procedures lane
 * (evidence capture -> promotion thresholds -> human-gated SKILL.md patches),
 * stored under <agentDir>/agent-learning with automatic migration from this
 * package's legacy <agentDir>/skillforge store.
 *
 * Shares agent-learning's once-key so installing both plugins during the
 * migration window registers the procedures lane exactly once.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { once } from "@ezxomp/agent-learning/src/once.ts";
import { proceduresExtension } from "@ezxomp/agent-learning/src/procedures/extension.ts";
import { registerUsageCapture } from "@ezxomp/agent-learning/src/procedures/usage/extension.ts";

export default function skillforgeCompat(pi: ExtensionAPI): void {
	once(pi, "agent-learning", () => {
		proceduresExtension(pi);
	registerUsageCapture(pi);
	});
}
