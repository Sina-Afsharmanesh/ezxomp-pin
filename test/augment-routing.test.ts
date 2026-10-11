import { describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as realPiAi from "@oh-my-pi/pi-ai";

const ROOT = resolve(import.meta.dirname, "..");
const AUGMENT_ENTRY = pathToFileURL(resolve(ROOT, "plugins/augment/src/index.ts")).href;
const ACTIVE_MODEL = { provider: "anthropic", id: "claude-opus", maxTokens: 8_000 };
const SMOL_MODEL = { provider: "openai", id: "gpt-5.6-mini", maxTokens: 4_000 };

const completedWith: unknown[] = [];
const authenticatedWith: unknown[] = [];

mock.module("@oh-my-pi/pi-coding-agent/extensibility/plugins", () => ({
	PluginManager: class {
		async getPluginSettings(): Promise<Record<string, unknown>> {
			return {};
		}
	},
}));

mock.module("@oh-my-pi/pi-ai", () => ({
	...realPiAi,
	complete: async (model: unknown) => {
		completedWith.push(model);
		return {
			stopReason: "stop",
			content: [{
				type: "text",
				text: "<augment-enhanced-prompt>Rewritten prompt</augment-enhanced-prompt>",
			}],
		};
	},
}));

interface RegisteredCommand {
	handler: (args: string, ctx: unknown) => Promise<void>;
}

async function registerExtension(): Promise<Map<string, RegisteredCommand>> {
	const extension = (await import(AUGMENT_ENTRY)).default as (api: {
		registerCommand: (name: string, command: RegisteredCommand) => void;
		exec: () => Promise<{ code: number; stdout: string }>;
		sendUserMessage: (message: string) => void;
	}) => void;
	const commands = new Map<string, RegisteredCommand>();
	extension({
		registerCommand: (name, command) => commands.set(name, command),
		exec: async () => ({ code: 0, stdout: "main\n" }),
		sendUserMessage: () => {},
	});
	return commands;
}

function commandContext(options: { smol?: typeof SMOL_MODEL } = {}): {
	context: object;
	editor: string[];
	notices: Array<[string, string]>;
} {
	const editor: string[] = [];
	const notices: Array<[string, string]> = [];
	return {
		context: {
			cwd: "/augment-routing",
			hasUI: false,
			model: ACTIVE_MODEL,
			models: {
				resolve: (alias: string) => alias === "@smol" ? options.smol : undefined,
			},
			modelRegistry: {
				getApiKeyAndHeaders: async (model: unknown) => {
					authenticatedWith.push(model);
					return { ok: true, apiKey: "test-key" };
				},
			},
			sessionManager: { getBranch: () => [] },
			ui: {
				setEditorText: (text: string) => editor.push(text),
				notify: (text: string, level: string) => notices.push([text, level]),
			},
		},
		editor,
		notices,
	};
}

describe("augment SMOL routing and command surface", () => {
	test("runs regeneration and auth on the user-configured @smol model, not the active model", async () => {
		completedWith.length = 0;
		authenticatedWith.length = 0;
		const commands = await registerExtension();
		const augment = commands.get("augment");
		if (!augment) throw new Error("expected /augment to register");
		const { context, editor } = commandContext({ smol: SMOL_MODEL });

		await augment.handler("Rewrite this", context);

		expect(completedWith).toEqual([SMOL_MODEL]);
		expect(authenticatedWith).toEqual([SMOL_MODEL]);
		expect(editor).toEqual(["Rewritten prompt"]);
	});

	test("registers /aug as the same prompt-rewrite entry point", async () => {
		completedWith.length = 0;
		authenticatedWith.length = 0;
		const commands = await registerExtension();
		const aug = commands.get("aug");
		if (!aug) throw new Error("expected /aug to register");
		const { context, editor } = commandContext({ smol: SMOL_MODEL });

		await aug.handler("Rewrite this", context);

		expect(completedWith).toEqual([SMOL_MODEL]);
		expect(editor).toEqual(["Rewritten prompt"]);
	});

	test("reports a clear error instead of silently using the active model when @smol is unavailable", async () => {
		completedWith.length = 0;
		authenticatedWith.length = 0;
		const commands = await registerExtension();
		const augment = commands.get("augment");
		if (!augment) throw new Error("expected /augment to register");
		const { context, editor, notices } = commandContext();

		await augment.handler("Rewrite this", context);

		expect(completedWith).toEqual([]);
		expect(authenticatedWith).toEqual([]);
		expect(editor).toEqual([]);
		expect(notices).toEqual([["Augment requires a configured @smol model.", "error"]]);
	});
});
