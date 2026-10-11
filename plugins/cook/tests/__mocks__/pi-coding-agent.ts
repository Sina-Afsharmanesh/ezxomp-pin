// Minimal ExtensionAPI test double used by vitest alias.
// Stores registered handlers so tests can invoke them programmatically.
import type { Mock } from "vitest";
import { vi } from "vitest";

export interface UiStub {
	notify: Mock;
	widget: Mock;
	setWidget: Mock;
	setTitle: Mock;
	setWorkingMessage: Mock;
	confirm: Mock;
	select: Mock;
	input: Mock;
}

export interface CtxStub {
	cwd: string;
	hasUI: boolean;
	ui: UiStub;
	model: { id: string; provider: string };
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
		ctx: CtxStub,
	) => Promise<unknown>;
}

export type LifecycleHandler = (event: unknown, ctx: CtxStub) => unknown;

export interface CommandDefinition {
	handler: (input: string, ctx: CtxStub) => unknown | Promise<unknown>;
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

export function __resetHandlers(): void {
	__handlers.tools.clear();
	__handlers.commands.clear();
	__handlers.flags.clear();
	__handlers.hooks.clear();
}

export function __getToolHandler(name: string): ToolDefinition {
	const t = __handlers.tools.get(name);
	if (!t) throw new Error(`tool not registered: ${name}`);
	return t;
}

export function __getCommandHandler(
	name: string,
): (input: string, ctx: CtxStub) => unknown | Promise<unknown> {
	const c = __handlers.commands.get(name);
	if (!c) throw new Error(`command not registered: ${name}`);
	return c.handler;
}

export async function __emitHook(
	name: string,
	event: unknown,
	ctx: CtxStub,
): Promise<unknown[]> {
	const list = __handlers.hooks.get(name) ?? [];
	const out: unknown[] = [];
	for (const h of list) out.push(await h(event, ctx));
	return out;
}

export function makeUiStub(): UiStub {
	return {
		notify: vi.fn(),
		widget: vi.fn(),
		setWidget: vi.fn(),
		setTitle: vi.fn(),
		setWorkingMessage: vi.fn(),
		confirm: vi.fn(async () => true),
		select: vi.fn(async () => ""),
		input: vi.fn(async () => ""),
	};
}

export function makeCtx(overrides: Partial<CtxStub> = {}): CtxStub {
	return {
		cwd: overrides.cwd ?? process.cwd(),
		hasUI: overrides.hasUI ?? true,
		ui: overrides.ui ?? makeUiStub(),
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
	getFlag: Mock;
	on(hook: string, handler: LifecycleHandler): void;
	sendMessage: Mock;
	exec: Mock;
	appendEntry: Mock;
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
		getFlag: vi.fn(() => undefined),
		on(hook: string, handler: LifecycleHandler): void {
			const list = __handlers.hooks.get(hook) ?? [];
			list.push(handler);
			__handlers.hooks.set(hook, list);
		},
		sendMessage: vi.fn(),
		exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		appendEntry: vi.fn(),
	};
}
