/**
 * test/manifest.test.ts — validates on-disk package.json#omp manifests for all marketplace plugins.
 * No network access required.
 */
import { describe, test, expect } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");

const EXPECTED_PLUGINS = [
 "code-nav",
 "codesight", "experiences", "agent-learning", "compact-eng", "extensible-workflows",
 "plannotator", "augment", "evo", "cook", "backlog", "pstack-suite",
 "gsd-web", "gsd-browser", "gsd-loop", "gsd-graph", "better-custom",
];

const EXPECTED_PACKAGE_IDS: Record<string, string> = {
 "code-nav": "@ezxomp/code-nav", codesight: "@ezxomp/codesight",
 experiences: "@ezxomp/experiences", "agent-learning": "@ezxomp/agent-learning",
 "compact-eng": "@ezxomp/compact-eng",
 "extensible-workflows": "@ezxomp/extensible-workflows",
 plannotator: "@ezxomp/plannotator",
 augment: "@ezxomp/augment",
 evo: "@ezxomp/evo",
 cook: "@ezxomp/cook",
 backlog: "@ezxomp/backlog",
 "pstack-suite": "@ezxomp/pstack-suite",
 "gsd-web": "@ezxomp/gsd-web",
 "gsd-browser": "@ezxomp/gsd-browser",
 "gsd-loop": "@ezxomp/gsd-loop",
 "gsd-graph": "@ezxomp/gsd-graph",
 "better-custom": "@ezxomp/better-custom",
};

const EXPECTED_VERSIONS: Record<string, string> = {
 "code-nav": "0.5.0-ezxomp.0", codesight: "0.2.2-ezxomp.0",
 experiences: "0.1.49-ezxomp.1", "agent-learning": "0.1.0-ezxomp.0",
 "compact-eng": "2.0.0-ezxomp.0",
 "extensible-workflows": "5.1.0-ezxomp.3",
 plannotator: "0.25.1-ezxomp.2",
 augment: "1.0.9-ezxomp.0",
 evo: "0.1.7-ezxomp.5",
 cook: "0.1.7-ezxomp.8",
 backlog: "0.1.0-ezxomp.0",
 "pstack-suite": "1.0.0-ezxomp.0",
 "gsd-web": "5.2.0-ezxomp.1",
 "gsd-browser": "0.1.0-ezxomp.0",
 "gsd-loop": "0.1.0-ezxomp.0",
 "gsd-graph": "0.1.0-ezxomp.0",
 "better-custom": "0.1.3-ezxomp.0",
};

interface PkgJson {
 name: string; version: string;
 files?: string[];
 omp?: { extensions?: string[]; settings?: Record<string, unknown> };
 pi?: unknown; peerDependencies?: Record<string, string>;
}

describe("plugin manifests", () => {
 for (const slug of EXPECTED_PLUGINS) {
  test(`${slug} has valid OMP manifest`, () => {
   const pkgPath = join(PLUGINS_DIR, slug, "package.json");
   expect(existsSync(pkgPath)).toBe(true);
   const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PkgJson;
   expect(pkg.name).toBe(EXPECTED_PACKAGE_IDS[slug]);
   expect(pkg.version).toBe(EXPECTED_VERSIONS[slug]);
   expect(pkg.pi).toBeUndefined();
   expect(pkg.omp).toBeDefined();
   expect(pkg.omp?.extensions).toBeDefined();
   expect(pkg.omp!.extensions!.length).toBeGreaterThan(0);
   for (const ext of pkg.omp!.extensions!) {
    expect(existsSync(join(PLUGINS_DIR, slug, ext))).toBe(true);
   }
   if (pkg.peerDependencies) {
    for (const dep of Object.keys(pkg.peerDependencies)) {
     expect(dep.startsWith("@earendil-works/")).toBe(false);
     expect(dep.startsWith("@mariozechner/")).toBe(false);
    }
   }
  });
 }

 test("codesight has display settings and bundled runtime artifact", () => {
  const pkg = JSON.parse(readFileSync(join(PLUGINS_DIR, "codesight", "package.json"), "utf-8")) as PkgJson;
  const settings = pkg.omp?.settings;
  expect(settings).toBeDefined();
  for (const key of ["watchFiles", "regenerateWiki", "showFooter", "showStartupModal", "notifyOnWatchError"]) {
   expect(settings![key]).toBeDefined();
   expect((settings![key] as { type: string }).type).toBe("boolean");
   expect((settings![key] as { default: boolean }).default).toBe(key === "showStartupModal" ? false : true);
  }
  expect(settings).not.toHaveProperty("cliStrategy");
  expect(pkg.files).toContain("codesight.bundle.js");
  expect(existsSync(join(PLUGINS_DIR, "codesight", "codesight.bundle.js"))).toBe(true);
 });

 test("plugins have no xynogen runtime dependencies", () => {
  for (const slug of EXPECTED_PLUGINS) {
   const pkg = JSON.parse(readFileSync(join(PLUGINS_DIR, slug, "package.json"), "utf-8")) as PkgJson & { dependencies?: Record<string, string> };
   expect(Object.keys(pkg.dependencies ?? {}).some((dependency) => dependency.startsWith("@xynogen/"))).toBe(false);
  }
 });

 test("extensible-workflows registers 3 tools + 1 command", () => {
  const index = readFileSync(join(PLUGINS_DIR, "extensible-workflows", "src", "index.ts"), "utf-8");
  expect(index).toContain("omp_workflow_list");
  expect(index).toContain("omp_workflow_save");
  expect(index).toContain("omp_workflow_render");
  expect(index).toContain("workflow-library");
 });

});

describe("cross-plugin name uniqueness", () => {
 test("no forbidden 'workflow' tool or /workflow command", () => {
  for (const slug of EXPECTED_PLUGINS) {
   const pkgPath = join(PLUGINS_DIR, slug, "package.json");
   if (!existsSync(pkgPath)) continue;
   const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PkgJson;
   for (const ext of pkg.omp?.extensions ?? []) {
    const extPath = join(PLUGINS_DIR, slug, ext);
    if (!existsSync(extPath)) continue;
    const index = readFileSync(extPath, "utf-8");
    expect(index).not.toMatch(/registerTool\(\{[^}]*name:\s*"workflow"/);
    expect(index).not.toMatch(/registerCommand\(\s*"workflow"\s*,/);
   }
  }
 });
});

describe("skills discovery", () => {
 test("extensible-workflows has omp-workflow-authoring skill", () => {
  expect(existsSync(join(PLUGINS_DIR, "extensible-workflows", "skills", "omp-workflow-authoring", "SKILL.md"))).toBe(true);
 });
 test("compact-eng has compact-eng skill", () => {
  expect(existsSync(join(PLUGINS_DIR, "compact-eng", "skills", "compact-eng", "SKILL.md"))).toBe(true);
 });
 test("agent-learning ships the ezxomp plugin/tool catalog", () => {
  const catalogDir = join(PLUGINS_DIR, "agent-learning", "skills");
  expect(existsSync(catalogDir)).toBe(true);
  const entries = readdirSync(catalogDir, { withFileTypes: true })
   .filter((entry) => entry.isDirectory())
   .map((entry) => entry.name);
  expect(entries.length).toBeGreaterThanOrEqual(9);
  for (const entry of entries) {
   const skillMd = join(catalogDir, entry, "SKILL.md");
   expect(existsSync(skillMd)).toBe(true);
   const content = readFileSync(skillMd, "utf-8");
   expect(content).toMatch(/^---[\n]/);
   expect(content).toContain("DO");
   expect(content).toContain("DON'T");
  }
 });
});

describe("legacy import scan", () => {
 for (const slug of EXPECTED_PLUGINS) {
  test(`${slug} has no @earendil-works runtime imports`, () => {
   const srcDir = join(PLUGINS_DIR, slug, "src");
   if (!existsSync(srcDir)) return;
   for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
     const content = readFileSync(join(srcDir, entry.name), "utf-8");
     for (const line of content.split("\n").filter(l => l.trim().startsWith("import"))) {
      expect(line).not.toContain("@earendil-works/");
      expect(line).not.toContain("@mariozechner/");
     }
    }
   }
  });
  test(`${slug} has no unpinned npx execution in src/`, () => {
   const srcDir = join(PLUGINS_DIR, slug, "src");
   if (!existsSync(srcDir)) return;
   for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
     const content = readFileSync(join(srcDir, entry.name), "utf-8");
     expect(content).not.toContain("npx ");
     expect(content).not.toContain("npm exec");
    }
   }
  });
 }
});

describe("UPSTREAM.json provenance", () => {
 for (const slug of EXPECTED_PLUGINS) {
  test(`${slug} has UPSTREAM.json`, () => {
   const upstreamPath = join(PLUGINS_DIR, slug, "UPSTREAM.json");
   expect(existsSync(upstreamPath)).toBe(true);
   const meta = JSON.parse(readFileSync(upstreamPath, "utf-8"));
   expect(meta.originalName).toBeDefined();
   expect(meta.url).toBeDefined();
   expect(meta.integrity).toBeDefined();
   expect(meta.localForkVersion).toBe(EXPECTED_VERSIONS[slug]);
  });
 }
});

describe("marketplace catalog", () => {
 test("has the OMP-required plugins array", () => {
  const mktPath = join(ROOT, ".omp-plugin", "marketplace.json");
  expect(existsSync(mktPath)).toBe(true);
  const mkt = JSON.parse(readFileSync(mktPath, "utf-8"));
  expect(mkt.name).toBe("ezxomp");
  expect(mkt.owner).toMatchObject({ name: "ezxomp" });
  expect(mkt).not.toHaveProperty("entries");
  expect(Array.isArray(mkt.plugins)).toBe(true);
  expect(mkt.plugins).toHaveLength(EXPECTED_PLUGINS.length);
 });

 test("registers each local plugin once with matching metadata", () => {
  const mkt = JSON.parse(readFileSync(join(ROOT, ".omp-plugin", "marketplace.json"), "utf-8"));
  const names = mkt.plugins.map((entry: { name: string }) => entry.name);
  expect(new Set(names).size).toBe(names.length);

  for (const entry of mkt.plugins) {
   expect(typeof entry.name).toBe("string");
   expect(entry.name).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
   expect(typeof entry.source).toBe("string");
   expect(entry.source).toBe(`./plugins/${entry.name}`);
   expect(typeof entry.version).toBe("string");
   expect(typeof entry.description).toBe("string");

   const packagePath = join(ROOT, entry.source, "package.json");
   expect(existsSync(packagePath)).toBe(true);
   const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
   expect(pkg.name).toBe(`@ezxomp/${entry.name}`);
   expect(pkg.version).toBe(entry.version);
  }
 });
});

describe("plannotator self-contained marketplace", () => {
 // The runtime manifest loads `index.bundle.js` (declared in
 // `package.json#omp.extensions`) plus the two HTML assets
 // (`plannotator.html`, `review-editor.html`); the bundle is what OMP
 // actually executes and the HTMLs are what the browser reads.
 // The `./generated/*.ts` sources ship alongside so downstream
 // consumers can rebuild the bundle and so upstream provenance is
 // preserved. OMP installs a plugin by copying its directory from the
 // marketplace clone path verbatim — it does not run `build:pi`. All
 // of these files must therefore be present in the git-tracked source
 // tree, not gitignored, and a remote clone (which carries only
 // tracked files) must already include them. Existence alone is not
 // enough: an untracked local copy can mask the regression. The asset
 // set is derived directly from disk (no sampled literals) so this
 // test defends the actual remote-clone contract for every generated
 // file plannotator ships.

 function walkGenerated(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
   const full = join(dir, entry.name);
   if (entry.isDirectory()) walkGenerated(full, out);
   else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
 }
 const generatedDir = join(PLUGINS_DIR, "plannotator", "generated");

 function runtimeAssets(): { generated: string[]; htmls: string[]; all: string[] } {
  const generated = walkGenerated(generatedDir);
  const htmls = [
   join(PLUGINS_DIR, "plannotator", "plannotator.html"),
   join(PLUGINS_DIR, "plannotator", "review-editor.html"),
   join(PLUGINS_DIR, "plannotator", "index.bundle.js"),
  ];
  return { generated, htmls, all: [...generated, ...htmls] };
 }


 function gitLs(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf-8" });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
 }

 test("no runtime-ignoring .gitignore in plannotator source", () => {
  expect(existsSync(join(PLUGINS_DIR, "plannotator", ".gitignore"))).toBe(false);
 });
 test("all generated modules and runtime assets are git-tracked", () => {
  // Derive the full set of generated modules from disk (no sampled
  // literals) and assert every one is git-tracked. Existence alone is
  // not enough — an untracked local copy can mask the regression. The
  // HTMLs and bundle are checked alongside so the remote-clone
  // contract is exercised end-to-end.
  const { generated, all } = runtimeAssets();
  expect(generated.length).toBeGreaterThan(0);
  expect(all.length).toBeGreaterThan(0);
  const rels = all.map((f) => f.replace(`${ROOT}/`, ""));
  const tracked = new Set(
   gitLs(["ls-files", "--", "plugins/plannotator"]).stdout
    .split("\n")
    .filter(Boolean),
  );
  const missing = rels.filter((r) => !tracked.has(r));
  expect(missing).toEqual([]);
 });

 test("manifest extension entry is the tracked bundle", () => {
  // Consumer-observable contract: the marketplace catalog points at the
  // plugin's `package.json`; the manifest's `omp.extensions` is what OMP
  // loads via `package.json` discovery. The entry must be the tracked
  // bundle, not `index.ts`, because the TS entry's `./generated/*`
  // imports and lazy browser HTML reads need a runtime resolution OMP's
  // extension loader does not perform.
  const pkg = JSON.parse(
   readFileSync(join(PLUGINS_DIR, "plannotator", "package.json"), "utf-8"),
  ) as { omp?: { extensions?: string[] } };
  expect(pkg.omp?.extensions?.[0]).toBe("./index.bundle.js");
 });

 test("clean git-tracked tree (marketplaceClonePath analog) contains every runtime asset", () => {
  // Extract a tracked-only tree to a clean temp dir and verify every
  // disk-derived runtime asset survives — i.e. the remote-clone path
  // works. Fails closed if any asset is untracked.
  const { all } = runtimeAssets();
  const archive = spawnSync("git", ["archive", "--format=tar", "HEAD"], {
   cwd: ROOT,
   maxBuffer: 512 * 1024 * 1024,
  });
  expect(archive.status).toBe(0);
  const tmp = mkdtempSync(join(tmpdir(), "ezxomp-tracked-fixture-"));
  try {
   const r = spawnSync("tar", ["xf", "-", "-C", tmp], {
    input: archive.stdout,
    maxBuffer: 512 * 1024 * 1024,
   });
   expect(r.status).toBe(0);
   for (const f of all) {
    expect(existsSync(f.replace(`${ROOT}/`, `${tmp}/`))).toBe(true);
   }
   // And confirm no .gitignore was reintroduced from upstream.
   expect(existsSync(join(tmp, "plugins/plannotator", ".gitignore"))).toBe(false);
  } finally {
   rmSync(tmp, { recursive: true, force: true });
  }
 });

 test("npm pack --dry-run --json --ignore-scripts ships every runtime asset and excludes tests/node_modules", () => {
  // Deterministic, dependency-free check that `npm pack` actually ships
  // the runtime the OMP extension loader will copy to its cache.
  // Uses --json for a machine-readable listing and --ignore-scripts so
  // no postinstall hooks run during the dry-run.
  //
  // `npm pack --json` returns `{ "<pkg-name>": { id, name, files: [{path}] } }`.
  // Files are listed relative to the tarball root (no `package/` prefix).
  const { generated } = runtimeAssets();
  const pluginDir = join(PLUGINS_DIR, "plannotator");
  const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
   cwd: pluginDir,
   encoding: "utf-8",
   maxBuffer: 128 * 1024 * 1024,
  });
  expect(r.status).toBe(0);
  const parsed = JSON.parse(r.stdout) as Record<
   string,
   { id?: string; name?: string; files?: Array<{ path: string }> }
  >;
  const expectedName = "@ezxomp/plannotator";
  const entry = Object.values(parsed).find((e) => e?.name === expectedName);
  expect(entry).toBeDefined();
  const paths = new Set((entry?.files ?? []).map((f) => f.path));

  // Must contain the bundle, both HTML assets, the upstream-generated
  // runtime modules, the bundle source for downstream rebuild, and the
  // build script + stub so refresh workflows work after install.
  const mustInclude = [
   "index.bundle.js",
   "plannotator.html",
   "review-editor.html",
   "generated/checklist.ts",
   "index.ts",
   "scripts/build-bundle.mjs",
   "scripts/optional-stubs/webtui-server.mjs",
  ];
  for (const p of mustInclude) {
   expect(paths.has(p)).toBe(true);
  }

  // Must NOT contain test files (saves bytes and avoids shipping the
  // private test surface) and must NOT contain node_modules.
  for (const p of paths) {
   expect(p.includes(".test.ts")).toBe(false);
   expect(p.startsWith("node_modules/")).toBe(false);
  }

  // Every disk-derived generated module must be present in the pack.
  for (const f of generated) {
   const rel = f.replace(`${PLUGINS_DIR}/plannotator/`, "");
   expect(paths.has(rel)).toBe(true);
  }
 });
});
