/**
 * tests/browser-tools.integration.test.ts — W7 availability-gated integration.
 *
 * Skips entirely when no Chrome-family binary is discoverable (or
 * GSD_BROWSER_EXECUTABLE does not point at one). Otherwise: spins a local
 * node:http fixture page, navigates, asserts the title, snapshots a
 * selector, and screenshots a PNG whose signature bytes are 89 50 4E 47.
 */

import { spawnSync } from "node:child_process";
import http from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { browserManager } from "../src/cdp/browser.js";
import { discoverBrowserExecutable } from "../src/cdp/browser.js";
import { registerNavigateTool, registerScreenshotTool, registerSnapshotTool } from "../src/tools/browser.js";
import { resolveGsdBrowserSettings, type GsdBrowserSettings } from "../src/settings.js";

function findBinary(): string | null {
	return discoverBrowserExecutable(process.env["GSD_BROWSER_EXECUTABLE"] ?? "");
}

const binary = findBinary();
const available = binary !== null;

interface CapturedTool {
	execute: (args: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		details?: Record<string, unknown>;
	}>;
}

describe.skipIf(!available)("browser tools integration", () => {
	let settings: GsdBrowserSettings;
	let captureDir: string;
	let server: http.Server;
	let port: number;
	const tools = new Map<string, CapturedTool>();

	beforeAll(async () => {
		captureDir = await mkdir(path.join(os.tmpdir(), `gsd-integration-${Date.now()}`), { recursive: true }).then((d) => d!);
		settings = await resolveGsdBrowserSettings({ captureDir });
		server = http.createServer((_req, res) => {
			res.setHeader("content-type", "text/html");
			res.end("<!doctype html><html><head><title>Integration Fixture</title></head><body><h1 class='target'>Hello</h1></body></html>");
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		port = (server.address() as { port: number }).port;

		// Canonical OMP one-object registration; capture the execute signature
		// (toolCallId, params, signal, onUpdate, ctx) the real host invokes.
		const host = {
			registerTool: (tool: { name: string; execute: CapturedTool["execute"] }) => {
				tools.set(tool.name, { execute: tool.execute });
			},
		};
		registerNavigateTool(host, () => settings);
		registerSnapshotTool(host, () => settings);
		registerScreenshotTool(host, () => settings);
	});

	afterAll(async () => {
		browserManager.dispose();
		server.close();
		await rm(captureDir, { recursive: true, force: true });
	});

	it("navigates to the fixture page and returns its title", async () => {
		const result = await tools.get("gsd_browser_navigate")!.execute("test-call", { url: `http://127.0.0.1:${port}/` }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({ available: true, title: "Integration Fixture" });
	});

	it("snapshots a selector from the fixture page", async () => {
		await tools.get("gsd_browser_navigate")!.execute("test-call", { url: `http://127.0.0.1:${port}/` }, undefined, undefined, { cwd: process.cwd() });
		const result = await tools.get("gsd_browser_snapshot")!.execute("test-call", { selector: "h1.target" }, undefined, undefined, { cwd: process.cwd() });
		expect(result.details).toMatchObject({ available: true });
		const matches = result.details!.matches as Array<{ html: string }>;
		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].html).toContain("Hello");
	});

	it("captures a PNG whose signature bytes are 89 50 4E 47", async () => {
		const result = await tools.get("gsd_browser_screenshot")!.execute({ viewport: "desktop" });
		expect(result.details).toMatchObject({ available: true });
		const filePath = result.details!.path as string;
		const bytes = await readFile(filePath);
		expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});
});
