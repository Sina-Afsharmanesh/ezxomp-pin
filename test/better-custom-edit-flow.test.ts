import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editProviderFlow } from "../plugins/better-custom/src/flows/edit.ts";
import { readModelOptions } from "../plugins/better-custom/src/model-entry.ts";
import type { GatewayProbeResult } from "../plugins/better-custom/src/probe/index.ts";
import { SELECT_CANCEL } from "../plugins/better-custom/src/ui/select.ts";
import type { CommandContext } from "../plugins/better-custom/src/types.ts";

const TEMP_ROOT = join(process.cwd(), ".test-tmp");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function configPath(source: unknown): Promise<string> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TEMP_ROOT, "better-custom-edit-"));
  tempDirs.push(dir);
  const path = join(dir, "models.json");
  await writeFile(path, JSON.stringify(source, null, 2) + "\n");
  return path;
}

async function configText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

type FakeContext = {
  ctx: CommandContext;
  notices: Array<{ message: string; type?: string }>;
};

function fakeContext(options: {
  inputs?: Array<string | undefined>;
  selects?: Array<string | undefined>;
  customs?: unknown[];
  confirms?: boolean[];
}): FakeContext {
  const inputs = [...(options.inputs ?? [])];
  const selects = [...(options.selects ?? [])];
  const customs = [...(options.customs ?? [])];
  const confirms = [...(options.confirms ?? [])];
  const notices: Array<{ message: string; type?: string }> = [];
  const ctx = {
    ui: {
      input: async () => inputs.shift(),
      select: async () => selects.shift(),
      confirm: async () => confirms.shift() ?? false,
      custom: async () => customs.shift() as never,
      notify(message: string, type?: string) { notices.push({ message, type }); },
      setWorkingMessage() {},
    },
  } as unknown as CommandContext;
  return { ctx, notices };
}

function targetConfig() {
  return {
    unknownRoot: { retain: ["every", "byte"] },
    providers: {
      target: {
        api: "openai-completions",
        apiKey: "old-key",
        baseUrl: "https://old.example/v1",
        headers: { "x-provider": "old" },
        compat: { unknownCompat: "keep" },
        unknownProvider: { retain: true },
        models: [
          {
            id: "changed",
            api: "openai-completions",
            input: ["text"],
            contextWindow: 1_024,
            maxTokens: 128,
            headers: { "x-model": "old" },
            unknownModel: { retain: true },
          },
          {
            id: "untouched",
            api: "openai-completions",
            input: ["text", "image"],
            unknownModel: { nested: [1, 2, 3] },
          },
        ],
      },
      unrelated: {
        api: "anthropic-messages",
        baseUrl: "https://unrelated.example/v1",
        unknownProvider: { retain: "all" },
        models: [{ id: "keep", input: ["text"] }],
      },
    },
  };
}

describe("better-custom edit-provider flow", () => {
  test("updates provider settings without changing unrelated config or model data", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      inputs: [
        "https://new.example/v1",
        "new-literal-key",
        '{"x-provider":"new"}',
        "renamed",
      ],
      selects: ["literal"],
      customs: [
        "target",
        "endpoint",
        "api-key",
        "api",
        "openai-responses",
        "headers",
        "developer-role",
        "supported",
        "rename",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, Record<string, unknown>>; unknownRoot: unknown };
    expect(config.unknownRoot).toEqual({ retain: ["every", "byte"] });
    expect(config.providers).not.toHaveProperty("target");
    expect(config.providers.renamed).toMatchObject({
      api: "openai-responses",
      apiKey: "new-literal-key",
      baseUrl: "https://new.example/v1",
      headers: { "x-provider": "new" },
      compat: { unknownCompat: "keep", supportsDeveloperRole: true },
      unknownProvider: { retain: true },
    });
    expect(config.providers.renamed?.models).toEqual([
      expect.objectContaining({
        id: "changed",
        api: "openai-responses",
        unknownModel: { retain: true },
      }),
      expect.objectContaining({
        id: "untouched",
        api: "openai-responses",
        unknownModel: { nested: [1, 2, 3] },
      }),
    ]);
    expect(config.providers.unrelated).toEqual(targetConfig().providers.unrelated);
  });

  test("updates every supported per-model setting while preserving all untouched fields", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      inputs: [
        "4096",
        "512",
        '{"x-model":"new"}',
        "https://model.example/v1",
      ],
      selects: ["high", "yes"],
      customs: [
        "target",
        "models",
        "changed",
        "reasoning",
        "vision",
        "context",
        "max-tokens",
        "headers",
        "base-url",
        "back",
        SELECT_CANCEL,
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    const changed = config.providers.target!.models[0]!;
    expect(readModelOptions(changed)).toMatchObject({
      reasoning: "high",
      vision: true,
      contextWindow: 4_096,
      maxTokens: 512,
      headers: { "x-model": "new" },
      baseUrl: "https://model.example/v1",
    });
    expect(changed).toMatchObject({
      unknownModel: { retain: true },
      input: ["text", "image"],
      thinking: {
        mode: "effort",
        efforts: ["minimal", "low", "medium", "high"],
        defaultLevel: "high",
      },
    });
    expect(changed).not.toHaveProperty("thinkingLevelMap");
    expect(config.providers.target!.models[1]).toEqual(targetConfig().providers.target.models[1]);
    expect(config.providers.unrelated).toEqual(targetConfig().providers.unrelated);
  });

  test("writes host thinking data that reads back at the selected xhigh ceiling", async () => {
    const source = JSON.parse(JSON.stringify(targetConfig())) as {
      providers: Record<string, { models: Array<Record<string, unknown>> }>;
    };
    source.providers.target!.models[0]!.thinkingLevelMap = { high: "high", xhigh: "extended" };
    const path = await configPath(source);
    const current = fakeContext({
      selects: ["xhigh"],
      customs: [
        "target",
        "models",
        "changed",
        "reasoning",
        "back",
        SELECT_CANCEL,
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    const model = config.providers.target!.models[0]!;
    expect(model.thinking).toMatchObject({
      mode: "effort",
      efforts: ["minimal", "low", "medium", "high", "xhigh"],
      defaultLevel: "xhigh",
    });
    expect(readModelOptions(model).reasoning).toBe("xhigh");
    expect(model).not.toHaveProperty("thinkingLevelMap");
  });

  test("deletes only the confirmed model", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      confirms: [true],
      customs: [
        "target",
        "models",
        "changed",
        "delete",
        SELECT_CANCEL,
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    expect(config.providers.target!.models).toEqual([targetConfig().providers.target.models[1]]);
    expect(config.providers.unrelated).toEqual(targetConfig().providers.unrelated);
  });

  test("rejects a rename collision after reloading config without writing bytes", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      inputs: ["unrelated"],
      customs: ["target", "rename", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes('Provider "unrelated" already exists'))).toBe(true);
  });

  test("revalidates a rename collision introduced while the prompt is open", async () => {
    const source = targetConfig();
    const path = await configPath(source);
    const current = fakeContext({ customs: ["target", "rename", "back", SELECT_CANCEL] });
    const concurrent = {
      ...source,
      providers: {
        ...source.providers,
        late: { api: "openai-completions", models: [{ id: "late-model" }] },
      },
    };
    const concurrentText = JSON.stringify(concurrent, null, 2) + "\n";
    current.ctx.ui.input = async () => {
      await writeFile(path, concurrentText);
      return "late";
    };

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(concurrentText);
    expect(current.notices.some(({ message }) => message.includes('Provider "late" already exists'))).toBe(true);
  });

  test("cancels without writing and reports an actionable outcome", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({ customs: [SELECT_CANCEL] });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("canceled"))).toBe(true);
  });

  test("rejects an invalid endpoint without writing and reports why", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      inputs: ["https://"],
      customs: ["target", "endpoint", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Invalid endpoint"))).toBe(true);
  });

  test("rejects invalid headers without writing and reports why", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      inputs: ["not-json"],
      customs: ["target", "headers", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Headers must be a JSON object"))).toBe(true);
  });

  test("calls the probe only for an explicit metadata refresh", async () => {
    const path = await configPath(targetConfig());
    let calls = 0;
    const runner = async (): Promise<GatewayProbeResult> => {
      calls += 1;
      const metadataById = new Map([["fresh", { vision: true, reasoning: true }]]);
      return {
        baseUrl: "https://old.example/v1",
        ids: ["fresh"],
        metadataById,
        infoById: metadataById,
      };
    };

    const endpointOnly = fakeContext({
      inputs: ["https://changed.example/v1"],
      customs: ["target", "endpoint", "back", SELECT_CANCEL],
    });
    expect(await editProviderFlow(endpointOnly.ctx, { configTarget: path, probeGateway: runner })).toBe(true);
    expect(calls).toBe(0);

    const refresh = fakeContext({
      selects: ["auto"],
      customs: ["target", "refresh", "auto", ["fresh"], "back", SELECT_CANCEL],
    });
    expect(await editProviderFlow(refresh.ctx, { configTarget: path, probeGateway: runner })).toBe(true);
    expect(calls).toBe(1);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    expect(config.providers.target!.models).toContainEqual(expect.objectContaining({ id: "fresh", input: ["text", "image"] }));
  });

  test("rename slugifies input and requires confirmation before shadowing a built-in provider id", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      inputs: ["Open AI", "y"],
      customs: ["target", "rename", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, unknown> };
    expect(config.providers).not.toHaveProperty("target");
    expect(config.providers).toHaveProperty("open-ai");
    expect(current.notices.some(({ message }) => message.includes("Renamed provider"))).toBe(true);
  });

  test("declines a built-in id override without writing and reprompts for a safe name", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      inputs: ["openai", "safe-name"],
      customs: ["target", "rename", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    expect(await configText(path)).not.toBe(before);
    const config = JSON.parse(await configText(path)) as { providers: Record<string, unknown> };
    expect(config.providers).toHaveProperty("safe-name");
    expect(config.providers).not.toHaveProperty("openai");
  });

  test("keeps an env-ref api key byte-for-byte when the key edit is left blank", async () => {
    const source = targetConfig();
    source.providers.target.apiKey = "$OPENAI_API_KEY";
    const path = await configPath(source);
    const before = await configText(path);
    const current = fakeContext({
      inputs: [""],
      selects: ["$env"],
      customs: ["target", "api-key", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);

    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("kept as $env reference"))).toBe(true);
  });

  test("serializes literal, environment, and shell keys through the edit flow without exposing secrets", async () => {
    const cases = [
      { selection: "literal", value: "plain-secret", expected: "plain-secret" },
      { selection: "$env", value: "OPENAI_KEY_NAME", expected: "$OPENAI_KEY_NAME" },
      { selection: "!shell-command", value: "op read op://vault/api-key", expected: "!op read op://vault/api-key" },
    ] as const;

    for (const testCase of cases) {
      const path = await configPath(targetConfig());
      const current = fakeContext({
        inputs: [testCase.value],
        selects: [testCase.selection],
        customs: ["target", "api-key", "back", SELECT_CANCEL],
      });

      expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

      const config = JSON.parse(await configText(path)) as { providers: Record<string, { apiKey?: unknown }> };
      expect(config.providers.target?.apiKey).toBe(testCase.expected);
      expect(config.providers.target?.apiKey).not.toContain("old-key");
    }
  });

  test("explicit none selection still clears an existing key to the placeholder", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      selects: ["none"],
      customs: ["target", "api-key", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { apiKey?: string }> };
    expect(config.providers.target?.apiKey).toBe("dummy");
  });

  test("selecting the current api flavor reports unchanged without writing bytes", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      customs: ["target", "api", "openai-completions", "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);

    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes('Provider API is already "openai-completions"'))).toBe(true);
  });

  test("blank context-window input keeps the current value without writing bytes", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    const current = fakeContext({
      inputs: [""],
      customs: [
        "target",
        "models",
        "changed",
        "context",
        SELECT_CANCEL,
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(false);

    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Context window kept at current value."))).toBe(true);
    expect(current.notices.some(({ message }) => message.includes("canceled"))).toBe(true);
  });

  test("'-' clears per-model baseUrl while other model fields survive", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      inputs: ["-"],
      customs: [
        "target",
        "models",
        "changed",
        "base-url",
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    const changed = config.providers.target!.models[0]!;
    expect(changed).not.toHaveProperty("baseUrl");
    expect(readModelOptions(changed)).not.toHaveProperty("baseUrl");
    // Untouched sibling fields survive.
    expect(changed).toMatchObject({ headers: { "x-model": "old" }, unknownModel: { retain: true } });
  });

  test("'-' clears per-model headers while other model fields survive", async () => {
    const path = await configPath(targetConfig());
    const current = fakeContext({
      inputs: ["-"],
      customs: [
        "target",
        "models",
        "changed",
        "headers",
        "back",
        SELECT_CANCEL,
      ],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    const changed = config.providers.target!.models[0]!;
    expect(changed).not.toHaveProperty("headers");
    expect(readModelOptions(changed)).not.toHaveProperty("headers");
    expect(changed).toMatchObject({ contextWindow: 1_024, unknownModel: { retain: true } });
  });

  test("metadata refresh re-probes once and merges fresh gateway fields into existing models", async () => {
    const source = targetConfig();
    // Stale locally-stored contextWindow plus a local connection override.
    source.providers.target.models[0]!.contextWindow = 1_024;
    source.providers.target.models[0]!.headers = { "x-model": "keep-me" };
    const path = await configPath(source);
    let calls = 0;
    const runner = async (): Promise<GatewayProbeResult> => {
      calls += 1;
      const metadataById = new Map([
        ["changed", { contextWindow: 262_144, reasoning: false }],
        ["fresh", { vision: true }],
      ]);
      return { baseUrl: "https://old.example/v1", ids: ["changed", "fresh"], metadataById, infoById: metadataById };
    };

    const current = fakeContext({
      selects: ["auto"],
      customs: ["target", "refresh", "auto", ["changed", "fresh"], "back", SELECT_CANCEL],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path, probeGateway: runner })).toBe(true);
    expect(calls).toBe(1);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, { models: Array<Record<string, unknown>> }> };
    const models = config.providers.target!.models;
    const changed = models.find((model) => model.id === "changed")!;
    // Fresh gateway metadata overwrote the stale stored value...
    expect(changed.contextWindow).toBe(262_144);
    // ...the local connection override persisted...
    expect(changed.headers).toEqual({ "x-model": "keep-me" });
    // ...and unknown fields survived the merge.
    expect(changed.unknownModel).toEqual({ retain: true });
    // A model absent from the probe keeps its stored entry untouched.
    const untouched = models.find((model) => model.id === "untouched")!;
    expect(untouched).toEqual(targetConfig().providers.target.models[1]);
    // The unseen-by-config model was added with probe metadata applied.
    expect(models).toContainEqual(expect.objectContaining({ id: "fresh", input: ["text", "image"] }));
  });

  test("a failed metadata refresh leaves config bytes unchanged with an actionable notice", async () => {
    const path = await configPath(targetConfig());
    const before = await configText(path);
    let calls = 0;
    const runner = async (): Promise<GatewayProbeResult> => {
      calls += 1;
      throw new Error("offline");
    };

    const current = fakeContext({
      selects: ["cancel"],
      customs: ["target", "refresh", "auto"],
    });

    expect(await editProviderFlow(current.ctx, { configTarget: path, probeGateway: runner })).toBe(false);

    expect(calls).toBe(1);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Auto probe failed"))).toBe(true);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });
});
