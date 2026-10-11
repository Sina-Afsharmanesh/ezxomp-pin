/**
 * Child process for test/agent-learning.test.ts procedures e2e.
 * Runs with PI_CODING_AGENT_DIR and AX_STATE_ROOT sandboxed to a temp dir and
 * AL_SRC/AX_SRC pointing at the local plugin sources. A future owner ledger
 * selects the documented atomic fallback, so this legacy migration contract
 * is independent of persisted host state.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ok = (m: string) => console.log("OK " + m);
const fail = (m: string): never => {
	console.error("FAIL " + m);
	process.exit(1);
};

const agent = process.env.PI_CODING_AGENT_DIR;
if (!agent) fail("PI_CODING_AGENT_DIR not set");
const base = process.env.AL_SRC;
if (!base) fail("AL_SRC not set");
const experienceRoot = process.env.AX_STATE_ROOT;
if (!experienceRoot) fail("AX_STATE_ROOT not set");
const experienceSrc = process.env.AX_SRC;
if (!experienceSrc) fail("AX_SRC not set");
mkdirSync(experienceRoot!, { recursive: true });
const { loadSqlite } = await import(join(experienceSrc!, "storage", "sqlite.ts"));
const { DatabaseSync } = await loadSqlite();
const futureLedger = new DatabaseSync(join(experienceRoot!, "ledger.sqlite"));
futureLedger.exec("PRAGMA user_version = 999");
futureLedger.close();
const proj = join(agent!, "project");
mkdirSync(proj, { recursive: true });

// 1. Seed a legacy pre-consolidation store + target user skill.
const legacy = join(agent!, "skillforge");
mkdirSync(join(legacy, "memory", "gotchas"), { recursive: true });
writeFileSync(
	join(legacy, "index.json"),
	JSON.stringify({ version: 1, updated_at: new Date().toISOString(), entries: [] }, null, "	"),
);
const skillDir = join(agent!, "skills", "target-skill");
mkdirSync(skillDir, { recursive: true });
writeFileSync(
	join(skillDir, "SKILL.md"),
	["---", "name: target-skill", "description: t", "---", "# Target", ""].join(String.fromCharCode(10)),
);

// 2. Import the ported pipeline from its new home.
const { createMemoryEntry, saveMemoryEntry } = await import(join(base!, "procedures", "memory", "capture.ts"));
const { promoteMemoryIfEligible, listPendingProposals, applyProposal } = await import(
	join(base!, "procedures", "promotion", "promotion.ts")
);

// 3. Capture a confirmed, hit-threshold entry targeting the skill.
const entry = createMemoryEntry({
	type: "gotcha",
	title: "E2E verified gotcha",
	scope: { languages: ["ts"] },
	skills: ["target-skill"],
	confidence: "confirmed",
	hits: 3,
	trigger: ["t"],
	symptom: ["s"],
	root_cause: ["r"],
	fix: ["f"],
	verification: ["bun test passes"],
});
const saved = await saveMemoryEntry(proj, entry, {});
if (!saved.path.includes(join("agent-learning"))) fail("store root not unified: " + saved.path);
if (existsSync(legacy)) fail("legacy store not migrated away");
if (!existsSync(join(agent!, "agent-learning", "index.json"))) fail("unified index missing");
ok("legacy migrated; entry saved under unified root");

// 4. Promotion at confirmed + hits>=3 + skills[] -> proposal file.
const proposals = await promoteMemoryIfEligible(proj, {
	entry: saved.entry,
	partition: "project",
	memoryPath: saved.path.startsWith("~")
		? join(agent!, saved.path.slice(2))
		: resolve(saved.path),
});
if (proposals.length !== 1) fail("expected exactly 1 proposal, got " + proposals.length);
ok("promotion proposal created at threshold");

// 5. Review list finds it; apply is human-gated upstream of this call.
const pending = await listPendingProposals("target-skill");
if (pending.length !== 1) fail("expected 1 pending proposal for target-skill");
const applied = await applyProposal(pending[0]!);
if (!existsSync(applied.target_path ?? "")) fail("applied target missing");
const patched = require("node:fs").readFileSync(applied.target_path!, "utf8");
if (!patched.includes("## Skillforge learnings")) fail("patch header missing");
if (!patched.includes(applied.proposed_guidance)) fail("guidance line missing");
ok("reviewed patch applied to user skill");

// 6. Traversal outside canonical skill root must refuse.
try {
	await applyProposal({
		...(pending[0] as object),
		id: "proposal-traversal-e2e",
		target_skill: "../__escape__",
		target_path: undefined,
	} as typeof pending[0]);
	fail("traversal apply did not throw");
} catch (error) {
	if (!/outside canonical|not found|Invalid/i.test(error instanceof Error ? error.message : String(error))) {
		fail("unexpected traversal error: " + String(error));
	}
}
ok("traversal refused");

console.log("E2E PASS");
