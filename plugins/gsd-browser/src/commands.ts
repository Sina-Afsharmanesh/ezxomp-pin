/**
 * src/commands.ts — /gsd-browser command handler (W8).
 *
 * Implements `/gsd-browser [status|stop|doctor]` using ctx.ui.notify.
 * - status: prints resolved settings + backend/search availability
 * - stop: calls browserManager.dispose()
 * - doctor: reports browser executable + Brave key presence
 */
import { resolveGsdBrowserSettings, type GsdBrowserSettings } from "./settings.js";
import { browserManager } from "./cdp/browser.js";
import { discoverBrowserExecutable } from "./cdp/browser.js";

interface CommandContext {
	cwd: string;
	ui?: {
		notify: (message: string, type?: "info" | "warning" | "error") => void;
	};
}

/** Headless-safe notify: print/RPC hosts without ui still see command output. */
function notify(ctx: CommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (typeof ctx.ui?.notify === "function") {
		notify(ctx, message, type);
		return;
	}
	if (type === "error") console.error(message);
	else console.log(message);
}

export function registerGsdBrowserCommand(pi: {
	registerCommand?: (name: string, config: {
		description?: string;
		handler: (args: string, ctx: CommandContext) => Promise<void>;
		getArgumentCompletions?: (args: string) => string[];
	}) => void;
}): void {
	if (typeof pi.registerCommand !== "function") return;

	pi.registerCommand("gsd-browser", {
		description: "GSD browser backend management: status, stop, doctor",
		handler: async (args: string, ctx: CommandContext): Promise<void> => {
			const subcommand = args.trim().split(/\s+/)[0]?.toLowerCase() ?? "status";

			switch (subcommand) {
				case "status": {
					const settings = await resolveGsdBrowserSettings({});
					const port = browserManager.debugPort;
					const hasBraveKey = !!(
						process.env.BRAVE_API_KEY ||
						settings.braveApiKey
					);

					notify(ctx,
						`GSD Browser Status:\n` +
						`  Enabled: ${settings.enabled}\n` +
						`  Backend: ${settings.backend} (port: ${port ?? "not running"})\n` +
						`  Brave Search: ${hasBraveKey ? "configured" : "not configured"}\n` +
						`  Fetch timeout: ${settings.fetchTimeoutMs}ms\n` +
						`  Search timeout: ${settings.searchTimeoutMs}ms\n` +
						`  Max fetch bytes: ${settings.maxFetchBytes}\n` +
						`  Injection blocking: ${settings.injectionBlocking}\n` +
						`  Allow private hosts: ${settings.allowPrivateHosts}\n` +
						`  Viewport: ${settings.viewportWidth}x${settings.viewportHeight}\n` +
						`  Capture dir: ${settings.captureDir}\n` +
						`  Browser profile: ${settings.browserProfileDir || "temp"}\n` +
						`  Browser executable: ${settings.browserExecutablePath || "auto"}\n` +
						`  Headless: ${settings.headless}`,
						"info"
					);
					break;
				}

				case "stop": {
					await browserManager.dispose();
					notify(ctx, "GSD browser backend stopped.", "info");
					break;
				}

				case "doctor": {
					const executable = discoverBrowserExecutable();
					const settings = await resolveGsdBrowserSettings({});
					const hasBraveKey = !!(
						process.env.BRAVE_API_KEY ||
						settings.braveApiKey
					);

					notify(ctx,
						`GSD Browser Doctor:\n` +
						`  Browser executable: ${executable || "NOT FOUND"}\n` +
						`  Brave API key: ${hasBraveKey ? "present" : "missing"}\n` +
						`  Settings enabled: ${settings.enabled}\n` +
						`  Backend mode: ${settings.backend}`,
						executable ? "info" : "warning"
					);
					break;
				}

				default: {
					notify(ctx, `Unknown subcommand: ${subcommand}. Use: status | stop | doctor`, "error");
				}
			}
		},
		getArgumentCompletions: (args: string): string[] => {
			const sub = args.trim().toLowerCase();
			const options = ["status", "stop", "doctor"];
			return options.filter((o) => o.startsWith(sub));
		},
	});
}
