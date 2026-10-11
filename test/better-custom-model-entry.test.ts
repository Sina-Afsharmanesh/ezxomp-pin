import { describe, expect, test } from "bun:test";
import {
  buildModelEntry,
  buildProviderConfig,
  localModelInfo,
  mutateModelEntry,
  mutateProviderConfig,
  readModelOptions,
  resolveModelInfo,
  thinkingFromLevelMap,
} from "../plugins/better-custom/src/model-entry.ts";

describe("better-custom model entry translation", () => {
  test("maps every supported provider API and retains model fields", () => {
    const apis = [
      "openai-completions",
      "openai-responses",
      "anthropic-messages",
      "google-generative-ai",
      "ollama-chat",
    ] as const;
    for (const api of apis) {
      const provider = buildProviderConfig({
        style: api,
        api,
        baseUrl: "https://gateway.example/v1",
        apiKey: { mode: "literal", value: "secret" },
        headers: { "x-gateway": "yes" },
        modelIds: ["model-a"],
        vision: true,
        reasoning: "high",
        contextWindow: 64000,
        maxTokens: 4096,
        modelOptionsById: { "model-a": { headers: { "x-model": "yes" }, baseUrl: "https://gateway.example/v1" } },
      });
      const model = provider.models?.[0] as Record<string, unknown>;
      expect(provider.api).toBe(api);
      expect(model.api).toBe(api);
      expect(model.contextWindow).toBe(64000);
      expect(model.maxTokens).toBe(4096);
      expect(model.baseUrl).toBe("https://gateway.example/v1");
      expect(model.headers).toEqual({ "x-model": "yes" });
      expect(model.input).toEqual(["text", "image"]);
      expect(model).not.toHaveProperty("thinkingLevelMap");
    }
  });

  test("uses host Ollama spelling and sentinel credential", () => {
    const provider = buildProviderConfig({
      style: "ollama",
      api: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: { mode: "none-placeholder" },
      modelIds: ["llama3"],
      reasoning: "high",
      vision: false,
    });
    expect(provider.api).toBe("ollama-chat");
    expect(provider.apiKey).toBe("ollama");
    expect((provider.models?.[0] as Record<string, unknown>).api).toBe("ollama-chat");
    expect(provider.compat).toMatchObject({ supportsDeveloperRole: false, supportsReasoningEffort: false });
  });

  test("probed 9router thinkingFormat enables reasoning effort for ollama-chat compat", () => {
    const provider = buildProviderConfig({
      style: "ollama-chat",
      api: "ollama-chat",
      baseUrl: "http://localhost:20128/v1",
      apiKey: { mode: "literal", value: "sk-9router" },
      modelIds: ["ollama-cloud/glm-5.3-flash"],
      reasoning: "high",
      infoById: new Map([["ollama-cloud/glm-5.3-flash", { thinkingFormat: "zai" }]]),
    });
    expect(provider.compat).toMatchObject({
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      thinkingFormat: "zai",
    });
  });

  test("plain-string ollama-chat compat without probe evidence keeps effort disabled", () => {
    const provider = buildProviderConfig({
      style: "ollama-chat",
      api: "ollama-chat",
      baseUrl: "http://localhost:20128/v1",
      apiKey: { mode: "literal", value: "sk-9router" },
      modelIds: ["ollama-cloud/glm-5.3-flash"],
    });
    expect(provider.compat).toMatchObject({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    });
    expect(provider.compat).not.toHaveProperty("thinkingFormat");
  });

  test("translates maps without leaking legacy property and reads ceiling precedence", () => {
    const thinking = thinkingFromLevelMap({
      minimal: null,
      low: "fast",
      medium: null,
      high: "deep",
      xhigh: "extended-wire",
      max: "maximum-wire",
      unknown: "ignored",
    });
    expect(thinking).toEqual({
      mode: "effort",
      efforts: ["low", "high", "xhigh", "max"],
      defaultLevel: "max",
      effortMap: { low: "fast", high: "deep", xhigh: "extended-wire", max: "maximum-wire" },
    });
    const entry = buildModelEntry("thinking", {
      vision: false,
      reasoning: "max",
      thinkingLevelMap: {
        low: "low-wire",
        high: "high-wire",
        xhigh: "xhigh-wire",
        max: "max-wire",
      },
    });
    expect(entry).not.toHaveProperty("thinkingLevelMap");
    expect(readModelOptions(entry).reasoning).toBe("max");
    expect(readModelOptions({ reasoning: true, input: ["text"], thinking: { mode: "effort", efforts: ["high"], effortMap: { xhigh: "wire" } } }).reasoning).toBe("xhigh");
    expect(readModelOptions({ reasoning: true, input: ["text"], thinking: { mode: "effort", efforts: ["medium", "high"], effortMap: {} } }).reasoning).toBe("high");
    expect(buildModelEntry("empty-map", { vision: false, reasoning: "high", thinkingLevelMap: { unknown: "ignored" } })).not.toHaveProperty("thinkingLevelMap");
  });

  test("targeted mutations preserve unrelated provider, model, and unknown fields", () => {
    const original = buildProviderConfig({
      api: "openai-completions",
      style: "openai-completions",
      baseUrl: "https://gateway.example/v1",
      apiKey: "dummy",
      headers: { "x-provider": "keep" },
      modelIds: ["one", "two"],
      vision: false,
      reasoning: "high",
      providerFields: { unknownProviderField: { keep: true } },
    });
    const first = original.models?.[0] as Record<string, unknown>;
    const updated = mutateProviderConfig(original, { modelId: "one", property: "contextWindow", value: 999 });
    const updatedFirst = updated.models?.[0] as Record<string, unknown>;
    expect(updatedFirst.contextWindow).toBe(999);
    expect(updatedFirst.thinking).toEqual(first.thinking);
    expect(updatedFirst.input).toEqual(first.input);
    expect(updated.models?.[1]).toEqual(original.models?.[1]);
    expect(updated.baseUrl).toBe(original.baseUrl);
    expect(updated.headers).toEqual(original.headers);
    expect(updated.unknownProviderField).toEqual({ keep: true });
    const modelChanged = mutateModelEntry(first as any, "vision", true);
    expect(modelChanged.input).toEqual(["text", "image"]);
    expect(modelChanged.thinking).toEqual(first.thinking);
    expect(first.input).toEqual(["text"]);
  });

  test("enforces detected, caller, local, and default precedence", () => {
    const detectedWins = buildProviderConfig({
      api: "openai-completions",
      modelIds: ["qwen3-vl"],
      vision: false,
      reasoning: "off",
      infoById: { "qwen3-vl": { vision: true, reasoning: true } },
    }).models?.[0] as Record<string, unknown>;
    expect(detectedWins.input).toEqual(["text", "image"]);
    expect(detectedWins.reasoning).toBe(true);

    const callerWins = buildProviderConfig({
      api: "openai-completions",
      modelIds: ["qwen3-vl"],
      vision: false,
      reasoning: "off",
    }).models?.[0] as Record<string, unknown>;
    expect(callerWins.input).toEqual(["text"]);
    expect(callerWins.reasoning).toBeUndefined();

    const localWins = buildProviderConfig({ api: "openai-completions", modelIds: ["qwen3-vl"] }).models?.[0] as Record<string, unknown>;
    expect(localWins.input).toEqual(["text", "image"]);
    expect(localWins.reasoning).toBe(true);

    const defaultsWin = buildProviderConfig({ api: "openai-completions", modelIds: ["unknown-manual-model"] }).models?.[0] as Record<string, unknown>;
    expect(defaultsWin.input).toEqual(["text"]);
    expect(defaultsWin.reasoning).toBe(true);
  });

  test("resolves local rules and defaults for manual models without probe metadata", () => {
    const provider = buildProviderConfig({ api: "openai-completions", modelIds: ["qwen3-vl", "unknown-manual-model"] });
    const qwen = provider.models?.[0] as Record<string, unknown>;
    const unknown = provider.models?.[1] as Record<string, unknown>;
    expect(qwen.input).toEqual(["text", "image"]);
    expect(qwen.contextWindow).toBe(131072);
    expect(qwen.reasoning).toBe(true);
    expect(unknown.input).toEqual(["text"]);
    expect(unknown.reasoning).toBe(true);
  });

  test("layers detected metadata over local rules and defaults", () => {
    expect(resolveModelInfo("qwen3-vl", { vision: false }).vision).toBe(false);
    expect(resolveModelInfo("qwen3-vl", { contextWindow: 123 }).vision).toBe(true);
    expect(resolveModelInfo("unknown-manual-model")).toMatchObject({ vision: false, reasoning: true });
    expect(localModelInfo("deepseek-reasoner")).toMatchObject({ vision: false, reasoning: true, contextWindow: 128000 });
  });

  test("serializes literal, none, env, and shell api-key modes through the real write path", () => {
    const cases = [
      [{ mode: "literal", value: "secret" }, "secret"],
      [{ mode: "none-placeholder" }, "dummy"],
      [{ mode: "$env", value: "TOKEN" }, "$TOKEN"],
      [{ mode: "!shell-command", value: "pass-helper" }, "!pass-helper"],
      ["opaque-string", "opaque-string"],
    ] as const;
    for (const [apiKey, expected] of cases) {
      const built = buildProviderConfig({ api: "openai-completions", style: "openai-completions", apiKey, modelIds: [] });
      expect(built.apiKey).toBe(expected);
    }
    const envPrefixed = buildProviderConfig({ api: "openai-completions", style: "openai-completions", apiKey: { mode: "$env", value: "$OTHER" }, modelIds: [] });
    expect(envPrefixed.apiKey).toBe("$OTHER");
    const shellPrefixed = buildProviderConfig({ api: "openai-completions", style: "openai-completions", apiKey: { mode: "!shell-command", value: "!helper" }, modelIds: [] });
    expect(shellPrefixed.apiKey).toBe("!helper");
    expect(buildProviderConfig({ api: "openai-completions", style: "openai-completions", apiKey: { mode: "literal", value: "" }, modelIds: [] }).apiKey).toBeUndefined();
    expect(buildProviderConfig({ api: "ollama-chat" as string, style: "ollama", apiKey: { mode: "none-placeholder" }, modelIds: [] }).apiKey).toBe("ollama");
  });

  test("headers mutations follow edit-flow validation and deletion semantics", () => {
    const base = { id: "m", input: ["text"] } as any;
    expect(mutateModelEntry(base, "headers", null)).not.toHaveProperty("headers");
    expect(mutateModelEntry(base, "headers", undefined)).not.toHaveProperty("headers");
    const set = mutateModelEntry(base, "headers", { "x-a": "1" });
    expect(set.headers).toEqual({ "x-a": "1" });
    expect(base).not.toHaveProperty("headers");
    expect(mutateModelEntry(base, "headers", "oops")).toEqual({ id: "m", input: ["text"] });
  });
});
