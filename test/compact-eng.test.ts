import { describe, expect, test } from "bun:test";
import { Type } from "@oh-my-pi/pi-coding-agent/extensibility/legacy-typebox";

interface TestContext {
	cwd: string;
	getContextUsage(): { tokens: number; contextWindow: number; percent: number };
	compact(options?: unknown): Promise<void>;
	isIdle(): boolean;
	hasPendingMessages(): boolean;
	ui: { notify(message: string, level?: string): void };
}

type ExtensionHandler = (event: unknown, ctx: TestContext) => unknown;
type ToolResult = { content: Array<{ type: string; text: string }>; details: Record<string, unknown> };
type RegisteredTool = {
	name: string;
	execute(id: string, params: unknown, signal: AbortSignal, update: () => void, ctx: TestContext): Promise<ToolResult>;
};

interface RegisteredExtension {
	handlers: Map<string, ExtensionHandler[]>;
	commands: Map<string, { handler: ExtensionHandler }>;
	tools: Map<string, RegisteredTool>;
	debugLogs: Array<{ message: string; context?: Record<string, unknown> }>;
}

interface ExtensionModule {
	default(
		pi: {
			on(event: string, handler: ExtensionHandler): void;
			registerCommand(name: string, command: { handler: ExtensionHandler }): void;
			registerTool(tool: RegisteredTool): void;
			typebox: { Type: typeof Type };
			logger: { debug(message: string, context?: Record<string, unknown>): void };
		},
		config?: Record<string, unknown>,
	): void;
}

async function registerCompactEng(config: Record<string, unknown> = {}): Promise<RegisteredExtension> {
	const handlers = new Map<string, ExtensionHandler[]>();
	const commands = new Map<string, { handler: ExtensionHandler }>();
	const tools = new Map<string, RegisteredTool>();
	const debugLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];
	const pi = {
		on(event: string, handler: ExtensionHandler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerCommand(name: string, command: { handler: ExtensionHandler }) {
			commands.set(name, command);
		},
		registerTool(tool: RegisteredTool) {
			tools.set(tool.name, tool);
		},
		typebox: { Type },
		logger: {
			debug(message: string, context?: Record<string, unknown>) {
				debugLogs.push({ message, context });
			},
		},
	};
	// This test intentionally exercises the future plugin-loading boundary; the module is absent in RED.
	const module = await import("../plugins/compact-eng/extensions/index.ts") as unknown as ExtensionModule;
	module.default(pi, config);
	return { handlers, commands, tools, debugLogs };
}

describe("compact-eng native composition contract", () => {
	test("registers the compact-eng command without replacing OMP compaction or Shake hooks", async () => {
		const extension = await registerCompactEng();

		expect(extension.commands.has("compact-eng")).toBe(true);
		expect(extension.commands.has("ultracompact")).toBe(false);
		expect(extension.handlers.has("session_before_compact")).toBe(false);
		expect(extension.handlers.has("tool_result")).toBe(false);
	});

	test("requests native compaction after a turn crosses the configured watermark", async () => {
		const extension = await registerCompactEng({ watermark: 0.7 });
		const handlers = extension.handlers.get("agent_end") ?? [];
		expect(handlers).toHaveLength(1);
		const compactCalls: unknown[] = [];
		const ctx: TestContext = {
			cwd: import.meta.dir,
			getContextUsage: () => ({ tokens: 72_000, contextWindow: 100_000, percent: 72 }),
			compact: async (options?: unknown) => { compactCalls.push(options); },
			isIdle: () => true,
			hasPendingMessages: () => false,
			ui: { notify() {} },
		};

		await handlers[0]({ type: "agent_end" }, ctx);

		expect(compactCalls).toEqual([undefined]);
	});

	test("does not compact below the watermark and coalesces concurrent turn-end checks", async () => {
		const extension = await registerCompactEng({ watermark: 0.7 });
		const handler = extension.handlers.get("agent_end")?.[0];
		expect(handler).toBeDefined();
		let percent = 69;
		let calls = 0;
		let release!: () => void;
		const pending = new Promise<void>((resolve) => { release = resolve; });
		const ctx: TestContext = {
			cwd: import.meta.dir,
			getContextUsage: () => ({ tokens: percent * 1_000, contextWindow: 100_000, percent }),
			compact: async () => { calls++; await pending; },
			isIdle: () => true,
			hasPendingMessages: () => false,
			ui: { notify() {} },
		};

		await handler!({ type: "agent_end" }, ctx);
		expect(calls).toBe(0);

		percent = 72;
		const first = handler!({ type: "agent_end" }, ctx);
		const second = handler!({ type: "agent_end" }, ctx);
		await Promise.resolve();
		expect(calls).toBe(1);
		release();
		await Promise.all([first, second]);
	});

	test("registers and invokes both bounded compact-eng tools", async () => {
		const extension = await registerCompactEng({ watermark: 0.7, cooldownTurns: 0 });
		expect([...extension.tools.keys()].sort()).toEqual(["compact_eng_context_status", "compact_eng_request"]);
		let tokens = 72_000;
		const compactCalls: unknown[] = [];
		const ctx: TestContext = {
			cwd: import.meta.dir,
			getContextUsage: () => ({ tokens, contextWindow: 100_000, percent: tokens / 1_000 }),
			compact: async (options?: unknown) => {
				compactCalls.push(options);
				tokens = 50_000;
			},
			isIdle: () => true,
			hasPendingMessages: () => false,
			ui: { notify() {} },
		};
		const signal = new AbortController().signal;
		const status = await extension.tools.get("compact_eng_context_status")!.execute("status", {}, signal, () => {}, ctx);
		expect(status.content[0].text.length).toBeLessThanOrEqual(4000);
		expect(status.content[0].text).toContain('"phase": "armed"');

		const request = await extension.tools.get("compact_eng_request")!.execute(
			"request",
			{ mode: "text", reason: "test native delegation" },
			signal,
			() => {},
			ctx,
		);
		expect(compactCalls).toEqual([undefined]);
		expect(request.details).toMatchObject({
			class: "native-outcome",
			source: "compact-eng-request",
			origin: "manual",
			requestedMode: "text",
			result: "settled",
		});
		expect(extension.debugLogs).toEqual([{
			message: "Compact-eng agent request",
			context: { mode: "text", reason: "test native delegation" },
		}]);
	});

	test("treats agent_end as the auto boundary while preserving pending-message deferral", async () => {
		const module = await import("../plugins/compact-eng/extensions/index.ts");
		let idle = false;
		let pendingMessages = false;
		let compactCalls = 0;
		const ctx: TestContext = {
			cwd: import.meta.dir,
			getContextUsage: () => ({ tokens: 72_000, contextWindow: 100_000, percent: 72 }),
			compact: async () => { compactCalls++; },
			isIdle: () => idle,
			hasPendingMessages: () => pendingMessages,
			ui: { notify() {} },
		};
		const governor = new module.CompactEngGovernor(module.resolveConfig({
			autoCompact: true,
			watermark: 0.7,
			cooldownTurns: 0,
			minProgressTokens: 0,
		}));

		const automatic = await governor.observeTurnEnd(ctx as never);
		expect(compactCalls).toBe(1);
		expect(automatic.origin).toBe("auto");

		const manual = await governor.requestCompaction(ctx as never, "text", { manual: true });
		expect(manual.result).toBe("deferred-pending");
		expect(manual.origin).toBe("manual");
		expect(compactCalls).toBe(1);

		const pendingGovernor = new module.CompactEngGovernor(module.resolveConfig({
			autoCompact: true,
			watermark: 0.7,
			cooldownTurns: 0,
		}));
		pendingMessages = true;
		const receipt = await pendingGovernor.observeTurnEnd(ctx as never);
		expect(receipt.result).toBe("deferred-pending");
		expect(compactCalls).toBe(1);
	});

	test("reports disabled auto-compaction distinctly and reevaluates when cooldown rearms", async () => {
		const module = await import("../plugins/compact-eng/extensions/index.ts");
		let tokens = 72_000;
		let compactCalls = 0;
		const ctx: TestContext = {
			cwd: import.meta.dir,
			getContextUsage: () => ({ tokens, contextWindow: 100_000, percent: tokens / 1_000 }),
			compact: async () => { compactCalls++; },
			isIdle: () => true,
			hasPendingMessages: () => false,
			ui: { notify() {} },
		};
		const disabled = new module.CompactEngGovernor(module.resolveConfig({ autoCompact: false, watermark: 0.7 }));
		expect((await disabled.observeTurnEnd(ctx as never)).result).toBe("auto-disabled");
		expect(compactCalls).toBe(0);

		tokens = 69_000;
		const below = new module.CompactEngGovernor(module.resolveConfig({ autoCompact: true, watermark: 0.7 }));
		expect((await below.observeTurnEnd(ctx as never)).result).toBe("below-watermark");

		tokens = 72_000;
		const cooldown = new module.CompactEngGovernor(module.resolveConfig({
			autoCompact: true,
			watermark: 0.7,
			cooldownTurns: 1,
		}));
		await cooldown.observeTurnEnd(ctx as never);
		expect(compactCalls).toBe(1);
		await cooldown.observeTurnEnd(ctx as never);
		expect(compactCalls).toBe(2);
	});
});
