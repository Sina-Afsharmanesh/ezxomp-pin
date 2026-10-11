import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "../vendor/js-yaml.mjs";
import { ROLE_FILE_MAP } from "./constants.ts";

/** The installer roster includes runtime roles plus orchestrator-only council stations. */
// fallow-ignore-next-line unused-export
export const COOK_PROFILE_FILE_MAP: Record<string, string> = {
	...ROLE_FILE_MAP,
	"cook-council": "cook-council.md",
	"cook-council-synthesis": "cook-council-synthesis.md",
	"cook-audit": "cook-audit.md",
	"cook-refute": "cook-refute.md",
};

const __dirname = dirname(fileURLToPath(import.meta.url));

export function ompHome(): string {
	return process.env.OMP_HOME ?? join(process.env.HOME ?? "~", ".omp");
}

/**
 * True when evo-sub currently owns (rewritten) cook profiles — its backups
 * restore them on /evo-sub off, so an auto-resync in between would clobber
 * the backup-restore contract. Mirrors evo's own resolution semantics:
 * OMP_HOME-aware path (plugins/evo/extensions/evo/paths.ts), real YAML parse
 * (evo config.ts requires boolean true for `sub`), plus evo-sub's state file
 * as ownership evidence when config probing fails. Any doubt → true (skip).
 */
async function evoSubActive(): Promise<boolean> {
	const configPath = join(ompHome(), "agent", "config.yml");
	try {
		const raw = await readFile(configPath, "utf-8");
		const parsed = yaml.load(raw) as Record<string, unknown> | undefined;
		const evo = (parsed?.["evo-mode"] ?? {}) as Record<string, unknown>;
		if (evo.sub === true) return true;
	} catch {
		// unreadable/invalid config → check the state file below
	}
	// evo-sub leaves a state file when it has ever taken ownership; treat any
	// existing state file as active (conservative: skip rather than clobber).
	return existsSync(join(ompHome(), "agent", "evo-mode", "sub-state.json"));
}

/**
 * Marker written next to installed profiles recording which plugin version
 * installed them and a content hash per profile. Enables freshness checks:
 * profiles drift from the shipped templates when the plugin updates or when
 * something else rewrites them (e.g. evo-sub rewrites, manual edits).
 */
interface InstallMarker {
	version: string;
	files: Record<string, string>; // profile name -> FNV-1a hash of shipped template
}

export const COOK_AGENTS_VERSION = "0.1.7-ezxomp.9";

function templateHash(content: string): string {
	// FNV-1a is sufficient here: this is a drift sentinel, not security.
	let h = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		h ^= content.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16);
}

function readMarker(destDir: string): InstallMarker | null {
	try {
		return JSON.parse(readFileSync(join(destDir, ".cook-agents-marker.json"), "utf-8")) as InstallMarker;
	} catch {
		return null;
	}
}

function writeMarker(destDir: string, files: Record<string, string>): void {
	atomicWrite(
		join(destDir, ".cook-agents-marker.json"),
		JSON.stringify({ version: COOK_AGENTS_VERSION, files } satisfies InstallMarker, null, 2),
	);
}

/**
 * Atomic file write (temp + rename): two OMP instances firing session_start
 * in the same project dir both run syncCookAgents; rename is atomic on POSIX
 * so concurrent installs can never expose a partially-written profile or a
 * torn marker. Last-writer-wins on content is fine — both write identical
 * template bytes.
 */
function atomicWrite(destPath: string, content: string): void {
	const tmpPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
	try {
		writeFileSync(tmpPath, content);
		renameSync(tmpPath, destPath);
	} catch (err) {
		try {
			unlinkSync(tmpPath);
		} catch {
			/* temp already gone */
		}
		throw err;
	}
}

/**
 * Merge operator-owned frontmatter additions into the current shipped
 * template.  Shipped keys and the complete body always come from the
 * template; only keys which are absent from that template survive a resync.
 * Keeping the template bytes intact (rather than dumping the whole YAML
 * document) also avoids needless churn in installed profiles.
 */
function mergeCustomFrontmatter(template: string, installed: string | null): string {
	if (installed === null) return template;
	const templateEnd = template.indexOf("\n---", 4);
	const installedEnd = installed.indexOf("\n---", 4);
	if (!template.startsWith("---\n") || templateEnd < 0 || !installed.startsWith("---\n") || installedEnd < 0) {
		return template;
	}
	try {
		const templateFrontmatter = yaml.load(template.slice(4, templateEnd)) as Record<string, unknown>;
		const installedFrontmatter = yaml.load(installed.slice(4, installedEnd)) as Record<string, unknown>;
		if (!templateFrontmatter || typeof templateFrontmatter !== "object") return template;
		if (!installedFrontmatter || typeof installedFrontmatter !== "object") return template;
		const additions = Object.entries(installedFrontmatter).filter(([key]) => !(key in templateFrontmatter));
		if (additions.length === 0) return template;
		const serialized = additions
			.map(([key, value]) => yaml.dump({ [key]: value }, { lineWidth: -1 }).trimEnd())
			.join("\n");
		const insertion = `${serialized}\n`;
		return `${template.slice(0, 4)}${insertion}${template.slice(4)}`;
	} catch {
		// A manually edited, invalid profile cannot safely contribute keys.
		return template;
	}
}


/**
 * Ensure the shipped agent profiles are installed and fresh in `scope` for
 * `cwd`. Returns "installed" when anything was written, "current" when the
 * marker proves all profiles match the shipped templates, or "skipped" when
 * neither scope can be resolved (nonexistent HOME, permission errors are
 * caught by the caller's session_start guard).
 */
export async function syncCookAgents(
	cwd: string,
	scope: "project" | "personal",
): Promise<"installed" | "current" | "skipped"> {
	const destDir =
		scope === "project"
			? join(cwd, ".omp", "agents")
			: join(ompHome(), "agents");
	if (scope === "personal" && !process.env.HOME && !process.env.OMP_HOME) return "skipped";
	// evo-sub rewrites both OMP_HOME/agents and project-local .omp/agents.
	// Cook must not refresh either scope while evo-sub owns the byte-exact
	// backups, or it would clobber the rewritten profile and invalidate restore.
	if (await evoSubActive()) return "skipped";

	// Freshness = marker version matches AND every installed file still hashes
	// to its marker value. This catches both drift sources: plugin template
	// updates (version bump rewrites marker) and post-install rewrites of the
	// installed profiles (hash mismatch). Cheap: hash reads only, no writes.
	if (profilesUpToDate(destDir)) return "current";
	await installCookAgents(cwd, scope);
	return "installed";
}

/**
 * True when the marker exists, matches COOK_AGENTS_VERSION, and every
 * installed profile still hashes to its marker-recorded value. A missing
 * marker (fresh install) or any drifted file returns false.
 */
export function profilesUpToDate(destDir: string): boolean {
	const marker = readMarker(destDir);
	if (!marker || marker.version !== COOK_AGENTS_VERSION) return false;
	if (!marker.files || typeof marker.files !== "object" || Array.isArray(marker.files)) return false;
	// Marker must cover EXACTLY the current roster: an incomplete map (e.g.
	// `{ version, files: {} }`) would falsely report current for missing files.
	const expected = Object.keys(COOK_PROFILE_FILE_MAP);
	if (expected.length !== Object.keys(marker.files).length) return false;
	for (const name of expected) {
		const recorded = marker.files[name];
		if (recorded === undefined) return false;
		const destPath = join(destDir, `${name}.md`);
		if (!existsSync(destPath)) return false;
		if (templateHash(readFileSync(destPath, "utf-8")) !== recorded) return false;
	}
	return true;
}

export async function installCookAgents(
	cwd: string,
	targetScope: "project" | "personal",
): Promise<string[]> {
	const installed: string[] = [];
	const srcDir = join(__dirname, "..", "agents");
	const destDir =
		targetScope === "project"
			? join(cwd, ".omp", "agents")
			: join(ompHome(), "agents");

	mkdirSync(destDir, { recursive: true });

	const hashes: Record<string, string> = {};
	for (const [name, srcFile] of Object.entries(COOK_PROFILE_FILE_MAP)) {
		const srcPath = join(srcDir, srcFile);
		const destPath = join(destDir, `${name}.md`);
		const template = existsSync(srcPath) ? readFileSync(srcPath, "utf-8") : null;
		const existing = existsSync(destPath) ? readFileSync(destPath, "utf-8") : null;
		if (template === null) {
			const stub = `---\nname: ${name}\ndescription: "Cook ${name.replace("cook-", "")} agent."\ntools: "*"\n---\n\nYou are the ${name.toUpperCase()} agent. See the cook workflow for your role.\n`;
			const merged = mergeCustomFrontmatter(stub, existing);
			hashes[name] = templateHash(merged);
			atomicWrite(destPath, merged);
		} else {
			const merged = mergeCustomFrontmatter(template, existing);
			hashes[name] = templateHash(merged);
			atomicWrite(destPath, merged);
		}
		installed.push(name);
	}
	writeMarker(destDir, hashes);

	return installed;
}
