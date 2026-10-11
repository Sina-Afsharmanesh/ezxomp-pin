import { beforeEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as realPiAi from "@oh-my-pi/pi-ai";
import * as realOverlayHost from "../plugins/experiences/extensions/agent-experience/src/overlay-host.ts";

const ROOT = resolve(import.meta.dirname, "..");
const AUGMENT = join(ROOT, "plugins", "augment");
const NPM_SOURCE = {
	type: "npm",
	package: "pi-augment",
	version: "1.0.8",
	url: "https://registry.npmjs.org/pi-augment/-/pi-augment-1.0.8.tgz",
	integrity: "sha512-0ZKEcBYieA11PoRB/QzQMYeDrNQS0nLAwzCWtQf5X1NGBd1ZLrPkHY5xTRRtcq5063hoXXMFfm3K7aHTFOjqnw==",
	importRoot: ".",
} as const;

interface PluginManifest {
	name: string;
	version: string;
	omp?: {
		extensions?: string[];
		settings?: Record<string, {
			type: string;
			default?: unknown;
			values?: string[];
			min?: number;
			step?: number;
		}>;
	};
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

interface RegisteredCommand {
	handler: (args: string, ctx: unknown) => Promise<void>;
}

interface OverlayComponent {
	render: (width: number) => readonly string[];
	handleInput: (data: string) => void;
}

const configuredSettings = new Map<string, Record<string, unknown>>([
	["/augment-default", {}],
	["/augment-custom", {
		rewriteMode: "plain",
		maxOutputTokens: 321,
		timeoutMs: 1_234,
		conversationContextDepth: 2,
		outputStyleFamily: "gpt",
		reviewBeforeSend: false,
	}],
]);
const savedSettings = new Map<string, Record<string, unknown>>();
const scheduledTimeouts: number[] = [];
let mountedOverlay: OverlayComponent | undefined;

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function requestText(request: unknown): string {
	const message = (request as {
		messages?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
	}).messages?.[0];
	return message?.content?.find(part => part.type === "text")?.text ?? "";
}

function sectionValue(text: string, name: string): string {
	const match = new RegExp(`<${name}>\\n([\\s\\S]*?)\\n</${name}>`).exec(text);
	return match?.[1] ?? "";
}

class FakePluginManager {
	constructor(private readonly cwd: string) {}

	async getPluginSettings(name: string): Promise<Record<string, unknown>> {
		if (name !== "@ezxomp/augment") throw new Error(`unexpected plugin ${name}`);
		return {
			...(savedSettings.get(this.cwd) ?? configuredSettings.get(this.cwd) ?? {}),
		};
	}

	async setPluginSetting(name: string, key: string, value: unknown): Promise<void> {
		if (name !== "@ezxomp/augment") throw new Error(`unexpected plugin ${name}`);
		savedSettings.set(this.cwd, {
			...(savedSettings.get(this.cwd) ?? configuredSettings.get(this.cwd) ?? {}),
			[key]: value,
		});
	}
}

mock.module("@oh-my-pi/pi-coding-agent/extensibility/plugins", () => ({
	PluginManager: FakePluginManager,
}));
mock.module("@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts", () => ({
	...realOverlayHost,
	hostCenteredOverlay: async (
		ctx: unknown,
		build: (
			tui: { requestRender: () => void },
			theme: { fg: (color: string, text: string) => string },
			done: () => void,
		) => OverlayComponent,
	) => {
		const c = ctx as { hasUI?: boolean };
		if (!c.hasUI) return undefined;
		try {
			return await realOverlayHost.hostCenteredOverlay(ctx as never, build as never, undefined);
		} catch {
			mountedOverlay = build(
				{ requestRender: () => {} },
				{ fg: (_color, text) => text },
				() => {},
			);
		}
	},
}));
mock.module("node:timers", () => ({
	setTimeout: (_callback: () => void, timeoutMs: number) => {
		scheduledTimeouts.push(timeoutMs);
		return {};
	},
	clearTimeout: () => {},
}));
mock.module("@oh-my-pi/pi-ai", () => ({
	...realPiAi,
	complete: async (_model: unknown, request: unknown, options: { maxTokens?: unknown }) => {
		const prompt = requestText(request);
		const conversation = ["one", "two", "three", "four", "five"]
			.filter(message => prompt.includes(`[user] ${message}`))
			.join(",");
		const enhanced = [
			sectionValue(prompt, "resolved_target_family"),
			sectionValue(prompt, "effective_rewrite_mode"),
			conversation,
			String(options.maxTokens),
			String(scheduledTimeouts.at(-1)),
		].join("|");

		return {
			stopReason: "stop",
			content: [{ type: "text", text: `<augment-enhanced-prompt>${enhanced}</augment-enhanced-prompt>` }],
		};
	},
}));

async function registerExtension(): Promise<{
	commands: Map<string, RegisteredCommand>;
	sentMessages: string[];
}> {
	const extension = (await import(pathToFileURL(join(AUGMENT, "src", "index.ts")).href)).default as (
		api: {
			registerCommand: (name: string, command: RegisteredCommand) => void;
			exec: (command: string, args: string[]) => Promise<{ code: number; stdout: string }>;
			sendUserMessage: (message: string) => void;
		},
	) => void;
	const commands = new Map<string, RegisteredCommand>();
	const sentMessages: string[] = [];

	extension({
		registerCommand: (name, command) => commands.set(name, command),
		exec: async () => ({ code: 0, stdout: "main\n" }),
		sendUserMessage: message => sentMessages.push(message),
	});

	return { commands, sentMessages };
}

function command(commands: Map<string, RegisteredCommand>, name: string): RegisteredCommand {
	const registered = commands.get(name);
	if (!registered) throw new Error(`expected /${name} to register`);
	return registered;
}

function augmentContext(cwd: string, editor: string[], notices: Array<[string, string]>): object {
	return {
		cwd,
		hasUI: false,
		model: { provider: "anthropic", id: "claude-sonnet", maxTokens: 2_000 },
		models: {
			resolve: (alias: string) =>
				alias === "@smol" ? { provider: "openai", id: "gpt-5.6-mini", maxTokens: 2_000 } : undefined,
		},
		modelRegistry: {
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key" }),
		},
		sessionManager: {
			getBranch: () => ["one", "two", "three", "four", "five"].map((text, timestamp) => ({
				type: "message",
				message: { role: "user", content: text, timestamp },
			})),
		},
		ui: {
			setEditorText: (text: string) => editor.push(text),
			notify: (text: string, level: string) => notices.push([text, level]),
		},
	};
}

describe("augment fork integration", () => {
	beforeEach(() => {
		savedSettings.clear();
		scheduledTimeouts.length = 0;
		mountedOverlay = undefined;
	});
	test("ships a verifiable OMP fork of the required upstream package", () => {
		const pkg = readJson<PluginManifest>(join(AUGMENT, "package.json"));
		const sourceLock = readJson<{
			sources: Record<string, typeof NPM_SOURCE>;
		}>(join(ROOT, "upstreams.lock.json"));
		const rootPackage = readJson<{ workspaces?: string[] }>(join(ROOT, "package.json"));
		const upstream = readJson<{
			originalName: string;
			version: string;
			url: string;
			integrity: string;
			importedPaths: string[];
			localForkVersion: string;
		}>(join(AUGMENT, "UPSTREAM.json"));
		expect(upstream.importedPaths).toContain("src/index.ts");
		expect(upstream.importedPaths).toContain("src/enhance.ts");
		expect(upstream.importedPaths).toContain("src/constants.ts");
		for (const importedPath of upstream.importedPaths) {
			expect(existsSync(join(AUGMENT, importedPath))).toBe(true);
		}

		const marketplace = readJson<{
			plugins: Array<{ name: string; source: string; version: string }>;
		}>(join(ROOT, ".omp-plugin", "marketplace.json"));

		expect(sourceLock.sources.augment).toEqual(NPM_SOURCE);
		expect(rootPackage.workspaces).toContain("plugins/*");
		expect(upstream).toMatchObject({
			originalName: NPM_SOURCE.package,
			version: NPM_SOURCE.version,
			url: NPM_SOURCE.url,
			integrity: NPM_SOURCE.integrity,
			localForkVersion: "1.0.9-ezxomp.0",
		});
		expect(pkg).toMatchObject({
			name: "@ezxomp/augment",
			version: "1.0.9-ezxomp.0",
			omp: { extensions: ["src/index.ts"] },
			dependencies: {
				"@ezxomp/experiences": "workspace:*",
			},
			peerDependencies: {
				"@oh-my-pi/pi-ai": "18.0.6",
				"@oh-my-pi/pi-coding-agent": "18.0.6",
				"@oh-my-pi/pi-tui": "18.0.6",
			},
		});
		expect(existsSync(join(AUGMENT, "LICENSE"))).toBe(true);
		expect(readFileSync(join(ROOT, "bun.lock"), "utf-8")).toContain("@ezxomp/augment");
		expect(marketplace.plugins.find(entry => entry.name === "augment")).toMatchObject({
			source: "./plugins/augment",
			version: "1.0.9-ezxomp.0",
		});
	});

	test("loads the extension entrypoint with its linked runtime dependency", () => {
		const entrypoint = pathToFileURL(join(AUGMENT, "src", "index.ts")).href;
		const result = spawnSync(process.execPath, ["-e", `await import(${JSON.stringify(entrypoint)})`], {
			cwd: ROOT,
			encoding: "utf-8",
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
	});

	test("links the fork into an isolated user-scope OMP registry", () => {
		const fixture = mkdtempSync(join(tmpdir(), "ezxomp-augment-link-"));
		const fakeOmp = join(fixture, "omp");
		const registry = join(fixture, "plugins.json");
		writeFileSync(fakeOmp, `#!/bin/sh
if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then
  if [ -f "$OMP_REGISTRY" ]; then cat "$OMP_REGISTRY"; else printf '[]'; fi
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "link" ] && [ "$4" = "--scope" ] && [ "$5" = "user" ]; then
  case "$3" in
    */augment) printf '[{"name":"@ezxomp/augment","path":"%s","scope":"user"}]' "$3" > "$OMP_REGISTRY" ;;
  esac
fi
exit 0
`);
		chmodSync(fakeOmp, 0o755);
		const env = {
			...process.env,
			OMP_REGISTRY: registry,
			PATH: `${fixture}:${process.env.PATH ?? ""}`,
		};

		try {
			const install = spawnSync(process.execPath, [join(ROOT, "scripts", "install-local.ts")], {
				cwd: ROOT,
				encoding: "utf-8",
				env,
			});
			const listed = spawnSync(fakeOmp, ["plugin", "list", "--json"], {
				encoding: "utf-8",
				env,
			});

			expect(install.status).toBe(0);
			expect(JSON.parse(listed.stdout)).toContainEqual({
				name: "@ezxomp/augment",
				path: AUGMENT,
				scope: "user",
			});
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	test("declares the six user-configurable settings to OMP", () => {
		const pkg = readJson<PluginManifest>(join(AUGMENT, "package.json"));
		const settings = pkg.omp?.settings;

		expect(Object.keys(settings ?? {})).toEqual([
			"rewriteMode",
			"maxOutputTokens",
			"timeoutMs",
			"conversationContextDepth",
			"outputStyleFamily",
			"reviewBeforeSend",
		]);
		expect(settings).toMatchObject({
			rewriteMode: {
				type: "enum",
				default: "auto",
				values: ["auto", "plain", "execution-contract"],
			},
			maxOutputTokens: { type: "number", default: 1_200, min: 1, step: 1 },
			timeoutMs: { type: "number", default: 45_000, min: 1, step: 1 },
			conversationContextDepth: { type: "number", default: 4, min: 0, step: 1 },
			outputStyleFamily: {
				type: "enum",
				default: "auto",
				values: ["auto", "claude", "gpt"],
			},
			reviewBeforeSend: { type: "boolean", default: true },
		});
	});

	test("keeps the upstream empty-command guidance", async () => {
		const { commands, sentMessages } = await registerExtension();
		const editor: string[] = [];
		const notices: Array<[string, string]> = [];

		await command(commands, "augment").handler("  ", augmentContext("/augment-default", editor, notices));

		expect(editor).toEqual([]);
		expect(sentMessages).toEqual([]);
		expect(notices).toEqual([["Usage: /augment <your prompt>", "info"]]);
	});

	test("opens six settings in the centered host and saves a user selection", async () => {
		const { commands } = await registerExtension();
		mountedOverlay = undefined;
		const context = {
			cwd: "/augment-overlay",
			hasUI: true,
			ui: {
				custom: () => {
					throw new Error("settings must use the centered overlay host");
				},
				notify: () => {},
			},
		};

		await command(commands, "augment-settings").handler("", context);

		if (!mountedOverlay) throw new Error("expected the centered settings overlay to mount");
		const overlay: OverlayComponent = mountedOverlay;
		const rendered = overlay.render(80).join("\n").toLowerCase();
		for (const label of [
			"rewrite mode",
			"max output tokens",
			"timeout",
			"conversation context depth",
			"output style",
			"review",
		]) {
			expect(rendered).toContain(label);
		}
		overlay.handleInput(" ");
		await Promise.resolve();
		expect(savedSettings.get("/augment-overlay")).toEqual({ rewriteMode: "plain" });
	});

	test("applies default and saved settings to the delivered enhancement", async () => {
		const defaultExtension = await registerExtension();
		const defaultEditor: string[] = [];
		const defaultNotices: Array<[string, string]> = [];
		await command(defaultExtension.commands, "augment").handler(
			"Debug the timeout failure.",
			augmentContext("/augment-default", defaultEditor, defaultNotices),
		);

		const customExtension = await registerExtension();
		const customEditor: string[] = [];
		const customNotices: Array<[string, string]> = [];
		await command(customExtension.commands, "augment").handler(
			"Debug the timeout failure.",
			augmentContext("/augment-custom", customEditor, customNotices),
		);

		expect(defaultEditor).toEqual(["claude|execution-contract|two,three,four,five|1200|45000"]);
		expect(defaultExtension.sentMessages).toEqual([]);
		expect(defaultNotices).toEqual([
			["Enhanced (debug, execution-contract, claude). Review and press Enter.", "info"],
		]);
		expect(customEditor).toEqual([]);
		expect(customExtension.sentMessages).toEqual(["gpt|plain|four,five|321|1234"]);
	});
});
