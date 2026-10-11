import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";

/**
 * Prompt template registry implementing SkillOpt's pattern from
 * skillopt_sleep/prompts.py (microsoft/SkillOpt, arXiv 2605.23904).
 * The registry is data-only and supports runtime overrides via an agent-specific
 * JSON file. No LLM or network calls are performed.
 */

/**
 * Built‑in prompt templates. These are the minimal set required by the tests:
 * "miner", "attempt", "judge", "reflect". These are shipped with the module.
 */
const BUILTIN_TEMPLATES: Record<string, string> = {
  miner: `You are an expert AI coding assistant. Given a user request and a transcript of the agent's recent reasoning/attempt, synthesize a concise, actionable prompt template for the next coding iteration.
User Request: {{request}}
Transcript: {{transcript}}
Output: {{output}}`,

  attempt: `You are an AI coding assistant. Write code to satisfy the following requirement:
{{request}}

Previous reasoning (for context):
{{reasoning}}

Additional context:
{{context}}

Return only the code block and brief explanation.`,

  judge: `You are a security‑aware code reviewer. Evaluate the provided code for:
- Functionality correctness
- Security vulnerabilities (e.g., injection, XSS, path traversal)
- Code quality (readability, modularity)
- Best practices adherence

Code to review:
{{code}}

Provide a detailed assessment with scores (1‑5) and actionable recommendations.`,

  reflect: `You are an AI coding assistant providing a high‑level reflection for the user. Summarize what was accomplished, remaining issues, and next steps based on the conversation history.

Conversation history:
{{history}}

Reflection:`,
};

type TemplateKey = keyof typeof BUILTIN_TEMPLATES;

export interface PromptRegistry {
  /** Retrieve the raw template string for a key. */
  get(key: string): string;
  /** Render the template with the supplied variables. */
  render(key: string, vars: Record<string, string>): string;
  /** Check if a key exists in the registry. */
  has(key: string): boolean;
}

/** Default registry using the built‑in templates. */
class DefaultPromptRegistry implements PromptRegistry {
  get(key: string): string {
    return BUILTIN_TEMPLATES[key as TemplateKey] ?? '';
  }
  has(key: string): boolean {
    return key in BUILTIN_TEMPLATES;
  }
  render(key: string, vars: Record<string, string>): string {
    const template = this.get(key);
    if (!template) {
      throw new Error(`Prompt template '${key}' not found`);
    }
    return renderTemplate(key, template, vars);
  }
}

/** Registry that applies JSON overrides on top of a source registry. */
class OverridePromptRegistry implements PromptRegistry {
  private readonly source: PromptRegistry;
  private readonly overrides: Record<string, string>;
  constructor(source: PromptRegistry, overrides: Record<string, string>) {
    this.source = source;
    this.overrides = overrides;
  }
  get(key: string): string {
    return this.overrides[key] ?? this.source.get(key);
  }
  has(key: string): boolean {
    return key in this.overrides || this.source.has(key);
  }
  render(key: string, vars: Record<string, string>): string {
    const template = this.get(key);
    if (!template) {
      throw new Error(`Prompt template '${key}' not found`);
    }
    return renderTemplate(key, template, vars);
  }
}

/** Shared placeholder interpolation: {{ var }} -> vars[var] or throw. */
function renderTemplate(
  key: string,
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, placeholder) => {
    const trimmed = placeholder.trim();
    if (trimmed in vars) {
      return vars[trimmed];
    }
    throw new Error(`Missing variable '${trimmed}' for prompt '${key}'`);
  });
}

/** Cache for override file to enable hot reload. */
let overrideCache: { content: Record<string, string>; mtime: number; path: string } | null = null;

export async function loadOverrides(opts?: { overridesPath?: string }): Promise<PromptRegistry> {
  const { registry, unknownKeys } = await loadOverridesWithUnknown(opts);
  return registry;
}

export async function loadOverridesWithUnknown(opts?: { overridesPath?: string }): Promise<{ registry: PromptRegistry; unknownKeys: string[] }> {
  const overridesPath = opts?.overridesPath ?? join(getAgentDir(), 'agent-learning', 'prompts.json');
  const unknownKeys: string[] = [];

  if (!existsSync(overridesPath)) {
    return { registry: new DefaultPromptRegistry(), unknownKeys: [] };
  }

  // Hot reload: re-serve the cached parse only when the file mtime is unchanged.
  if (overrideCache && overrideCache.path === overridesPath) {
    try {
      if (statSync(overridesPath).mtime.getTime() === overrideCache.mtime) {
        const source = new DefaultPromptRegistry();
        const registry = new OverridePromptRegistry(source, overrideCache.content);
        return { registry, unknownKeys: [] };
      }
    } catch {
      // File vanished since cache; fall through to a fresh (failing) read below.
    }
  }

  try {
    const raw = readFileSync(overridesPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const overrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        overrides[key] = value;
      } else {
        unknownKeys.push(key);
      }
    }
    const source = new DefaultPromptRegistry();
    const registry = new OverridePromptRegistry(source, overrides);
    const stats = statSync(overridesPath);
    overrideCache = { content: overrides, mtime: stats.mtime.getTime(), path: overridesPath };
    return { registry, unknownKeys };
  } catch {
    return { registry: new DefaultPromptRegistry(), unknownKeys: [] };
  }
}
