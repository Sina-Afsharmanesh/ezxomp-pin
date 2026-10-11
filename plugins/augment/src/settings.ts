import type { AugmentFamily, AugmentRewriteMode } from "./types.js";

export interface AugmentSettings {
	rewriteMode: AugmentRewriteMode | "auto";
	maxOutputTokens: number;
	timeoutMs: number;
	conversationContextDepth: number;
	outputStyleFamily: AugmentFamily | "auto";
	reviewBeforeSend: boolean;
}

export const DEFAULT_AUGMENT_SETTINGS: AugmentSettings = {
	rewriteMode: "auto",
	maxOutputTokens: 1_200,
	timeoutMs: 45_000,
	conversationContextDepth: 4,
	outputStyleFamily: "auto",
	reviewBeforeSend: true,
};

const REWRITE_MODES = new Set<AugmentSettings["rewriteMode"]>([
	"auto",
	"plain",
	"execution-contract",
]);
const OUTPUT_FAMILIES = new Set<AugmentSettings["outputStyleFamily"]>(["auto", "claude", "gpt"]);

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function nonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function resolveAugmentSettings(raw: Record<string, unknown>): AugmentSettings {
	const rewriteMode = REWRITE_MODES.has(raw.rewriteMode as AugmentSettings["rewriteMode"])
		? raw.rewriteMode as AugmentSettings["rewriteMode"]
		: DEFAULT_AUGMENT_SETTINGS.rewriteMode;
	const outputStyleFamily = OUTPUT_FAMILIES.has(raw.outputStyleFamily as AugmentSettings["outputStyleFamily"])
		? raw.outputStyleFamily as AugmentSettings["outputStyleFamily"]
		: DEFAULT_AUGMENT_SETTINGS.outputStyleFamily;

	return {
		rewriteMode,
		maxOutputTokens: positiveInteger(raw.maxOutputTokens)
			? raw.maxOutputTokens
			: DEFAULT_AUGMENT_SETTINGS.maxOutputTokens,
		timeoutMs: positiveInteger(raw.timeoutMs)
			? raw.timeoutMs
			: DEFAULT_AUGMENT_SETTINGS.timeoutMs,
		conversationContextDepth: nonNegativeInteger(raw.conversationContextDepth)
			? raw.conversationContextDepth
			: DEFAULT_AUGMENT_SETTINGS.conversationContextDepth,
		outputStyleFamily,
		reviewBeforeSend: typeof raw.reviewBeforeSend === "boolean"
			? raw.reviewBeforeSend
			: DEFAULT_AUGMENT_SETTINGS.reviewBeforeSend,
	};
}
