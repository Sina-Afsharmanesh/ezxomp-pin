import { describe, expect, test } from "bun:test";
import { gatewayPreset } from "../plugins/better-custom/src/presets.ts";
import {
  modelUrlCandidates,
  normalizeEndpoint,
} from "../plugins/better-custom/src/url.ts";
import {
  parsePublicModelCatalog,
  probeDeveloperRole,
  probeGateway,
} from "../plugins/better-custom/src/probe/index.ts";
import type { ProbeFetch } from "../plugins/better-custom/src/probe/types.ts";

type Call = { url: string; init?: RequestInit };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routedFetch(routes: Record<string, Response | unknown>, calls: Call[]): ProbeFetch {
  return async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    return route instanceof Response ? route : route === undefined ? json({ error: "missing route" }, 404) : json(route);
  };
}

describe("better-custom gateway presets and endpoint candidates", () => {
  test("uses the documented preset flags and falls unknown ids back to auto", () => {
    expect(gatewayPreset("auto")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: true, modelGroupInfo: true, publicCatalog: true, perModelDetails: true, modelsDev: true },
    });
    expect(gatewayPreset("litellm")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: true, modelGroupInfo: true, publicCatalog: true, perModelDetails: false, modelsDev: false },
    });
    for (const id of ["oneapi", "newapi"]) {
      expect(gatewayPreset(id)).toMatchObject({
        ensureV1: true,
        profile: { modelInfo: false, modelGroupInfo: false, publicCatalog: false, perModelDetails: false, modelsDev: false },
      });
    }
    expect(gatewayPreset("omniroute")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: false, modelGroupInfo: false, publicCatalog: false, perModelDetails: true, modelsDev: false },
    });
    expect(gatewayPreset("unknown")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: true, modelGroupInfo: true, publicCatalog: true, perModelDetails: true, modelsDev: true },
    });
    for (const id of ["openrouter", "generic"]) {
      expect(gatewayPreset(id)).toMatchObject({
        ensureV1: false,
        profile: { modelInfo: false, modelGroupInfo: false, publicCatalog: false, perModelDetails: true, modelsDev: true },
      });
    }
    expect(gatewayPreset("omniroute")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: false, modelGroupInfo: false, publicCatalog: false, perModelDetails: true, modelsDev: false },
    });
    expect(gatewayPreset("unknown")).toMatchObject({
      ensureV1: false,
      profile: { modelInfo: true, modelGroupInfo: true, publicCatalog: true, perModelDetails: true, modelsDev: true },
    });
    expect(gatewayPreset("unknown-persisted-id").id).toBe("auto");
  });

  test("normalizes request paths and tries deterministic safe model URL variants", () => {
    expect(normalizeEndpoint("http://gateway.example/v1/chat/completions", "openai-completions")).toBe("http://gateway.example/v1");
    expect(normalizeEndpoint("api.example.com/v1/responses", "openai-responses")).toBe("https://api.example.com/v1");
    expect(normalizeEndpoint("https://anthropic.example/v1/messages", "anthropic-messages")).toBe("https://anthropic.example/v1");
    expect(normalizeEndpoint("https://gemini.example/v1beta/models", "google-generative-ai")).toBe("https://gemini.example/v1beta");
    expect(modelUrlCandidates("http://gateway.example/v1", "openai-completions")).toEqual([
      "http://gateway.example/v1/models",
      "http://gateway.example/models",
      "https://gateway.example/v1/models",
      "https://gateway.example/models",
    ]);
    expect(modelUrlCandidates("localhost:4000", "openai-completions")).toEqual([
      "http://localhost:4000/models",
      "http://localhost:4000/v1/models",
    ]);
    expect(modelUrlCandidates("https://gateway.example/v1", "openai-completions")).toEqual([
      "https://gateway.example/v1/models",
      "https://gateway.example/models",
    ]);
  });
});

describe("better-custom gateway metadata probing", () => {
  test("parses OpenRouter inline fields and generic per-model details", async () => {
    const calls: Call[] = [];
    const openRouter = await probeGateway({
      endpoint: "https://openrouter.example/api/v1",
      api: "openai-completions",
      preset: "openrouter",
      fetch: routedFetch({
        "https://openrouter.example/api/v1/models": {
          data: [{
            id: "router-model",
            context_length: 200_000,
            reasoning: true,
            architecture: { input_modalities: ["text", "image"] },
          }],
        },
        "https://openrouter.example/api/v1/models/router-model": {},
      }, calls),
    });
    expect(openRouter.metadataById.get("router-model")).toEqual({ contextWindow: 200_000, vision: true, reasoning: true });

    const genericCalls: Call[] = [];
    const generic = await probeGateway({
      endpoint: "https://generic.example/v1",
      api: "openai-completions",
      preset: "generic",
      fetch: routedFetch({
        "https://generic.example/v1/models": { data: [{ id: "detail-model" }] },
        "https://generic.example/v1/models/detail-model": {
          context_window: 16_384,
          max_output_tokens: 2_048,
          capabilities: {
            vision: { supported: true },
            reasoning: { type: "effort", effort_options: ["low", "high"] },
          },
        },
      }, genericCalls),
    });
    expect(generic.metadataById.get("detail-model")).toEqual({
      contextWindow: 16_384,
      maxTokens: 2_048,
      vision: true,
      reasoning: true,
      effortOptions: ["low", "high"],
    });
    expect(genericCalls.map((call) => call.url)).toEqual([
      "https://generic.example/v1/models",
      "https://generic.example/v1/models/detail-model",
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://openrouter.example/api/v1/models",
      "https://openrouter.example/api/v1/models/router-model",
    ]);
  });

  test("parses LiteLLM gateway-wide and public catalog metadata in order", async () => {
    const calls: Call[] = [];
    const result = await probeGateway({
      endpoint: "http://localhost:4000/v1",
      api: "openai-completions",
      preset: "litellm",
      apiKey: "resolved-litellm-key",
      fetch: routedFetch({
        "http://localhost:4000/v1/models": { data: [{ id: "litellm-model" }] },
        "http://localhost:4000/model/info": {
          data: [{ model_name: "litellm-model", model_info: { max_input_tokens: 8_192, max_output_tokens: 1_024 } }],
        },
        "http://localhost:4000/model_group/info": {
          data: [{ model_group: "litellm-model", supports_vision: true }],
        },
        "http://localhost:4000/api/models/public": [{ model_name: "litellm-model", context_window: 16_384 }],
      }, calls),
    });
    expect(result.metadataById.get("litellm-model")).toEqual({ contextWindow: 16_384, maxTokens: 1_024, vision: true });
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:4000/v1/models",
      "http://localhost:4000/model/info",
      "http://localhost:4000/model_group/info",
      "http://localhost:4000/api/models/public",
    ]);
    expect(new Headers(calls[3]?.init?.headers).has("authorization")).toBe(false);
  });

  test("filters non-public entries from a public model catalog", () => {
    const metadata = parsePublicModelCatalog([
      { model_name: "visible-model", context_window: 32_768 },
      { model_name: "draft-model", context_window: 1, status: "draft" },
      { model_name: "archived-model", context_window: 1, status: "archived" },
      { model_name: "hidden-model", context_window: 1, is_visible: false },
    ]);
    expect([...metadata]).toEqual([["visible-model", { contextWindow: 32_768 }]]);
  });

  test("uses the llm public-catalog fallback and preserves its authoritative fields", async () => {
    const calls: Call[] = [];
    const result = await probeGateway({
      endpoint: "https://api.ustc.example/v1",
      api: "openai-completions",
      preset: "auto",
      fetch: routedFetch({
        "https://api.ustc.example/v1/models": { data: [{ id: "catalog-model" }] },
        "https://llm.ustc.example/api/models/public": [
          { model_name: "catalog-model", context_window: 131_072, supports_vision: true },
          { model_name: "draft-model", context_window: 1, status: "draft" },
          { model_name: "archived-model", context_window: 1, status: "archived" },
          { model_name: "hidden-model", context_window: 1, is_visible: false },
        ],
        "https://api.ustc.example/v1/models/catalog-model": {
          context_window: 4_096,
          capabilities: { vision: { supported: false }, reasoning: { type: "none" } },
        },
      }, calls),
    });
    expect(result.metadataById.get("catalog-model")).toEqual({ contextWindow: 131_072, vision: true, reasoning: false });
    expect(result.metadataById.has("draft-model")).toBe(false);
    expect(result.metadataById.has("archived-model")).toBe(false);
    expect(result.metadataById.has("hidden-model")).toBe(false);

    const urls = calls.map((call) => call.url);
    const apiCatalog = "https://api.ustc.example/api/models/public";
    const llmCatalog = "https://llm.ustc.example/api/models/public";
    expect(urls.indexOf(apiCatalog)).toBeGreaterThanOrEqual(0);
    expect(urls.indexOf(llmCatalog)).toBeGreaterThan(urls.indexOf(apiCatalog));
    expect(urls).not.toContain("https://ustc.example/api/models/public");
  });

  test("parses One API and New API meta fields with supported endpoint types", async () => {
    for (const preset of ["oneapi", "newapi"] as const) {
      const calls: Call[] = [];
      const result = await probeGateway({
        endpoint: "http://localhost:3000",
        api: "openai-completions",
        preset,
        fetch: routedFetch({
          "http://localhost:3000/v1/models": {
            data: [{
              id: preset + "-model",
              meta: { context_window: 32_768, capabilities: { vision: true, thinking: true } },
              supported_endpoint_types: ["chat", "embeddings"],
            }],
          },
        }, calls),
      });
      expect(result.metadataById.get(preset + "-model")).toEqual({
        contextWindow: 32_768,
        vision: true,
        reasoning: true,
        endpointTypes: ["chat", "embeddings"],
      });
      expect(calls.map((call) => call.url)).toEqual(["http://localhost:3000/v1/models"]);
    }
  });

  test("parses Gemini input limits and Ollama tags plus show details", async () => {
    const geminiCalls: Call[] = [];
    const gemini = await probeGateway({
      endpoint: "https://gemini.example",
      api: "google-generative-ai",
      preset: "oneapi",
      fetch: routedFetch({
        "https://gemini.example/v1beta/models": {
          models: [{ name: "models/gemini-test", inputTokenLimit: 1_000_000, outputTokenLimit: 8_192 }],
        },
      }, geminiCalls),
    });
    expect(gemini.ids).toEqual(["gemini-test"]);
    expect(gemini.metadataById.get("gemini-test")).toEqual({ contextWindow: 1_000_000, maxTokens: 8_192 });
    expect(geminiCalls.map((call) => call.url)).toEqual(["https://gemini.example/v1beta/models"]);

    const ollamaCalls: Call[] = [];
    const ollama = await probeGateway({
      endpoint: "http://localhost:11434/v1",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:11434/api/health": 404,
        "http://localhost:11434/api/version": 404,
        "http://localhost:11434/api/tags": { models: [{ name: "llama:latest", capabilities: ["vision", "thinking"] }] },
        "http://localhost:11434/api/show": { model_info: { "llama.context_length": 8_192 } },
      }, ollamaCalls),
    });
    expect(ollama.metadataById.get("llama:latest")).toEqual({ contextWindow: 8_192, vision: true, reasoning: true });
    expect(ollamaCalls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/health",
      "http://localhost:11434/api/version",
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/show",
    ]);
    expect(JSON.parse(String(ollamaCalls[3]?.init?.body))).toEqual({ name: "llama:latest" });
  });

  test("keeps gateway subpaths and falls back to the OpenAI model list when tags yields nothing", async () => {
    const subpathCalls: Call[] = [];
    const subpath = await probeGateway({
      endpoint: "http://localhost:20128/ollama/v1",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:20128/ollama/api/health": 404,
        "http://localhost:20128/ollama/api/version": 404,
        "http://localhost:20128/ollama/api/tags": { models: [{ name: "glm:latest", capabilities: ["thinking"] }] },
        "http://localhost:20128/ollama/api/show": { model_info: { "glm.context_length": 4_096 } },
      }, subpathCalls),
    });
    expect(subpath.ids).toEqual(["glm:latest"]);
    expect(subpath.baseUrl).toBe("http://localhost:20128/ollama");
    expect(subpathCalls.map((call) => call.url)).toEqual([
      "http://localhost:20128/ollama/api/health",
      "http://localhost:20128/ollama/api/version",
      "http://localhost:20128/ollama/api/tags",
      "http://localhost:20128/ollama/api/show",
    ]);

    const fallbackCalls: Call[] = [];
    const fallback = await probeGateway({
      endpoint: "http://localhost:20128",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:20128/api/health": 404,
        "http://localhost:20128/api/version": 404,
        "http://localhost:20128/api/tags": 404,
        "http://localhost:20128/v1/models": { data: [{ id: "ollama/glm-5.3-flash:cloud", context_window: 131_072 }] },
        "http://localhost:20128/models": 404,
      }, fallbackCalls),
    });
    expect(fallback.ids).toEqual(["ollama/glm-5.3-flash:cloud"]);
    expect(fallback.baseUrl).toBe("http://localhost:20128/v1");
    expect(fallback.metadataById.get("ollama/glm-5.3-flash:cloud")).toEqual({ contextWindow: 131_072 });
    expect(fallbackCalls.map((call) => call.url)).toEqual([
      "http://localhost:20128/api/health",
      "http://localhost:20128/api/version",
      "http://localhost:20128/api/tags",
      "http://localhost:20128/models",
      "http://localhost:20128/v1/models",
    ]);
  });
  test("detects 9router via /api/version and prefers the real /v1/models catalog over static tags", async () => {
    const calls: Call[] = [];
    const result = await probeGateway({
      endpoint: "http://localhost:20128",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:20128/api/health": 404,
        "http://localhost:20128/api/version": { currentVersion: "0.5.69", latestVersion: "0.5.69", hasUpdate: false },
        "http://localhost:20128/api/tags": { models: [{ name: "llama3.2" }] },
        "http://localhost:20128/models": 404,
        "http://localhost:20128/v1/models": {
          data: [{
            id: "ollama-cloud/glm-5.3-flash",
            capabilities: { vision: true, reasoning: true, thinkingFormat: "zai", contextWindow: 1_000_000, maxOutput: 131_072 },
            context_length: 1_000_000,
            max_completion_tokens: 131_072,
          }],
        },
      }, calls),
    });
    expect(result.ids).toEqual(["ollama-cloud/glm-5.3-flash"]);
    expect(result.baseUrl).toBe("http://localhost:20128/v1");
    expect(result.metadataById.get("ollama-cloud/glm-5.3-flash")).toEqual({
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      vision: true,
      reasoning: true,
      thinkingFormat: "zai",
    });
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:20128/api/health",
      "http://localhost:20128/api/version",
      "http://localhost:20128/models",
      "http://localhost:20128/v1/models",
    ]);
  });

  test("genuine Ollama version shape never triggers the 9router catalog path", async () => {
    const calls: Call[] = [];
    const result = await probeGateway({
      endpoint: "http://localhost:11434",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:11434/api/health": 404,
        "http://localhost:11434/api/version": { version: "0.12.6" },
        "http://localhost:11434/api/tags": { models: [{ name: "llama3.2" }] },
        "http://localhost:11434/api/show": {},
      }, calls),
    });
    expect(result.ids).toEqual(["llama3.2"]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/health",
      "http://localhost:11434/api/version",
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/show",
    ]);
  });

  test("confirmed 9router with an empty OpenAI list returns empty instead of placeholder tags models", async () => {
    const calls: Call[] = [];
    const result = await probeGateway({
      endpoint: "http://localhost:20128",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:20128/api/health": 404,
        "http://localhost:20128/api/version": { currentVersion: "0.5.69", latestVersion: "0.5.69", hasUpdate: false },
        "http://localhost:20128/api/tags": { models: [{ name: "llama3.2" }] },
        "http://localhost:20128/models": 404,
        "http://localhost:20128/v1/models": { data: [] },
      }, calls),
    });
    expect(result.ids).toEqual([]);
    expect(result.metadataById.size).toBe(0);
  });

  test("detects OmniRoute marker and routes to OpenAI model list, skipping tags", async () => {
    const calls: Call[] = [];
    const omni = await probeGateway({
      endpoint: "https://omniroute.example",
      api: "ollama-chat",
      fetch: routedFetch({
        "https://omniroute.example/api/health": { status: "ok", timestamp: "2026-01-01T00:00:00Z" },
        "https://omniroute.example/v1/models": {
          data: [{ id: "omni-model", context_window: 128_000 }],
        },
      }, calls),
    });
    expect(omni.ids).toEqual(["omni-model"]);
    expect(omni.metadataById.get("omni-model")).toEqual({ contextWindow: 128_000 });
    expect(calls.map((call) => call.url)).toEqual([
      "https://omniroute.example/api/health",
      "https://omniroute.example/models",
      "https://omniroute.example/v1/models",
    ]);
    expect(calls.map((call) => call.url)).not.toContain("https://omniroute.example/api/tags");
  });

  test("ignores missing health marker and proceeds to normal Ollama tags flow", async () => {
    const calls: Call[] = [];
    const genuine = await probeGateway({
      endpoint: "http://localhost:11434",
      api: "ollama-chat",
      fetch: routedFetch({
        "http://localhost:11434/api/health": 404,
        "http://localhost:11434/api/tags": { models: [{ name: "llama3", capabilities: [] }] },
        "http://localhost:11434/api/show": { model_info: { "llama3.context_length": 8_192 } },
      }, calls),
    });
    expect(genuine.ids).toEqual(["llama3"]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/health",
      "http://localhost:11434/api/version",
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/show",
    ]);
  });

  test("detects OmniRoute marker but handles empty model list gracefully", async () => {
    const calls: Call[] = [];
    const empty = await probeGateway({
      endpoint: "https://omniroute.example",
      api: "ollama-chat",
      fetch: routedFetch({
        "https://omniroute.example/api/health": { status: "ok", timestamp: "now" },
        "https://omniroute.example/v1/models": { data: [] },
      }, calls),
    });
    expect(empty.ids).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://omniroute.example/api/health",
      "https://omniroute.example/models",
      "https://omniroute.example/v1/models",
    ]);
  });

  test("treats timeout and non-2xx model endpoints as evidence absence", async () => {
    const rejected = await probeGateway({
      endpoint: "http://localhost:4100",
      api: "openai-completions",
      preset: "generic",
      fetch: async () => json({ error: "unavailable" }, 503),
    });
    expect(rejected).toMatchObject({ ids: [] });
    expect(rejected.metadataById.size).toBe(0);

    const timedOut = await probeGateway({
      endpoint: "http://localhost:4101",
      api: "openai-completions",
      preset: "generic",
      timeoutMs: 1,
      fetch: async () => new Promise<Response>(() => undefined),
    });
    expect(timedOut).toMatchObject({ ids: [] });
    expect(timedOut.metadataById.size).toBe(0);
  });

});

describe("better-custom developer-role probe", () => {
  test("uses the documented minimal developer wire shape and system control without leaking a key", async () => {
    const secret = "sk-never-return-or-log";
    const calls: Call[] = [];
    const accepted = await probeDeveloperRole({
      endpoint: "https://gateway.example/v1/chat/completions",
      modelId: "wire-model",
      apiKey: secret,
      fetch: routedFetch({
        "https://gateway.example/v1/chat/completions": { choices: [{ message: { content: "OK" } }] },
      }, calls),
    });
    expect(accepted).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      "https://gateway.example/v1/chat/completions",
      "https://gateway.example/v1/chat/completions",
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: "wire-model",
      stream: false,
      max_tokens: 1,
      messages: [{ role: "developer", content: "Reply with OK" }],
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      model: "wire-model",
      stream: false,
      max_tokens: 1,
      messages: [{ role: "system", content: "Reply with OK" }],
    });
    expect(JSON.stringify({ accepted, urls: calls.map((call) => call.url) })).not.toContain(secret);

    let attempt = 0;
    const rejected = await probeDeveloperRole({
      endpoint: "https://gateway.example/v1",
      modelId: "wire-model",
      fetch: async () => ++attempt === 1
        ? json({ error: { message: "developer role is unsupported" } }, 400)
        : json({ choices: [{ message: { content: "OK" } }] }),
    });
    expect(rejected).toBe(false);

    const malformed = await probeDeveloperRole({
      endpoint: "https://gateway.example/v1",
      modelId: "wire-model",
      fetch: async () => json({ choices: [] }),
    });
    expect(malformed).toBe(false);
  });

  test("records a bool-ToolProperty 400 as unsupported developer role, never an error", async () => {
    const rejected = await probeDeveloperRole({
      endpoint: "http://localhost:20128/v1",
      modelId: "ollama/glm-5.3-flash:cloud",
      fetch: async () => json({ error: "json: cannot unmarshal bool into Go value of type api.ToolProperty" }, 400),
    });
    expect(rejected).toBe(false);
  });
});

describe("better-custom OmniRoute catalog metadata", () => {
  test("parses effort_tiers, modalities, and thinking markers", async () => {
    const catalog = {
      data: [
        {
          id: "omni-model",
          capabilities: {
            effort_tiers: ["low", "medium", "high", "ultra", "extra"],
            input_modalities: ["text", "image"],
            output_modalities: ["text"],
            tool_calling: true,
            attachment: true,
            structured_output: true,
            temperature: 0.7,
            supportsThinking: true,
          },
          thinking: true,
          architecture: {
            input_modalities: ["text"],
          },
        },
      ],
    };
    const metadata = (await probeGateway({ endpoint: "http://localhost:20128/v1", api: "openai-completions", preset: "omniroute", fetch: routedFetch({ "http://localhost:20128/v1/models": catalog }, []) }))?.metadataById.get("omni-model");
    expect(metadata?.reasoning).toBe(true);
    expect(metadata?.effortOptions).toEqual(["low", "medium", "high", "ultra", "extra"]);
    expect(metadata?.vision).toBe(true);
  });

  test("omits 'none' from effort_tiers and handles v1beta thinking", async () => {
    const catalog = {
      data: [
        {
          id: "thinking-model",
          capabilities: {
            effort_tiers: ["none", "low", "high"],
          },
          thinking: true,
        },
      ],
    };
    const metadata = (await probeGateway({ endpoint: "http://localhost:20128/v1", api: "openai-completions", preset: "omniroute", fetch: routedFetch({ "http://localhost:20128/v1/models": catalog }, []) }))?.metadataById.get("thinking-model");
    expect(metadata?.reasoning).toBe(true);
    expect(metadata?.effortOptions).toEqual(["low", "high"]);
  });
});
