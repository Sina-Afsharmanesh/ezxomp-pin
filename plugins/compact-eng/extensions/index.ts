import type { AgentEndEvent, AutoCompactionEndEvent, AutoCompactionStartEvent, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { CompactEngGovernor } from "./governor";
import { resolveConfig } from "./types";
import type { CompactEngConfig, CompactEngMode, CompactionReceipt } from "./types";

const WARNING_RESULTS = new Set<CompactionReceipt["result"]>(["deferred-pending", "usage-unavailable", "circuit-open", "no-progress"]);
const REQUEST_ACTIONS = new Set(["compact", "snapcompact"]);
type GovernorProvider = (ctx: ExtensionContext) => Promise<CompactEngGovernor>;

function boundedJson(value: unknown): string {
	const text = JSON.stringify(value, null, 2);
	return text.length <= 4000 ? text : `${text.slice(0, 3980)}\n…truncated`;
}

function receiptLevel(receipt: CompactionReceipt): "info" | "warning" | "error" {
	if (receipt.result === "error") return "error";
	if (WARNING_RESULTS.has(receipt.result)) return "warning";
	return "info";
}

function commandAction(args: string): string {
	const action = args.trim().toLowerCase();
	if (action === "") return "compact";
	return action;
}

function commandMode(action: string): CompactEngMode {
	if (action === "snapcompact") return "snapcompact";
	return "text";
}

function receiptResult(receipt: CompactionReceipt): string {
	if (receipt.result) return receipt.result;
	return receipt.class;
}

export async function handleCompactEngCommand(governor: CompactEngGovernor, args: string, ctx: ExtensionCommandContext): Promise<void> {
	const action = commandAction(args);
	if (action === "status") {
		ctx.ui.notify(`Compact-eng status\n${boundedJson(governor.status(ctx))}`, "info");
		return;
	}
	if (!REQUEST_ACTIONS.has(action)) {
		ctx.ui.notify("Usage: /compact-eng [status|compact|snapcompact]", "warning");
		return;
	}
	const mode = commandMode(action);
	const receipt = await governor.requestCompaction(ctx, mode, { manual: true });
	ctx.ui.notify(`Compact-eng ${mode} native request: ${receiptResult(receipt)}`, receiptLevel(receipt));
}

function registerCompactEngTools(pi: ExtensionAPI, getGovernor: GovernorProvider): void {
	if (typeof pi.registerTool !== "function" || !pi.typebox?.Type) return;
	const Type = pi.typebox.Type;
	pi.registerTool({
		name: "compact_eng_context_status",
		label: "Compact-eng Context Status",
		description: "Read compact-eng context pressure, thresholds, governor phase, circuit state, and last bounded receipt.",
		parameters: Type.Object({}),
		approval: "read",
		async execute(_id, _params, _signal, _update, ctx) {
			const governor = await getGovernor(ctx);
			const status = governor.status(ctx);
			return { content: [{ type: "text", text: boundedJson(status) }], details: status };
		},
	});
	pi.registerTool({
		name: "compact_eng_request",
		label: "Compact-eng Request",
		description: "Request one guarded OMP-native text or snapcompact compaction without replacing native compaction.",
		parameters: Type.Object({
			mode: Type.Union([Type.Literal("text"), Type.Literal("snapcompact")]),
			reason: Type.Optional(Type.String({ maxLength: 240 })),
		}),
		approval: "exec",
		async execute(_id, params, _signal, _update, ctx) {
			const request = params as { mode: CompactEngMode; reason?: string };
			if (request.reason) {
				pi.logger.debug("Compact-eng agent request", {
					mode: request.mode,
					reason: request.reason.slice(0, 240),
				});
			}
			const governor = await getGovernor(ctx);
			const receipt = await governor.requestCompaction(ctx, request.mode, { manual: true });
			return { content: [{ type: "text", text: boundedJson(receipt) }], details: receipt };
		},
	});
}

function createGovernorProvider(config: CompactEngConfig): {
	get: GovernorProvider;
	current(): CompactEngGovernor | undefined;
	reset(): void;
} {
	let governor: CompactEngGovernor | undefined;
	let loading: Promise<CompactEngGovernor> | undefined;
	const get: GovernorProvider = (ctx) => {
		loading ??= import("@oh-my-pi/pi-coding-agent/extensibility/plugins")
			.then(({ PluginManager }) => new PluginManager(ctx.cwd).getPluginSettings("@ezxomp/compact-eng"))
			.catch(() => ({}))
			.then((persisted) => new CompactEngGovernor(resolveConfig({ ...config, ...persisted })));
		return loading.then((resolved) => {
			governor = resolved;
			return resolved;
		});
	};
	return {
		get,
		current: () => governor,
		reset() {
			governor?.reset();
		},
	};
}

export default function compactEng(pi: ExtensionAPI, config: CompactEngConfig = {}): void {
	const governors = createGovernorProvider(config);
	pi.registerCommand("compact-eng", {
		description: "Inspect pressure or request guarded OMP-native text/snapcompact compaction.",
		handler(args: string, ctx: ExtensionCommandContext) {
			const governor = governors.current();
			if (governor) return handleCompactEngCommand(governor, args, ctx);
			return governors.get(ctx).then((resolved) => handleCompactEngCommand(resolved, args, ctx));
		},
	});
	registerCompactEngTools(pi, governors.get);
	pi.on("session_start", () => governors.reset());
	pi.on("session_shutdown", () => governors.reset());
	pi.on("agent_end", (event: AgentEndEvent, ctx: ExtensionContext) => {
		const governor = governors.current();
		if (governor) return governor.observeTurnEnd(ctx, event.willContinue === true).then(() => {});
		return governors.get(ctx)
			.then((resolved) => resolved.observeTurnEnd(ctx, event.willContinue === true))
			.then(() => {});
	});
	pi.on("auto_compaction_start", (event: AutoCompactionStartEvent, ctx: ExtensionContext) => {
		const governor = governors.current();
		if (governor) return governor.observeAutoStart(event);
		return governors.get(ctx).then((resolved) => resolved.observeAutoStart(event));
	});
	pi.on("auto_compaction_end", (event: AutoCompactionEndEvent, ctx: ExtensionContext) => {
		const governor = governors.current();
		if (governor) return governor.observeAutoEnd(event, ctx);
		return governors.get(ctx).then((resolved) => resolved.observeAutoEnd(event, ctx));
	});
}

export { CompactEngGovernor } from "./governor";
export { resolveConfig } from "./types";
export type { CircuitState, CompactEngConfig, CompactEngMode, CompactEngStatus, CompactionOrigin, CompactionReceipt, GovernorPhase, ResolvedCompactEngConfig, UsageSample } from "./types";
