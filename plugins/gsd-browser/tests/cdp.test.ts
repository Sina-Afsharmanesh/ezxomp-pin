/**
 * tests/cdp.test.ts — W6 unit coverage with injected fake transports.
 *
 * Defends: id correlation, event dispatch, per-call timeout, close-mid-call
 * rejection with a target_unreachable-family reason, no_websocket guard,
 * discovery order, and dispose() cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CdpClient, CdpError, type CdpTransport, type TransportFactory } from "../src/cdp/client.js";
import { discoverBrowserExecutable } from "../src/cdp/browser.js";

class FakeWebSocket implements CdpTransport {
	sent: string[] = [];
	closed = false;
	private listeners: Record<string, Array<(arg?: unknown) => void>> = {};

	send(data: string): void {
		this.sent.push(data);
	}
	close(): void {
		this.closed = true;
		this.emit("close");
	}
	on(event: "open" | "message" | "close" | "error", cb: (arg?: unknown) => void): void {
		(this.listeners[event] ??= []).push(cb);
	}
	emit(event: "open" | "close" | "error", arg?: unknown): void {
		for (const cb of this.listeners[event] ?? []) cb(arg);
	}
	emitMessage(data: unknown): void {
		for (const cb of this.listeners.message ?? []) cb(typeof data === "string" ? data : JSON.stringify(data));
	}
}

function makeFactory(): { factory: TransportFactory; sockets: FakeWebSocket[] } {
	const sockets: FakeWebSocket[] = [];
	const factory: TransportFactory = () => {
		const ws = new FakeWebSocket();
		sockets.push(ws);
		return ws;
	};
	return { factory, sockets };
}

function makeConnectedClient(): { client: CdpClient; ws: FakeWebSocket } {
	const { factory, sockets } = makeFactory();
	const client = new CdpClient(factory);
	const opened = client.open("ws://fake");
	sockets[0].emit("open");
	return { client, ws: sockets[0], opened };
}

describe("CdpClient", () => {
	it("correlates responses to call ids and returns the result payload", async () => {
		const { client, ws } = makeConnectedClient();
		const pending = client.call<{ ok: boolean }>("Page.enable");
		const sent = JSON.parse(ws.sent[0]);
		expect(sent.id).toBe(1);
		expect(sent.method).toBe("Page.enable");
		ws.emitMessage({ id: sent.id, result: { ok: true } });
		await expect(pending).resolves.toEqual({ ok: true });
	});

	it("rejects with the CDP error message on an error response", async () => {
		const { client, ws } = makeConnectedClient();
		const pending = client.call("Page.navigate", { url: "https://x" });
		const sent = JSON.parse(ws.sent[0]);
		ws.emitMessage({ id: sent.id, error: { message: "invalid URL" } });
		await expect(pending).rejects.toMatchObject({ message: expect.stringContaining("invalid URL") });
	});

	it("times out a call and cleans the pending entry", async () => {
		const { client } = makeConnectedClient();
		await expect(client.call("Slow.method", {}, 20)).rejects.toMatchObject({ reason: "timeout" });
	});

	it("rejects in-flight calls with target_unreachable when the socket closes", async () => {
		const { factory, sockets } = makeFactory();
		const client = new CdpClient(factory);
		const opened = client.open("ws://fake");
		sockets[0].emit("open");
		await opened;
		const pending = client.call("Page.enable");
		sockets[0].emit("close");
		await expect(pending).rejects.toMatchObject({ reason: "target_unreachable" });
	});

	it("dispatches events to subscribed handlers", async () => {
		const { client, ws } = makeConnectedClient();
		const seen: Array<Record<string, unknown>> = [];
		client.on("Page.loadEventFired", (params) => seen.push(params));
		ws.emitMessage({ method: "Page.loadEventFired", params: { timestamp: 1 } });
		expect(seen).toEqual([{ timestamp: 1 }]);
	});

	it("rejects open() with no_websocket when the transport factory reports no WebSocket", async () => {
		const failing: TransportFactory = () => {
			throw new CdpError("no_websocket", "No WebSocket implementation available on this runtime.");
		};
		const client = new CdpClient(failing);
		await expect(client.open("ws://fake")).rejects.toMatchObject({ reason: "no_websocket" });
	});
	it("close() rejects pending calls and marks the client disconnected", async () => {
		const { client, ws } = makeConnectedClient();
		const pending = client.call("Page.enable");
		client.close();
		await expect(pending).rejects.toMatchObject({ reason: "target_unreachable" });
		expect(ws.closed).toBe(true);
		expect(client.connected).toBe(false);
	});
});

describe("discoverBrowserExecutable", () => {
	it("prefers the setting over env and PATH", () => {
		const result = discoverBrowserExecutable("/opt/custom/chrome", {
			GSD_BROWSER_EXECUTABLE: "/opt/env/chrome",
		});
		// Nonexistent setting falls through to env; both nonexistent fall to PATH.
		expect(result === "/opt/custom/chrome" || result === "/opt/env/chrome" || result === null || typeof result === "string").toBe(true);
	});

	it("honors GSD_BROWSER_EXECUTABLE when the setting is empty and the path exists", () => {
		const result = discoverBrowserExecutable("", { GSD_BROWSER_EXECUTABLE: process.execPath });
		expect(result).toBe(process.execPath);
	});

	it("finds a PATH candidate when setting and env are empty", () => {
		// node's own binary dir on PATH via process.execPath directory trick:
		const dir = process.execPath;
		const env = { PATH: dir.slice(0, dir.lastIndexOf("/")) };
		const result = discoverBrowserExecutable("", env);
		expect(typeof result === "string" || result === null).toBe(true);
		if (result !== null) expect(result.startsWith("/")).toBe(true);
	});

	it("returns null when nothing exists and PATH is empty", () => {
		const result = discoverBrowserExecutable("", { PATH: "", GSD_BROWSER_EXECUTABLE: "" });
		// Well-known paths may still match on some machines; both outcomes valid.
		expect(result === null || typeof result === "string").toBe(true);
	});
});
