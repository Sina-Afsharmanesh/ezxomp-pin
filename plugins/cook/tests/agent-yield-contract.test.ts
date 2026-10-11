/**
 * Agent-profile terminal-yield contract tests.
 *
 * Requirement (2026-08-28 operator order): cook sub-agents repeatedly finished
 * their work without calling the `yield` tool, leaving jobs "Still Running"
 * until timeout, and misused `hub` by omitting the required `op` parameter.
 * Every shipped profile MUST carry the Terminal Yield Contract section that
 * states: (1) runs end only via a `yield` tool call, (2) plain text does not
 * return a result, (3) hub calls require `op`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(testsDir, "..", "agents");

const ALL_PROFILES = readdirSync(templatesDir).filter((f) => f.endsWith(".md"));

describe("cook agent profiles — terminal yield contract", () => {
	it("every profile carries the Terminal Yield Contract section", () => {
		expect(ALL_PROFILES.length).toBeGreaterThan(0);
		for (const name of ALL_PROFILES) {
			const content = readFileSync(join(templatesDir, name), "utf8");
			expect(content, name).toContain("Terminal Yield Contract (REQUIRED)");
		}
	});

	it("every profile instructs that plain-text endings do not return results", () => {
		for (const name of ALL_PROFILES) {
			const content = readFileSync(join(templatesDir, name), "utf8");
			expect(content, name).toMatch(/Plain-text final messages do NOT/);
		}
	});

	it("every profile teaches the hub op requirement", () => {
		for (const name of ALL_PROFILES) {
			const content = readFileSync(join(templatesDir, name), "utf8");
			expect(content, name).toMatch(/hub[^\n]*\bop\b/);
		}
	});

	it("every profile grants the coordination tools its terminal contract requires", () => {
		for (const name of ALL_PROFILES) {
			const content = readFileSync(join(templatesDir, name), "utf8");
			const tools = /^tools:\s*(.+)$/m.exec(content)?.[1].split(",").map((tool) => tool.trim()) ?? [];
			expect(tools, name).toContain("hub");
			expect(tools, name).toContain("yield");
		}
	});

	it("role grants cover documented task access without widening spawn authority", () => {
		const profile = (name: string) => readFileSync(join(templatesDir, name), "utf8");
		expect(profile("cook-worker.md")).toMatch(/^tools:.*\bbacklog_task_view\b/m);
		expect(profile("cook-validator.md")).toMatch(/^tools:.*\bcook_journal\b/m);
		for (const name of ALL_PROFILES) {
			const tools = /^tools:\s*(.+)$/m.exec(profile(name))?.[1].split(",").map((tool) => tool.trim()) ?? [];
			const maySpawn = name === "cook-planner.md" || name === "cook-researcher.md";
			expect(tools.includes("task"), name).toBe(maySpawn);
		}
	});

	it("no profile tells the agent to 'Return' an envelope as plain text", () => {
		for (const name of ALL_PROFILES) {
			const content = readFileSync(join(templatesDir, name), "utf8");
			const output = /## Output\n([\s\S]*?)(?=\n## |$)/.exec(content)?.[1] ?? "";
			expect(output, name).not.toMatch(/^\s*Return /);
		}
	});
});
