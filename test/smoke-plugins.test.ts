/**
 * test/smoke-plugins.ts — Exercise local behavior for plugins without a model.
 */
import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS = join(ROOT, "plugins");

describe("smoke: plugin registration and loading", () => {
 test("all marketplace plugins have loadable extension entry files", () => {
  const slugs = ["code-nav",
   "codesight", "experiences", "agent-learning", "compact-eng", "extensible-workflows", "plannotator", "augment", "gsd-web", "gsd-graph", "gsd-loop", "gsd-browser"];
  for (const slug of slugs) {
   const pkg = JSON.parse(readFileSync(join(PLUGINS, slug, "package.json"), "utf-8"));
   for (const ext of pkg.omp?.extensions ?? []) {
    expect(existsSync(join(PLUGINS, slug, ext))).toBe(true);
   }
  }
 });
});

describe("smoke: gsd-web plugin", () => {
 test("registers /gsd-web command against a fake pi", async () => {
  const pkg = JSON.parse(readFileSync(join(PLUGINS, "gsd-web", "package.json"), "utf-8"));
  const [entry] = pkg.omp?.extensions ?? [];
  expect(entry).toBeDefined();

  const extension = await import(join(PLUGINS, "gsd-web", entry!));
  const commands = new Map<string, unknown>();
  expect(extension.default).toBeTypeOf("function");
  extension.default({
   setLabel: (_label: string) => { },
   registerCommand: (name: string, command: unknown) => commands.set(name, command),
  } as never);
  expect(commands.has("gsd-web")).toBe(true);
 });
});

describe("smoke: gsd-graph extension entry", () => {
 test("gsd-graph entry registers the declared surface", () => {
  const pkg = JSON.parse(readFileSync(join(PLUGINS, "gsd-graph", "package.json"), "utf-8"));
  for (const ext of pkg.omp?.extensions ?? []) {
   const content = readFileSync(join(PLUGINS, "gsd-graph", ext), "utf-8");
   expect(content).toContain('setLabel("GSD Graph")');
   // Tools live in src/tools.ts, not the entry file — assert names there.
   const toolContent = readFileSync(join(PLUGINS, "gsd-graph", "src", "tools.ts"), "utf-8");
   expect(toolContent).toContain('"gsd_graph"');
   expect(toolContent).toContain('"gsd_graph_run"');
   // command: /gsd-graph
   expect(content).toContain('registerGsdGraphCommand');
   // session_start autoRebuild hook
   expect(content).toContain('session_start');
  }
 });
});

describe("smoke: better-custom command", () => {
 test("loads the manifest extension and registers /custom-provider", async () => {
  const pkg = JSON.parse(readFileSync(join(PLUGINS, "better-custom", "package.json"), "utf-8"));
  const [entry] = pkg.omp?.extensions ?? [];
  expect(entry).toBeDefined();

  const extension = await import(join(PLUGINS, "better-custom", entry!));
  const commands = new Map<string, unknown>();
  expect(extension.default).toBeTypeOf("function");
  await extension.default({
   registerCommand: (name: string, command: unknown) => commands.set(name, command),
  } as never);
  expect(commands.has("custom-provider")).toBe(true);
 });
});

describe("smoke: compact-eng native governor", () => {
 test("compact-eng governor can be imported and configured without the old engine", async () => {
  const { CompactEngGovernor, resolveConfig } = await import(join(PLUGINS, "compact-eng", "extensions", "index.ts"));
  const governor = new CompactEngGovernor(resolveConfig({ watermark: 0.7 }));
  expect(governor.status().config.watermark).toBe(0.7);
  expect(existsSync(join(PLUGINS, "compact-eng", "extensions", "engine.ts"))).toBe(false);
 });
});

describe("smoke: extensible-workflows library", () => {
 test("library can list, save, and render workflows", async () => {
  const { listWorkflows, saveWorkflow, renderWorkflow, validateWorkflow } =
   await import(join(PLUGINS, "extensible-workflows", "src", "library.ts"));
  expect(typeof listWorkflows).toBe("function");
  expect(typeof saveWorkflow).toBe("function");
  expect(typeof renderWorkflow).toBe("function");
  expect(typeof validateWorkflow).toBe("function");
 });
});

describe("smoke: codesight offline behavior", () => {
 test("codesight has watcher controller with lock file", () => {
  const watcher = readFileSync(join(PLUGINS, "codesight", "src", "watcher.ts"), "utf-8");
  expect(watcher).toContain(".omp-watch.lock");
  expect(watcher).toContain("ownerPid");
 });
 test("codesight routes commands through bundled CLI", () => {
  const runner = readFileSync(join(PLUGINS, "codesight", "src", "codesight.ts"), "utf-8");
  expect(runner).toContain("resolveCodesightInvocation");
  expect(runner).toContain("codesight.bundle.js");
 });
});

describe("smoke: cross-plugin name uniqueness", () => {
 test("no duplicate tool names across plugins", () => {
  const slugs = ["code-nav",
   "codesight", "experiences", "compact-eng", "extensible-workflows", "plannotator", "augment"];
  const toolOwners = new Map<string, string[]>();
  for (const slug of slugs) {
   const pkg = JSON.parse(readFileSync(join(PLUGINS, slug, "package.json"), "utf-8"));
   for (const ext of pkg.omp?.extensions ?? []) {
    const content = readFileSync(join(PLUGINS, slug, ext), "utf-8");
    for (const m of content.matchAll(/name:\s*"(omp_workflow_[a-z]+|agent_shell_[a-z]+|cook_dispatch|skillforge_capture_memory|read_skills)"/g)) {
     const tool = m[1];
     const owners = toolOwners.get(tool) || [];
     owners.push(slug);
     toolOwners.set(tool, owners);
    }
   }
  }
  for (const [, owners] of toolOwners) expect(owners.length).toBe(1);
 });
});
