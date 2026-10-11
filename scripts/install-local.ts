#!/usr/bin/env bun
/**
 * install-local.ts — idempotent user-scope link installer for ezxomp plugins.
 *
 * Runs `omp plugin link <absolute-path> --scope user` for each of the 9 plugins,
 * then `omp plugin doctor`. Re-links an existing matching path; fails rather
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");

const PLUGINS = [
	"code-nav",
	"codesight",
	"experiences",
	"compact-eng",
	"extensible-workflows",
	"plannotator",
	"augment",
];

function log(msg: string): void {
	process.stdout.write(msg + "\n");
}

function fail(msg: string): never {
	process.stderr.write(`ERROR: ${msg}\n`);
	process.exit(1);
}

function runOmp(args: string[], cwd = ROOT): { ok: boolean; stdout: string; stderr: string } {
	const r = spawnSync("omp", args, { cwd, encoding: "utf-8", timeout: 60_000 });
	return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Check current link state; re-link if matching path, fail if different repo. */
function ensureLink(pluginSlug: string, absPath: string): void {
	if (!existsSync(join(absPath, "package.json"))) {
		fail(`plugins/${pluginSlug}/package.json not found — run import first`);
	}

	// Read package name from manifest
	const pkg = JSON.parse(readFileSync(join(absPath, "package.json"), "utf-8"));
	const pkgName: string = pkg.name;

	// Check existing link state
	const listResult = runOmp(["plugin", "list", "--json"]);
	if (!listResult.ok) {
		// If list fails, just attempt link
		const linkR = runOmp(["plugin", "link", absPath, "--scope", "user"]);
		if (!linkR.ok) fail(`omp plugin link ${pluginSlug} failed: ${linkR.stderr}`);
		log(`[link] ${pkgName}: linked`);
		return;
	}

	// Parse existing links to check for same-named plugin targeting another repo
	let existing: Array<{ name?: string; source?: string; path?: string }> = [];
	try {
		const parsed = JSON.parse(listResult.stdout);
		existing = Array.isArray(parsed) ? parsed : (parsed.plugins ?? parsed.entries ?? []);
	} catch {
		// non-JSON, attempt fresh link
	}

	const found = existing.find((e: { name?: string }) => e.name === pkgName || e.name === `@ezxomp/${pluginSlug}`);
	if (found) {
		const sourcePath = found.source ?? found.path ?? "";
		if (sourcePath.includes("/repo/ezxomp/plugins/")) {
			log(`[link] ${pkgName}: already linked (matching repo)`);
			return;
		}
		if (sourcePath && sourcePath !== absPath) {
			fail(`${pkgName} is already linked from ${sourcePath} (different repo) — refusing to replace`);
		}
	}

	// Link
	const linkR = runOmp(["plugin", "link", absPath, "--scope", "user"]);
	if (!linkR.ok) {
		// Might already be linked; check if it's ours
		if (linkR.stderr.includes("already") || linkR.stderr.includes("exists")) {
			log(`[link] ${pkgName}: already linked`);
			return;
		}
		fail(`omp plugin link ${pluginSlug} failed: ${linkR.stderr}`);
	}
	log(`[link] ${pkgName}: linked`);
}

function main(): void {
	log("Installing ezxomp plugins as user-scope links...\n");

	for (const slug of PLUGINS) {
		const absPath = join(PLUGINS_DIR, slug);
		if (!existsSync(absPath)) fail(`plugins/${slug} not found — run 'bun run import' first`);
		ensureLink(slug, absPath);
	}

	log("\nRunning omp plugin doctor...");
	const doctorR = runOmp(["plugin", "doctor"]);
	if (!doctorR.ok) {
		log(`plugin doctor warnings:\n${doctorR.stdout}\n${doctorR.stderr}`);
	} else {
		log(doctorR.stdout);
	}

	log("\nAll 9 plugins linked and doctor complete.");
}

main();
