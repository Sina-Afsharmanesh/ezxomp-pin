import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addProviderFlow } from "../plugins/better-custom/src/flows/add.ts";
import { SELECT_CANCEL } from "../plugins/better-custom/src/ui/select.ts";
import type { CommandContext } from "../plugins/better-custom/src/types.ts";

const TEMP_ROOT = join(process.cwd(), ".test-tmp");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function configPath(source: unknown): Promise<string> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TEMP_ROOT, "better-custom-add-"));
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
  working: Array<string | undefined>;
};

function fakeContext(
  inputs: Array<string | undefined>,
  selects: Array<string | undefined>,
  customs: unknown[],
): FakeContext {
  const notices: Array<{ message: string; type?: string }> = [];
  const working: Array<string | undefined> = [];
  const ctx = {
    ui: {
      input: async () => inputs.shift(),
      select: async () => selects.shift(),
      confirm: async () => true,
      custom: async () => customs.shift() as never,
      notify(message: string, type?: string) { notices.push({ message, type }); },
      setWorkingMessage(message?: string) { working.push(message); },
    },
  } as unknown as CommandContext;
  return { ctx, notices, working };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("better-custom add-provider flow", () => {
  test("adds an OpenAI completions provider through discovery and checks developer-role support once", async () => {
    const path = await configPath({ unknownRoot: { preserve: true }, providers: { unrelated: { api: "other", models: [{ id: "keep" }] } } });
    const current = fakeContext(
      ["https://gateway.example/v1", "acme", "secret"],
      ["openai-completions", "literal", "generic"],
      ["auto", ["gpt-test"]],
    );
    const requests: string[] = [];
    let developerRoleCalls = 0;

    const added = await addProviderFlow(current.ctx, {
      configTarget: path,
      fetch: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url === "https://gateway.example/v1/models") return json({ data: [{ id: "gpt-test" }] });
        if (url === "https://gateway.example/v1/models/gpt-test") return json({ context_window: 128_000, supports_vision: true });
        return json({ error: "missing route" }, 404);
      },
      probeDeveloperRole: async () => {
        developerRoleCalls += 1;
        return true;
      },
    });

    const config = JSON.parse(await configText(path)) as { unknownRoot: unknown; providers: Record<string, Record<string, unknown>> };
    const provider = config.providers.acme!;
    const model = provider.models as Array<Record<string, unknown>>;
    expect(added).toBe(true);
    expect(config.unknownRoot).toEqual({ preserve: true });
    expect(config.providers.unrelated).toEqual({ api: "other", models: [{ id: "keep" }] });
    expect(provider.api).toBe("openai-completions");
    expect(provider.compat).toEqual({ supportsDeveloperRole: true });
    expect(model).toHaveLength(1);
    expect(model[0]?.id).toBe("gpt-test");
    expect(model[0]?.contextWindow).toBe(128_000);
    expect(model[0]?.input).toEqual(["text", "image"]);
    const detectedThinking = model[0]?.thinking as { defaultLevel?: string } | undefined;
    expect(detectedThinking?.defaultLevel).toBe("xhigh");
    expect(developerRoleCalls).toBe(1);
    expect(requests).toContain("https://gateway.example/v1/models");
  });

  test("creates a host-compatible provider for every supported style", async () => {
    const styles = [
      "openai-responses",
      "anthropic-messages",
      "google-generative-ai",
      "ollama-chat",
    ] as const;

    for (const style of styles) {
      const path = await configPath({ providers: {} });
      const current = fakeContext(
        ["https://" + style + ".example/v1", "provider-" + style, "model-" + style, ""],
        [style, "none"],
        ["manual"],
      );
      let developerRoleCalls = 0;
      const added = await addProviderFlow(current.ctx, {
        configTarget: path,
        probeDeveloperRole: async () => {
          developerRoleCalls += 1;
          return true;
        },
      });
      const config = JSON.parse(await configText(path)) as { providers: Record<string, Record<string, unknown>> };
      const provider = config.providers["provider-" + style]!;
      const models = provider.models as Array<Record<string, unknown>>;

      expect(added).toBe(true);
      expect(provider.api).toBe(style);
      expect(models[0]?.api).toBe(style);
      expect(developerRoleCalls).toBe(style === "openai-responses" ? 1 : 0);
      if (style === "ollama-chat") expect(provider.apiKey).toBe("ollama");
    }
  });


  test("defaults manual models to text-only while retaining xhigh reasoning", async () => {
    const path = await configPath({ providers: {} });
    const current = fakeContext(
      ["https://manual.example/v1", "manual", "manual-model", ""],
      ["anthropic-messages", "none"],
      ["manual"],
    );

    expect(await addProviderFlow(current.ctx, { configTarget: path })).toBe(true);

    const config = JSON.parse(await configText(path)) as { providers: Record<string, Record<string, unknown>> };
    const models = config.providers.manual!.models as Array<Record<string, unknown>>;
    expect(models[0]?.input).toEqual(["text"]);
    const manualThinking = models[0]?.thinking as { defaultLevel?: string } | undefined;
    expect(manualThinking?.defaultLevel).toBe("xhigh");
  });

  test("serializes every API key mode through add sessions", async () => {
    const modes = [
      {
        name: "literal",
        selection: "literal",
        value: "plain-secret",
        expected: "plain-secret",
      },
      { name: "none", selection: "none", value: undefined, expected: "dummy" },
      {
        name: "environment",
        selection: "$env",
        value: "OPENAI_API_KEY",
        expected: "$OPENAI_API_KEY",
      },
      {
        name: "shell",
        selection: "!shell-command",
        value: "op read op://vault/api-key",
        expected: "!op read op://vault/api-key",
      },
    ] as const;

    for (const mode of modes) {
      const path = await configPath({ providers: {} });
      const current = fakeContext(
        [
          "https://keys.example/v1",
          "keys-" + mode.name,
          ...(mode.value === undefined ? [] : [mode.value]),
          "model-" + mode.name,
          "",
        ],
        ["anthropic-messages", mode.selection],
        ["manual"],
      );

      expect(await addProviderFlow(current.ctx, { configTarget: path })).toBe(true);

      const config = JSON.parse(await configText(path)) as { providers: Record<string, Record<string, unknown>> };
      expect(config.providers["keys-" + mode.name]?.apiKey).toBe(mode.expected);
    }
  });

  test("rejects a duplicate name without changing config bytes", async () => {
    const path = await configPath({ providers: { taken: { api: "openai-completions", models: [{ id: "keep" }] } }, unknown: "keep" });
    const before = await configText(path);
    const current = fakeContext(
      ["https://duplicate.example/v1", "taken", undefined],
      ["openai-completions"],
      [],
    );

    expect(await addProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("already exists"))).toBe(true);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });

  test("cancels at the model picker without writing config", async () => {
    const path = await configPath({ providers: { unrelated: { models: [{ id: "keep" }] } } });
    const before = await configText(path);
    const current = fakeContext(
      ["https://cancel.example/v1", "cancelled", "secret"],
      ["openai-completions", "literal", "generic"],
      ["auto", SELECT_CANCEL],
    );

    expect(await addProviderFlow(current.ctx, {
      configTarget: path,
      fetch: async (input) => String(input) === "https://cancel.example/v1/models"
        ? json({ data: [{ id: "cancel-model" }] })
        : json({ error: "missing route" }, 404),
      probeDeveloperRole: async () => true,
    })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });

  test("offers manual entry after a failed probe and writes only the completed provider", async () => {
    const path = await configPath({ untouched: true, providers: { unrelated: { models: [{ id: "keep" }] } } });
    const current = fakeContext(
      ["https://fallback.example/v1", "fallback", "manual-model", ""],
      ["anthropic-messages", "none", "generic"],
      ["auto", "manual"],
    );

    expect(await addProviderFlow(current.ctx, {
      configTarget: path,
      probeGateway: async () => { throw new Error("offline"); },
    })).toBe(true);

    const config = JSON.parse(await configText(path)) as { untouched: boolean; providers: Record<string, Record<string, unknown>> };
    expect(config.untouched).toBe(true);
    expect(config.providers.unrelated).toEqual({ models: [{ id: "keep" }] });
    expect(config.providers.fallback?.models).toEqual(expect.arrayContaining([expect.objectContaining({ id: "manual-model" })]));
    expect(current.notices.some(({ message }) => message.includes("Auto probe failed"))).toBe(true);
  });

  test("leaves config bytes unchanged for an invalid required endpoint", async () => {
    const path = await configPath({ providers: { unrelated: { models: [{ id: "keep" }] } } });
    const before = await configText(path);
    const current = fakeContext([""], ["openai-completions"], []);

    expect(await addProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Endpoint is required"))).toBe(true);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });

  test("leaves config bytes unchanged when manual fallback is cancelled", async () => {
    const path = await configPath({ providers: { unrelated: { models: [{ id: "keep" }] } } });
    const before = await configText(path);
    const current = fakeContext(
      ["https://failed.example/v1", "failed", undefined],
      ["anthropic-messages", "none", "generic"],
      ["auto", "manual"],
    );

    expect(await addProviderFlow(current.ctx, {
      configTarget: path,
      probeGateway: async () => { throw new Error("offline"); },
    })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Auto probe failed"))).toBe(true);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });


  test("rejects unsupported styles without touching config", async () => {
    const path = await configPath({ providers: { unrelated: { models: [{ id: "keep" }] } } });
    const before = await configText(path);
    const current = fakeContext([], ["unsupported-style"], []);

    expect(await addProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.notices.some(({ message }) => message.includes("Unsupported provider style"))).toBe(true);
  });

});
