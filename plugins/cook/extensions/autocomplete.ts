import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@oh-my-pi/pi-tui";

const COOK_SUBCOMMANDS = [
	{ name: "on", description: "Enable cookmode" },
	{ name: "off", description: "Disable cookmode" },
	{ name: "status", description: "Show cookmode and watch status" },
	{ name: "config", description: "Configure cook agent models" },
	{ name: "install", description: "Install cook agents" },
	{ name: "start", description: "Start watching the active workflow" },
	{ name: "stop", description: "Stop watching the active workflow" },
	{ name: "propose", description: "Propose a workflow chain" },
	{ name: "validate", description: "Validate a workflow chain" },
	{ name: "ready", description: "List ready tasks" },
	{ name: "claim", description: "Claim the next ready task for a lane" },
	{ name: "snapshot", description: "Machine projection of cook state" },
	{ name: "all", description: "List all tasks" },
] as const;

function item(value: string, description: string): AutocompleteItem {
	return { value: `${value} `, label: value, description };
}

/** Return argument-only completions so the host preserves the `/cook` token. */
export function cookCompletions(argumentPrefix: string): AutocompleteItem[] {
	const prefix = argumentPrefix ?? "";
	const trimmed = prefix.trimStart();
	const firstSpace = trimmed.search(/[ \t]/);
	const command = firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace);
	const commandLower = command.toLowerCase();
	const trailingSpace = /[ \t]$/.test(prefix);

	if (!command || (firstSpace < 0 && !trailingSpace)) {
		const typed = commandLower;
		return COOK_SUBCOMMANDS
			.filter((subcommand) => subcommand.name.startsWith(typed))
			.map((subcommand) => item(subcommand.name, subcommand.description));
	}

	return [];
}

function cookArgumentPrefix(lines: string[], cursorLine: number, cursorCol: number): string | null {
	if (lines.slice(0, cursorLine).some((line) => line.trim() !== "")) return null;
	const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
	const command = textBeforeCursor.trimStart();
	if (!command.startsWith("/cook")) return null;
	const argumentText = command.slice("/cook".length);
	if (!/^[ \t]/.test(argumentText)) return null;
	return argumentText.trimStart();
}

/** Wrap the host provider with `/cook` argument completion. */
export function createCookAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
	const provider: AutocompleteProvider = {
		async getSuggestions(lines, cursorLine, cursorCol) {
			const argumentPrefix = cookArgumentPrefix(lines, cursorLine, cursorCol);
			if (argumentPrefix !== null) {
				const items = cookCompletions(argumentPrefix);
				if (items.length > 0) return { items, prefix: argumentPrefix };
			}
			return current.getSuggestions(lines, cursorLine, cursorCol);
		},
		applyCompletion: (lines, cursorLine, cursorCol, completion, prefix) => {
			const afterCursor = (lines[cursorLine] ?? "").slice(cursorCol);
			const cookPrefix = cookArgumentPrefix(lines, cursorLine, cursorCol);
			const isCookItem = cookPrefix !== null && cookCompletions(cookPrefix).some(
				(item) => item.value === completion.value && item.label === completion.label,
			);
			const replacement = isCookItem && /^[ \t]/.test(afterCursor)
				? { ...completion, value: completion.value.trimEnd() }
				: completion;
			return current.applyCompletion(lines, cursorLine, cursorCol, replacement, prefix);
		},
	};
	if (current.getInlineHint) {
		provider.getInlineHint = (lines, cursorLine, cursorCol) =>
			current.getInlineHint!(lines, cursorLine, cursorCol);
	}
	if (current.trySyncSlashCompletion) {
		provider.trySyncSlashCompletion = (textBeforeCursor) =>
			current.trySyncSlashCompletion!(textBeforeCursor);
	}
	if (current.trySyncInlineReplace) {
		provider.trySyncInlineReplace = (textBeforeCursor) =>
			current.trySyncInlineReplace!(textBeforeCursor);
	}
	if (current.getForceFileSuggestions) {
		provider.getForceFileSuggestions = (lines, cursorLine, cursorCol) =>
			current.getForceFileSuggestions!(lines, cursorLine, cursorCol);
	}
	if (current.shouldTriggerFileCompletion) {
		provider.shouldTriggerFileCompletion = (lines, cursorLine, cursorCol) =>
			current.shouldTriggerFileCompletion!(lines, cursorLine, cursorCol);
	}
	return provider;
}

const registrationState = globalThis as typeof globalThis & {
	[symbol: symbol]: WeakSet<object> | undefined;
};
const registeredUIs = registrationState[Symbol.for("ezxomp.cook.autocomplete.registeredUIs")] ??= new WeakSet<object>();

/** Register once per interactive UI; headless contexts skip registration. */
export function registerCookAutocompleteProvider(ctx: ExtensionContext): void {
	if (!ctx.hasUI || typeof ctx.ui?.addAutocompleteProvider !== "function") return;
	const ui = ctx.ui as unknown as object;
	if (registeredUIs.has(ui)) return;
	ctx.ui.addAutocompleteProvider(createCookAutocompleteProvider);
	registeredUIs.add(ui);
}
