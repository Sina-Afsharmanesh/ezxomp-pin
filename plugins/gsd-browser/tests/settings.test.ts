import { afterEach, describe, expect, it } from "vitest";
import { resolveGsdBrowserSettings, type ResolverDeps } from "../src/settings.ts";

const ENV_KEYS = ["BRAVE_API_KEY", "GSD_WEBSEARCH_TIMEOUT_MS", "GSD_BROWSER_EXECUTABLE"] as const;

function cleanEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {};
	for (const k of ENV_KEYS) env[k] = undefined;
	return env;
}

function deps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
	return { env: cleanEnv(), homeDir: "/home/test", readFileFn: async () => { throw new Error("no file"); }, ...overrides };
}

afterEach(() => {
	delete process.env["BRAVE_API_KEY"];
	delete process.env["GSD_WEBSEARCH_TIMEOUT_MS"];
	delete process.env["GSD_BROWSER_EXECUTABLE"];
});

describe("resolveGsdBrowserSettings", () => {
	it("returns manifest defaults for null/undefined/non-object input", async () => {
		for (const raw of [null, undefined, 42, "x", []]) {
			const s = await resolveGsdBrowserSettings(raw, deps());
			expect(s.enabled).toBe(true);
			expect(s.backend).toBe("auto");
			expect(s.domVerification).toBe(false);
			expect(s.braveApiKey).toBe("");
			expect(s.searchTimeoutMs).toBe(10000);
			expect(s.fetchTimeoutMs).toBe(10000);
			expect(s.maxFetchBytes).toBe(67108864);
			expect(s.injectionBlocking).toBe(false);
			expect(s.allowPrivateHosts).toBe(true);
			expect(s.viewportWidth).toBe(1440);
			expect(s.viewportHeight).toBe(900);
			expect(s.captureDir).toBe(".gsd-browser/captures");
			expect(s.browserProfileDir).toBe("");
			expect(s.browserExecutablePath).toBe("");
			expect(s.headless).toBe(true);
			expect(s.enabledKill).toBe(true);
		}
	});

	it("normalizes per-key types and rejects malformed values with defaults", async () => {
		const s = await resolveGsdBrowserSettings(
			{
				enabled: "yes",
				backend: "turbo",
				domVerification: 1,
				braveApiKey: 123,
				searchTimeoutMs: "2500junk",
				fetchTimeoutMs: -5,
				maxFetchBytes: 0,
				injectionBlocking: "true",
				allowPrivateHosts: null,
				viewportWidth: 0,
				viewportHeight: -1,
				captureDir: 42,
			},
			deps(),
		);
		expect(s.enabled).toBe(true); // malformed -> default
		expect(s.backend).toBe("auto"); // enum guard
		expect(s.domVerification).toBe(false);
		expect(s.braveApiKey).toBe("");
		expect(s.searchTimeoutMs).toBe(10000); // malformed -> default
		expect(s.fetchTimeoutMs).toBe(1); // -5 is a number -> clamped to >= 1
		expect(s.maxFetchBytes).toBe(1024); // 0 clamped up to >=1024
		expect(s.injectionBlocking).toBe(false);
		expect(s.allowPrivateHosts).toBe(true);
		expect(s.viewportWidth).toBe(1); // 0 clamped to >= 1
		expect(s.viewportHeight).toBe(1); // -1 clamped to >= 1
		expect(s.captureDir).toBe(".gsd-browser/captures"); // malformed -> default
	});
});

describe("env overrides", () => {
	it("GSD_WEBSEARCH_TIMEOUT_MS overrides searchTimeoutMs when a positive integer", async () => {
		const s = await resolveGsdBrowserSettings({}, deps({ env: { ...cleanEnv(), GSD_WEBSEARCH_TIMEOUT_MS: "2500" } }));
		expect(s.searchTimeoutMs).toBe(2500);
	});

	it("GSD_WEBSEARCH_TIMEOUT_MS ignored when malformed", async () => {
		const s = await resolveGsdBrowserSettings({ searchTimeoutMs: 5000 }, deps({ env: { ...cleanEnv(), GSD_WEBSEARCH_TIMEOUT_MS: "abc" } }));
		expect(s.searchTimeoutMs).toBe(5000);
	});

	it("GSD_BROWSER_EXECUTABLE overrides browserExecutablePath", async () => {
		const s = await resolveGsdBrowserSettings(
			{ browserExecutablePath: "/usr/bin/chromium" },
			deps({ env: { ...cleanEnv(), GSD_BROWSER_EXECUTABLE: "/opt/chrome" } }),
		);
		expect(s.browserExecutablePath).toBe("/opt/chrome");
	});
});

describe("Brave key chain", () => {
	it("env BRAVE_API_KEY wins over setting and file, trimmed", async () => {
		const s = await resolveGsdBrowserSettings(
			{ braveApiKey: "setting-key" },
			deps({ env: { ...cleanEnv(), BRAVE_API_KEY: "  env-key  " }, readFileFn: async () => "file-key" }),
		);
		expect(s.braveApiKey).toBe("env-key");
	});

	it("setting wins over file; file trimmed; empty file -> unset", async () => {
		const fromSetting = await resolveGsdBrowserSettings({ braveApiKey: " setting-key " }, deps({ readFileFn: async () => "file-key" }));
		expect(fromSetting.braveApiKey).toBe("setting-key");

		const fromFile = await resolveGsdBrowserSettings({}, deps({ readFileFn: async () => "  file-key\n" }));
		expect(fromFile.braveApiKey).toBe("file-key");

		const emptyFile = await resolveGsdBrowserSettings({}, deps({ readFileFn: async () => "   " }));
		expect(emptyFile.braveApiKey).toBe("");
	});

	it("missing file falls back to empty key", async () => {
		const s = await resolveGsdBrowserSettings({}, deps());
		expect(s.braveApiKey).toBe("");
	});
});
