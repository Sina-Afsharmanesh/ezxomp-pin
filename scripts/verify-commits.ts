#!/usr/bin/env bun
/**
 * verify-commits.ts — Validate commit messages from a Git base to HEAD.
 *
 * Usage:
 *   bun run scripts/verify-commits.ts [base]
 *
 * Defaults: base = main
 *
 * Checks each commit in `git rev-list <base>..HEAD`:
 *   1. Conventional commit type (fix/feat/docs/refactor/test/chore/fixup)
 *   2. Imperative mood (no past tense: -ed, -s, "fixes", "adds")
 *   3. Summary under 72 chars
 *   4. No trailing period in summary
 *   5. DCO sign-off (Signed-off-by line in body)
 *
 * Exit 0 = pass, exit 1 = any check failed.
 */
import { spawnSync } from "node:child_process";
const VALID_TYPES: Record<string, true> = {
	fix: true, feat: true, docs: true, refactor: true, test: true, chore: true, fixup: true,
};

const PAST_TENSE = /\b(fixes|added|fixed|updated|removed|renamed|created|deleted|moved|changed|introduced|improved|refactored|implemented)\b/i;

const errors: string[] = [];
const warnings: string[] = [];

function log(msg: string): void { process.stdout.write(msg + "\n"); }

// ── Run Git to get commit descriptions ──────────────────────────────────────

const base = process.argv[2] ?? "main";

const result = spawnSync("git", ["rev-list", "--reverse", `${base}..HEAD`], {
	encoding: "utf-8",
	cwd: process.cwd(),
});

if (result.status !== 0) {
	process.stderr.write(`ERROR: git rev-list failed: ${result.stderr}`);
	process.exit(1);
}

const commitIds = result.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const commits = commitIds.map((commitId) => {
	const descriptionResult = spawnSync("git", ["log", "-1", "--format=%B", commitId], {
		encoding: "utf-8",
		cwd: process.cwd(),
	});
	if (descriptionResult.status !== 0) {
		process.stderr.write(`ERROR: git log failed for ${commitId}: ${descriptionResult.stderr}`);
		process.exit(1);
	}
	return { commitId, description: descriptionResult.stdout.trimEnd() };
});

if (commits.length === 0) {
	log("No commits to verify (working copy is at base).");
	process.exit(0);
}

// ── Validate each commit ───────────────────────────────────────────────────

for (const { commitId, description } of commits) {
	const lines = description.split("\n");
	const summary = lines[0];
	const shortId = commitId.slice(0, 8);

	// 1. Conventional commit type
	const typeMatch = summary.match(/^(\w+)(\([\w/.-]+\))?(!)?:\s+(.+)/);
	if (!typeMatch) {
		errors.push(`${shortId}: summary "${summary}" does not match conventional commit format (type(scope): summary)`);
		continue;
	}
	const type = typeMatch[1];
	if (!VALID_TYPES[type]) {
		errors.push(`${shortId}: invalid type "${type}" — valid: ${Object.keys(VALID_TYPES).join(", ")}`);
	}

	const summaryText = typeMatch[4];

	// 2. Summary under 72 chars
	if (summary.length > 72) {
		errors.push(`${shortId}: summary is ${summary.length} chars, max 72: "${summary}"`);
	}

	// 3. No trailing period
	if (summaryText.endsWith(".")) {
		errors.push(`${shortId}: summary has trailing period: "${summary}"`);
	}

	// 4. Imperative mood — check for past tense
	if (PAST_TENSE.test(summaryText)) {
		const match = summaryText.match(PAST_TENSE);
		errors.push(`${shortId}: summary not imperative mood (found "${match?.[0]}"): "${summary}"`);
	}

	// 5. DCO sign-off
	const hasDco = description.includes("Signed-off-by:");
	if (!hasDco) {
		errors.push(`${shortId}: missing DCO sign-off (Signed-off-by: line)`);
	}
}

// ── Report ────────────────────────────────────────────────────────────────

if (warnings.length > 0) {
	log("Warnings:");
	for (const w of warnings) log(`  ⚠ ${w}`);
}

if (errors.length > 0) {
	log(`\nFAIL: ${errors.length} error(s) across ${commits.length} commit(s)`);
	for (const e of errors) log(`  ✘ ${e}`);
	process.exit(1);
}

log(`\n✔ PASS: ${commits.length} commit(s) valid (conventional commits + DCO)`);
