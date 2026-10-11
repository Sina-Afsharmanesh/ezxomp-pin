import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];

afterEach(() => {
	for (const temporaryRoot of temporaryRoots.splice(0)) {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
});

function makeFixture(): string {
	const fixture = mkdtempSync(join(tmpdir(), "ezxomp-scaffold-"));
	temporaryRoots.push(fixture);
	mkdirSync(join(fixture, "scripts"), { recursive: true });
	mkdirSync(join(fixture, ".omp-plugin"), { recursive: true });
	copyFileSync(join(ROOT, "scripts", "scaffold-plugin.ts"), join(fixture, "scripts", "scaffold-plugin.ts"));
	copyFileSync(join(ROOT, "scripts", "verify-scaffold.ts"), join(fixture, "scripts", "verify-scaffold.ts"));
	copyFileSync(join(ROOT, "LICENSE"), join(fixture, "LICENSE"));
	writeFileSync(join(fixture, "AGENTS.md"), "# Fixture\n\n## Child DOX Index\n\n- `plugins/existing/AGENTS.md` — Existing fixture plugin.\n");
	writeFileSync(join(fixture, ".omp-plugin", "marketplace.json"), JSON.stringify({
		name: "fixture",
		owner: { name: "fixture" },
		plugins: [],
	}, null, "\t"));
	return fixture;
}

function runScript(fixture: string, script: string, args: string[]) {
	return spawnSync(process.execPath, [join(fixture, "scripts", script), ...args], {
		cwd: fixture,
		encoding: "utf-8",
	});
}

describe("plugin scaffolder", () => {
	test("creates a valid, compilable plugin without active MCP commands", () => {
		const fixture = makeFixture();
		const slug = "1st-plugin";
		const scaffold = runScript(fixture, "scaffold-plugin.ts", [
			slug,
			"--description",
			"Scaffold integration probe",
			"--with-skills",
			"--with-hooks",
			"--with-tools",
			"--with-commands",
			"--with-mcp",
		]);

		expect(scaffold.status).toBe(0);
		expect(scaffold.stderr).toBe("");

		const plugin = join(fixture, "plugins", slug);
		const entrypoint = join(plugin, "src", "index.ts");
		const source = readFileSync(entrypoint, "utf-8");
		expect(source.match(/(^|\n)\s*export\s+default\b/g)).toHaveLength(1);
		const build = spawnSync(process.execPath, ["build", entrypoint, "--target=bun", `--outdir=${join(fixture, "dist")}`], {
			cwd: fixture,
			encoding: "utf-8",
		});
		expect(build.status).toBe(0);

		expect(readFileSync(join(plugin, "LICENSE"), "utf-8")).toBe(readFileSync(join(fixture, "LICENSE"), "utf-8"));
		expect(readFileSync(join(plugin, ".mcp.json"), "utf-8")).toContain('"mcpServers": {}');
		expect(existsSync(join(plugin, "tools"))).toBe(false);
		expect(statSync(join(plugin, "hooks", "pre", "Bash.sh")).mode & 0o111).toBeGreaterThan(0);
		expect(readFileSync(join(fixture, "AGENTS.md"), "utf-8")).toContain(`- \`plugins/${slug}/AGENTS.md\` — ${slug} OMP plugin.`);

		const catalog = JSON.parse(readFileSync(join(fixture, ".omp-plugin", "marketplace.json"), "utf-8"));
		expect(catalog.plugins).toContainEqual(expect.objectContaining({
			name: slug,
			source: `./plugins/${slug}`,
		}));
		expect(runScript(fixture, "verify-scaffold.ts", [slug]).status).toBe(0);
	});

	test("rejects a missing description value without writing a plugin", () => {
		const fixture = makeFixture();
		const slug = "missing-description";
		const scaffold = runScript(fixture, "scaffold-plugin.ts", [slug, "--description"]);

		expect(scaffold.status).not.toBe(0);
		expect(scaffold.stderr).toContain("--description requires a non-empty, single-line value");
		expect(existsSync(join(fixture, "plugins", slug))).toBe(false);
	});

	test("rejects an extension with no default export", () => {
		const fixture = makeFixture();
		const slug = "invalid-extension";
		expect(runScript(fixture, "scaffold-plugin.ts", [slug]).status).toBe(0);
		writeFileSync(join(fixture, "plugins", slug, "src", "index.ts"), "export const extension = true;\n");

		const verification = runScript(fixture, "verify-scaffold.ts", [slug]);
		expect(verification.status).not.toBe(0);
		expect(verification.stdout).toContain('extension "src/index.ts": expected exactly one default export, found 0');
	});
});
