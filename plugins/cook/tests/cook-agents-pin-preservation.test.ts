/**
 * TASK-51 RED tests — drift-resync must preserve operator customizations.
 *
 * Defect ledger finding #1 (TASK-51, 2026-08-29): installCookAgents
 * overwrites installed profiles with shipped templates on ANY hash drift,
 * destroying frontmatter customizations such as model: pins written by
 * cook_config. Selected fix (ADHD diverge/focus, frame F1 merge-on-write):
 * keys present in the installed file but ABSENT from the template are
 * merged (additive delta) before write; the marker records the hash of the
 * merged content so freshness checks see the merged file as current.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
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
	tmpHome = mkdtempSync(join(tmpdir(), "cook-pins-home-"));
	tmpProject = mkdtempSync(join(tmpdir(), "cook-pins-proj-"));
	process.env.HOME = tmpHome;
	delete process.env.OMP_HOME;
});

afterEach(() => {
	process.env.HOME = homeBackup;
	if (ompHomeBackup === undefined) delete process.env.OMP_HOME;
	else process.env.OMP_HOME = ompHomeBackup;
});

function projectAgentsDir(): string {
	return join(tmpProject, ".omp", "agents");
}

function profilePath(name: string): string {
	return join(projectAgentsDir(), `${name}.md`);
}

function templateOf(name: string): string {
	return readFileSync(join(templatesDir, COOK_PROFILE_FILE_MAP[name]), "utf-8");
}

/** Insert a frontmatter key line right after the opening `---` delimiter. */
function withAddedFrontmatterKey(src: string, keyLine: string): string {
	const firstDelim = src.indexOf("\n");
	return `${src.slice(0, firstDelim + 1)}${keyLine}\n${src.slice(firstDelim + 1)}`;
}

/** Structural de-merge: merged output minus the added keys must equal the template. */
function deMerged(after: string, keyLine: string): string {
	return after.replace(`${keyLine}\n`, "");
}

describe("installCookAgents — additive customization preservation (TASK-51 F1)", () => {
	it("keeps an added model pin across resync without a freshness loop", async () => {
		await installCookAgents(tmpProject, "project");

		// Operator customization: cook_config writes a model pin.
		const dest = profilePath("cook-worker");
		writeFileSync(dest, withAddedFrontmatterKey(readFileSync(dest, "utf-8"), "model: my-model-pin"));

		// Resync preserves the pin and merges template content under it.
		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("installed");
		const after = readFileSync(dest, "utf-8");
		expect(after).toContain("model: my-model-pin");
		expect(deMerged(after, "model: my-model-pin")).toBe(templateOf("cook-worker"));
		// Marker now hashes the merged content: no reinstall loop.
		expect(profilesUpToDate(projectAgentsDir())).toBe(true);
		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("current");
	});

	it("keeps added frontmatter keys when a version bump forces reinstall", async () => {
		await installCookAgents(tmpProject, "project");
		const dest = profilePath("cook-planner");
		writeFileSync(dest, withAddedFrontmatterKey(readFileSync(dest, "utf-8"), "model: deepseek-v4-flash:0731"));

		// Simulate plugin update: marker version rollback.
		const markerPath = join(projectAgentsDir(), ".cook-agents-marker.json");
		const marker = JSON.parse(readFileSync(markerPath, "utf-8"));
		marker.version = "0.0.1-ancient";
		writeFileSync(markerPath, JSON.stringify(marker));

		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("installed");
		const after = readFileSync(dest, "utf-8");
		expect(after).toContain("model: deepseek-v4-flash:0731");
		expect(deMerged(after, "model: deepseek-v4-flash:0731")).toBe(templateOf("cook-planner"));
	});

	it("still reinstalls the template when the body drifts (non-frontmatter edit)", async () => {
		await installCookAgents(tmpProject, "project");
		const dest = profilePath("cook-worker");
		writeFileSync(dest, `${readFileSync(dest, "utf-8")}\n<!-- body drift -->\n`);

		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("installed");
		expect(readFileSync(dest, "utf-8")).not.toContain("body drift");
		expect(readFileSync(dest, "utf-8")).toBe(templateOf("cook-worker"));
	});

	it("still reinstalls when an existing template key value is edited", async () => {
		await installCookAgents(tmpProject, "project");
		const dest = profilePath("cook-worker");
		const tpl = templateOf("cook-worker");
		writeFileSync(dest, tpl.replace("tools:", "tools: rogue-tool,"));

		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("installed");
		expect(readFileSync(dest, "utf-8")).toBe(tpl);
	});

	it("falls back to the plain template when the drifted file is unparseable", async () => {
		await installCookAgents(tmpProject, "project");
		const dest = profilePath("cook-scout");
		writeFileSync(dest, "::: not yaml :::\n\tbroken: [unclosed\n");

		await expect(syncCookAgents(tmpProject, "project")).resolves.toBe("installed");
		expect(readFileSync(dest, "utf-8")).toBe(templateOf("cook-scout"));
	});
});
