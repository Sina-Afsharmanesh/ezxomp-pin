/**
 * test/agent-learning-prompts-registry.test.ts
 *
 * Tests for the PromptTemplateRegistry implementation based on skillopt_sleep/prompts.py.
 */

import { describe, expect, it } from "bun:test";

import { loadOverrides, loadOverridesWithUnknown, PromptRegistry } from "../plugins/agent-learning/src/procedures/prompts/registry.js";

describe("PromptRegistry", () => {
  it("has built‑in templates", async () => {
    const registry = await loadOverrides();
    expect(registry.has("miner")).toBe(true);
    expect(registry.has("attempt")).toBe(true);
    expect(registry.has("judge")).toBe(true);
    expect(registry.has("reflect")).toBe(true);
    expect(registry.has("unknown")).toBe(false);

    // Test that the built‑in templates have expected placeholders
    const minerTemplate = registry.get("miner");
    expect(minerTemplate).toContain("{{request}}");
    expect(minerTemplate).toContain("{{transcript}}");
    expect(minerTemplate).toContain("{{output}}");

    const attemptTemplate = registry.get("attempt");
    expect(attemptTemplate).toContain("{{request}}");
    expect(attemptTemplate).toContain("{{reasoning}}");
    expect(attemptTemplate).toContain("{{context}}");

    const judgeTemplate = registry.get("judge");
    expect(judgeTemplate).toContain("{{code}}");

    const reflectTemplate = registry.get("reflect");
    expect(reflectTemplate).toContain("{{history}}");
  });

  it("renders templates correctly", async () => {
    const registry = await loadOverrides();

    const rendered = registry.render("miner", {
      request: "Write a function",
      transcript: "I need to write a function",
      output: "function foo() { return 1; }",
    });

    expect(rendered).toContain("Write a function");
    expect(rendered).toContain("I need to write a function");
    expect(rendered).toContain("function foo() { return 1; }");
  });

  it("throws on missing variable", async () => {
    const registry = await loadOverrides();

    expect(() => registry.render("miner", {
      request: "Write a function",
      transcript: "I need to write a function",
      // Missing 'output' variable
    })).toThrow();

    expect(() => registry.render("judge", {
      // Missing 'code' variable
    })).toThrow();
  });

  it("has loadOverrides function", async () => {
    expect(typeof loadOverrides).toBe("function");
    expect(typeof loadOverridesWithUnknown).toBe("function");
  });

  it("loads from custom overrides path", async () => {
    // Create a temporary directory
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    
    const tempDir = await fs.mkdtemp(`${os.tmpdir()}/agent-learning-test-`);
    const customPath = path.join(tempDir, "prompts.json");

    await fs.writeFile(customPath, JSON.stringify({
      miner: "Custom {{request}} {{transcript}}",
    }));

    const registry = await loadOverrides({ overridesPath: customPath });

    expect(registry.has("miner")).toBe(true);

    const rendered = registry.render("miner", {
      request: "Test request",
      transcript: "Test transcript",
    });

    expect(rendered).toBe("Custom Test request Test transcript");

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});