import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "test", "fixtures", "agent-learning-procedures-v7-e2e.ts");
const AX_SRC = join(ROOT, "plugins", "experiences", "extensions", "agent-experience", "src");
const AL_SRC = join(ROOT, "plugins", "agent-learning", "src");

function runScenario(scenario: string): void {
	const agentDir = mkdtempSync(join(tmpdir(), `task-28-${scenario}-`));
	const experienceRoot = join(agentDir, "experience");
	const result = spawnSync("bun", [FIXTURE, scenario], {
		cwd: ROOT,
		encoding: "utf8",
		timeout: 60_000,
		env: {
			...process.env,
			PI_CODING_AGENT_DIR: agentDir,
			AX_STATE_ROOT: experienceRoot,
			AL_SRC,
			AX_SRC,
		},
	});
	try {
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
		if (result.status !== 0) {
			throw new Error(`TASK-28 ${scenario} RED scenario failed:\n${output.slice(-4000)}`);
		}
		expect(output).toContain(`TASK-28 RED scenario passed: ${scenario}`);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
}

describe("TASK-28: experiences schema v7 procedures partition", () => {
	it("creates the procedures partition on a fresh ledger", () => {
		runScenario("fresh");
	});

	it("upgrades a v6 ledger and replays the v7 migration idempotently", () => {
		runScenario("upgrade");
	});

	it("routes procedure capture and retrieval through checksum- and lock-protected SQLite", () => {
		runScenario("procedures");
	});

	it("migrates the legacy atomic-file root once and archives it", () => {
		runScenario("legacy");
	});

	it("backs up and restores procedure rows with the ledger", () => {
		runScenario("backup");
	});
});
