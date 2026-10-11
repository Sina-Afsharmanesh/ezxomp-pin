#!/usr/bin/env bun
/**
 * scripts/build-bundle.mjs — produce `codesight.bundle.js` for marketplace delivery.
 *
 * Why: OMP's marketplace install copies the plugin directory from
 * `marketplaceClonePath` verbatim and does not run `bun install`. The
 * CodeSight analyzer CLI (pinned as `codesight@1.19.0` upstream) used to be
 * resolved two ways at runtime — `require.resolve('codesight/package.json')`
 * (which only worked inside the workspace thanks to a gitignored symlink)
 * and the `cliStrategy=npx` fallback (which downloaded from npm on first
 * use). Neither survives marketplace install in a flat cache dir with no
 * node_modules and no network.
 *
 * Bundling the analyzer into a git-tracked `codesight.bundle.js` removes
 * both fallbacks: the plugin now resolves one local file at runtime. The
 * `codesight` npm package stays in `devDependencies` so the build script
 * can find it during this repo's `bun install`, and the bundle is treated
 * as a runtime artifact (same lifecycle as `plannotator/index.bundle.js`).
 *
 * Output: `plugins/codesight/codesight.bundle.js` — tracked as a runtime
 * artifact, committed, and shipped via the `files` array.
 *
 * Usage:
 *   bun run scripts/build-bundle.mjs              # build current source
 *   bun run scripts/build-bundle.mjs --check      # SHA-256 content-hash verify
 *   bun run scripts/build-bundle.mjs --print-hash # print tracked bundle sha256
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleEntry = resolve(root, "node_modules", "codesight", "dist", "index.js");
const outfile = resolve(root, "codesight.bundle.js");

// Pinned to upstream `codesight@1.19.0` (see plugins/codesight/UPSTREAM.json).
// Replaces the runtime `require("../package.json")` (whose relative path
// now points outside the plugin root after bundling) with a baked-in stub.
const BUNDLED_VERSION = "1.19.0";

/**
 * Upstream `dist/core.js` opens with
 *
 *   const _require = createRequire(import.meta.url);
 *   const _pkg = _require("../package.json");
 *   export const VERSION = _pkg.version;
 *
 * Bun.build ships the file at the plugin root instead of one level inside
 * `dist/`, so the relative require would resolve to `<plugin>/../package.json`,
 * which the flat-cache install never sees. Bun's minifier hoists the
 * declaration to a `var _require, _pkg, VERSION, ...` block and leaves the
 * assignment inside the ESM init closure. Swap the assignment for a stub
 * object so the bundle reports the pinned version without any runtime
 * filesystem lookup.
 */
const REQUIRE_PATTERN = /^\s*_pkg = _require\("\.\.\/package\.json"\);$/m;

const INLINE_REPLACEMENT = `_pkg = /* codesight-pkg-stub (build-time) */ { name: "codesight", version: "${BUNDLED_VERSION}" };`;

const UNSAFE_CONFIG_LOADER = `async function loadConfig(root) {
  for (const filename of CONFIG_FILES) {
    const configPath = join6(root, filename);
    if (!await fileExists3(configPath))
      continue;
    try {
      if (filename.endsWith(".json")) {
        const content = await readFile4(configPath, "utf-8");
        return JSON.parse(content);
      }
      if (filename.endsWith(".ts")) {
        return await loadTsConfig(configPath, root);
      }
      const module = await import(pathToFileURL(configPath).href);
      return module.default || module;
    } catch (err) {
      console.warn(\`  Warning: failed to load \${filename}: \${err.message}\`);
      return {};
    }
  }
  try {
    const pkgPath = join6(root, "package.json");
    if (await fileExists3(pkgPath)) {
      const pkg = JSON.parse(await readFile4(pkgPath, "utf-8"));
      if (pkg.codesight && typeof pkg.codesight === "object") {
        return pkg.codesight;
      }
    }
  } catch {}
  return {};
}`;

const SAFE_CONFIG_LOADER = `async function loadConfig(root) {
  for (const filename of CONFIG_FILES) {
    const configPath = join6(root, filename);
    if (!await fileExists3(configPath))
      continue;
    try {
      const content = await readFile4(configPath, "utf-8");
      if (filename.endsWith(".json"))
        return JSON.parse(content);
      const parsed = safeParseConfigText(content);
      if (Object.keys(parsed).length > 0)
        return parsed;
      console.warn(\`  Warning: ignored \${filename}: only JSON or static export default object literals are supported\`);
      return {};
    } catch (err) {
      console.warn(\`  Warning: failed to load \${filename}: \${err.message}\`);
      return {};
    }
  }
  try {
    const pkgPath = join6(root, "package.json");
    if (await fileExists3(pkgPath)) {
      const pkg = JSON.parse(await readFile4(pkgPath, "utf-8"));
      if (pkg.codesight && typeof pkg.codesight === "object") {
        return pkg.codesight;
      }
    }
  } catch {}
  return {};
}`;

const UNSAFE_TS_CONFIG_LOADER = `async function loadTsConfig(configPath, _root) {
  try {
    const module = await import(pathToFileURL(configPath).href);
    return module.default || module;
  } catch {}
  const content = await readFile4(configPath, "utf-8");
  const parsed = safeParseConfigText(content);
  if (Object.keys(parsed).length > 0)
    return parsed;
  console.warn(\`  Warning: cannot load codesight.config.ts (install tsx for full TS config support, or use codesight.config.json)\`);
  return {};
}`;

const SAFE_TS_CONFIG_LOADER = `async function loadTsConfig(configPath, _root) {
  const content = await readFile4(configPath, "utf-8");
  const parsed = safeParseConfigText(content);
  if (Object.keys(parsed).length > 0)
    return parsed;
  console.warn(\`  Warning: ignored codesight.config.ts: only static export default object literals are supported\`);
  return {};
}`;

const UNSAFE_CONFIG_HELP = `  Config (.codesightignore / codesight.config.json):
    Reads codesight.config.(ts|js|json) or package.json "codesight" field.`;

const SAFE_CONFIG_HELP = `  Config (.codesightignore / codesight.config.json):
    Reads codesight.config.json, static codesight.config.(ts|js|mjs) literals, or package.json "codesight" field.`;

function sha256(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const buildOptions = {
	entrypoints: [bundleEntry],
	target: "bun",
	format: "esm",
	minify: false,
	sourcemap: "none",
	external: ["bun", "node:*"],
};

function rewriteRequiredPkg(source) {
	if (!REQUIRE_PATTERN.test(source)) {
		throw new Error(
			`expected upstream \`_pkg = _require("../package.json");\` after build; upstream source shape changed.`,
		);
	}
	return source.replace(REQUIRE_PATTERN, INLINE_REPLACEMENT);
}

function replaceOnce(source, search, replacement, description) {
	const count = source.split(search).length - 1;
	if (count !== 1) {
		throw new Error(`expected exactly one ${description}; found ${count}. Upstream source shape changed.`);
	}
	return source.replace(search, replacement);
}

const WATCHER_ERROR_ANCHOR = [
  '    changedFiles.push(filename);',
  '    if (debounceTimer)',
  '      clearTimeout(debounceTimer);',
  '    debounceTimer = setTimeout(runScan, 500);',
  '  });',
].join("\n");

// ezxomp patch: upstream attachs no "error" handler to the recursive FSWatcher
// in watchMode. Under inotify exhaustion (ENOSPC — common on tmpfs or
// watch-heavy desktops) the emitted "error" event is unhandled and crashes
// the process, which the OMP plugin watcher retry loop turns into a
// watching/error flap. Degrade ENOSPC to a logged warning and keep
// watching instead.
const WATCHER_ERROR_PATCH = [
  WATCHER_ERROR_ANCHOR,
  '  watcher.on("error", (err) => {',
    '    if ((err == null ? void 0 : err.code) === "ENOSPC") {',
      '      console.error("  codesight: file watcher hit the inotify limit (ENOSPC); some changes may be missed. Raise fs.inotify.max_user_watches / max_user_instances.");',
    '      return;',
    '    }',
    '    throw err;',
  '  });',
].join("\n");

function rewriteWatcherErrorHandling(source) {
	return replaceOnce(source, WATCHER_ERROR_ANCHOR, WATCHER_ERROR_PATCH, "watchMode change debounce callback");
}
function rewriteProjectConfigLoader(source) {
	let next = replaceOnce(source, UNSAFE_CONFIG_LOADER, SAFE_CONFIG_LOADER, "unsafe project config loader");
	next = replaceOnce(next, UNSAFE_TS_CONFIG_LOADER, SAFE_TS_CONFIG_LOADER, "unsafe TypeScript config loader");
	next = replaceOnce(next, UNSAFE_CONFIG_HELP, SAFE_CONFIG_HELP, "project config help text");
	if (next.includes("import(pathToFileURL(configPath).href)")) {
		throw new Error("unsafe project config dynamic import survived bundle rewrite.");
	}
	return next;
}

async function buildOnce({ outDir, name }) {
	if (!existsSync(bundleEntry)) {
		console.error(
			`FAIL: ${bundleEntry} not found.\n` +
				`Install codesight@1.19.0 (e.g. \`bun install -g codesight@1.19.0\` or add to devDependencies) before building.`,
		);
		process.exit(1);
	}
	const result = await Bun.build({
		...buildOptions,
		outdir: outDir,
		naming: name,
	});
	if (!result.success) {
		console.error("bundle build failed:");
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	return result.outputs[0]?.path ?? resolve(outDir, name);
}

async function build() {
	const outPath = await buildOnce({ outDir: root, name: "codesight.bundle.js" });
	const rewritten = rewriteWatcherErrorHandling(rewriteProjectConfigLoader(rewriteRequiredPkg(readFileSync(outPath, "utf-8"))));
	await Bun.write(outPath, rewritten);
	const { size } = statSync(outPath);
	const digest = sha256(outPath);
	console.log(
		`built ${outPath} (${(size / 1024 / 1024).toFixed(2)} MiB, sha256=${digest.slice(0, 16)}…)`,
	);
}

async function check() {
	if (!existsSync(outfile)) {
		console.error(`FAIL: ${outfile} not found — run scripts/build-bundle.mjs`);
		process.exit(1);
	}
	// Content-equivalence check: rebuild to a temp path, apply the same
	// require-replacement, compare SHA-256, and ALWAYS remove the temp file
	// in `finally` so we never leak a tracked-size
	// `codesight.bundle.js.__check__`.
	const tmpPath = resolve(root, "codesight.bundle.js.__check__");
	try {
		await buildOnce({ outDir: root, name: "codesight.bundle.js.__check__" });
		const rewritten = rewriteWatcherErrorHandling(rewriteProjectConfigLoader(rewriteRequiredPkg(readFileSync(tmpPath, "utf-8"))));
		await Bun.write(tmpPath, rewritten);
		const freshDigest = sha256(tmpPath);
		const trackedDigest = sha256(outfile);
		if (freshDigest !== trackedDigest) {
			console.error(
				`FAIL: bundle content drift.\n  tracked: ${trackedDigest}\n  fresh:   ${freshDigest}`,
			);
			process.exit(1);
		}
		console.log("ok (content hash matches a fresh rebuild)");
	} finally {
		rmSync(tmpPath, { force: true });
	}
}

function printHash() {
	if (!existsSync(outfile)) {
		console.error(`FAIL: ${outfile} not found`);
		process.exit(1);
	}
	console.log(sha256(outfile));
}

const arg = process.argv[2];
if (arg === "--check") {
	await check();
} else if (arg === "--print-hash") {
	printHash();
} else {
	await build();
}
