/**
 * verify-scaffold.ts — Validate a scaffolded or existing OMP plugin directory.
 *
 * Usage:
 *   bun run scripts/verify-scaffold.ts <slug>
 *
 * Checks:
 *   1. plugins/<slug>/package.json exists and has name, version, omp.extensions
 *   2. Each extension stays inside the plugin and resolves to a source file
 *   3. No legacy `pi` manifest field
 *   4. Plugin name is @ezxomp/<slug>
 *   5. Each resolved extension has exactly one default export
 *   6. skills SKILL.md files have frontmatter (name + description)
 *   7. hooks pre/post directories are not empty when present
 *   8. commands/*.md have frontmatter (name + description)
 *   9. .mcp.json has an mcpServers object (if present)
 *  10. Plugin is registered in .omp-plugin/marketplace.json
 *  11. AGENTS.md exists
 *
 * Exit 0 = pass, exit 1 = any check failed.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const MARKETPLACE = join(ROOT, ".omp-plugin", "marketplace.json");
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const EXTENSION_INDEX_FILES = ["index.ts", "index.js", "index.mjs", "index.cjs"];

const errors: string[] = [];
const warnings: string[] = [];

type JsonObject = Record<string, unknown>;

function error(message: string): void {
	errors.push(message);
}

function warn(message: string): void {
	warnings.push(message);
}

function log(message: string): void {
	process.stdout.write(`${message}\n`);
}

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string, label: string): JsonObject | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		if (!isRecord(parsed)) {
			error(`${label}: expected a JSON object`);
			return undefined;
		}
		return parsed;
	} catch (cause) {
		error(`${label}: invalid JSON (${cause instanceof Error ? cause.message : String(cause)})`);
		return undefined;
	}
}

function checkFrontmatter(content: string, file: string): void {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) {
		error(`${file}: missing YAML frontmatter`);
		return;
	}
	const frontmatter = match[1];
	if (!frontmatter.includes("name:")) {
		warn(`${file}: frontmatter missing "name" (OMP falls back to directory name)`);
	}
	if (!frontmatter.includes("description:")) {
		error(`${file}: frontmatter missing "description"`);
	}
}

function isWithin(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function resolveExtensionFile(pluginDir: string, extension: string): string | undefined {
	const extensionPath = resolve(pluginDir, extension);
	if (!isWithin(pluginDir, extensionPath)) {
		error(`extension "${extension}" must stay inside the plugin directory`);
		return undefined;
	}
	if (!existsSync(extensionPath)) {
		error(`extension not found: ${extension}`);
		return undefined;
	}

	const stat = statSync(extensionPath);
	if (!stat.isDirectory()) return extensionPath;

	const indexFile = EXTENSION_INDEX_FILES.find(file => existsSync(join(extensionPath, file)));
	if (!indexFile) {
		error(`extension dir "${extension}" has no index.{ts,js,mjs,cjs}`);
		return undefined;
	}
	return join(extensionPath, indexFile);
}

function checkDefaultExport(path: string, extension: string): void {
	let content: string;
	try {
		content = readFileSync(path, "utf-8");
	} catch (cause) {
		error(`extension "${extension}": could not read source (${cause instanceof Error ? cause.message : String(cause)})`);
		return;
	}

	const defaultExportCount = content.match(/(^|\n)\s*export\s+default\b/g)?.length ?? 0;
	if (defaultExportCount !== 1) {
		error(`extension "${extension}": expected exactly one default export, found ${defaultExportCount}`);
	}
}

function checkPackage(pluginDir: string, slug: string): void {
	const packagePath = join(pluginDir, "package.json");
	if (!existsSync(packagePath)) {
		error(`plugins/${slug}/package.json not found`);
		return;
	}

	const pkg = readJson(packagePath, "package.json");
	if (!pkg) return;
	const expectedName = `@ezxomp/${slug}`;
	if (pkg.name !== expectedName) {
		error(`package name: expected "${expectedName}", got "${String(pkg.name)}"`);
	}
	if (typeof pkg.version !== "string" || pkg.version.length === 0) {
		error("package.json missing non-empty \"version\"");
	}
	if (Object.hasOwn(pkg, "pi")) {
		error(`plugins/${slug} still has legacy "pi" manifest key (use "omp" only)`);
	}
	if (!isRecord(pkg.omp)) {
		error(`plugins/${slug} missing "omp" manifest`);
		return;
	}

	const extensions = pkg.omp.extensions;
	const extensionEntries = typeof extensions === "string" ? [extensions] : extensions;
	if (!Array.isArray(extensionEntries) || extensionEntries.length === 0) {
		error("omp.extensions must be a non-empty string or string array");
		return;
	}

	for (const extension of extensionEntries) {
		if (typeof extension !== "string" || extension.length === 0) {
			error("omp.extensions may contain only non-empty strings");
			continue;
		}
		const source = resolveExtensionFile(pluginDir, extension);
		if (source) checkDefaultExport(source, extension);
	}

	if (isRecord(pkg.peerDependencies)) {
		for (const dependency of Object.keys(pkg.peerDependencies)) {
			if (!dependency.startsWith("@oh-my-pi/")) {
				warn(`peerDependency "${dependency}" is not an @oh-my-pi/* package (may be intentional)`);
			}
		}
	}
}

function checkSkills(pluginDir: string): void {
	const skillsDir = join(pluginDir, "skills");
	if (!existsSync(skillsDir)) return;

	for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
		if (entry.name.startsWith(".")) continue;
		const skillPath = join(skillsDir, entry.name, "SKILL.md");
		if (!existsSync(skillPath)) {
			error(`skills/${entry.name}/: missing SKILL.md`);
			continue;
		}
		checkFrontmatter(readFileSync(skillPath, "utf-8"), `skills/${entry.name}/SKILL.md`);
	}
}

function checkHooks(pluginDir: string): void {
	const hooksDir = join(pluginDir, "hooks");
	if (!existsSync(hooksDir)) return;

	for (const type of ["pre", "post"]) {
		const typeDir = join(hooksDir, type);
		if (existsSync(typeDir) && readdirSync(typeDir).length === 0) {
			warn(`hooks/${type}/ is empty`);
		}
	}
}

function checkCommands(pluginDir: string): void {
	const commandsDir = join(pluginDir, "commands");
	if (!existsSync(commandsDir)) return;

	for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const commandPath = join(commandsDir, entry.name);
		checkFrontmatter(readFileSync(commandPath, "utf-8"), `commands/${entry.name}`);
	}
}

function checkMcp(pluginDir: string): void {
	const mcpPath = join(pluginDir, ".mcp.json");
	if (!existsSync(mcpPath)) return;

	const mcp = readJson(mcpPath, ".mcp.json");
	if (!mcp) return;
	if (!isRecord(mcp.mcpServers)) {
		error(".mcp.json: missing \"mcpServers\" object");
		return;
	}
	for (const [name, server] of Object.entries(mcp.mcpServers)) {
		if (!isRecord(server) || (typeof server.command !== "string" && typeof server.url !== "string")) {
			error(`.mcp.json: server "${name}" missing command or url`);
		}
	}
}

function checkMarketplace(slug: string): void {
	if (!existsSync(MARKETPLACE)) {
		error(".omp-plugin/marketplace.json not found");
		return;
	}

	const marketplace = readJson(MARKETPLACE, "marketplace.json");
	if (!marketplace) return;
	if (!Array.isArray(marketplace.plugins)) {
		error("marketplace.json: no \"plugins\" array");
		return;
	}
	const entry = marketplace.plugins.find(candidate => isRecord(candidate) && candidate.name === slug);
	if (!isRecord(entry)) {
		error(`marketplace.json: plugin "${slug}" not registered`);
		return;
	}
	const expectedSource = `./plugins/${slug}`;
	if (entry.source !== expectedSource) {
		error(`marketplace.json: source for "${slug}" is "${String(entry.source)}", expected "${expectedSource}"`);
	}
}

function reportAndExit(): never {
	if (warnings.length > 0) {
		log("\nWarnings:");
		for (const warning of warnings) log(`  ⚠ ${warning}`);
	}
	if (errors.length > 0) {
		log(`\nFAIL: ${errors.length} error(s)`);
		for (const failure of errors) log(`  ✘ ${failure}`);
		process.exit(1);
	}
	process.exit(0);
}

const slug = process.argv[2];
if (!slug || !SLUG_PATTERN.test(slug)) {
	process.stderr.write("Usage: bun run scripts/verify-scaffold.ts <slug matching /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/ >\n");
	process.exit(1);
}

const pluginDir = join(PLUGINS_DIR, slug);
log(`Verifying: plugins/${slug}`);
if (!existsSync(pluginDir)) {
	error(`plugins/${slug} directory not found`);
	reportAndExit();
}

checkPackage(pluginDir, slug);
checkSkills(pluginDir);
checkHooks(pluginDir);
checkCommands(pluginDir);
checkMcp(pluginDir);
if (!existsSync(join(pluginDir, "AGENTS.md"))) {
	error(`plugins/${slug}/AGENTS.md not found (DOX child doc required)`);
}
checkMarketplace(slug);

if (errors.length === 0) log(`\n✔ PASS: plugins/${slug} is valid`);
reportAndExit();
