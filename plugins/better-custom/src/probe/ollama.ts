import { dedupe, modelBaseCandidates, normalizeEndpoint } from "../url.ts";
import { fetchOpenAIStyleModelList, openAIDataEntries } from "./models-list.ts";
import {
  mergeObservedMetadata,
  metadataFromModelListItem,
  metadataFromOllamaShow,
  metadataFromOllamaTag,
  modelIdFromEntry,
} from "./metadata.ts";
import { probeHeaders, requestJson, resolveFetch } from "./request.ts";
import type { GatewayProbeOptions, GatewayProbeResult, ObservedModelMetadata } from "./types.ts";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/**
 * Prefer the native (non-/v1) root but keep gateway subpaths intact: a 9router
 * endpoint may serve the Ollama-compatible surface under e.g. /ollama, so only
 * a trailing /v1 segment is removed.
 */
function nativeRoot(endpoint: string): string | undefined {
  try {
    const url = new URL(normalizeEndpoint(endpoint, "ollama-chat"));
    if (url.pathname.replace(/\/+$/, "").endsWith("/v1")) url.pathname = url.pathname.slice(0, -3) || "/";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function sortedMap(map: Map<string, ObservedModelMetadata>): Map<string, ObservedModelMetadata> {
  return new Map([...map].sort(([left], [right]) => left.localeCompare(right)));
}

/** Accept the Ollama `models` envelope only. */
function ollamaModelsEntries(value: unknown): unknown[] | undefined {
  const models = record(value)?.models;
  return Array.isArray(models) ? models : undefined;
}

/**
 * 9router exposes `/api/version` with `currentVersion`/`latestVersion`/
 * `hasUpdate`; genuine Ollama returns `{ version }`. Detection only consumes
 * the field-shape difference, never the values.
 */
function is9routerVersion(json: unknown): boolean {
  const rec = record(json);
  return !!(rec && typeof rec.currentVersion === "string" && typeof rec.latestVersion === "string" && typeof rec.hasUpdate === "boolean");
}

/** Strict OmniRoute /api/health marker: {status:"ok", timestamp:"..."}; genuine Ollama has no health route. */
function isOmniRouteHealth(json: unknown): boolean {
  const rec = record(json);
  return !!(rec && rec.status === "ok" && typeof rec.timestamp === "string" && rec.timestamp.length > 0);
}

/**
 * Shared OpenAI-style catalog acceptance for confirmed gateways. A confirmed
 * marker trusts the real /v1/models result even when empty; it never falls
 * back to static placeholder tags.
 */
async function probeGatewayModelList(options: GatewayProbeOptions, baseUrl: string, fetcher: ReturnType<typeof resolveFetch>): Promise<GatewayProbeResult> {
  const list = await fetchOpenAIStyleModelList(options.endpoint, "openai-completions", options, false, openAIDataEntries);
  if (!list) return { baseUrl, ids: [], metadataById: new Map(), infoById: new Map() };
  const sorted = sortedMap(list.metadataById);
  return { baseUrl: list.baseUrl, ids: list.ids, metadataById: sorted, infoById: sorted };
}

/** Metadata from a populated /api/tags list, refined with per-model /api/show. */
async function probeOllamaTags(options: GatewayProbeOptions, baseUrl: string, models: unknown[]): Promise<GatewayProbeResult> {
  const fetcher = resolveFetch(options.fetch);
  const metadataById = new Map<string, ObservedModelMetadata>();
  const ids = dedupe(models.map(modelIdFromEntry).filter((id): id is string => Boolean(id))).sort();
  for (const tag of models) {
    const id = modelIdFromEntry(tag);
    const metadata = metadataFromOllamaTag(tag);
    if (id && metadata) metadataById.set(id, metadata);
  }
  for (const id of ids) {
    const json = await requestJson(fetcher, baseUrl.replace(/\/+$/, "") + "/api/show", {
      method: "POST",
      headers: probeHeaders("ollama-chat", options.apiKey, true),
      body: JSON.stringify({ name: id }),
    }, options.timeoutMs);
    const metadata = metadataFromOllamaShow(json);
    if (metadata) metadataById.set(id, mergeObservedMetadata(metadataById.get(id), metadata));
  }
  const sorted = sortedMap(metadataById);
  return { baseUrl, ids, metadataById: sorted, infoById: sorted };
}

/**
 * Probe Ollama's native tags/show endpoints. Gateway markers are checked in
 * strict order BEFORE /api/tags: OmniRoute's strict /api/health marker first
 * (no API key attached; genuine Ollama has no health route), then the 9router
 * /api/version shape. A confirmed marker selects the real /v1/models catalog
 * even when empty; markers route the catalog source only, never credential
 * trust (doc-24 / TASK-113.2).
 */
export async function probeOllama(options: GatewayProbeOptions): Promise<GatewayProbeResult> {
  const baseUrl = nativeRoot(options.endpoint) ?? options.endpoint.trim();
  const fetcher = resolveFetch(options.fetch);
  const headers = probeHeaders("ollama-chat", options.apiKey);

  const health = await requestJson(fetcher, baseUrl.replace(/\/+$/, "") + "/api/health", { headers: {} }, options.timeoutMs);
  if (isOmniRouteHealth(health)) return probeGatewayModelList(options, baseUrl, fetcher);

  const version = await requestJson(fetcher, baseUrl.replace(/\/+$/, "") + "/api/version", { headers }, options.timeoutMs);
  if (is9routerVersion(version)) return probeGatewayModelList(options, baseUrl, fetcher);

  const tags = await requestJson(fetcher, baseUrl.replace(/\/+$/, "") + "/api/tags", { headers }, options.timeoutMs);
  const models = ollamaModelsEntries(tags);
  if (models && models.length > 0) return probeOllamaTags(options, baseUrl, models);

  // The native tags endpoint yielded nothing: fall back to the OpenAI-style list.
  const fallback = await fetchOpenAIStyleModelList(options.endpoint, "openai-completions", options, false, openAIDataEntries);
  if (fallback) {
    const sorted = sortedMap(fallback.metadataById);
    return { baseUrl: fallback.baseUrl, ids: fallback.ids, metadataById: sorted, infoById: sorted };
  }
  return { baseUrl, ids: [], metadataById: new Map(), infoById: new Map() };
}
