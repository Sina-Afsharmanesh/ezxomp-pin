export type CompactEngMode = "text" | "snapcompact";
export type CompactionOrigin = "auto" | "manual" | "fallback";
export type GovernorPhase = "armed" | "requesting" | "compacting" | "settling" | "cooldown";
export type CircuitState = "closed" | "open" | "half-open";

export interface CompactEngConfig {
	autoCompact?: boolean;
	watermark?: number;
	watermarkTokens?: number | null;
	releaseWatermark?: number;
	outputHeadroomTokens?: number;
	mode?: CompactEngMode;
	cooldownTurns?: number;
	maxConsecutiveFailures?: number;
	circuitCooldownTurns?: number;
	minProgressTokens?: number;
}

export interface ResolvedCompactEngConfig {
	autoCompact: boolean;
	watermark: number;
	watermarkTokens: number | null;
	releaseWatermark: number;
	outputHeadroomTokens: number;
	mode: CompactEngMode;
	cooldownTurns: number;
	maxConsecutiveFailures: number;
	circuitCooldownTurns: number;
	minProgressTokens: number;
}

export interface UsageSample {
	tokens: number;
	contextWindow: number;
	percent: number;
	triggerTokens: number;
	releaseTokens: number;
}

export interface CompactionReceipt {
	class: "native-shake-observed" | "native-auto-observed" | "plugin-native-text-requested" | "plugin-native-snapcompact-requested" | "native-outcome" | "deferred" | "no-progress" | "circuit-open" | "stale-completion";
	source: "native-auto" | "compact-eng-request";
	origin?: CompactionOrigin;
	generation: number;
	requestedMode?: CompactEngMode;
	observedAction?: string;
	result?: "accepted" | "settled" | "aborted" | "skipped" | "error" | "deferred-pending" | "usage-unavailable" | "auto-disabled" | "below-watermark" | "cooldown" | "circuit-open" | "no-progress" | "stale-completion";
	before?: UsageSample;
	after?: UsageSample;
	transition: string;
	turn: number;
	at: number;
	pending?: boolean;
	aborted?: boolean;
	skipped?: boolean;
	retry?: boolean;
	error?: string;
	noProgress?: boolean;
	fallback?: CompactEngMode;
}

export interface CompactEngStatus {
	config: ResolvedCompactEngConfig;
	phase: GovernorPhase;
	circuit: CircuitState;
	generation: number;
	inFlight: boolean;
	turn: number;
	cooldownRemaining: number;
	circuitCooldownRemaining: number;
	consecutiveFailures: number;
	noProgressCount: number;
	usage?: UsageSample;
	lastReceipt?: CompactionReceipt;
}

const DEFAULT_CONFIG: ResolvedCompactEngConfig = {
	autoCompact: true,
	watermark: 0.7,
	watermarkTokens: null,
	releaseWatermark: 0.55,
	outputHeadroomTokens: 4096,
	mode: "text",
	cooldownTurns: 2,
	maxConsecutiveFailures: 3,
	circuitCooldownTurns: 5,
	minProgressTokens: 4096,
};

const CONFIG_KEYS: Record<keyof CompactEngConfig, true> = {
	autoCompact: true,
	watermark: true,
	watermarkTokens: true,
	releaseWatermark: true,
	outputHeadroomTokens: true,
	mode: true,
	cooldownTurns: true,
	maxConsecutiveFailures: true,
	circuitCooldownTurns: true,
	minProgressTokens: true,
};

function fail(key: string, expectation: string): never {
	throw new Error(`compact-eng config ${key} must be ${expectation}`);
}

function finiteNumber(value: unknown, key: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) fail(key, "a finite number");
	return value;
}

function integer(value: unknown, key: string, minimum: number): number {
	const number = finiteNumber(value, key);
	if (!Number.isInteger(number) || number < minimum) fail(key, `an integer >= ${minimum}`);
	return number;
}

function watermark(value: unknown): number {
	const resolved = finiteNumber(value, "watermark");
	if (resolved <= 0 || resolved >= 1) fail("watermark", "greater than 0 and less than 1");
	return resolved;
}

function watermarkTokens(value: unknown): number | null {
	if (value === null) return null;
	return integer(value, "watermarkTokens", 1);
}

function releaseWatermark(value: unknown, trigger: number): number {
	const resolved = finiteNumber(value, "releaseWatermark");
	if (resolved < 0 || resolved >= trigger) fail("releaseWatermark", "at least 0 and less than watermark");
	return resolved;
}

function mode(value: unknown): CompactEngMode {
	if (value === "text") return value;
	if (value === "snapcompact") return value;
	return fail("mode", '"text" or "snapcompact"');
}

export function resolveConfig(config: CompactEngConfig = {}): ResolvedCompactEngConfig {
	for (const key of Object.keys(config)) if (!(key in CONFIG_KEYS)) fail(key, "a supported key");
	const resolved = { ...DEFAULT_CONFIG, ...config } as ResolvedCompactEngConfig;
	if (typeof resolved.autoCompact !== "boolean") fail("autoCompact", "a boolean");
	resolved.watermark = watermark(resolved.watermark);
	resolved.watermarkTokens = watermarkTokens(resolved.watermarkTokens);
	resolved.releaseWatermark = releaseWatermark(resolved.releaseWatermark, resolved.watermark);
	resolved.outputHeadroomTokens = integer(resolved.outputHeadroomTokens, "outputHeadroomTokens", 0);
	resolved.mode = mode(resolved.mode);
	resolved.cooldownTurns = integer(resolved.cooldownTurns, "cooldownTurns", 0);
	resolved.maxConsecutiveFailures = integer(resolved.maxConsecutiveFailures, "maxConsecutiveFailures", 1);
	resolved.circuitCooldownTurns = integer(resolved.circuitCooldownTurns, "circuitCooldownTurns", 1);
	resolved.minProgressTokens = integer(resolved.minProgressTokens, "minProgressTokens", 0);
	return resolved;
}
