#!/usr/bin/env bun
/**
 * scripts/build-bundle.mjs — produce `index.bundle.js` for marketplace delivery.
 *
 * Why: OMP's marketplace install copies the plugin directory from
 * `marketplaceClonePath` verbatim and does not run `bun install`. Plannotator's
 * runtime depends on npm packages (parse5, turndown, chokidar, diff,
 * @pierre/diffs, @plannotator/webtui, @joplin/turndown-plugin-gfm) that must
 * therefore be inlined into the extension entry. OMP peers (@oh-my-pi/*) and
 * the optional lazy AI SDKs (@anthropic-ai/claude-agent-sdk, @opencode-ai/sdk,
 * omp-legacy-pi-modules) stay external so they resolve from the host runtime.
 *
 * The `@plannotator/webtui/server` subpath transitively requires `node-pty`
 * and `ws` at module top. `node-pty` is a native binding (compiled `.node`
 * binary plus platform-specific glue) and `ws` is pure JavaScript; both must
 * NOT be inlined into a portable marketplace bundle because the inlined
 * native code embeds an absolute `__dirname` pointing at the build machine
 * and requires a host-compiled `.node` matching the consumer platform/arch.
 * A small Bun resolver plugin replaces the entire `@plannotator/webtui/server`
 * subpath with `scripts/optional-stubs/webtui-server.mjs`, which throws
 * `WebtuiServerUnavailableError` and a deterministic message. plannotator
 * only loads this subpath via a guarded lazy dynamic import in
 * `server/agent-terminal.ts`; the existing lazy catch returns
 * `reason: "pty-unavailable"`, so the bundled marketplace intentionally
 * surfaces pty-unavailable — it cannot use the host webtui install because
 * the stub is inlined and the real package is external.
 *
 * Output: `plugins/plannotator/index.bundle.js` — tracked as a runtime
 * artifact (same lifecycle as `generated/` and the browser HTML assets).
 *
 * Usage:
 *   bun run scripts/build-bundle.mjs                # build current sources
 *   bun run scripts/build-bundle.mjs --check        # content-hash verification
 *   bun run scripts/build-bundle.mjs --print-hash   # print current bundle sha256
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "index.ts");
const outfile = resolve(root, "index.bundle.js");
const stubFile = resolve(root, "scripts/optional-stubs/webtui-server.mjs");

function sha256(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** @type {import("bun").BunPlugin} */
const redirectWebtuiServer = {
	name: "redirect-webtui-server",
	setup(b) {
		b.onResolve({ filter: /^@plannotator\/webtui\/server($|\/)/ }, () => ({
			path: stubFile,
		}));
	},
};

const buildOptions = {
	entrypoints: [entry],
	target: "bun",
	format: "esm",
	minify: false,
	sourcemap: "none",
	plugins: [redirectWebtuiServer],
	external: [
		"@oh-my-pi/*",
		"@anthropic-ai/claude-agent-sdk",
		"@opencode-ai/sdk",
		"omp-legacy-pi-modules",
		"bun",
		"node:*",
	],
};

async function build() {
	const result = await Bun.build({
		...buildOptions,
		outdir: root,
		naming: "[dir]/[name].bundle.js",
	});
	if (!result.success) {
		console.error("bundle build failed:");
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	const outPath = result.outputs[0]?.path ?? outfile;
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
	if (!existsSync(stubFile)) {
		console.error(`FAIL: ${stubFile} not found`);
		process.exit(1);
	}
	// Content-equivalence check: rebuild to a temp path, compare sha256,
	// and ALWAYS remove the temp file in `finally` so we never leak a
	// tracked-size `plugins/plannotator/index.bundle.js.__check__`.
	const tmpPath = resolve(root, "index.bundle.js.__check__");
	try {
		const result = await Bun.build({
			...buildOptions,
			outdir: root,
			naming: "[dir]/[name].bundle.js.__check__",
		});
		if (!result.success) {
			console.error("bundle rebuild for check failed:");
			for (const log of result.logs) console.error(log);
			process.exit(1);
		}
		const freshPath = result.outputs[0]?.path ?? tmpPath;
		const freshDigest = sha256(freshPath);
		const trackedDigest = sha256(outfile);
		if (freshDigest !== trackedDigest) {
			console.error(
				`FAIL: bundle content drift.\n  tracked: ${trackedDigest}\n  fresh:   ${freshDigest}`,
			);
			process.exit(1);
		}
		// Content hash is definitive; no separate mtime freshness check.
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
