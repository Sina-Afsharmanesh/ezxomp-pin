// Minimal ExtensionAPI test double used by vitest alias.
// Stores registered handlers so tests can invoke them programmatically.
// Extended beyond the upstream fork's mock to cover getActiveTools/setActiveTools/getAllTools
// (the surface omp-evo-mode drives).
import type { Mock } from "vitest";
import { vi } from "vitest";

// MockProcedure was removed in vitest 4 — Mock<Procedure> now takes a Function type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
type MockProcedure = AnyFn;

export interface UiStub {
	notify: Mock<MockProcedure>;
	setStatus: Mock<MockProcedure>;
	widget: Mock<MockProcedure>;
	confirm: Mock<MockProcedure>;
	select: Mock<MockProcedure>;
	input: Mock<MockProcedure>;
}

export interface MemoryStub {
	save: Mock<MockProcedure>;
	entries: any[];
}

export interface TestContext {
	mode: "tui" | "rpc" | "json" | "print";
	cwd: string;
	hasUI: boolean;
	ui: UiStub;
	memory: MemoryStub;
	model: { id: string; provider: string };
	/** Mirrors the real ctx.signal in OMP runtime; tests don't need a real one. */
	signal?: AbortSignal;
}

export interface ToolDefinition {
	name: string;
	label?: string;
	description?: string;
	parameters?: unknown;
	execute?: (
		id: string,
		params: unknown,
		signal: AbortSignal,
		onUpdate: unknown,
		ctx: TestContext,
	) => Promise<unknown>;
}

export type LifecycleHandler = (event: unknown, ctx: TestContext) => unknown;

export interface CommandDefinition {
	handler: (input: string, ctx: TestContext) => unknown | Promise<unknown>;
	description?: string;
}

export interface ToolInfo {
	name: string;
	label?: string;
	description?: string;
}

export interface HandlersStore {
	tools: Map<string, ToolDefinition>;
	commands: Map<string, CommandDefinition>;
	flags: Map<string, unknown>;
	hooks: Map<string, LifecycleHandler[]>;
}

const __handlers: HandlersStore = {
	tools: new Map(),
	commands: new Map(),
	flags: new Map(),
	hooks: new Map(),
};

// Mock tool pool: simulates the full OMP tool surface a session would have.
// Tests seed this per-test to control what "getAllTools" returns.
let __toolPool: ToolInfo[] = [];
let __activeTools: string[] | null = null; // null = no restriction active

export function __seedToolPool(tools: ToolInfo[]): void {
	__toolPool = [...tools];
}

export function __getActiveToolsState(): string[] | null {
	return __activeTools === null ? null : [...__activeTools];
}

export function __setActiveToolsState(v: string[] | null): void {
	__activeTools = v === null ? null : [...v];
}

export function __resetHandlers(): void {
	__handlers.tools.clear();
	__handlers.commands.clear();
	__handlers.flags.clear();
	__handlers.hooks.clear();
	__toolPool = [];
	__activeTools = null;
}

export function __getToolHandler(name: string): ToolDefinition {
	const t = __handlers.tools.get(name);
	if (!t) throw new Error(`tool not registered: ${name}`);
	return t;
}

export function __getCommandHandler(
	name: string,
): (input: string, ctx: TestContext) => unknown | Promise<unknown> {
	const c = __handlers.commands.get(name);
	if (!c) throw new Error(`command not registered: ${name}`);
	return c.handler;
}

export async function __emitHook(
	name: string,
	event: unknown,
	ctx: TestContext,
): Promise<unknown[]> {
	const list = __handlers.hooks.get(name) ?? [];
	const out: unknown[] = [];
	for (const h of list) out.push(await h(event, ctx));
	return out;
}

/** Invoke the tool_call hook and return the result (possibly a block directive). */
export async function __toolCall(
	event: { toolName: string; input?: unknown; [k: string]: unknown },
	ctx: TestContext,
): Promise<unknown> {
	const results = await __emitHook("tool_call", event, ctx);
	for (const r of results) {
		if (r !== undefined) return r;
	}
	return undefined;
}

export function makeUiStub(): UiStub {
	return {
		notify: vi.fn(),
		setStatus: vi.fn(),
		widget: vi.fn(),
		confirm: vi.fn(async () => true),
		select: vi.fn(async () => ""),
		input: vi.fn(async () => ""),
	};
}

export function makeCtx(overrides: Partial<TestContext> = {}): TestContext {
	return {
		mode: overrides.mode ?? "tui",
		cwd: overrides.cwd ?? process.cwd(),
		hasUI: overrides.hasUI ?? true,
		ui: overrides.ui ?? makeUiStub(),
		memory: overrides.memory ?? { save: vi.fn(async () => {}), entries: [] },
		model: overrides.model ?? { id: "test", provider: "test" },
	};
}

interface TypeBox {
	kind: string;
	[k: string]: unknown;
}

export const Type = {
	Object: (schema: Record<string, unknown>): TypeBox => ({
		kind: "object",
		schema,
	}),
	String: (opts?: Record<string, unknown>): TypeBox => ({ kind: "string", opts }),
	Number: (opts?: Record<string, unknown>): TypeBox => ({ kind: "number", opts }),
	Boolean: (opts?: Record<string, unknown>): TypeBox => ({
		kind: "boolean",
		opts,
	}),
	Optional: (t: TypeBox): TypeBox => ({ kind: "optional", inner: t }),
	Array: (t: TypeBox): TypeBox => ({ kind: "array", inner: t }),
	Union: (list: TypeBox[]): TypeBox => ({ kind: "union", list }),
	Literal: (v: unknown): TypeBox => ({ kind: "literal", value: v }),
	Record: (k: TypeBox, v: TypeBox): TypeBox => ({ kind: "record", k, v }),
	Any: (): TypeBox => ({ kind: "any" }),
	Null: (): TypeBox => ({ kind: "null" }),
};

export interface PiStub {
	__handlers: HandlersStore;
	registerTool(def: ToolDefinition): void;
	registerCommand(name: string, definition: CommandDefinition): void;
	registerFlag(name: string, def: unknown): void;
	on(hook: string, handler: LifecycleHandler): void;
	setLabel(label: string): void;
	sendMessage: Mock<MockProcedure>;
	exec: Mock<MockProcedure>;
	getAllTools: Mock<MockProcedure>;
	getActiveTools: Mock<MockProcedure>;
	setActiveTools: Mock<MockProcedure>;
}

export default function makePi(): PiStub {
	return {
		__handlers,
		registerTool(def: ToolDefinition): void {
			__handlers.tools.set(def.name, def);
		},
		registerCommand(name: string, definition: CommandDefinition): void {
			__handlers.commands.set(name, definition);
		},
		registerFlag(name: string, def: unknown): void {
			__handlers.flags.set(name, def);
		},
		on(hook: string, handler: LifecycleHandler): void {
			const list = __handlers.hooks.get(hook) ?? [];
			list.push(handler);
			__handlers.hooks.set(hook, list);
		},
		setLabel(_label: string): void {
			// No-op in tests.
		},
		sendMessage: vi.fn(),
		exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		getAllTools: vi.fn(async () => [...__toolPool]),
		getActiveTools: vi.fn(async () =>
			__activeTools === null ? __toolPool.map((t) => t.name) : [...__activeTools],
		),
		setActiveTools: vi.fn(async (tools: string[]) => {
			__activeTools = [...tools];
		}),
	};
}

export type ExtensionAPI = PiStub;
