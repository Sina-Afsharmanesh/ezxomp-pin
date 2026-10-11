import { clearTimeout, setTimeout } from "node:timers";
import type { Api, AssistantMessage, Context, Model } from "@oh-my-pi/pi-ai";
import { complete } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import { CancellableLoader } from "@oh-my-pi/pi-tui";
import { resolveAugmentSettings, type AugmentSettings } from "./settings.js";
import { buildPromptContext } from "./context.js";
import { buildRetryReminder, parseEnhancedPrompt } from "./parser.js";
import { buildStrategyRequest } from "./strategies/strategy.js";
import type { EnhancementResult } from "./types.js";
export async function enhance(
  ctx: ExtensionCommandContext,
  exec: ExtensionAPI["exec"],
  draft: string,
): Promise<EnhancementResult | null> {
  // resolve may be unavailable in degraded hosts; an unresolvable @smol must
  // fail closed rather than fall back to the active model.
  let model: Model<Api> | undefined;
  try {
    model = ctx.models?.resolve("@smol");
  } catch {
    model = undefined;
  }
  if (!model) {
    throw new Error("Augment requires a configured @smol model.");
  }

  const settings = await loadSettings(ctx);
  const auth = await resolveModelAuth(ctx, model);

  const promptContext = await buildPromptContext(ctx, exec, draft, settings);
  const request = buildStrategyRequest(promptContext);

  const enhanced = await runWithLoader(
    ctx,
    `Augmenting (${promptContext.intent}, ${promptContext.targetFamily})...`,
    async (signal) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const activeRequest = attempt === 0
          ? request
          : appendRetryReminder(request);

        const response = await callLLM(model, auth.apiKey, auth.headers, activeRequest, signal, settings);
        if (!response) return null;

        const text = extractText(response);
        try {
          return parseEnhancedPrompt(text);
        } catch (parseError) {
          if (attempt === 0) continue;
          throw parseError;
        }
      }
      return null;
    }
  );

  if (!enhanced) return null;

  return {
    enhanced,
    intent: promptContext.intent,
    mode: promptContext.effectiveRewriteMode,
    family: promptContext.targetFamily,
  };
}

async function loadSettings(ctx: ExtensionCommandContext): Promise<AugmentSettings> {
  const persisted = await new PluginManager(ctx.cwd)
    .getPluginSettings("@ezxomp/augment")
    .catch(() => ({}));
  return resolveAugmentSettings(persisted);
}

async function resolveModelAuth(
  ctx: ExtensionCommandContext,
  model: Model<Api>
): Promise<{ apiKey: string; headers?: Record<string, string> }> {
  const registry = ctx.modelRegistry as {
    getApiKeyAndHeaders?: (model: Model<Api>) => Promise<{
      ok: boolean;
      apiKey?: string;
      headers?: Record<string, string>;
      error?: string;
    }>;
    getApiKey?: (model: Model<Api>) => Promise<string | undefined>;
  };

  if (typeof registry.getApiKeyAndHeaders === "function") {
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      throw new Error(auth.error ?? `Failed to resolve auth for ${model.provider}/${model.id}.`);
    }
    if (!auth.apiKey) {
      throw new Error(`No API key for ${model.provider}/${model.id}.`);
    }
    return auth.headers ? { apiKey: auth.apiKey, headers: auth.headers } : { apiKey: auth.apiKey };
  }

  if (typeof registry.getApiKey === "function") {
    const apiKey = await registry.getApiKey(model);
    if (!apiKey) {
      throw new Error(`No API key for ${model.provider}/${model.id}.`);
    }
    return { apiKey };
  }

  throw new Error(
    "Your Pi version does not expose a supported modelRegistry auth API. Upgrade pi or use a pi-augment build compatible with your runtime."
  );
}

async function callLLM(
  model: Model<Api>,
  apiKey: string,
  headers: Record<string, string> | undefined,
  request: Context,
  signal: AbortSignal,
  settings: AugmentSettings,
): Promise<AssistantMessage | null> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), settings.timeoutMs);
  const combined = AbortSignal.any([signal, timeoutController.signal]);

  try {
    const response = await complete(model, request, {
      apiKey,
      ...(headers ? { headers } : {}),
      signal: combined,
      maxTokens: Math.min(model.maxTokens ?? settings.maxOutputTokens, settings.maxOutputTokens),
    });
    if (signal.aborted || response.stopReason === "aborted") return null;
    return response;
  } catch (error) {
    if (signal.aborted) return null;
    if (timeoutController.signal.aborted) {
      throw new Error("Augment timed out. Try again or use a faster model.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runWithLoader<T>(
  ctx: ExtensionCommandContext,
  message: string,
  task: (signal: AbortSignal) => Promise<T | null>
): Promise<T | null> {
  if (!ctx.hasUI) {
    // No UI — just run the task directly
    const controller = new AbortController();
    return task(controller.signal);
  }

  let taskError: Error | undefined;

  const result = await ctx.ui.custom<T | null>((tui, theme, _keybindings, done) => {
    const loader = new CancellableLoader(
      tui,
      text => theme.fg("accent", text),
      text => theme.fg("text", text),
      message,
    );
    loader.onAbort = () => done(null);

    void task(loader.signal)
      .then((r) => {
        if (!loader.signal.aborted) done(r);
      })
      .catch((err: unknown) => {
        if (loader.signal.aborted) {
          done(null);
          return;
        }
        taskError = err instanceof Error ? err : new Error("Enhancement failed.");
        done(null);
      });

    return loader;
  });

  if (taskError) throw taskError;
  return result;
}

function appendRetryReminder(request: Context): Context {
  return {
    ...request,
    systemPrompt: [
      ...(request.systemPrompt ?? []),
      "",
      buildRetryReminder(),
    ],
  };
}

function extractText(response: AssistantMessage): string {
  return response.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}
