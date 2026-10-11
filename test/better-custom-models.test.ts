import { describe, expect, test } from "bun:test";
import { buildProviderConfig } from "../plugins/better-custom/src/model-entry.ts";
import type { ModelsConfig } from "../plugins/better-custom/src/types.ts";

/** The model-browser module is the planned host-neutral seam for TASK-30. */
const MODEL_BROWSER_MODULE = "../plugins/better-custom/src/model-browser.ts";
type ModuleExports = Record<string, unknown>;

type ModelRecord = {
  id: string;
  provider: string;
  name?: string;
  isFree?: boolean;
  family?: string;
  cost?: { input: number; output: number };
};

type ProviderSource = {
  id: string;
  authenticated: boolean;
  origin: "native" | "better-custom" | "pi-free";
  models: readonly ModelRecord[];
};

type ProviderGroup = {
  id: string;
  models: ModelRecord[];
  freeCount: number;
};

type UnifiedModelView = {
  providers: ProviderGroup[];
  families: Array<{ id: string; displayName: string; models: ModelRecord[] }>;
  freeModels: ModelRecord[];
};

type RegisterProviderApi = {
  registerProvider(name: string, config: Record<string, unknown>): void;
};

type RegisterBetterCustomProviders = (pi: RegisterProviderApi, config: ModelsConfig) => void;
type BuildUnifiedModelView = (sources: readonly ProviderSource[]) => UnifiedModelView;

async function loadModelBrowser(): Promise<ModuleExports> {
  try {
    return await import(MODEL_BROWSER_MODULE) as ModuleExports;
  } catch {
    // Keep the RED contract assertion-level while the planned module is absent.
    return {};
  }
}

function providerRefs(groups: readonly ProviderGroup[]): string[] {
  return groups.flatMap((group) => group.models.map((model) => `${model.provider}/${model.id}`));
}

describe("better-custom native /model integration", () => {
  test("registers every configured custom model through the native provider seam", async () => {
    const module = await loadModelBrowser();
    const register = module.registerBetterCustomProviders;
    expect(register).toBeTypeOf("function");
    if (typeof register !== "function") return;

    const provider = buildProviderConfig({
      style: "openai-completions",
      api: "openai-completions",
      baseUrl: "https://custom.example/v1",
      apiKey: { mode: "literal", value: "test-key" },
      modelIds: ["custom-alpha", "custom-beta"],
    });
    const config: ModelsConfig = { providers: { custom: provider } };
    const calls: Array<{ name: string; config: Record<string, unknown> }> = [];
    const pi: RegisterProviderApi = {
      registerProvider(name, registered) {
        calls.push({ name, config: registered });
      },
    };

    register(pi, config);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("custom");
    const models = calls[0]?.config.models as Array<{ id: string }>;
    expect(models.map((model) => model.id)).toEqual(["custom-alpha", "custom-beta"]);
    expect(calls[0]?.config).toMatchObject({
      api: "openai-completions",
      baseUrl: "https://custom.example/v1",
      apiKey: "test-key",
    });
  });
});

describe("better-custom unified authenticated model view", () => {
  test("includes native and better-custom models from every authenticated provider", async () => {
    const module = await loadModelBrowser();
    const build = module.buildUnifiedModelView;
    expect(build).toBeTypeOf("function");
    if (typeof build !== "function") return;

    const view = (build as BuildUnifiedModelView)([
      {
        id: "anthropic",
        origin: "native",
        authenticated: true,
        models: [{ provider: "anthropic", id: "claude-sonnet", family: "claude" }],
      },
      {
        id: "custom",
        origin: "better-custom",
        authenticated: true,
        models: [{ provider: "custom", id: "custom-alpha", family: "custom" }],
      },
      {
        id: "unauthed",
        origin: "native",
        authenticated: false,
        models: [{ provider: "unauthed", id: "hidden-model", family: "hidden" }],
      },
    ]);

    expect(view.providers.map((provider) => provider.id)).toEqual(["anthropic", "custom"]);
    expect(providerRefs(view.providers)).toEqual(["anthropic/claude-sonnet", "custom/custom-alpha"]);
    expect(view.families.flatMap((family) => family.models.map((model) => model.id))).toEqual([
      "claude-sonnet",
      "custom-alpha",
    ]);
  });

  test("puts pi-free models into the same provider and free-model views", async () => {
    const module = await loadModelBrowser();
    const build = module.buildUnifiedModelView;
    expect(build).toBeTypeOf("function");
    if (typeof build !== "function") return;

    const view = (build as BuildUnifiedModelView)([
      {
        id: "kilo",
        origin: "pi-free",
        authenticated: true,
        models: [{
          provider: "kilo",
          id: "free-model",
          name: "Free Model",
          isFree: true,
          cost: { input: 0, output: 0 },
          family: "free-family",
        }],
      },
      {
        id: "custom",
        origin: "better-custom",
        authenticated: true,
        models: [{ provider: "custom", id: "custom-alpha", isFree: false, family: "custom" }],
      },
    ]);

    expect(view.providers.find((provider) => provider.id === "kilo")?.models.map((model) => model.id)).toEqual(["free-model"]);
    expect(view.freeModels.map((model) => `${model.provider}/${model.id}`)).toEqual(["kilo/free-model"]);
    expect(view.families.flatMap((family) => family.models.map((model) => `${model.provider}/${model.id}`))).toContain("kilo/free-model");
  });
});
