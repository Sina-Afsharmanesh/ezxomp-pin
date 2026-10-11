import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * The `stage --out <dir>` command writes a fresh upstream source snapshot to
 * `<dir>`. It must NEVER resolve inside the working tree's `plugins/`
 * directory, otherwise an accidental overwrite of the live plugin source is
 * possible. The check must reject:
 *   - absolute paths under plugins/  (e.g. /…/plugins/plannotator)
 *   - relative paths that resolve under plugins/ (e.g. `plugins/plannotator`,
 *     `./plugins/plannotator`, `plugins/../plugins/plannotator`)
 * and must NOT reject:
 *   - absolute paths outside plugins/
 *   - paths that share the `plugins` prefix but are siblings (e.g.
 *     `pluginsX` → `/…/pluginsX`)
 */

function stage(slug: string, outDir: string): { status: number; stderr: string } {
	const r = spawnSync(
		"bun",
		["run", "scripts/import-upstreams.ts", "stage", slug, "--out", outDir],
		{ cwd: ROOT, encoding: "utf-8", timeout: 5000 },
	);
	return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

describe("stage --out containment check", () => {
	const slug = "plannotator"; // any slug; check fires before download

	test("rejects relative path inside plugins/", () => {
		const r = stage(slug, "plugins/plannotator");
		expect(r.status).not.toBe(0);
		expect(r.stderr).toMatch(/must not resolve inside plugins\//);
	});

	test("rejects absolute path inside plugins/", () => {
		const r = stage(slug, `${ROOT}/plugins/plannotator`);
		expect(r.status).not.toBe(0);
		expect(r.stderr).toMatch(/must not resolve inside plugins\//);
	});

	test("rejects bare plugins/ directory", () => {
		const r = stage(slug, `${ROOT}/plugins`);
		expect(r.status).not.toBe(0);
		expect(r.stderr).toMatch(/must not resolve inside plugins\//);
	});

	test("rejects traversal that resolves inside plugins/", () => {
		const r = stage(slug, "plugins/../plugins/plannotator");
		expect(r.status).not.toBe(0);
		expect(r.stderr).toMatch(/must not resolve inside plugins\//);
	});

	test("rejects absolute /plugins/ root with trailing slash", () => {
		const r = stage(slug, `${ROOT}/plugins/`);
		expect(r.status).not.toBe(0);
		expect(r.stderr).toMatch(/must not resolve inside plugins\//);
	});

	// We don't assert the negative (accept) cases here because a successful
	// `stage` call begins downloading a tarball, which is too slow for unit
	// tests. The manual harness in test/manifest.test.ts and the root README
	// cover the accept path.
});
