/**
 * src/settings.ts — resolveGsdBrowserSettings(raw).
 *
 * Per-key type checks, clamps (timeouts >= 1, maxFetchBytes >= 1024,
 * viewports >= 1), enum guards, env overrides (GSD_BROWSER_EXECUTABLE,
 * GSD_WEBSEARCH_TIMEOUT_MS), and the Brave key chain:
 * env BRAVE_API_KEY > setting braveApiKey > file ~/.gsd/brave_api_key
 * (trimmed, empty -> unset).
 */

import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface GsdBrowserSettings {
	enabled: boolean;
	backend: "auto" | "none";
	domVerification: boolean;
	braveApiKey: string;
	searchTimeoutMs: number;
	fetchTimeoutMs: number;
	maxFetchBytes: number;
	injectionBlocking: boolean;
	allowPrivateHosts: boolean;
	maxDomChars: number;
	viewportWidth: number;
	viewportHeight: number;
	captureDir: string;
	browserProfileDir: string;
	browserExecutablePath: string;
	headless: boolean;
	enabledKill: boolean;
}

/** Injectable I/O so tests stay hermetic; defaults use the real process. */
export interface ResolverDeps {
	env?: Record<string, string | undefined>;
	readFileFn?: (path: string) => Promise<string>;
	homeDir?: string;
}

const DEFAULTS: GsdBrowserSettings = {
	enabled: true,
	backend: "auto",
	domVerification: false,
	braveApiKey: "",
	searchTimeoutMs: 10000,
	fetchTimeoutMs: 10000,
	maxFetchBytes: 67108864,
	injectionBlocking: false,
	allowPrivateHosts: true,
	viewportWidth: 1440,
	viewportHeight: 900,
	maxDomChars: 20000,
	captureDir: ".gsd-browser/captures",
	browserExecutablePath: "",
	browserProfileDir: "",
	headless: true,
	enabledKill: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
	return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
	return typeof v === "string" ? v : fallback;
}

/** Clamp a number setting to >= min; malformed values fall back to default. */
function asClampedNumber(v: unknown, fallback: number, min: number): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
	return Math.max(Math.floor(v), min);
}

function asBackend(v: unknown): "auto" | "none" {
	return v === "none" ? "none" : "auto";
}

function parsePositiveIntEnv(v: string | undefined): number | null {
	if (!v) return null;
	if (!/^[0-9]+$/.test(v)) return null;
	const n = Number.parseInt(v, 10);
	return Number.isInteger(n) && n > 0 ? n : null;
}

async function readBraveKeyFile(deps: ResolverDeps): Promise<string> {
	const read = deps.readFileFn ?? readFileFnDefault;
	const home = deps.homeDir ?? homedir();
	try {
		const raw = await read(join(home, ".gsd", "brave_api_key"));
		return raw.trim();
	} catch {
		return "";
	}
}

export async function resolveGsdBrowserSettings(
	raw: unknown,
	deps: ResolverDeps = {},
): Promise<GsdBrowserSettings> {
	const obj = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const env = deps.env ?? process.env;

	const settings: GsdBrowserSettings = {
		enabled: asBool(obj["enabled"], DEFAULTS.enabled),
		backend: asBackend(obj["backend"]),
		domVerification: asBool(obj["domVerification"], DEFAULTS.domVerification),
		braveApiKey: asString(obj["braveApiKey"], DEFAULTS.braveApiKey),
		searchTimeoutMs: asClampedNumber(obj["searchTimeoutMs"], DEFAULTS.searchTimeoutMs, 1),
		fetchTimeoutMs: asClampedNumber(obj["fetchTimeoutMs"], DEFAULTS.fetchTimeoutMs, 1),
		maxFetchBytes: asClampedNumber(obj["maxFetchBytes"], DEFAULTS.maxFetchBytes, 1024),
		injectionBlocking: asBool(obj["injectionBlocking"], DEFAULTS.injectionBlocking),
		allowPrivateHosts: asBool(obj["allowPrivateHosts"], DEFAULTS.allowPrivateHosts),
		viewportWidth: asClampedNumber(obj["viewportWidth"], DEFAULTS.viewportWidth, 1),
		viewportHeight: asClampedNumber(obj["viewportHeight"], DEFAULTS.viewportHeight, 1),
		maxDomChars: asClampedNumber(obj["maxDomChars"], DEFAULTS.maxDomChars, 1),
		captureDir: asString(obj["captureDir"], DEFAULTS.captureDir),
		browserProfileDir: asString(obj["browserProfileDir"], DEFAULTS.browserProfileDir),
		browserExecutablePath: asString(obj["browserExecutablePath"], DEFAULTS.browserExecutablePath),
		headless: asBool(obj["headless"], DEFAULTS.headless),
		enabledKill: asBool(obj["enabledKill"], DEFAULTS.enabledKill),
	};

	// Env overrides.
	const envTimeout = parsePositiveIntEnv(env["GSD_WEBSEARCH_TIMEOUT_MS"]);
	if (envTimeout !== null) settings.searchTimeoutMs = envTimeout;
	const envExecutable = env["GSD_BROWSER_EXECUTABLE"];
	if (envExecutable) settings.browserExecutablePath = envExecutable;

	// Brave key chain: env > setting > ~/.gsd/brave_api_key (trimmed, empty -> unset).
	const envKey = env["BRAVE_API_KEY"];
	if (envKey && envKey.trim()) {
		settings.braveApiKey = envKey.trim();
	} else {
		const settingKey = settings.braveApiKey.trim();
		if (settingKey) {
			settings.braveApiKey = settingKey;
		} else {
			settings.braveApiKey = await readBraveKeyFile(deps);
		}
	}

	return settings;
}

function readFileFnDefault(path: string): Promise<string> {
	return readFile(path, "utf8");
}
