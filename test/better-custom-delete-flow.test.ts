import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deleteProviderFlow } from "../plugins/better-custom/src/flows/delete.ts";
import type { CommandContext } from "../plugins/better-custom/src/types.ts";
import { SELECT_CANCEL } from "../plugins/better-custom/src/ui/select.ts";

const TEMP_ROOT = join(process.cwd(), ".test-tmp");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function configPath(source: unknown): Promise<string> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TEMP_ROOT, "better-custom-delete-"));
  tempDirs.push(dir);
  const path = join(dir, "models.json");
  await writeFile(path, JSON.stringify(source, null, 2) + "\n");
  return path;
}

async function configText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

type FakeContext = {
  confirmCalls: () => number;
  ctx: CommandContext;
  notices: Array<{ message: string; type?: string }>;
};

function fakeContext(
  selectedProvider: string | typeof SELECT_CANCEL,
  confirmed: boolean,
  onConfirm?: () => Promise<void>,
  onSelect?: () => Promise<void>,
): FakeContext {
  const notices: Array<{ message: string; type?: string }> = [];
  let confirmCalls = 0;
  const ctx = {
    ui: {
      input: async () => undefined,
      select: async () => undefined,
      custom: async () => {
        await onSelect?.();
        return selectedProvider;
      },
      confirm: async () => {
        confirmCalls += 1;
        await onConfirm?.();
        return confirmed;
      },
      notify(message: string, type?: string) {
        notices.push({ message, type });
      },
      setWorkingMessage() {},
    },
  } as unknown as CommandContext;
  return { confirmCalls: () => confirmCalls, ctx, notices };
}

describe("better-custom delete-provider flow", () => {
  test("removes only the confirmed provider and preserves unrelated configuration", async () => {
    const source = {
      unknownTopLevel: { retain: ["nested", 3] },
      providers: {
        keep: {
          api: "openai-completions",
          baseUrl: "https://keep.example/v1",
          headers: { "X-Keep": "yes" },
          models: [{ id: "keep-model" }],
          retained: "yes",
        },
        remove: {
          api: "openai-responses",
          baseUrl: "https://remove.example/v1",
          models: [{ id: "remove-model" }],
        },
      },
    };
    const path = await configPath(source);
    const current = fakeContext("remove", true);

    expect(await deleteProviderFlow(current.ctx, { configTarget: path })).toBe(true);
    expect(JSON.parse(await configText(path))).toEqual({
      unknownTopLevel: source.unknownTopLevel,
      providers: { keep: source.providers.keep },
    });
    expect(current.confirmCalls()).toBe(1);
    expect(current.notices.some(({ message }) => message.includes('Deleted provider "remove"'))).toBe(true);
  });

  test("canceled selection leaves configuration bytes unchanged without confirming", async () => {
    const path = await configPath({ providers: { remove: { models: [{ id: "remove-model" }] } } });
    const before = await configText(path);
    const current = fakeContext(SELECT_CANCEL, true);

    expect(await deleteProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.confirmCalls()).toBe(0);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });

  test("rejected confirmation leaves configuration bytes unchanged", async () => {
    const path = await configPath({ providers: { remove: { models: [{ id: "remove-model" }] } } });
    const before = await configText(path);
    const current = fakeContext("remove", false);

    expect(await deleteProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(before);
    expect(current.confirmCalls()).toBe(1);
    expect(current.notices.some(({ message }) => message.includes("configuration is unchanged"))).toBe(true);
  });

  test("does not delete a same-id replacement written while confirmation is open", async () => {
    const initial = {
      unknownTopLevel: { retain: true },
      providers: {
        keep: { models: [{ id: "keep-model" }] },
        selected: { api: "openai-completions", models: [{ id: "old-model" }], generation: "old" },
      },
    };
    const replacement = {
      unknownTopLevel: initial.unknownTopLevel,
      providers: {
        keep: initial.providers.keep,
        selected: { api: "anthropic-messages", models: [{ id: "replacement-model" }], generation: "new" },
      },
    };
    const path = await configPath(initial);
    const replacementText = JSON.stringify(replacement, null, 2) + "\n";
    const current = fakeContext("selected", true, () => writeFile(path, replacementText));

    expect(await deleteProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(replacementText);
    expect(current.confirmCalls()).toBe(1);
    expect(current.notices.some(({ message }) => message.includes("changed while confirmation was open"))).toBe(true);
  });

  test("does not delete a provider that vanished while selection was open", async () => {
    const initial = {
      unknownTopLevel: { retain: true },
      providers: {
        keep: { models: [{ id: "keep-model" }] },
        vanishing: { api: "openai-completions", models: [{ id: "gone-model" }] },
      },
    };
    const vanished = {
      unknownTopLevel: initial.unknownTopLevel,
      providers: { keep: initial.providers.keep },
    };
    const path = await configPath(initial);
    const vanishedText = JSON.stringify(vanished, null, 2) + "\n";
    const current = fakeContext("vanishing", true, undefined, () => writeFile(path, vanishedText));

    expect(await deleteProviderFlow(current.ctx, { configTarget: path })).toBe(false);
    expect(await configText(path)).toBe(vanishedText);
    expect(current.confirmCalls()).toBe(0);
    expect(current.notices.some(({ message }) => message.includes('"vanishing" no longer exists'))).toBe(true);
  });
});
