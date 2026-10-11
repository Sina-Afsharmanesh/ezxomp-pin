import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverModelsConfig,
  getSelectedModelsConfig,
  hasBunYaml,
  loadModelsConfig,
  parseModelsConfigText,
  saveModelsConfig,
  stringifyModelsConfig,
} from "../plugins/better-custom/src/config.ts";
import {
  apiKeyFromProvider,
  parseApiKey,
  resolveApiKeyForProbe,
  resolveProviderApiKey,
  serializeApiKey,
} from "../plugins/better-custom/src/api-key.ts";

async function tempAgentDir(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), "better-custom-" + label + "-"));
}

describe("better-custom config persistence", () => {
  test("round-trips JSON while preserving unrelated providers and unknown fields", async () => {
    const agentDir = await tempAgentDir("json");
    const source = {
      customRoot: { keep: true },
      providers: {
        unrelated: { apiKey: "opaque", customProviderField: { keep: 1 }, models: [{ id: "other" }] },
        target: { apiKey: "$TARGET", customProviderField: "preserve", models: [{ id: "model", customModelField: 7 }] },
      },
    };
    await writeFile(join(agentDir, "models.json"), JSON.stringify(source, null, 2) + "\n");

    const loaded = loadModelsConfig({ agentDir, isOmp: false });
    expect(loaded).toEqual(source);
    saveModelsConfig(loaded);
    expect(JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"))).toEqual(source);
    expect(getSelectedModelsConfig().path).toBe(join(agentDir, "models.json"));
  });

  test("discovers OMP files in yml, yaml, json order and preserves selected format", async () => {
    const agentDir = await tempAgentDir("formats");
    const source = { unknownRoot: "kept", providers: { unrelated: { models: ["x"], untouched: true } } };
    await writeFile(join(agentDir, "models.yaml"), JSON.stringify(source, null, 2) + "\n");
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { wrong: {} } }));
    const selectedYaml = discoverModelsConfig({ agentDir, isOmp: true });
    expect(selectedYaml.path).toBe(join(agentDir, "models.yaml"));
    expect(selectedYaml.format).toBe("yaml");

    const loaded = loadModelsConfig(selectedYaml);
    saveModelsConfig(loaded);
    const { YAML } = await import("bun");
    expect(YAML.parse(await readFile(selectedYaml.path, "utf8"))).toEqual(source);
    expect(await readFile(join(agentDir, "models.json"), "utf8")).toContain("wrong");

    await writeFile(join(agentDir, "models.yml"), JSON.stringify(source, null, 2) + "\n");
    expect(discoverModelsConfig({ agentDir, isOmp: true }).path).toBe(join(agentDir, "models.yml"));
  });

  test("new OMP config targets models.yml and uses Bun YAML or indented JSON fallback", async () => {
    const agentDir = await tempAgentDir("new");
    const location = discoverModelsConfig({ agentDir, isOmp: true });
    expect(location.path).toBe(join(agentDir, "models.yml"));
    const source = { providers: { fresh: { apiKey: "dummy", models: [{ id: "m" }] } } };
    saveModelsConfig(source, location);
    const written = await readFile(location.path, "utf8");
    expect(written.endsWith("\n")).toBe(true);
    if (hasBunYaml) {
      const { YAML } = await import("bun");
      expect(YAML.parse(written)).toEqual(source);
    } else {
      expect(written).toBe(JSON.stringify(source, null, 2) + "\n");
    }
    expect(loadModelsConfig(location)).toEqual(source);
  });

  test("non-Bun YAML fallback accepts JSON and rejects genuine YAML without touching files", async () => {
    const source = { providers: { portable: { models: ["m"] } } };
    const jsonAsYaml = stringifyModelsConfig(source, "yaml", null);
    expect(jsonAsYaml).toBe(JSON.stringify(source, null, 2));
    expect(parseModelsConfigText(jsonAsYaml, "yaml", null)).toEqual(source);
    if (hasBunYaml) {
      const { YAML } = await import("bun");
      expect(parseModelsConfigText(YAML.stringify(source), "yaml")).toEqual(source);
    }

    const agentDir = await tempAgentDir("error");
    const path = join(agentDir, "models.yml");
    const genuineYaml = "providers:\n  broken: [\n";
    await writeFile(path, genuineYaml);
    expect(() => parseModelsConfigText(genuineYaml, "yaml", null, path)).toThrow(/Bun YAML support is unavailable/);
    expect(await readFile(path, "utf8")).toBe(genuineYaml);
  });
});

describe("better-custom API-key references", () => {
  test("serializes and parses literal, environment, shell, none, and Ollama modes", () => {
    const cases = [
      ["literal", "secret", undefined, "secret"],
      ["$env", "TOKEN", undefined, "$TOKEN"],
      ["!shell-command", "pass-helper", undefined, "!pass-helper"],
      ["none-placeholder", undefined, undefined, "dummy"],
      ["none-placeholder", undefined, "ollama-chat", "ollama"],
    ] as const;
    for (const [mode, value, style, stored] of cases) {
      const parsed = parseApiKey(stored);
      expect(serializeApiKey(mode, value, style)).toBe(stored);
      if (mode === "literal" || mode === "$env" || mode === "!shell-command") {
        expect(parsed.value).toBe(value);
      } else {
        expect(parsed.mode).toBe("none-placeholder");
      }
    }
    expect(apiKeyFromProvider({ apiKey: "$TOKEN" })).toEqual({ mode: "$env", value: "TOKEN" });
    expect(apiKeyFromProvider({ apiKey: "!pass-helper" })).toEqual({ mode: "!shell-command", value: "pass-helper" });
  });

  test("resolves only through the explicit probe seam and never logs or exposes during parsing", () => {
    const env = { TOKEN: "  resolved-token  " };
    expect(resolveApiKeyForProbe(parseApiKey("$TOKEN"), undefined, { env })).toBe("resolved-token");
    expect(resolveApiKeyForProbe(parseApiKey("!pass-helper"), undefined, { runShell: (command) => command + "-result" })).toBe("pass-helper-result");
    expect(resolveProviderApiKey({ apiKey: "literal-secret" })).toBe("literal-secret");
    expect(parseApiKey("literal-secret")).toEqual({ mode: "literal", value: "literal-secret" });
    expect(resolveApiKeyForProbe(parseApiKey("dummy"), undefined, { runShell: () => { throw new Error("must not run"); } })).toBeUndefined();
  });
});
