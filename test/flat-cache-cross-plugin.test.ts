/**
 * test/flat-cache-cross-plugin.test.ts — regression: OMP flat-cache extension load.
 *
 * OMP installs each marketplace plugin by copying its source into a flat cache
 * directory under `~/.omp/plugins/cache/plugins/<mkt>___<slug>___<ver>/` and
 * creating `~/.omp/plugins/node_modules/@ezxomp/<slug>` symlinks pointing at
 * the cache copy. The cache dir's basename is the encoded `mkt___slug___ver`
 * string, NOT just the slug — so any workspace-relative cross-plugin import
 * like `../../<other-plugin>/...` would need to traverse through both
 * `cache/plugins/` and a `___`-delimited directory, and would fail because
 * the sibling plugin dirs are gone.
 *
 * This test mirrors that exact layout under a unique `mkdtempSync` fixture:
 *   <root>/cache/plugins/ezxomp___<slug>___fixture/   — copied plugin source
 *   <root>/node_modules/@ezxomp/<slug>                — symlink → cache copy
 *   <root>/node_modules/@oh-my-pi/                    — symlink → repo-local @oh-my-pi
 *   <root>/node_modules/<top>                         — symlink → repo-local top-level dep
 *
 * The triple-underscore basename is the load-bearing detail: it makes
 * `../../experiences/...` structurally
 * unresolvable from inside the cache copy, so only the
 * `@ezxomp/<other>/...` package form can succeed. The fixture is torn down
 * in `afterEach`. No state outside the test's own tmp dir is ever read or
 * written, and the test never references `$HOME` or `~/.omp` — it passes
 * cleanly with `HOME=$(mktemp -d)`.
 *
 * Inspired by the load-test pattern in skill://omp-plugin-self-containment.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS = join(ROOT, "plugins");
const REPO_NODE_MODULES = join(ROOT, "node_modules");

interface PluginFixture {
	readonly slug: string;
	readonly deps: readonly string[];
}

const PLUGIN_FIXTURES: readonly PluginFixture[] = [
	{ slug: "extensible-workflows", deps: ["experiences", "agent-learning"] },
	// Consolidated learning package: cross-imports experiences' overlay host.
	{ slug: "agent-learning", deps: ["experiences"] },
];

/**
 * OMP-style cache dir name: `ezxomp___<slug>___fixture`. The triple-underscore
 * separator plus the `plugins/` parent breaks any `../../<other-plugin>/...`
 * relative path because the parent of the cache copy is `plugins/`, not the
 * sibling plugin dir.
 */
function cacheDirName(slug: string): string {
	return `ezxomp___${slug}___fixture`;
}

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function makeFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ezxomp-flatcache-"));
	temporaryRoots.push(root);
	const cachePlugins = join(root, "cache", "plugins");
	const nodeModules = join(root, "node_modules");
	mkdirSync(cachePlugins, { recursive: true });
	mkdirSync(join(nodeModules, "@ezxomp"), { recursive: true });

	const slugs = new Set<string>();
	for (const fixture of PLUGIN_FIXTURES) {
		slugs.add(fixture.slug);
		for (const dep of fixture.deps) slugs.add(dep);
	}

	// 1. Copy each plugin into an OMP-style cache dir under
	//    `cache/plugins/ezxomp___<slug>___fixture/`. The basename deliberately
	//    does NOT match the slug so `../../<other>/...` cannot walk back to a
	//    sibling plugin dir. Prune the embedded `node_modules/` (broken
	//    @bun/... symlinks would short-circuit Bun's node_modules walk).
	for (const slug of slugs) {
		const sourceDir = join(PLUGINS, slug);
		if (!existsSync(sourceDir)) continue;
		const targetDir = join(cachePlugins, cacheDirName(slug));
		cpSync(sourceDir, targetDir, { recursive: true });
		rmSync(join(targetDir, "node_modules"), { recursive: true, force: true });
		symlinkSync(targetDir, join(nodeModules, "@ezxomp", slug), "dir");
	}

	// 2. Symlink repo-local @oh-my-pi/* so transitive peer imports inside
	//    the cache copies resolve from the repo's own install.
	const repoOh = join(REPO_NODE_MODULES, "@oh-my-pi");
	if (existsSync(repoOh)) {
		mkdirSync(join(nodeModules, "@oh-my-pi"), { recursive: true });
		for (const entry of readdirSync(repoOh)) {
			symlinkSync(join(repoOh, entry), join(nodeModules, "@oh-my-pi", entry), "dir");
		}
	}

	// 3. Symlink repo-local top-level deps (koffi, protobufjs, etc.) so any
	//    transitive dep outside @oh-my-pi also resolves from the repo.
	for (const entry of readdirSync(REPO_NODE_MODULES)) {
		if (entry.startsWith("@")) continue;
		if (entry === ".bin") continue;
		symlinkSync(join(REPO_NODE_MODULES, entry), join(nodeModules, entry), "dir");
	}

	return root;
}

interface LoadResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

function loadEntry(fixtureRoot: string, slug: string, entry: string): LoadResult {
	const symlinkDir = join(fixtureRoot, "node_modules", "@ezxomp", slug);
	const nodeModulesDir = join(fixtureRoot, "node_modules");
	const normalizedEntry = entry.startsWith(".") ? entry : `./${entry}`;
	const code = `await import(${JSON.stringify(normalizedEntry)});`;
	const result = spawnSync("bun", ["-e", code], {
		cwd: symlinkDir,
		env: {
			...process.env,
			NODE_PATH: [nodeModulesDir, REPO_NODE_MODULES].join(":"),
		},
		encoding: "utf-8",
		timeout: 30_000,
	}) as SpawnSyncReturns<string>;
	return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function readPackageExtensions(slug: string): readonly string[] {
	const pkg = JSON.parse(readFileSync(join(PLUGINS, slug, "package.json"), "utf-8")) as {
		omp?: { extensions?: unknown };
	};
	const ext = pkg.omp?.extensions;
	if (!Array.isArray(ext) || ext.length === 0) throw new Error(`Plugin ${slug} declares no omp.extensions`);
	return ext as string[];
}

describe("flat-cache cross-plugin extension load", () => {
	for (const fixture of PLUGIN_FIXTURES) {
		for (const entry of readPackageExtensions(fixture.slug)) {
			test(`${fixture.slug} loads ${entry} from a flat-cache fixture`, () => {
				const fixtureRoot = makeFixture();
				const result = loadEntry(fixtureRoot, fixture.slug, entry);
				expect(result.status).toBe(0);
				expect(result.stderr).toBe("");
			});
		}
	}
});
