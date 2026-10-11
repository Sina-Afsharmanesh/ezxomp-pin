import { buildProbeUrl, dedupe, modelBaseCandidates } from "../url.ts";
import type { ProviderApi } from "../types.ts";
import { metadataFromModelListItem, modelIdFromEntry } from "./metadata.ts";
import { probeHeaders, requestJson, resolveFetch } from "./request.ts";
import type { GatewayProbeOptions, ObservedModelMetadata } from "./types.ts";

export type OpenAIListEntries = (value: unknown) => unknown[] | undefined;

/** Accept the plain OpenAI `data` envelope only. */
export function openAIDataEntries(value: unknown): unknown[] | undefined {
  const data = (value as { data?: unknown } | undefined)?.data;
  return Array.isArray(data) ? data as unknown[] : undefined;
}

/**
 * Accumulate model ids and inline list metadata from an OpenAI-style data array.
 */
function collectModelEntries(entries: readonly unknown[], ids: string[], metadataById: Map<string, ObservedModelMetadata>): void {
  for (const entry of entries) {
    const id = modelIdFromEntry(entry);
    if (!id) continue;
    ids.push(id);
    const metadata = metadataFromModelListItem(entry);
    if (metadata) metadataById.set(id, metadata);
  }
}

/**
 * Walk model-list base candidates and accept the first response whose payload
 * contains model entries. `parseEntries` lets callers accept different list
 * envelopes (OpenAI `data`, gateway `models`) without duplicating the walk.
 * Returns undefined when no candidate yields a usable catalog.
 */
export async function fetchOpenAIStyleModelList(
  endpoint: string,
  api: ProviderApi,
  options: GatewayProbeOptions,
  ensureV1 = false,
  parseEntries: OpenAIListEntries,
): Promise<{ baseUrl: string; ids: string[]; metadataById: Map<string, ObservedModelMetadata> } | undefined> {
  const fetcher = resolveFetch(options.fetch);
  const headers = probeHeaders(api, options.apiKey);
  const candidates = modelBaseCandidates(endpoint, api, ensureV1);
  for (const baseUrl of candidates) {
    const json = await requestJson(fetcher, buildProbeUrl(baseUrl), { headers }, options.timeoutMs);
    const entries = parseEntries(json);
    if (!entries) continue;

    const ids: string[] = [];
    const metadataById = new Map<string, ObservedModelMetadata>();
    collectModelEntries(entries, ids, metadataById);
    if (ids.length > 0) return { baseUrl, ids: dedupe(ids).sort(), metadataById };
  }
  return undefined;
}