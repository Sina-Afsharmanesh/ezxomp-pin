/**
 * test/smoke-codesight-tui.ts — CodeSight TUI smoke test.
 * Verifies codesight extension structure, settings, watcher states, and overlay components
 * without launching a full interactive OMP session.
 */
import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CODESIGHT = join(ROOT, "plugins", "codesight");

describe("smoke: codesight TUI structure", () => {
 test("codesight has all required source files", () => {
  expect(existsSync(join(CODESIGHT, "src", "index.ts"))).toBe(true);
  expect(existsSync(join(CODESIGHT, "src", "watcher.ts"))).toBe(true);
  expect(existsSync(join(CODESIGHT, "src", "tools.ts"))).toBe(true);
  expect(existsSync(join(CODESIGHT, "src", "overlay.ts"))).toBe(true);
 });

 test("package.json has display settings and the tracked bundle", () => {
  const pkg = JSON.parse(readFileSync(join(CODESIGHT, "package.json"), "utf-8"));
  const settings = pkg.omp?.settings;
  expect(settings).toBeDefined();
  for (const key of ["watchFiles", "regenerateWiki", "showFooter", "showStartupModal", "notifyOnWatchError"]) {
   expect(settings[key]).toBeDefined();
   expect(settings[key].type).toBe("boolean");
   expect(settings[key].default).toBe(key === "showStartupModal" ? false : true);
  }
  expect(settings).not.toHaveProperty("cliStrategy");
  expect(pkg.files).toContain("codesight.bundle.js");
  expect(existsSync(join(CODESIGHT, "codesight.bundle.js"))).toBe(true);
 });

 test("watcher has all 8 states", () => {
  const watcher = readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8");
  const states = ["disabled", "starting", "watching", "external", "refreshing", "stale", "missing", "error"];
  for (const state of states) expect(watcher).toContain(state);
 });

 test("watcher uses exclusive lock with ownerPid", () => {
  const watcher = readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8");
  expect(watcher).toContain(".omp-watch.lock");
  expect(watcher).toContain("ownerPid");
  expect(watcher).toContain("childPid");
 });

 test("watcher executes the bundled CLI invocation", () => {
  const watcher = readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8");
  expect(watcher).toContain("resolveCodesightInvocation");
  expect(watcher).toContain("invocation.executable");
 });

 test("footer uses ezxomp:codesight status key", () => {
  const allSrc = readFileSync(join(CODESIGHT, "src", "index.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "tools.ts"), "utf-8");
  expect(allSrc).toContain("ezxomp:codesight");
 });

 test("codesight-refresh and codesight-init commands exist", () => {
  const tools = readFileSync(join(CODESIGHT, "src", "tools.ts"), "utf-8");
  expect(tools).toContain("codesight-refresh");
  expect(tools).toContain("codesight-init");
 });

 test("settings reconciler uses getPluginSettings", () => {
  const allSrc = readFileSync(join(CODESIGHT, "src", "index.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "tools.ts"), "utf-8");
  expect(allSrc).toContain("getPluginSettings");
 });

 test("session_shutdown disposes watcher", () => {
  const allSrc = readFileSync(join(CODESIGHT, "src", "index.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "watcher.ts"), "utf-8") + readFileSync(join(CODESIGHT, "src", "tools.ts"), "utf-8");
  expect(allSrc).toContain("session_shutdown");
 });

 test("runner is bundle-only and has no npx path", () => {
  const runner = readFileSync(join(CODESIGHT, "src", "codesight.ts"), "utf-8");
  expect(runner).toContain("codesight.bundle.js");
  expect(runner).not.toContain("npx");
  expect(runner).not.toContain("require.resolve");
 });
});
