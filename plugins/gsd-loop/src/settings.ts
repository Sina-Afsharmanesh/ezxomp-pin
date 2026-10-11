/**
 * src/settings.ts — typed settings resolver (WU-2).
 *
 * Declared keys come from package.json#omp.settings (9 keys); persisted
 * overrides via PluginManager.getPluginSettings("@ezxomp/gsd-loop").
 * Invalid types / out-of-range values fall back to defaults (clamped).
 */

export interface GsdLoopSettings {
	"loop.maxIterations": number;
	"loop.memoryCheckInterval": number;
	"loop.memoryHeapThresholdRatio": number;
	"loop.maxConsecutiveErrors": number;
	"loop.maxCooldownRetries": number;
	"loop.cooldownFallbackWaitMs": number;
	"loop.maxFinalizeTimeouts": number;
	"verify.maxRetries": number;
	"verify.timeoutMs": number;
}

export const GSD_LOOP_CONSTANTS = {
	stubRecoveryThreshold: 2, // gsd-pi STUB_RECOVERY_THRESHOLD (session.ts:101)
	wedgeSignatureSeparator: ":",
} as const;

/** Verify backoff policy constants (upstream, not user knobs). */
export const VERIFY_BACKOFF_MIN_MS = 2000;
export const VERIFY_BACKOFF_MAX_MS = 30000;
export const VERIFY_JITTER_RATIO = 0.1;

export const SETTINGS_DEFAULTS: GsdLoopSettings = {
	"loop.maxIterations": 500,
	"loop.memoryCheckInterval": 5,
	"loop.memoryHeapThresholdRatio": 0.85,
	"loop.maxConsecutiveErrors": 3,
	"loop.maxCooldownRetries": 5,
	"loop.cooldownFallbackWaitMs": 35000,
	"loop.maxFinalizeTimeouts": 3,
	"verify.maxRetries": 3,
	"verify.timeoutMs": 120000,
};

interface KeySpec {
	min: number;
	/** Coerce to integer (step: 1 keys). */
	int: boolean;
}

const KEY_SPECS: Record<keyof GsdLoopSettings, KeySpec> = {
	"loop.maxIterations": { min: 1, int: true },
	"loop.memoryCheckInterval": { min: 1, int: true },
	"loop.memoryHeapThresholdRatio": { min: 0.1, int: false },
	"loop.maxConsecutiveErrors": { min: 1, int: true },
	"loop.maxCooldownRetries": { min: 1, int: true },
	"loop.cooldownFallbackWaitMs": { min: 1000, int: true },
	"loop.maxFinalizeTimeouts": { min: 1, int: true },
	"verify.maxRetries": { min: 0, int: true },
	"verify.timeoutMs": { min: 1000, int: true },
};

function coerce(raw: unknown, spec: KeySpec, fallback: number): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
	const value = spec.int ? Math.floor(raw) : raw;
	if (value < spec.min) return fallback;
	return value;
}

/** Resolve persisted/plugin-settings raw values into validated settings. */
export function resolveGsdLoopSettings(raw: unknown): GsdLoopSettings {
	const source =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const resolved = {} as GsdLoopSettings;
	for (const key of Object.keys(SETTINGS_DEFAULTS) as (keyof GsdLoopSettings)[]) {
		resolved[key] = coerce(source[key], KEY_SPECS[key], SETTINGS_DEFAULTS[key]);
	}
	return resolved;
}
