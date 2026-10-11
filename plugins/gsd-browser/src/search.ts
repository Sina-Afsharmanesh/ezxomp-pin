/**
 * src/search.ts — line-faithful port of cmdWebsearch
 * (gsd-core src/commands.cts:2582-2672, v1.12.0): Brave web search with
 * exact query params, X-Subscription-Token, retry only 429/5xx
 * (MAX_RETRIES=2), Retry-After seconds parse + 250ms doubling backoff,
 * non-retryable 4xx immediate, result mapping {title,url,description,age||null}.
 * HTTP layer injectable for tests.
 */

const MAX_RETRIES = 2;
import { scanText } from "./injection.ts";
import { registerTool } from "./tools/factory.ts";
import type { ToolResult } from "./tools/browser.ts";
import type { SettingsProvider } from "./tools.ts";

const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 2000;
const BACKOFF_JITTER_MS = 100;
const RETRY_AFTER_CAP_MS = 60000;

export interface BraveSearchOptions {
 apiKey: string;
 limit?: number;
 freshness?: "day" | "week" | "month";
 timeoutMs?: number;
 fetchFn?: typeof fetch;
}

export interface BraveResult {
 title: string;
 url: string;
 description: string;
 age: string | null;
}

export interface BraveSearchOutcome {
 available: boolean;
 query?: string;
 reason?: string;
 error?: string;
 attempts?: number;
 count?: number;
 results?: BraveResult[];
}

export interface BraveSearchToolArgs {
 query: string;
 limit?: number;
 freshness?: "day" | "week" | "month";
 timeoutMs?: number;
}

/** Retry-After header -> delay in ms (seconds form or HTTP-date), clamped to 0..60s. */
function parseRetryAfter(header: string | null | undefined): number | null {
 if (!header) return null;
 const trimmed = header.trim();
 if (/^\d+$/.test(trimmed)) {
  return Math.min(Math.max(Number.parseInt(trimmed, 10) * 1000, 0), RETRY_AFTER_CAP_MS);
 }
 const asDate = Date.parse(trimmed);
 if (!Number.isNaN(asDate)) {
  return Math.min(Math.max(asDate - Date.now(), 0), RETRY_AFTER_CAP_MS);
 }
 return null;
}

function sleep(ms: number): Promise<void> {
 const { promise, resolve } = Promise.withResolvers<void>();
 setTimeout(resolve, ms);
 return promise;
}

function retryDelayMs(attempt: number): number {
 const exp = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
 return exp + Math.floor(Math.random() * BACKOFF_JITTER_MS);
}

interface BraveApiResponse {
 web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> };
}

export async function braveSearch(query: string, opts: BraveSearchOptions): Promise<BraveSearchOutcome> {
 const apiKey = opts.apiKey;

 if (!apiKey) {
  // No key = silent skip, agent falls back to built-in search.
  return { available: false, reason: "BRAVE_API_KEY not set" };
 }

 if (!query) {
  return { available: false, error: "Query required" };
 }

 const params = new URLSearchParams({
  q: query,
  count: String(opts.limit ?? 10),
  country: "us",
  search_lang: "en",
  text_decorations: "false",
 });

 if (opts.freshness) {
  params.set("freshness", opts.freshness);
 }

 const timeoutMs = opts.timeoutMs ?? 10000;
 const doFetch = opts.fetchFn ?? fetch;
 let attempt = 0;

 for (;;) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
  try {
   const response = await doFetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
     Accept: "application/json",
     "X-Subscription-Token": apiKey,
    },
    signal: ac.signal,
   });

   if (!response.ok) {
    // Status gates the parse: a malformed error body must surface the HTTP
    // code, not a JSON parse error.
    const status = response.status;
    const isRetryable = status === 429 || status >= 500;
    if (!isRetryable) {
     clearTimeout(timer);
     return { available: false, error: `API error: ${status}` };
    }
    attempt++;
    if (attempt > MAX_RETRIES) {
     clearTimeout(timer);
     return { available: false, error: `API error: ${status}`, attempts: attempt };
    }
    let delay: number;
    if (status === 429) {
     const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
     delay = retryAfter !== null ? retryAfter : retryDelayMs(attempt - 1);
    } else {
     delay = retryDelayMs(attempt - 1);
    }
    clearTimeout(timer);
    await sleep(delay);
    continue;
   }

   // Timer stays live through the body read: a stalled JSON stream still
   // trips the deadline. Cleared after parse.
   const data = (await response.json()) as BraveApiResponse;
   clearTimeout(timer);
   const results = (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
    age: r.age || null,
   }));
   return {
    available: true,
    query,
    count: results.length,
    results,
   };
  } catch (err) {
   clearTimeout(timer);
   // Only network-layer failures retry (abort/timeout/socket). JSON parse
   // errors on SUCCESS bodies are deterministic — fail once.
   const isNetworkError =
    (err as Error).name === "AbortError" ||
    /timeout|abort|socket|network|fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(String((err as Error).message));
   if (!isNetworkError) {
    return { available: false, error: (err as Error).message };
   }
   attempt++;
   if (attempt > MAX_RETRIES) {
    return { available: false, error: (err as Error).message, attempts: attempt };
   }
   await sleep(retryDelayMs(attempt - 1));
  }
 }
}

function envelope(text: string, details?: Record<string, unknown>, isError?: boolean): ToolResult {
 const env: ToolResult = { content: [{ type: "text", text }] };
 if (details !== undefined) env.details = details;
 if (isError) env.isError = true;
 return env;
}

export function registerSearchTool(pi: unknown, getSettings: SettingsProvider): void {
 registerTool(pi, "gsd_browser_search", {
  description: "Brave web search; returns {available, query, count, results[]} or silent-unavailable without a key (exact `cmdWebsearch` contract)",
  args: {
   query: { type: "string", description: "Search query" },
   limit: { type: "number", description: "Maximum number of results to return (default 10)", optional: true },
   freshness: { type: "string", description: "Freshness constraint: day | week | month", optional: true },
   timeoutMs: { type: "number", description: "Per-call request timeout in ms (default settings.searchTimeoutMs)", optional: true },
  },
  execute: async (_toolCallId: string, rawParams: Record<string, unknown>, _signal?: AbortSignal, _onUpdate?: (details: unknown) => void, _ctx?: { cwd: string }): Promise<ToolResult> => {
   const args = rawParams as unknown as BraveSearchToolArgs;
   const settings = await getSettings(_ctx?.cwd ?? process.cwd());
   const apiKey = settings.braveApiKey;
   const outcome = await braveSearch(args.query, {
    apiKey,
    limit: args.limit ?? 10,
    freshness: args.freshness,
    timeoutMs: args.timeoutMs ?? settings.searchTimeoutMs,
   });
   if (!outcome.available) {
    // Documented silent-unavailability contract: missing key is an expected
    // fallback, NOT a tool failure — no isError.
    const reason = outcome.reason ?? outcome.error ?? "unknown";
    return envelope(`search unavailable: ${reason}`, { available: false, reason }, outcome.error !== undefined);
   }
   // Assemble result text for injection scan: URLs carry javascript:/data:
   // /userinfo/token payloads — include them beside title+description.
   const assembledText = outcome.results?.map((r: BraveResult) => `${r.title}\n${r.url}\n${r.description}`).join("\n") ?? "";
   const injection = scanText(assembledText);
   const details: Record<string, unknown> = {
    query: outcome.query,
    count: outcome.count ?? 0,
    results: outcome.results,
    injection,
   };
   if (settings.injectionBlocking && injection.level === "high") {
    const quoted = injection.findings.map((f) => `\`${f.ruleId}: ${f.match ?? ""}\``).join("\n");
    return envelope(`search succeeded but injection scanner flagged HIGH severity findings:\n${quoted}`, details, true);
   }
   const text = `Search results for "${outcome.query}":\n${outcome.results?.map((r: BraveResult) => `- ${r.url} (${r.title})`).join("\n") ?? "(no results)"}`;
   return envelope(text, { available: true, ...details });
  },
 });
}
export { parseRetryAfter, retryDelayMs };
