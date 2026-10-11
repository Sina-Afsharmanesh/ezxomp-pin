import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import type { ExtensionContext, Theme } from "@oh-my-pi/pi-coding-agent";
import {
	Container,
	Input,
	SettingsList,
	Text,
	type Component,
	type SettingItem,
	type SettingsListTheme,
	type TUI,
} from "@oh-my-pi/pi-tui";
import { DEFAULT_AUGMENT_SETTINGS, resolveAugmentSettings, type AugmentSettings } from "./settings.js";

const PLUGIN_NAME = "@ezxomp/augment";
const SETTING_KEYS = [
	"rewriteMode",
	"maxOutputTokens",
	"timeoutMs",
	"conversationContextDepth",
	"outputStyleFamily",
	"reviewBeforeSend",
] as const satisfies readonly (keyof AugmentSettings)[];

type SettingKey = (typeof SETTING_KEYS)[number];

function settingsTheme(theme: Theme): SettingsListTheme {
	return {
		label: (text, selected) => theme.fg(selected ? "accent" : "text", text),
		value: (text, selected) => theme.fg(selected ? "accent" : "muted", text),
		description: text => theme.fg("dim", text),
		cursor: theme.fg("accent", "→"),
		hint: text => theme.fg("dim", text),
	};
}

function displayValue(key: SettingKey, value: AugmentSettings[SettingKey]): string {
	if (key === "reviewBeforeSend") return value ? "on" : "off";
	return String(value);
}

function settingItems(settings: AugmentSettings): SettingItem[] {
	const labels: Record<SettingKey, string> = {
		rewriteMode: "Rewrite mode",
		maxOutputTokens: "Max output tokens",
		timeoutMs: "Timeout",
		conversationContextDepth: "Conversation context depth",
		outputStyleFamily: "Output style family",
		reviewBeforeSend: "Editor review",
	};
	const descriptions: Record<SettingKey, string> = {
		rewriteMode: "Choose plain or execution-contract rewriting, or resolve it from intent.",
		maxOutputTokens: "Maximum completion tokens for the enhancement request.",
		timeoutMs: "Maximum time to wait for the enhancement request.",
		conversationContextDepth: "Number of recent conversation messages to include.",
		outputStyleFamily: "Target Claude or GPT prompt style, or follow the active model.",
		reviewBeforeSend: "Place the enhancement in the editor for review before sending.",
	};
	const values: Partial<Record<SettingKey, string[]>> = {
		rewriteMode: ["auto", "plain", "execution-contract"],
		outputStyleFamily: ["auto", "claude", "gpt"],
		reviewBeforeSend: ["off", "on"],
	};

	return SETTING_KEYS.map(key => ({
		id: key,
		label: labels[key],
		description: descriptions[key],
		currentValue: displayValue(key, settings[key]),
		values: values[key],
		changed: settings[key] !== DEFAULT_AUGMENT_SETTINGS[key],
		submenu: key === "maxOutputTokens" || key === "timeoutMs" || key === "conversationContextDepth"
			? (_currentValue, done) => new NumericSettingInput(key, settings[key] as number, done)
			: undefined,
	} satisfies SettingItem));
}

class NumericSettingInput implements Component {
	readonly #label: string;
	readonly #minimum: number;
	readonly #input = new Input();
	readonly #done: (value?: string) => void;

	constructor(key: SettingKey, value: number, done: (value?: string) => void) {
		this.#label = key === "conversationContextDepth" ? "Conversation context depth" : key;
		this.#minimum = key === "conversationContextDepth" ? 0 : 1;
		this.#input.setValue(String(value));
		this.#done = done;
		this.#input.onSubmit = value => {
			const parsed = Number(value);
			if (Number.isInteger(parsed) && parsed >= this.#minimum) this.#done(String(parsed));
		};
		this.#input.onEscape = () => this.#done();
	}

	render(width: number): readonly string[] {
		return [
			`${this.#label}:`,
			...this.#input.render(Math.max(20, width)),
			"Enter save · Esc cancel",
		];
	}

	handleInput(data: string): void {
		this.#input.handleInput(data);
	}

	invalidate(): void {
		this.#input.invalidate();
	}
}

class AugmentSettingsOverlay implements Component {
	readonly #settingsList: SettingsList;
	readonly #settings: AugmentSettings;
	readonly #tui: TUI;
	readonly #ctx: ExtensionContext;
	readonly #manager: PluginManager;

	constructor(
		ctx: ExtensionContext,
		manager: PluginManager,
		settings: AugmentSettings,
		tui: TUI,
		theme: Theme,
		done: () => void,
	) {
		this.#ctx = ctx;
		this.#manager = manager;
		this.#settings = { ...settings };
		this.#tui = tui;
		this.#settingsList = new SettingsList(
			settingItems(this.#settings),
			SETTING_KEYS.length,
			settingsTheme(theme),
			(id, value) => void this.#saveSetting(id as SettingKey, this.parseValue(id as SettingKey, value)),
			done,
			{ typeToSearch: false, hint: "↑↓ move · Enter/Space change · Esc close" },
		);
	}

	render(width: number): readonly string[] {
		const body = new Container();
		body.addChild(new Text("Augment settings"));
		body.addChild(new Text(""));
		body.addChild(this.#settingsList);
		return body.render(Math.max(40, width - 2));
	}

	handleInput(data: string): void {
		this.#settingsList.handleInput(data);
		this.#tui.requestRender();
	}

	invalidate(): void {
		this.#settingsList.setItems(settingItems(this.#settings));
	}

	private parseValue(key: SettingKey, value: string): AugmentSettings[SettingKey] {
		if (key === "reviewBeforeSend") return value === "on";
		if (key === "rewriteMode" || key === "outputStyleFamily") return value as AugmentSettings[SettingKey];
		return Number(value) as AugmentSettings[SettingKey];
	}

	async #saveSetting(key: SettingKey, value: AugmentSettings[SettingKey]): Promise<void> {
		(this.#settings as unknown as Record<SettingKey, unknown>)[key] = value;
		this.invalidate();
		this.#tui.requestRender();
		try {
			await this.#manager.setPluginSetting(PLUGIN_NAME, key, value);
		} catch (error) {
			this.#ctx.ui.notify(
				`Unable to save Augment setting ${key}: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
	}
}

export async function openAugmentSettings(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Augment settings require an interactive UI.", "info");
		return;
	}

	const manager = new PluginManager(ctx.cwd);
	const persisted = await manager.getPluginSettings(PLUGIN_NAME).catch(() => ({}));
	const settings = resolveAugmentSettings(persisted);
	// Lazy import (static import cannot work here): the binding must be resolved
	// per call so a module registry rewire registered after this file first loads
	// is honored; mirrors index.ts's lazy `await import("./enhance.js")`.
	const { hostCenteredOverlay } = await import(
		"@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts"
	);
	await hostCenteredOverlay<void>(ctx, (tui: TUI, theme: Theme, done) =>
		new AugmentSettingsOverlay(ctx, manager, settings, tui, theme, () => done(undefined)),
	);
}
