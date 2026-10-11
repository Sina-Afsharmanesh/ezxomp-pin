import { completeSimple } from "@oh-my-pi/pi-ai";
import { discoverAuthStorage, ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { createPiConsolidationModelAdapter, parseProviderModel, type ConsolidationModelAdapter } from "./model-adapter.ts";
import { redactText } from "../storage/redaction.ts";

type OmpModelRegistry = Pick<ExtensionContext, "modelRegistry">["modelRegistry"];

type StandaloneRuntime = {
	createModelRegistry: () => Promise<OmpModelRegistry>;
	completeSimple: typeof completeSimple;
};

/**
 * Build the same model registry used by OMP without importing a host runtime
 * directory. The CLI is bundled with this plugin, while the OMP packages are
 * resolved through the package's normal dependency graph.
 */
export async function loadStandaloneOmpRuntime(): Promise<StandaloneRuntime> {
	const authStorage = await discoverAuthStorage();
	const modelRegistry = new ModelRegistry(authStorage);
	await modelRegistry.refresh("offline");
	return {
		createModelRegistry: async () => modelRegistry,
		completeSimple,
	};
}

export async function validateStandaloneConsolidationModel(configured: string): Promise<{ ok: true } | { ok: false; reason: string }> {
	const parsed = parseProviderModel(configured);
	if (!parsed) return { ok: false, reason: "invalid provider/model id" };
	try {
		const runtime = await loadStandaloneOmpRuntime();
		const modelRegistry = await runtime.createModelRegistry();
		const model = modelRegistry.find(parsed.provider, parsed.modelId);
		if (!model) return { ok: false, reason: "model is unavailable to the standalone scheduler" };
		if (!modelRegistry.hasConfiguredAuth(model)) return { ok: false, reason: "model authentication is not configured" };
		const auth = await modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) return { ok: false, reason: "model authentication is unavailable" };
		return { ok: true };
	} catch (error: unknown) {
		return { ok: false, reason: redactText(String(error instanceof Error ? error.message : error)).slice(0, 180) };
	}
}

export async function createStandaloneConsolidationModelAdapter(options: { signal?: AbortSignal } = {}): Promise<ConsolidationModelAdapter> {
	const runtime = await loadStandaloneOmpRuntime();
	const modelRegistry = await runtime.createModelRegistry();
	return createPiConsolidationModelAdapter(
		{ modelRegistry },
		{ complete: runtime.completeSimple, purpose: "agent-experience-scheduled-habit-learning" },
	);
}
