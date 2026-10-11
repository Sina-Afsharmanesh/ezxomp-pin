#!/usr/bin/env bun
/**
 * import-upstreams.ts — lock-driven importer for ezxomp plugin baselines.
 *
 * Commands:
 *   import --all        Download+verify+copy every locked source into plugins/<slug>
 *   verify              Re-download each source, verify integrity, reproduce UPSTREAM.json
 *   stage <slug> --out <dir>   Reconstruct a fresh source snapshot beside the fork
 *
 * npm sources: verify registry SHA-512 integrity of the tarball.
 * git sources: verify pinned Git archive SHA-256 and commit-named archive root.
 *
 * Plannotator: builds upstream `build:pi` before copying apps/pi-extension.
 * Never overwrites plugins/*; initial import requires every destination absent.
 * No --force path.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, statSync, readdirSync, renameSync } from "node:fs";
import { join, resolve, relative, basename, dirname, sep } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawnSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────────

interface NpmSource {
	type: "npm";
	package: string;
	version: string;
	url: string;
	integrity: string; // sha512-...
	importRoot: string;
}

interface GitSource {
	type: "git";
	repo: string;
	commit: string;
	url: string;
	integrity: string; // sha256:...
	importRoot: string;
	exclude?: string[];
	build?: string;
}

type Source = NpmSource | GitSource;

interface LockFile {
	"$schema": string;
	sources: Record<string, Source>;
}

interface UpstreamMeta {
	originalName: string;
	url: string;
	version?: string;
	commit?: string;
	integrity: string;
	importedPaths: string[];
	localForkVersion: string;
}

// ── Fork versions ──────────────────────────────────────────────────────────

const FORK_VERSIONS: Record<string, string> = {
	skillforge: "0.2.5-ezxomp.1",
	"skills": "0.7.4-ezxomp.0",
	"code-nav": "0.5.0-ezxomp.0",
	codesight: "0.2.1-ezxomp.1",
	experiences: "0.1.49-ezxomp.1",
	"compact-eng": "2.0.0-ezxomp.0",
	"extensible-workflows": "5.1.0-ezxomp.1",
	plannotator: "0.25.1-ezxomp.1",
	augment: "1.0.9-ezxomp.0",
};

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const LOCK_PATH = join(ROOT, "upstreams.lock.json");

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
	process.stdout.write(msg + "\n");
}

function err(msg: string): never {
	process.stderr.write(`ERROR: ${msg}\n`);
	process.exit(1);
}

function loadLock(): LockFile {
	const raw = readFileSync(LOCK_PATH, "utf-8");
	return JSON.parse(raw) as LockFile;
}

function sha512Hex(data: Buffer): string {
	return createHash("sha512").update(data).digest("base64");
}

function sha256Hex(data: Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

async function download(url: string): Promise<Buffer> {
	const resp = await fetch(url);
	if (!resp.ok) err(`fetch ${url} → HTTP ${resp.status}`);
	const ab = await resp.arrayBuffer();
	return Buffer.from(ab);
}

function verifyIntegrity(data: Buffer, expected: string, label: string): void {
	if (expected.startsWith("sha512-")) {
		const calc = "sha512-" + sha512Hex(data);
		if (calc !== expected) err(`integrity mismatch for ${label}: expected ${expected}, got ${calc}`);
	} else if (expected.startsWith("sha256:")) {
		const calc = "sha256:" + sha256Hex(data);
		if (calc !== expected) err(`integrity mismatch for ${label}: expected ${expected}, got ${calc}`);
	} else {
		err(`unknown integrity format for ${label}: ${expected}`);
	}
}

/** Extract a .tgz into a directory (Bun's tar extraction via shell tar). */
function extractTar(tarball: Buffer, dest: string): void {
	mkdirSync(dest, { recursive: true });
	const tmpFile = join(tmpdir(), `ezxomp-${Date.now()}.tgz`);
	writeFileSync(tmpFile, tarball);
	const r = spawnSync("tar", ["xzf", tmpFile, "-C", dest], { encoding: "utf-8" });
	rmSync(tmpFile, { force: true });
	if (r.status !== 0) err(`tar extract failed: ${r.stderr}`);
}

/** Find the single top-level directory inside an extracted archive (e.g. "package/" or "<repo>-<commit>/"). */
function findArchiveRoot(dir: string): string {
	const entries = readdirSync(dir).filter(e => !e.startsWith("."));
	if (entries.length === 1) {
		const p = join(dir, entries[0]);
		if (statSync(p).isDirectory()) return p;
	}
	// npm tarballs have "package/", git archives have "<repo>-<commit>/"
	const pkgDir = entries.find(e => e === "package");
	if (pkgDir) return join(dir, pkgDir);
	if (entries.length === 1) return join(dir, entries[0]);
	// fallback: first directory
	for (const e of entries) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) return p;
	}
	err(`cannot determine archive root in ${dir}; entries: ${entries.join(", ")}`);
}

const EXCLUDED_DIRS = new Set([
	".git",
	"node_modules",
	".npm",
	".cache",
	"coverage",
	".nyc_output",
	".circleci",
	".github",
]);

const EXCLUDED_FILES = new Set([
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	".travis.yml",
	".releaserc",
	"codecov.yml",
	".prettierrc",
	".eslintrc",
	".eslintrc.js",
	".eslintrc.json",
]);

/** Recursively copy from src to dst, excluding build/test/git artifacts. */
function copySource(src: string, dst: string, excludeDirs: string[] = [], keepBuild = false): string[] {
	const imported: string[] = [];
	const excludeSet = new Set(excludeDirs.map(d => resolve(src, d)));

	function walk(s: string, d: string): void {
		mkdirSync(d, { recursive: true });
		for (const entry of readdirSync(s, { withFileTypes: true })) {
			const name = entry.name;
			const srcPath = join(s, name);
			const dstPath = join(d, name);

			// Skip excluded absolute paths (e.g. packages/extensions/herdr)
			if (excludeSet.has(resolve(srcPath))) continue;
			// Skip excluded dirs
			if (entry.isDirectory()) {
				if (EXCLUDED_DIRS.has(name)) continue;
				if ((name === "dist" || name === "build") && !keepBuild) continue;
				walk(srcPath, dstPath);
			} else if (entry.isFile()) {
				if (EXCLUDED_FILES.has(name)) continue;
				if (name.endsWith(".map.js") || name.endsWith(".map")) continue;
				cpSync(srcPath, dstPath);
				imported.push(relative(dst, dstPath));
			}
		}
	}

	walk(src, dst);
	return imported;
}

/** List all files in a directory recursively (for UPSTREAM.json importedPaths). */
function listFiles(dir: string, base = dir): string[] {
	const files: string[] = [];
	if (!existsSync(dir)) return files;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(path, base));
		} else if (entry.isFile()) {
			files.push(relative(base, path));
		}
	}
	return files.sort();
}

function writeUpstreamJson(pluginDir: string, meta: UpstreamMeta): void {
	const sorted: UpstreamMeta = {
		...meta,
		importedPaths: meta.importedPaths.sort(),
	};
	writeFileSync(join(pluginDir, "UPSTREAM.json"), JSON.stringify(sorted, null, 2) + "\n");
}

function findLicense(srcDir: string): string | null {
	for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "COPYING"]) {
		const p = join(srcDir, name);
		if (existsSync(p)) return p;
	}
	// Search one level up for monorepos
	const parent = dirname(srcDir);
	for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
		const p = join(parent, name);
		if (existsSync(p)) return p;
	}
	return null;
}

// ── Import logic ───────────────────────────────────────────────────────────

async function importNpm(slug: string, source: NpmSource, pluginDir: string): Promise<void> {
	log(`[npm] ${slug}: downloading ${source.url}`);
	const tarball = await download(source.url);
	verifyIntegrity(tarball, source.integrity, slug);

	const extractDir = join(tmpdir(), `ezxomp-${slug}-${Date.now()}`);
	extractTar(tarball, extractDir);
	const archiveRoot = findArchiveRoot(extractDir);

	// Copy source
	const imported = copySource(archiveRoot, pluginDir);

	// Copy license verbatim
	const licensePath = findLicense(archiveRoot);
	if (licensePath && existsSync(licensePath)) {
		cpSync(licensePath, join(pluginDir, basename(licensePath)));
	}

	writeUpstreamJson(pluginDir, {
		originalName: source.package,
		url: source.url,
		version: source.version,
		integrity: source.integrity,
		importedPaths: imported,
		localForkVersion: FORK_VERSIONS[slug],
	});

	rmSync(extractDir, { recursive: true, force: true });
	log(`[npm] ${slug}: imported ${imported.length} files → plugins/${slug}`);
}

async function importGit(slug: string, source: GitSource, pluginDir: string): Promise<void> {
	log(`[git] ${slug}: downloading ${source.url}`);
	const tarball = await download(source.url);
	verifyIntegrity(tarball, source.integrity, slug);

	const extractDir = join(tmpdir(), `ezxomp-${slug}-${Date.now()}`);
	extractTar(tarball, extractDir);
	const archiveRoot = findArchiveRoot(extractDir);

	// Verify commit-named archive root
	const expectedPrefix = source.repo.split("/")[1] + "-" + source.commit.substring(0, 7);
	if (!basename(archiveRoot).startsWith(source.repo.split("/")[1] + "-")) {
		// Some archives use full commit; just verify it contains the repo name
		if (!basename(archiveRoot).includes(source.repo.split("/")[1])) {
			err(`archive root mismatch for ${slug}: expected prefix ${expectedPrefix}, got ${basename(archiveRoot)}`);
		}
	}

	// Determine import root
	const srcRoot = source.importRoot === "." ? archiveRoot : join(archiveRoot, source.importRoot);
	if (!existsSync(srcRoot)) err(`importRoot not found for ${slug}: ${srcRoot}`);

	// Install deps then build if needed (plannotator)
	if (source.build) {
		log(`[git] ${slug}: installing deps in ${archiveRoot}`);
		const installR = spawnSync("bun", ["install", "--frozen-lockfile"], { cwd: archiveRoot, encoding: "utf-8", timeout: 120_000 });
		if (installR.status !== 0) {
			log(`[git] ${slug}: frozen install failed (status=${installR.status}, signal=${installR.signal}), retrying without lockfile`);
			const installR2 = spawnSync("bun", ["install"], { cwd: archiveRoot, encoding: "utf-8", timeout: 120_000 });
			if (installR2.status !== 0) {
				err(`install failed for ${slug}: status=${installR2.status}, signal=${installR2.signal}\nstderr:\n${installR2.stderr}\nstdout:\n${installR2.stdout}`);
			}
		}
		log(`[git] ${slug}: running build "${source.build}" in ${archiveRoot}`);
		const r = spawnSync("bun", ["run", source.build], { cwd: archiveRoot, encoding: "utf-8", timeout: 180_000 });
		if (r.status !== 0) {
			err(`build failed for ${slug}: status=${r.status}, signal=${r.signal}\nstderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
		}
		log(`[git] ${slug}: upstream build "${source.build}" succeeded`);
	}

	// Copy source (with excludes)
	const imported = copySource(srcRoot, pluginDir, source.exclude || [], source.build !== undefined);

	// Copy license verbatim
	const licensePath = findLicense(archiveRoot);
	if (licensePath && existsSync(licensePath)) {
		const licenseContent = readFileSync(licensePath);
		writeFileSync(join(pluginDir, basename(licensePath)), licenseContent);
	}

	writeUpstreamJson(pluginDir, {
		originalName: source.repo,
		url: source.url,
		commit: source.commit,
		integrity: source.integrity,
		importedPaths: imported,
		localForkVersion: FORK_VERSIONS[slug],
	});

	rmSync(extractDir, { recursive: true, force: true });
	log(`[git] ${slug}: imported ${imported.length} files → plugins/${slug}`);
}

async function importAll(): Promise<void> {
	const lock = loadLock();
	for (const [slug, source] of Object.entries(lock.sources)) {
		const pluginDir = join(PLUGINS_DIR, slug);
		if (existsSync(pluginDir) && readdirSync(pluginDir).length > 0) {
			err(`plugins/${slug} already exists and is non-empty; initial import requires every destination absent`);
		}
		mkdirSync(pluginDir, { recursive: true });
		if (source.type === "npm") {
			await importNpm(slug, source, pluginDir);
		} else {
			await importGit(slug, source, pluginDir);
		}
	}
	log("\nAll 7 sources imported successfully.");
}

// ── Verify logic ───────────────────────────────────────────────────────────

async function verifyAll(): Promise<void> {
	const lock = loadLock();
	let failures = 0;
	for (const [slug, source] of Object.entries(lock.sources)) {
		const pluginDir = join(PLUGINS_DIR, slug);
		const upstreamPath = join(pluginDir, "UPSTREAM.json");
		if (!existsSync(upstreamPath)) {
			log(`[verify] ${slug}: MISSING UPSTREAM.json — run import first`);
			failures++;
			continue;
		}

		log(`[verify] ${slug}: downloading ${source.url}`);
		const tarball = await download(source.url);
		try {
			verifyIntegrity(tarball, source.integrity, slug);
		} catch (e) {
			log(`[verify] ${slug}: INTEGRITY FAIL — ${(e as Error).message}`);
			failures++;
			continue;
		}

		// Reproduce UPSTREAM.json metadata deterministically
		const extractDir = join(tmpdir(), `ezxomp-verify-${slug}-${Date.now()}`);
		extractTar(tarball, extractDir);
		const archiveRoot = findArchiveRoot(extractDir);
		const srcRoot = source.type === "git" && source.importRoot !== "."
			? join(archiveRoot, source.importRoot)
			: archiveRoot;

		// Build if needed
		if (source.type === "git" && source.build) {
			spawnSync("bun", ["run", source.build], { cwd: archiveRoot, encoding: "utf-8", timeout: 120_000 });
		}

		const expectedMeta: UpstreamMeta = {
			originalName: source.type === "npm" ? source.package : source.repo,
			url: source.url,
			version: source.type === "npm" ? source.version : undefined,
			commit: source.type === "git" ? source.commit : undefined,
			integrity: source.integrity,
			importedPaths: listFiles(pluginDir).filter(f => f !== "UPSTREAM.json"),
			localForkVersion: FORK_VERSIONS[slug],
		};

		const existing = JSON.parse(readFileSync(upstreamPath, "utf-8")) as UpstreamMeta;
		const expectedJson = JSON.stringify({
			...expectedMeta,
			importedPaths: expectedMeta.importedPaths.sort(),
		}, null, 2);
		const existingJson = JSON.stringify({
			...existing,
			importedPaths: existing.importedPaths.sort(),
		}, null, 2);

		// Note: verify checks integrity + metadata fields, NOT file-by-file fork comparison
		const metaMatches = existing.originalName === expectedMeta.originalName
			&& existing.url === expectedMeta.url
			&& existing.integrity === expectedMeta.integrity
			&& existing.localForkVersion === expectedMeta.localForkVersion
			&& (existing.version || "") === (expectedMeta.version || "")
			&& (existing.commit || "") === (expectedMeta.commit || "");

		if (metaMatches) {
			log(`[verify] ${slug}: OK (integrity + metadata match)`);
		} else {
			log(`[verify] ${slug}: METADATA MISMATCH`);
			failures++;
		}

		rmSync(extractDir, { recursive: true, force: true });
	}

	if (failures > 0) {
		err(`${failures} source(s) failed verification`);
	}
	log("\nAll 7 sources verified successfully.");
}

// ── Stage logic ────────────────────────────────────────────────────────────

async function stage(slug: string, outDir: string): Promise<void> {
	const lock = loadLock();
	const source = lock.sources[slug];
	if (!source) err(`unknown plugin: ${slug}`);

	// Containment guard: --out must not resolve to the `plugins/` directory
	// or any descendant of it (including `plugins` itself). We compare both
	// sides as absolute, normalized paths with a trailing separator so a
	// relative user input like `plugins/plannotator` cannot bypass the
	// check, and a sibling like `plugins-old/foo` does not falsely match.
	const pluginsRoot = resolve(ROOT, PLUGINS_DIR) + sep;
	const resolvedOut = resolve(ROOT, outDir);
	if ((resolvedOut + sep).startsWith(pluginsRoot)) {
		err(`stage --out must not resolve inside plugins/ (got ${outDir} → ${resolvedOut})`);
	}

	log(`[stage] ${slug}: downloading ${source.url}`);
	const tarball = await download(source.url);
	verifyIntegrity(tarball, source.integrity, slug);

	const extractDir = join(tmpdir(), `ezxomp-stage-${slug}-${Date.now()}`);
	extractTar(tarball, extractDir);
	const archiveRoot = findArchiveRoot(extractDir);

	if (source.type === "git" && source.build) {
		log(`[stage] ${slug}: bun install in ${archiveRoot}`);
		const installR = spawnSync("bun", ["install"], {
			cwd: archiveRoot,
			encoding: "utf-8",
			timeout: 120_000,
		});
		if (installR.status !== 0) {
			err(
				`stage ${slug}: bun install failed (status=${installR.status}, signal=${installR.signal})\n` +
					`stdout:\n${installR.stdout ?? ""}\nstderr:\n${installR.stderr ?? ""}`,
			);
		}
		log(`[stage] ${slug}: bun install succeeded`);
		log(`[stage] ${slug}: running build "${source.build}" in ${archiveRoot}`);
		const buildR = spawnSync("bun", ["run", source.build], {
			cwd: archiveRoot,
			encoding: "utf-8",
			timeout: 180_000,
		});
		if (buildR.status !== 0) {
			err(
				`stage ${slug}: upstream build "${source.build}" failed (status=${buildR.status}, signal=${buildR.signal})\n` +
					`stdout:\n${buildR.stdout ?? ""}\nstderr:\n${buildR.stderr ?? ""}`,
			);
		}
		log(`[stage] ${slug}: upstream build succeeded`);
	}
	const srcRoot = source.type === "git" && source.importRoot !== "."
		? join(archiveRoot, source.importRoot)
		: archiveRoot;

	mkdirSync(resolvedOut, { recursive: true });
	copySource(srcRoot, resolvedOut, source.type === "git" ? source.exclude : [], source.type === "git" && source.build !== undefined);
	rmSync(extractDir, { recursive: true, force: true });
	log(`[stage] ${slug}: fresh source → ${resolvedOut}`);
}

// ── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (process.argv[1] && process.argv[1].includes("import-upstreams")) {
	// Called directly as script
}

const command = args[0];
if (command === "--all" || command === "import") {
	importAll().catch(e => err((e as Error).message));
} else if (command === "import-plugin" || command === "import-one") {
	// Import a single plugin (already-fetched others remain untouched)
	const slug = args[1];
	if (!slug) err("usage: import-plugin <slug>");
	const lock = loadLock();
	const source = lock.sources[slug];
	if (!source) err(`unknown plugin: ${slug}`);
	const pluginDir = join(PLUGINS_DIR, slug);
	if (existsSync(pluginDir) && readdirSync(pluginDir).length > 0) err(`plugins/${slug} already exists`);
	mkdirSync(pluginDir, { recursive: true });
	(source.type === "npm" ? importNpm(slug, source, pluginDir) : importGit(slug, source, pluginDir)).catch(e => err((e as Error).message));
} else if (command === "verify" || command === "import:check") {
	verifyAll().catch(e => err((e as Error).message));
} else if (command === "stage") {
	const slug = args[1];
	const outIdx = args.indexOf("--out");
	const outDir = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, `staged-${slug}`);
	if (!slug) err("usage: stage <plugin> --out <dir>");
	stage(slug, outDir).catch(e => err((e as Error).message));
} else {
	err(`usage: import-upstreams.ts [--all | import-plugin <slug> | verify | stage <slug> --out <dir>]`);
}

export { importAll, verifyAll, stage };
