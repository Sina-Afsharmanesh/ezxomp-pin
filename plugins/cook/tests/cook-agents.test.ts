/**
 * Agent-profile install/sync contract tests.
 *
 * Requirements (2026-08-27 operator order):
 * 1. Cook sub-agents must be installed/updated automatically whenever cook
 *    runs under an OMP plugin system — no manual /cook install needed.
 * 2. Freshness: shipped templates must re-sync when the plugin updates
 *    (version+hash marker, not blind overwrite).
 * 3. Spawn authority: only cook-planner and cook-researcher may spawn
 *    subagents from within the agent roster (plus the orchestrator itself) —
 *    researcher dispatches cook-scout; planner dispatches scout/researcher;
 *    all other profiles, including council stations, must not carry the task tool.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	COOK_AGENTS_VERSION,
	COOK_PROFILE_FILE_MAP,
	installCookAgents,
	profilesUpToDate,
	syncCookAgents,
} from "../extensions/agents.ts";

const testsDir = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(testsDir, "..", "agents");
let homeBackup: string | undefined;
let ompHomeBackup: string | undefined;
let tmpHome: string;
let tmpProject: string;

beforeEach(() => {
	homeBackup = process.env.HOME;
	ompHomeBackup = process.env.OMP_HOME;
	tmpHome = mkdtempSync(join(tmpdir(), "cook-agents-home-"));
	tmpProject = mkdtempSync(join(tmpdir(), "cook-agents-proj-"));
	process.env.HOME = tmpHome;
	delete process.env.OMP_HOME;
});

afterEach(() => {
	process.env.HOME = homeBackup;
	if (ompHomeBackup === undefined) delete process.env.OMP_HOME;
	else process.env.OMP_HOME = ompHomeBackup;
	vi.restoreAllMocks();
});

function projectAgentsDir(): string {
	return join(tmpProject, ".omp", "agents");
}

function personalAgentsDir(): string {
	return join(tmpHome, ".omp", "agents");
}

function ompHomeAgentsDir(): string {
	return join(tmpHome, "omp-home", "agents");
}

describe("installCookAgents — baseline install", () => {
	it("installs all ten profiles with shipped template content", async () => {
		const installed = await installCookAgents(tmpProject, "project");

		expect(installed).toHaveLength(10);
		expect(Object.keys(COOK_PROFILE_FILE_MAP).sort()).toEqual([
			"cook-audit",
			"cook-council",
			"cook-council-synthesis",
			"cook-judge",
			"cook-planner",
			"cook-refute",
			"cook-researcher",
			"cook-scout",
			"cook-validator",
			"cook-worker",
		]);
		for (const [name, file] of Object.entries(COOK_PROFILE_FILE_MAP)) {
			const dest = join(projectAgentsDir(), `${name}.md`);
			expect(existsSync(dest)).toBe(true);
			// Content matches the shipped template (not the stub).
			const template = readFileSync(
				join(templatesDir, file),
				"utf-8",
			);
			expect(readFileSync(dest, "utf-8")).toBe(template);
		}
		// Marker records the version and template hashes.
		const marker = JSON.parse(
			readFileSync(join(projectAgentsDir(), ".cook-agents-marker.json"), "utf-8"),
		);
		expect(marker.version).toBe(COOK_AGENTS_VERSION);
		expect(Object.keys(marker.files)).toHaveLength(10);
	});
});

describe("profilesUpToDate / syncCookAgents — freshness", () => {
	it("reports current when marker matches version and hashes", async () => {
		await installCookAgents(tmpProject, "project");

		// Recompute the same hashes the installer wrote (any template change
		// would alter them); simplest honest check: sync sees no work to do.
		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("current");
	});

	it("re-installs when a profile was modified after install (drift)", async () => {
		await installCookAgents(tmpProject, "project");

		// Simulate drift: evo-sub rewrite or manual edit of a profile.
		const dest = join(projectAgentsDir(), "cook-worker.md");
		writeFileSync(dest, "---\nname: cook-worker\ntools: \"*\"\n---\n\ndrifted\n");

		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("installed");
		// Content restored from the shipped template.
		const template = readFileSync(
			join(templatesDir, COOK_PROFILE_FILE_MAP["cook-worker"]),
			"utf-8",
		);
		expect(readFileSync(dest, "utf-8")).toBe(template);
	});

	it("re-installs when the marker version differs (plugin update)", async () => {
		await installCookAgents(tmpProject, "project");

		// Simulate an older plugin's marker.
		const markerPath = join(projectAgentsDir(), ".cook-agents-marker.json");
		const marker = JSON.parse(readFileSync(markerPath, "utf-8"));
		marker.version = "0.0.1-ancient";
		writeFileSync(markerPath, JSON.stringify(marker));

		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("installed");
	});

	it("re-syncs council templates when the plugin version marker changes", async () => {
		await installCookAgents(tmpProject, "project");
		const markerPath = join(projectAgentsDir(), ".cook-agents-marker.json");
		const marker = JSON.parse(readFileSync(markerPath, "utf-8"));
		marker.version = "0.0.1-ancient";
		writeFileSync(markerPath, JSON.stringify(marker));
		const councilPath = join(projectAgentsDir(), "cook-council.md");
		writeFileSync(councilPath, "stale council profile\n");

		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("installed");
		expect(readFileSync(councilPath, "utf-8")).toBe(
			readFileSync(join(templatesDir, COOK_PROFILE_FILE_MAP["cook-council"]), "utf-8"),
		);
	});

	it("treats a missing marker as stale (fresh OMP install path)", async () => {
		// No installCookAgents ran — dest dir doesn't even exist.
		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("installed");
		expect(existsSync(join(projectAgentsDir(), "cook-worker.md"))).toBe(true);
	});

	it("profilesUpToDate is false when marker hashes diverge from templates", async () => {
		await installCookAgents(tmpProject, "project");
		// Drift an installed file, then the marker-vs-file hash check must fail.
		const dest = join(projectAgentsDir(), "cook-worker.md");
		writeFileSync(dest, `${readFileSync(dest, "utf-8")}\n<!-- drift -->\n`);
		expect(profilesUpToDate(projectAgentsDir())).toBe(false);
	});

	it("profilesUpToDate is false for an incomplete marker map", async () => {
		await installCookAgents(tmpProject, "project");
		// Tamper the marker to the degenerate shape the judge flagged.
		const markerPath = join(projectAgentsDir(), ".cook-agents-marker.json");
		writeFileSync(markerPath, JSON.stringify({ version: COOK_AGENTS_VERSION, files: {} }));
		expect(profilesUpToDate(projectAgentsDir())).toBe(false);
	});

	it("profilesUpToDate is false for a malformed current-version files field", async () => {
		await installCookAgents(tmpProject, "project");
		const markerPath = join(projectAgentsDir(), ".cook-agents-marker.json");
		writeFileSync(markerPath, JSON.stringify({ version: COOK_AGENTS_VERSION, files: null }));
		expect(profilesUpToDate(projectAgentsDir())).toBe(false);
	});
});

describe("syncCookAgents — scope and evo interplay", () => {
	it("installs to personal scope from HOME", async () => {
		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("installed");
		expect(existsSync(join(personalAgentsDir(), "cook-planner.md"))).toBe(true);
	});

	it("installs both council profiles to personal scope", async () => {
		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("installed");
		for (const name of ["cook-council", "cook-council-synthesis"]) {
			expect(existsSync(join(personalAgentsDir(), `${name}.md`))).toBe(true);
		}
	});

	it("skips personal scope when HOME is unset", async () => {
		delete process.env.HOME;
		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("skipped");
	});

	it("resolves personal scope through OMP_HOME when set", async () => {
		process.env.OMP_HOME = join(tmpHome, "omp-home");
		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("installed");
		expect(existsSync(join(ompHomeAgentsDir(), "cook-planner.md"))).toBe(true);
	});

	it("skips project scope while evo-sub owns the profiles", async () => {
		// Install first so a marker exists, then simulate evo-sub active by
		// pointing HOME at a fixture config with evo-mode.sub: true.
		// evo-sub rewrites both personal and project profiles; cook must not clobber
		// either scope while its byte-exact backup owns the files.
		await installCookAgents(tmpProject, "project");
		const agentDir = join(tmpHome, ".omp", "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "config.yml"), "evo-mode:\n  main: true\n  sub: true\n");

		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("skipped");
	});

	it("skips project scope on evo-sub state-file evidence (config unreadable)", async () => {
		await installCookAgents(tmpProject, "project");
		// No config.yml at all - but evo-sub state file exists as conservative
		// ownership evidence for both scopes.
		const stateDir = join(tmpHome, ".omp", "agent", "evo-mode");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, "sub-state.json"), "{}");

		const result = await syncCookAgents(tmpProject, "project");
		expect(result).toBe("skipped");
	});

	it("still skips personal scope when evo-sub is active (config evidence)", async () => {
		const agentDir = join(tmpHome, ".omp", "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "config.yml"), "evo-mode:\n  main: true\n  sub: true\n");

		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("skipped");
		// No profiles may be written into the evo-sub-owned personal scope.
		expect(existsSync(join(personalAgentsDir(), "cook-worker.md"))).toBe(false);
	});

	it("still skips personal scope on evo-sub state-file evidence (config unreadable)", async () => {
		const stateDir = join(tmpHome, ".omp", "agent", "evo-mode");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, "sub-state.json"), "{}");

		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("skipped");
		expect(existsSync(join(personalAgentsDir(), "cook-worker.md"))).toBe(false);
	});

	it("treats corrupt evo-sub state as active for personal scope (fail-closed, never auto-deletes)", async () => {
		const stateDir = join(tmpHome, ".omp", "agent", "evo-mode");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, "sub-state.json"), "{{{ not json");

		const result = await syncCookAgents(tmpProject, "personal");
		expect(result).toBe("skipped");
		// The corrupt state file is left for manual recovery - never deleted.
		expect(existsSync(join(stateDir, "sub-state.json"))).toBe(true);
	});
});

describe("spawn authority — profile frontmatter contract", () => {
	it("planner and researcher profiles carry task; all others do not", () => {
		for (const [name, file] of Object.entries(COOK_PROFILE_FILE_MAP)) {
			const src = readFileSync(join(templatesDir, file), "utf-8");
			const fm = src.split("---")[1] ?? "";
			const toolsLine = fm.split("\n").find((l) => l.startsWith("tools:")) ?? "";
			const hasTask = /(^|[ ,])task([ ,]|$)/.test(toolsLine.replace(/backlog_[a-z_]+/g, ""));
			if (name === "cook-planner" || name === "cook-researcher") {
				expect(hasTask, name + " must keep task").toBe(true);
			} else {
				expect(hasTask, name + " must not spawn").toBe(false);
			}
		}
	});

	it("council, audit, and refute profiles have read-only frontmatter", () => {
		for (const name of ["cook-council", "cook-council-synthesis", "cook-audit", "cook-refute"]) {
			const src = readFileSync(join(templatesDir, COOK_PROFILE_FILE_MAP[name]), "utf-8");
			const fm = src.split("---")[1] ?? "";
			const toolsLine = fm.split("\n").find((l) => l.startsWith("tools:")) ?? "";
			expect(toolsLine).toContain("codesight_get_");
			expect(toolsLine).not.toMatch(/(^|[ ,])(task|write|edit|bash)([ ,]|$)/);
		}
	});

	it("researcher body documents scout dispatch via task tool", () => {
		const src = readFileSync(join(templatesDir, COOK_PROFILE_FILE_MAP["cook-researcher"]), "utf-8");
		expect(src).toContain('agent: "cook-scout"');
	});

	it("every profile carries conditional codesight directives", () => {
		for (const [name, file] of Object.entries(COOK_PROFILE_FILE_MAP)) {
			const src = readFileSync(join(templatesDir, file), "utf-8");
			expect(src, name + " missing codesight directives").toContain("## Tool Directives (codesight)");
			expect(src, name + " codesight block must be conditional").toContain("If \x60codesight_*\x60 tools are registered");
			expect(src, name + " codesight block must degrade silently").toContain("Absent → skip silently");
			const fm = src.split("---")[1] ?? "";
			const toolsLine = fm.split("\n").find((l) => l.startsWith("tools:")) ?? "";
			expect(toolsLine, name + " frontmatter must expose codesight_* tools").toContain("codesight_get_");
		}
	});
});

describe("upstream-derived profile roster and evo ownership", () => {
	const expected = [
		"cook-audit", "cook-council", "cook-council-synthesis", "cook-judge", "cook-planner",
		"cook-refute", "cook-researcher", "cook-scout", "cook-validator", "cook-worker",
	].sort();

	it("installs the approved ten-profile roster and hashes every member", async () => {
		expect(Object.keys(COOK_PROFILE_FILE_MAP).sort()).toEqual(expected);
		await installCookAgents(tmpProject, "project");
		const marker = JSON.parse(readFileSync(join(projectAgentsDir(), ".cook-agents-marker.json"), "utf-8")) as { files: Record<string, string> };
		expect(Object.keys(marker.files).sort()).toEqual(expected);
	});

	it("preserves an evo-sub-owned project rewrite instead of refreshing marker drift", async () => {
		await installCookAgents(tmpProject, "project");
		const rewritten = join(projectAgentsDir(), "cook-worker.md");
		writeFileSync(rewritten, "---\nname: cook-worker\ntools: eval, hub\n---\n\nEVO-SUB-OWNED\n");
		const stateDir = join(tmpHome, ".omp", "agent", "evo-mode");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, "sub-state.json"), "{}");
		expect(await syncCookAgents(tmpProject, "project")).toBe("skipped");
		expect(readFileSync(rewritten, "utf-8")).toContain("EVO-SUB-OWNED");
	});

	it("installs the two new upstream-derived read-only profiles with evidence directives", () => {
		for (const name of ["cook-audit", "cook-refute"] as const) {
			const file = COOK_PROFILE_FILE_MAP[name];
			expect(file).toBeDefined();
			const source = readFileSync(join(templatesDir, file), "utf-8");
			const frontmatter = source.split("---")[1] ?? "";
			const tools = frontmatter.split("\n").find((line) => line.startsWith("tools:")) ?? "";
			expect(source).toContain("## Tool Directives (codesight)");
			expect(tools).toContain("codesight_get_");
			expect(tools).not.toMatch(/(^|[ ,])(task|write|edit|bash)([ ,]|$)/);
		}
	});
});
