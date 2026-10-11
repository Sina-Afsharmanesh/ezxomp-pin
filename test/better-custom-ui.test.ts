import { describe, expect, test } from "bun:test";
import {
	CANCELLED,
	filterSelectItems,
	isSelectCancel,
	normalizeSelectItems,
	pickMany,
	selectOne,
} from "../plugins/better-custom/src/ui/select.ts";
import {
	promptApiKey,
	promptProviderStyle,
	promptVision,
	setWorkingMessage,
} from "../plugins/better-custom/src/ui/prompts.ts";

type Component = { render(width: number): readonly string[]; handleInput?(data: string): void };
type UiState = {
	customComponent?: Component;
	customCalls: number;
	selectCalls: Array<{ title: string; options: readonly unknown[]; optionsArg?: unknown }>;
	inputCalls: Array<{ title: string; placeholder?: string }>;
	notices: Array<{ message: string; type?: string }>;
	working: Array<string | undefined>;
	selectResults: Array<string | undefined>;
	inputResults: Array<string | undefined>;
};

function fakeContext(state: UiState) {
	return {
		ui: {
			custom(factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: unknown) => void) => unknown) {
				state.customCalls += 1;
				return new Promise<unknown>((resolve) => {
					const tui = { requestRender() {} };
					const theme = { fg: (_name: string, value: string) => value, bold: (value: string) => value };
					const done = (result: unknown) => resolve(result);
					state.customComponent = factory(tui, theme, {}, done) as Component;
				});
			},
			select(title: string, options: readonly unknown[], optionsArg?: unknown) {
				state.selectCalls.push({ title, options, optionsArg });
				return Promise.resolve(state.selectResults.shift());
			},
			input(title: string, placeholder?: string) {
				state.inputCalls.push({ title, placeholder });
				return Promise.resolve(state.inputResults.shift());
			},
			confirm() { return Promise.resolve(true); },
			notify(message: string, type?: string) { state.notices.push({ message, type }); },
			setWorkingMessage(message?: string) { state.working.push(message); },
		},
	};
}

function state(partial: Partial<UiState> = {}): UiState {
	return {
		customCalls: 0,
		selectCalls: [],
		inputCalls: [],
		notices: [],
		working: [],
		selectResults: [],
		inputResults: [],
		...partial,
	};
}

describe("better-custom selector helpers", () => {
	test("normalizes values and matches all searchable fields", () => {
		const items = normalizeSelectItems([
			"plain",
			{ value: "vision", label: "Vision model", suffix: " [img]", description: "fast", searchText: "qwen" },
		]);
		expect(items[0]).toEqual({ value: "plain", label: "plain" });
		expect(filterSelectItems(items, "QWEN").map((item) => item.value)).toEqual(["vision"]);
		expect(filterSelectItems(items, "img").map((item) => item.value)).toEqual(["vision"]);
		expect(filterSelectItems(items, "").map((item) => item.value)).toEqual(["plain", "vision"]);
	});

	test("single select filters then returns the typed value", async () => {
		const current = state();
		const promise = selectOne(fakeContext(current) as never, "Models", ["alpha", "beta"]);
		await Promise.resolve();
		current.customComponent?.handleInput?.("b");
		expect(current.customComponent?.render(80).join("\n")).toContain("beta");
		current.customComponent?.handleInput?.("\r");
		expect(await promise).toBe("beta");
		expect(current.customCalls).toBe(1);
	});

	test("multi select preserves checked values and escape resolves cancellation", async () => {
		const current = state();
		const promise = pickMany(fakeContext(current) as never, "Models", [
			{ value: "one", label: "One" },
			{ value: "two", label: "Two" },
		]);
		await Promise.resolve();
		current.customComponent?.handleInput?.(" ");
		current.customComponent?.handleInput?.("\x1b[B");
		current.customComponent?.handleInput?.(" ");
		const rendered = current.customComponent?.render(80).join("\n") ?? "";
		expect(rendered).toContain("[x]");
		current.customComponent?.handleInput?.("\u001b");
		expect(await promise).toBeNull();
		expect(isSelectCancel(CANCELLED)).toBe(true);
	});
});

describe("better-custom native prompts", () => {
	test("provider style and API key prompts delegate to native UI", async () => {
		const current = state({ selectResults: ["Ollama-compatible", "literal"], inputResults: ["secret"] });
		const ctx = fakeContext(current) as never;
		expect(await promptProviderStyle(ctx)).toEqual({ style: "ollama-chat", api: "ollama-chat" });
		expect(await promptApiKey(ctx)).toEqual({ mode: "literal", value: "secret" });
		expect(current.customCalls).toBe(0);
		expect(current.selectCalls.map((call) => call.title)).toEqual(["Provider style", "API key"]);
		expect(current.selectCalls[0].options[0]).not.toHaveProperty("value");
	});

	test("vision cancellation and progress use documented native paths", async () => {
		const current = state({ selectResults: [undefined] });
		const ctx = fakeContext(current) as never;
		expect(await promptVision(ctx)).toBeNull();
		setWorkingMessage(ctx, "Probing models");
		setWorkingMessage(ctx);
		expect(current.working).toEqual(["Probing models", undefined]);
		expect(current.customCalls).toBe(0);
	});
});
