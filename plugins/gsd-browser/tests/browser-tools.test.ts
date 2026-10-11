/**
 * tests/browser-tools.test.ts — W7 unit coverage over a fake CDP transport
 * plus a local node:http fixture for /json/list (per plan W7).
 *
 * Defends: navigate command sequence + payload mapping, snapshot selector
 * excerpt bounding + code-wrapped text, screenshot .gitignore gate
 * byte-content + file write + viewport preset, and degradation reasons.
 */

import http from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CdpClient, type CdpTransport, type TransportFactory } from "../src/cdp/client.js";
import { browserManager } from "../src/cdp/browser.js";
import {
	GITIGNORE_HEADER,
	VIEWPORT_PRESETS,
	GITIGNORE_CONTENT,
	registerNavigateTool,
	registerScreenshotTool,
	registerSnapshotTool,
} from "../src/tools/browser.js";
import { resolveGsdBrowserSettings, type GsdBrowserSettings } from "../src/settings.js";
import gsdBrowser from "../src/index.js";
import { listTargets } from "../src/cdp/targets.js";

class FakeWebSocket implements CdpTransport {
	sent: string[] = [];
	private listeners: Record<string, Array<(arg?: unknown) => void>> = {};
	private loadFired = false;

	constructor(
		private readonly emitLoadEvent: boolean,
	) {}

	send(data: string): void {
		this.sent.push(data);
		const msg = JSON.parse(data) as { id: number; method: string; params?: Record<string, unknown> };
		const method = msg.method;
		queueMicrotask(() => {
			switch (method) {
				case "Page.navigate": {
					this.emitMessage({ id: msg.id, result: { frameId: "f1" } });
					if (this.emitLoadEvent) {
						queueMicrotask(() => this.emitMessage({ method: "Page.loadEventFired", params: { timestamp: 1 } }));
					}
					return;
				}
				case "Runtime.evaluate": {
					const expr = String(msg.params?.expression ?? "");
					const value = expr.includes("document.title")
						? "Example Page"
						: "https://example.test/";
					this.emitMessage({ id: msg.id, result: { value, type: "string" } });
					return;
				}
				case "DOM.getDocument":
					this.emitMessage({ id: msg.id, result: { root: { nodeId: 1 } } });
					return;
				case "DOM.querySelectorAll":
					this.emitMessage({ id: msg.id, result: { nodeIds: [2, 3] } });
					return;
				case "DOM.getOuterHTML":
					this.emitMessage({ id: msg.id, result: { outerHTML: "<p>hello world</p>" } });
					return;
				case "Page.captureScreenshot":
					this.emitMessage({ id: msg.id, result: { data: Buffer.from("89504e47-fake-png-bytes").toString("base64") } });
					return;
				case "Browser.getVersion":
					this.emitMessage({ id: msg.id, result: { browser: "Fake/1.0", protocolVersion: "1.3" } });
					return;
				default:
					this.emitMessage({ id: msg.id, result: {} });
			}
		});
	}
	close(): void {
		this.emit("close");
	}
	on(event: "open" | "message" | "close" | "error", cb: (arg?: unknown) => void): void {
		(this.listeners[event] ??= []).push(cb);
	}
	emit(event: "open" | "close" | "error", arg?: unknown): void {
		for (const cb of (this.listeners[event] ?? [])) cb(arg);
	}
	emitMessage(data: unknown): void {
		const str = typeof data === "string" ? data : JSON.stringify(data);
		for (const cb of (this.listeners as any).message ?? []) cb(str);
	}
}

function makeTransportFactory(): { factory: TransportFactory; methods: string[]; sockets: FakeWebSocket[] } {
	const methods: string[] = [];
	const sockets: FakeWebSocket[] = [];
	const factory: TransportFactory = () => {
		const ws = new FakeWebSocket(true);
		const origSend = ws.send.bind(ws);
		ws.send = (data: string) => {
			methods.push((JSON.parse(data) as { method: string }).method);
			origSend(data);
		};
		sockets.push(ws);
		queueMicrotask(() => ws.emit("open"));
		return ws;
	};
	return { factory, methods, sockets };
}

interface CapturedTool {
	execute: (
		toolCallId: string,
		args: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: ((details: unknown) => void) | undefined,
		ctx: { cwd: string }
	) => Promise<{
		content: Array<{ type: "text"; text: string }>;
		details?: Record<string, unknown>;
	}>;
}

function makeHost(): { host: unknown; tools: Map<string, CapturedTool> } {
	const tools = new Map<string, CapturedTool>();
	const host = {
		registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
			tools.set(def.name, { execute: def.execute });
		},
	};
	return { host, tools };
}

/** Local node:http fixture serving the DevTools /json/list contract. */
function startTargetServer(port: number): Promise<http.Server> {
	return new Promise((resolve) => {
		const server = http.createServer((_req, res) => {
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify([
					{
						id: "t1",
						type: "page",
						url: "about:blank",
						title: "Fixture",
						webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/t1`,
					},
				]),
			);
		});
		server.listen(port, "127.0.0.1", () => resolve(server));
	});
}

describe("browser tools over fake CDP + http fixture", () => {
	let captureDir: string;
	let settings: GsdBrowserSettings;
	let cdp: ReturnType<typeof makeTransportFactory>;
	let server: http.Server;
	let port: number;

	beforeEach(async () => {
		captureDir = await mkdtemp(path.join(os.tmpdir(), "gsd-captures-"));
		settings = await resolveGsdBrowserSettings({ captureDir });
		server = await startTargetServer(0);
		const addr = server.address() as { port: number };
		port = addr.port;
		cdp = makeTransportFactory();
		browserManager.dispose();
	});

	afterEach(async () => {
		browserManager.dispose();
		server.close();
		await rm(captureDir, { recursive: true, force: true });
	});

	function stubManager(): void {
		(browserManager as unknown as { managed: unknown }).managed = {
			executable: "/fake/chrome",
			profileDir: "/tmp/fake-profile",
			child: { pid: 1, exitCode: 0, once: () => {}, kill: () => true } as never,
			port,
			lockPath: "/tmp/fake-profile/.lock",
			generation: 1,
		};
	}

	it("navigate issues Page.enable, Network.enable, Page.navigate and maps the payload", async () => {
		stubManager();
		const { host, tools } = makeHost();
		registerNavigateTool(host, () => settings, () => new CdpClient(cdp.factory));
		const result = await tools.get("gsd_browser_navigate")!.execute("cid", { url: "https://example.test/" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({
			available: true,
			finalUrl: "https://example.test/",
			title: "Example Page",
			httpStatus: null,
		});
		expect(cdp.methods).toEqual(expect.arrayContaining(["Page.enable", "Network.enable", "Page.navigate"]));
	});

	it("snapshot returns code-wrapped text and bounded outerHTML excerpts", async () => {
		stubManager();
		const { host, tools } = makeHost();
		registerSnapshotTool(host, () => settings, () => new CdpClient(cdp.factory));
		const result = await tools.get("gsd_browser_snapshot")!.execute("cid", { selector: "p" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.content[0].text).toContain("```");
		expect(result.details).toMatchObject({ available: true, title: "Example Page" });
		const matches = result.details!.matches as Array<{ html: string }>;
		expect(matches).toHaveLength(2);
		expect(matches[0].html).toBe("<p>hello world</p>");
	});

	it("screenshot writes the .gitignore gate with byte-exact content before capture", async () => {
		stubManager();
		const { host, tools } = makeHost();
		registerScreenshotTool(host, () => settings, () => new CdpClient(cdp.factory));
		const result = await tools.get("gsd_browser_screenshot")!.execute("cid", { viewport: "mobile" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({ available: true, viewport: { preset: "mobile", width: 375, height: 812 } });
		const gate = await readFile(path.join(captureDir, ".gitignore"), "utf8");
		expect(gate).toBe(GITIGNORE_CONTENT);
		const files = await readdir(captureDir);
		expect(files.some((f) => f.endsWith(".png"))).toBe(true);
	});

	it("degrades with no_browser_backend when discovery finds nothing", async () => {
		browserManager.dispose();
		const { host, tools } = makeHost();
		registerNavigateTool(host, () => settings, () => new CdpClient(cdp.factory));
		const result = await tools.get("gsd_browser_navigate")!.execute("cid", { url: "https://example.test/" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({ available: false, reason: "no_browser_backend" });
	});

	it("degrades with timeout when the load event never fires", async () => {
		stubManager();
		// Transport that never emits the load event.
		const factory: TransportFactory = () => {
			const ws = new FakeWebSocket(false);
			queueMicrotask(() => ws.emit("open"));
			return ws;
		};
		const { host, tools } = makeHost();
		registerNavigateTool(host, () => settings, () => new CdpClient(factory));
		const result = await tools.get("gsd_browser_navigate")!.execute("cid", { url: "https://example.test/", timeoutMs: 50 }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({ available: false, reason: "timeout" });
	});

	it("viewport presets map to the GSD viewport triple", () => {
		expect(VIEWPORT_PRESETS.desktop).toEqual({ width: 1440, height: 900 });
		expect(VIEWPORT_PRESETS.mobile).toEqual({ width: 375, height: 812 });
		expect(VIEWPORT_PRESETS.tablet).toEqual({ width: 768, height: 1024 });
	});
});

describe("entrypoint registration", () => {
	it("registers six gsd_browser_* tools, gsd-browser command, and session_shutdown dispose", async () => {
		const tools = new Map<string, unknown>();
		const commands: Array<{ name: string }> = [];
		const shutdownHandlers: Array<() => void> = [];
		const fakePi = {
			registerTool: (def: { name: string }) => tools.set(def.name, def),
			registerCommand: (name: string) => commands.push({ name }),
			on: (_event: string, handler: () => void) => shutdownHandlers.push(handler),
		};

		gsdBrowser(fakePi);

		expect(tools.has("gsd_browser_fetch")).toBe(true);
		expect(tools.has("gsd_browser_search")).toBe(true);
		expect(tools.has("gsd_browser_navigate")).toBe(true);
		expect(tools.has("gsd_browser_snapshot")).toBe(true);
		expect(tools.has("gsd_browser_screenshot")).toBe(true);
		expect(tools.has("gsd_browser_status")).toBe(true);
		expect(commands.some((c) => c.name === "gsd-browser")).toBe(true);
		expect(shutdownHandlers.length).toBe(1);
	});
});

describe("listTargets timeout", () => {
	it("throws target_unreachable when endpoint never answers", async () => {
		// Bind a server socket but never accept/respond, then use that port with a small timeout.
		const server = http.createServer();
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const addr = server.address() as { port: number };
		await expect(listTargets(addr.port)).rejects.toThrow("target_unreachable");
		server.close();
	});
});
