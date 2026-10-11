import { PROVIDER_REGISTRY } from "@oh-my-pi/pi-ai";
import { BUILTIN_PROVIDER_IDS } from "./config.ts";
import type { ModelEntry, ModelsConfig, ProviderConfig } from "./types.ts";

/** One presentation source: a provider's models as seen by the host or wizard. */
export interface UnifiedViewSource {
  id: string;
  origin?: "native" | "better-custom" | "pi-free" | string;
  /** Providers are included unless explicitly marked unauthenticated. */
  authenticated?: boolean;
  models?: ReadonlyArray<Record<string, unknown>>;
}

export interface UnifiedViewModel extends Record<string, unknown> {
  provider: string;
  id: string;
}

export interface UnifiedProviderGroup {
  id: string;
  label: string;
  models: UnifiedViewModel[];
  freeCount: number;
}

export interface UnifiedFamilyGroup {
  id: string;
  displayName: string;
  models: UnifiedViewModel[];
}

export interface UnifiedModelView {
  providers: UnifiedProviderGroup[];
  families: UnifiedFamilyGroup[];
  /** Free-model lane; populated by the pi-free sub-ticket. */
  freeModels: UnifiedViewModel[];
}

/**
 * Minimal host-neutral slice of the ExtensionAPI provider surface used by this
 * module so tests and non-pi hosts can inject their own registrar.
 */
export interface ProviderRegistrar {
  registerProvider(name: string, config: Record<string, unknown>): void;
  unregisterProvider?(name: string): void;
}

/**
 * Live builtin ownership from the host provider registry (@oh-my-pi/pi-ai
 * 17.3.8, 76 descriptor entries with `.id`) so no current or future builtin id
 * can be shadowed by a custom provider. The static config list remains as a
 * conservative fallback.
 */
function builtinIdsFromHostRegistry(registry: unknown): Set<string> {
  const entries = Array.isArray(registry)
    ? registry
    : registry !== null && typeof registry === "object" ? Object.values(registry) : [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry && typeof entry === "object") {
      const id = (entry as { id?: unknown }).id;
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return ids;
}

const HOST_BUILTIN_PROVIDER_IDS = builtinIdsFromHostRegistry(PROVIDER_REGISTRY);

function isBuiltinProvider(name: string): boolean {
  return HOST_BUILTIN_PROVIDER_IDS.has(name) || BUILTIN_PROVIDER_IDS.has(name);
}

/** Placeholder values the wizard stores for genuinely keyless providers. */
const KEYLESS_PLACEHOLDERS = new Set(["dummy", "ollama"]);

function hasCredentialReference(provider: ProviderConfig): boolean {
  const apiKey = provider.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0 || KEYLESS_PLACEHOLDERS.has(apiKey.trim().toLowerCase())) {
    return false;
  }
  return true;
}

function hasOauth(provider: ProviderConfig): boolean {
  // Mirror host runtime validation (Boolean(config.oauth)): null, 0, "" and
  // other falsy/non-object garbage do not count as an oauth configuration.
  return provider.oauth !== null && typeof provider.oauth === "object";
}

/**
 * Preserve every known and unknown model field verbatim; strings become
 * id-only entries so string-model configs still register.
 */
function normalizeModelEntry(entry: string | ModelEntry): Record<string, unknown> | undefined {
  if (typeof entry === "string") {
    const id = entry.trim();
    return id ? { id } : undefined;
  }
  const record = entry !== null && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as unknown as Record<string, unknown>)
    : undefined;
  if (!record || typeof record.id !== "string" || !record.id.trim()) return undefined;
  return { ...record, id: record.id.trim() };
}

function modelEntries(provider: ProviderConfig): Array<Record<string, unknown>> {
  return Array.isArray(provider.models)
    ? provider.models.map(normalizeModelEntry).filter((entry): entry is Record<string, unknown> => entry !== undefined)
    : [];
}

/**
 * Build the native registration payload for one persisted provider. Credential
 * references ($ENV / !command / literal) pass through untouched — the host
 * registry resolves them lazily per request, so no secret material ever enters
 * registered state and loading performs zero network I/O and zero command or
 * environment reads.
 */
export function registrationConfig(provider: ProviderConfig): Record<string, unknown> {
  return { ...provider, models: modelEntries(provider) };
}

/**
 * Host runtime-register validation (validateProviderConfiguration,
 * @oh-my-pi/pi-coding-agent src/config/models-configs.ts) requires apiKey or
 * oauth whenever models are defined; keyless providers would throw during
 * registry drain. Such providers are skipped here with a surfaced warning.
 */
/**
 * Mirrors host validateProviderConfiguration (runtime-register mode,
 * @oh-my-pi/pi-coding-agent src/config/models-configs.ts) so the registration
 * path and the unified-view side-channel apply the IDENTICAL predicate:
 * models require baseUrl, and baseUrl+models require a credential reference
 * or oauth.
 */
function registrationBlocker(name: string, provider: ProviderConfig): string | undefined {
  if (modelEntries(provider).length === 0) return "no usable model entries";
  if (typeof provider.baseUrl !== "string" || !provider.baseUrl.trim()) {
    return "\"baseUrl\" is required when defining models.";
  }
  if (!hasCredentialReference(provider) && !hasOauth(provider)) {
    return "no credential reference or oauth; host requires one to register models";
  }
  return undefined;
}

let activeRegistrar: ProviderRegistrar | undefined;
const registeredNames = new Set<string>();

function surfaceWarning(message: string): void {
  console.warn("[better-custom] " + message);
}

/**
 * Diff-sync every configured custom provider through the captured host
 * registrar: add new providers, replace changed ones, and unregister ones that
 * vanished from config or can no longer be registered — so add/edit/delete
 * mutations reach the live session without a restart. No-op before the
 * extension lifecycle captures a registrar.
 */
export function refreshBetterCustomProviders(config: ModelsConfig): void {
  if (!activeRegistrar) return;
  syncProviders(activeRegistrar, config);
}

/** Capture the host registrar for later mutation-refresh calls. */
export function setProviderRegistrar(pi: ProviderRegistrar | undefined): void {
  activeRegistrar = pi;
}

/** Session-switch slice of the host used to activate a selected model. */
export interface HostModelSwitcher {
  setModel(model: Record<string, unknown>): Promise<boolean>;
}

let activeSwitcher: HostModelSwitcher | undefined;

/** Capture the host session-switch seam once during extension load. */
export function setHostModelSwitcher(switcher: HostModelSwitcher | undefined): void {
  activeSwitcher = switcher;
}

/**
 * Route a resolved canonical model through the host session switch seam.
 * Returns false (with a surfaced warning) when no host was captured or the
 * switch failed, instead of throwing into the caller's flow.
 */
export async function switchToModel(model: Record<string, unknown>): Promise<boolean> {
  if (!activeSwitcher || typeof activeSwitcher.setModel !== "function") return false;
  try {
    return await activeSwitcher.setModel(model);
  } catch (error) {
    surfaceWarning("Model switch failed: " + (error instanceof Error ? error.message : String(error)) + ".");
    return false;
  }
}

/**
 * View sources for every registrable better-custom provider: built-in ids are
 * skipped, keyless providers cannot satisfy host validation so they stay out,
 * and each model keeps its canonical provider reference plus metadata fields.
 */
export function betterCustomViewSources(config: ModelsConfig | undefined): UnifiedViewSource[] {
  const sources: UnifiedViewSource[] = [];
  if (!config || typeof config !== "object") return sources;
  for (const [name, raw] of Object.entries(config.providers ?? {})) {
    if (!name || isBuiltinProvider(name)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const provider = raw as ProviderConfig;
    if (registrationBlocker(name, provider)) continue;
    sources.push({
      id: name,
      origin: "better-custom",
      authenticated: true,
      models: modelEntries(provider).map((entry) => ({ ...entry, provider: name })),
    });
  }
  return sources;
}

/**
 * Register every configured custom provider through the native seam. Built-in
 * providers are never shadowed even when present in user config. Failures are
 * surfaced per provider and never block extension load or sibling providers.
 */
export function registerBetterCustomProviders(pi: ProviderRegistrar, config: ModelsConfig): void {
  syncProviders(pi, config);
}

function syncProviders(pi: ProviderRegistrar, config: ModelsConfig): void {
  const desired = new Set<string>();
  for (const [name, provider] of Object.entries(config.providers ?? {})) {
    if (!name || isBuiltinProvider(name)) continue;
    if (provider === null || typeof provider !== "object" || Array.isArray(provider)) continue;
    const blocker = registrationBlocker(name, provider as ProviderConfig);
    if (blocker) {
      surfaceWarning("Provider \"" + name + "\" was not registered: " + blocker + ".");
      continue;
    }
    desired.add(name);
    try {
      pi.registerProvider(name, registrationConfig(provider as ProviderConfig));
      registeredNames.add(name);
    } catch (error) {
      registeredNames.delete(name);
      surfaceWarning("Provider \"" + name + "\" could not be registered: " + (error instanceof Error ? error.message : String(error)) + ".");
    }
  }

  if (typeof pi.unregisterProvider === "function") {
    for (const name of [...registeredNames]) {
      if (desired.has(name)) continue;
      try {
        pi.unregisterProvider(name);
      } catch (error) {
        surfaceWarning("Provider \"" + name + "\" could not be unregistered: " + (error instanceof Error ? error.message : String(error)) + ".");
      }
      registeredNames.delete(name);
    }
  }
}


type CostShape = { input?: unknown; output?: unknown } | null | undefined;

function hasPaidSibling(models: readonly UnifiedViewModel[]): boolean {
  // Pricing exposure exists only when some sibling carries a positive price
  // (pi-free's adaptive detectPricingExposed route).
  return models.some((m) => {
    const cost = m.cost as CostShape;
    return cost !== null && typeof cost === "object" && (
      (typeof cost.input === "number" && cost.input > 0) ||
      (typeof cost.output === "number" && cost.output > 0)
    );
  });
}

/**
 * PROVIDER-RELATIVE free classification without any runtime dependency on
 * pi-free, mirroring upstream lib/registry.ts::isFreeModel truth table:
 * - explicit isFree marker wins outright (true free, false paid);
 * - all-zero-cost provider, no pricing exposure (Route A): name heuristic ONLY;
 * - mixed provider with >=1 paid sibling (Route B): zero input+output cost OR
 *   name heuristic — a nonzero-priced "free trial" still classifies via name.
 */
function isFreeModel(model: UnifiedViewModel, pricingKnown: boolean): boolean {
  if (model.isFree === true) return true;
  if (model.isFree === false) return false;
  const namedFree = typeof model.name === "string" ? /\bfree\b/i.test(model.name) : false;
  if (!pricingKnown) return namedFree;
  // Upstream parity ((model.cost?.input ?? 0) === 0): a null OR undefined
  // cost object, and missing individual cost fields, all read as 0.
  const cost = model.cost as CostShape;
  if (cost !== null && typeof cost === "object") {
    const input = typeof cost.input === "number" ? cost.input : 0;
    const output = typeof cost.output === "number" ? cost.output : 0;
    if (input === 0 && output === 0) return true;
  } else if (cost === null || cost === undefined) {
    return true;
  }
  return namedFree;
}

function titleize(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Deterministic pi-models-style presentation over all authenticated sources.
 * Unauthenticated/unavailable providers are excluded, provider and family
 * groups preserve first-seen source order, every model keeps its canonical
 * provider/id reference, and empty or stale catalogs yield a valid empty view.
  // Free lane populated via the provider-relative isFreeModel classifier.
 */
export function buildUnifiedModelView(sources: readonly UnifiedViewSource[] | undefined): UnifiedModelView {
  const providers = new Map<string, UnifiedProviderGroup>();
  const families = new Map<string, UnifiedFamilyGroup>();
  // Canonical provider/id refs must appear exactly once: callers pass the
  // native registry FIRST and config-sourced customs after, so registry-listed
  // entries win and config side-channel duplicates are dropped here.
  const seenRefs = new Set<string>();
  const freeModels: UnifiedViewModel[] = [];
  for (const source of sources ?? []) {
    if (!source || typeof source.id !== "string" || !source.id.trim()) continue;
    if (source.authenticated === false) continue;
    const rawModels = Array.isArray(source.models) ? source.models : [];
    const models: UnifiedViewModel[] = [];
    for (const raw of rawModels) {
      if (!raw || typeof raw !== "object") continue;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      if (!id) continue;
      const ref = source.id + "/" + id;
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      const model: UnifiedViewModel = { ...raw, provider: source.id, id };
      models.push(model);
      const familyId = typeof raw.family === "string" && raw.family.trim() ? raw.family.trim() : source.id;
      let family = families.get(familyId);
      if (!family) {
        family = { id: familyId, displayName: titleize(familyId), models: [] };
        families.set(familyId, family);
      }
      family.models.push(model);
    }
    if (models.length === 0) continue;
    // Single source of truth: classify once per source, then reuse the result
    // for lane membership AND the provider group's freeCount.
    const pricingKnown = hasPaidSibling(models);
    const freeFlags = models.map((model) => isFreeModel(model, pricingKnown));
    for (let i = 0; i < models.length; i++) {
      if (freeFlags[i]) freeModels.push(models[i]);
    }
    // Same provider id from registry + config side-channel merges into ONE group.
    let group = providers.get(source.id);
    if (!group) {
      group = { id: source.id, label: titleize(source.id), models: [], freeCount: 0 };
      providers.set(source.id, group);
    }
    group.models.push(...models);
    group.freeCount += freeFlags.filter(Boolean).length;
  }
  // Explicit ordering independent of input/Map iteration quirks.
  const sortedProviders = [...providers.values()].sort((left, right) => left.id.localeCompare(right.id));
  const sortedFamilies = [...families.values()].sort((left, right) => left.id.localeCompare(right.id));
  // Deterministic free lane ordered by canonical ref.
  freeModels.sort((left, right) => (left.provider + "/" + left.id).localeCompare(right.provider + "/" + right.id));
  return { providers: sortedProviders, families: sortedFamilies, freeModels };
}
