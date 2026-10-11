import { describe, expect, it, vi } from "vitest";
import { braveSearch, parseRetryAfter, retryDelayMs } from "../src/search.ts";
import type { BraveSearchOptions } from "../src/search.ts";

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const fn = vi.fn(async (url: string | URL, init?: RequestInit) => await handler(String(url), init));
	return fn as unknown as typeof fetch & { mock: { calls: Array<[string, RequestInit | undefined]> } };
}

function opts(overrides: Partial<BraveSearchOptions> = {}): BraveSearchOptions {
	return { apiKey: "test-key", ...overrides };
}

describe("braveSearch", () => {
	it("no key => exact {available:false, reason:'BRAVE_API_KEY not set'} without any fetch", async () => {
		const f = mockFetch(() => new Response("{}"));
		const r = await braveSearch("q", { ...opts({ apiKey: "" }), fetchFn: f });
		expect(r).toEqual({ available: false, reason: "BRAVE_API_KEY not set" });
		expect(f.mock.calls.length).toBe(0);
	});

	it("empty query => {available:false, error:'Query required'}", async () => {
		const f = mockFetch(() => new Response("{}"));
		const r = await braveSearch("", { ...opts(), fetchFn: f });
		expect(r).toEqual({ available: false, error: "Query required" });
	});

	it("200 => exact query params, header, and mapped results with age||null", async () => {
		const f = mockFetch(
			() =>
				new Response(
					JSON.stringify({
						web: {
							results: [
								{ title: "T1", url: "https://a", description: "d1", age: "2 days ago" },
								{ title: "T2", url: "https://b", description: "d2" },
							],
						},
					}),
				),
		);
		const r = await braveSearch("hello", { ...opts({ limit: 5, freshness: "week" }), fetchFn: f });
		expect(r.available).toBe(true);
		expect(r.count).toBe(2);
		expect(r.results?.[0]).toEqual({ title: "T1", url: "https://a", description: "d1", age: "2 days ago" });
		expect(r.results?.[1]?.age).toBeNull();

		const [url, init] = f.mock.calls[0];
		const parsed = new URL(url);
		expect(parsed.origin + parsed.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
		expect(parsed.searchParams.get("q")).toBe("hello");
		expect(parsed.searchParams.get("count")).toBe("5");
		expect(parsed.searchParams.get("country")).toBe("us");
		expect(parsed.searchParams.get("search_lang")).toBe("en");
		expect(parsed.searchParams.get("text_decorations")).toBe("false");
		expect(parsed.searchParams.get("freshness")).toBe("week");
		expect(init?.headers).toMatchObject({ "X-Subscription-Token": "test-key" });
	});

	it("400 fails immediately without attempts", async () => {
		const f = mockFetch(() => new Response("no", { status: 400 }));
		const r = await braveSearch("q", { ...opts(), fetchFn: f });
		expect(r).toEqual({ available: false, error: "API error: 400" });
		expect(f.mock.calls.length).toBe(1);
	});

	it("429 honors Retry-After seconds then succeeds", async () => {
		let i = 0;
		const inject = (async () => {
			const call = i++;
			if (call === 0) return new Response("slow", { status: 429, headers: { "retry-after": "1" } });
			return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
		}) as unknown as typeof fetch;
		const started = Date.now();
		const r = await braveSearch("q", { ...opts(), fetchFn: inject });
		expect(r).toMatchObject({ available: true });
		// Retry-After: 1s parsed, so the retry waited >= ~900ms (parser clamps to [0,60000]ms)
		expect(Date.now() - started).toBeGreaterThanOrEqual(900);
	});

	it("500 retries exactly MAX_RETRIES then reports error with attempts:3", async () => {
		const f = mockFetch(() => new Response("boom", { status: 500 }));
		const r = await braveSearch("q", { ...opts({ timeoutMs: 200 }), fetchFn: f });
		expect(r.available).toBe(false);
		expect(r.error).toBe("API error: 500");
		expect(r.attempts).toBe(3);
		expect(f.mock.calls.length).toBe(3);
	});

	it("timeout path errors cleanly with attempts present", async () => {
		const f = mockFetch(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")));
				}),
		);
		const r = await braveSearch("q", { ...opts({ timeoutMs: 50 }), fetchFn: f });
		expect(r.available).toBe(false);
		expect(r.attempts).toBe(3);
		expect(typeof r.error).toBe("string");
	});
});

describe("backoff helpers", () => {
	it("parseRetryAfter handles seconds, HTTP-date, junk", () => {
		expect(parseRetryAfter("2")).toBe(2000);
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter("junk")).toBeNull();
		expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(0);
		expect(parseRetryAfter("999")).toBeLessThanOrEqual(60000);
	});

	it("retryDelayMs doubles with attempt index and caps at 2000+jitter", () => {
		const first = retryDelayMs(0);
		expect(first).toBeGreaterThanOrEqual(250);
		expect(first).toBeLessThan(350);
		const capped = retryDelayMs(10);
		expect(capped).toBeGreaterThanOrEqual(2000);
		expect(capped).toBeLessThanOrEqual(2100);
	});
});
