/**
 * skills — thin backward-compatibility publisher.
 *
 * Superseded by @ezxomp/agent-learning (marketplace), which owns the skill
 * surface: the ezxomp plugin/tool catalog, the skills.sh search/fetch adapter
 * (safe-language-only policy), and the read_skills tool. This package keeps
 * publishing a working read_skills implementation during the migration window
 * so existing user flows do not break; it re-exports agent-learning's surface
 * module instead of carrying its own discovery/loading logic.
 *
 * The bundled pix-* skill set was retired with the pix-skills era (doc-5).
 */

export {
	default as default,
} from "@ezxomp/agent-learning/src/index.ts";

export {
	catalogRoot,
	extractDescription,
	extractName,
	formatSkillList,
	interpolateSkill,
	readSkillResource,
	copySkillResource,
	type CopiedSkillResource,
} from "@ezxomp/agent-learning/src/read-skills.ts";
