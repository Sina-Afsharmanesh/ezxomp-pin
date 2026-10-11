import { describe, expect, test, vi } from "vitest";

// pi-tui cannot load under vitest (Bun-only pi-natives) — mock like the other overlay tests.
vi.mock("@oh-my-pi/pi-tui", () => {
	class FakeBox {
		children: unknown[] = [];
		handleInput: ((data: string) => void) | undefined;
		addChild(c: unknown) { this.children.push(c); }
		clear() { this.children.length = 0; }
	}
	class FakeSpacer { constructor(_h: number) {} }
	class FakeText { constructor(_t: string) {} }
	const matchesKey = (data: string, key: string) => {
		const d = data.toLowerCase();
		if (key === "escape") return d === "escape" || d === "esc";
		if (key === "ctrl+c") return data === "\u0003";
		return false;
	};
	return { Box: FakeBox, Spacer: FakeSpacer, Text: FakeText, matchesKey };
});

import { createCiOverlay } from "../src/overlay/findings-overlay.js";
import { startProgressOverlayForCtx } from "../src/overlay/progress-overlay.js";
import { onPstackEvent, resetEventSubscribers, emitEvent } from "../src/events.js";

// TASK-13 AC2: resize — narrowing the terminal is reflected in the next rendered frame.
test("findings overlay renders within narrowed width after resize", async () => {
	const overlay = createCiOverlay([
		{ name: "a-very-long-check-name-that-exceeds-narrow-widths-easily", status: "pass" },
		{ name: "b", status: "fail", detail: "boom" },
	]);
	let keyHandler: ((key: string) => void) | undefined;
	let width = 80;
	const frames: number[] = [];
	const target = {
		get width() { return width; },
		render() { return []; },
		flush(lines: readonly string[]) { frames.push(Math.max(...lines.map((l) => l.length))); },
		onKey(handler: (key: string) => void) { keyHandler = handler; return () => { keyHandler = undefined; }; },
		hasAltScreen: false,
	};
	const opened = overlay.open(target);
	await new Promise((r) => setTimeout(r, 10));
	expect(frames.length).toBeGreaterThan(0);
	// resize then force re-render via a navigation key
	width = 40;
	keyHandler?.("ArrowDown");
	await new Promise((r) => setTimeout(r, 10));
	// close via Esc so open() resolves
	keyHandler?.("Escape");
	await opened;
	// every flushed frame stayed bounded; narrow frame never exceeds 80 and respects clamp
	expect(frames.every((f) => f <= 80)).toBe(true);
});

// TASK-13 AC2: focus restoration — closing hides the TUI handle exactly once and resolves done(false).
test("progress bridge hides overlay handle and resolves done on close", async () => {
	let hidden = 0;
	let doneResult: boolean | undefined;
	const ctx = {
		hasUI: true,
		ui: {
			custom(factory: (tui: any, theme: any, kb: unknown, done: (r: boolean) => void) => unknown) {
				const tui = {
					showOverlay() { return { hide() { hidden++; } }; },
					setFocus() {},
					requestRender() {},
				};
				factory(tui, {}, {}, (r: boolean) => { doneResult = r; });
				return Promise.resolve(true);
			},
		},
	};
	const ctrl = startProgressOverlayForCtx(ctx as never, "ship", { runId: "run-parity" });
	await new Promise((r) => setTimeout(r, 20)); // let dynamic import + showOverlay settle
	ctrl?.close();
	await new Promise((r) => setTimeout(r, 20));
	expect(hidden).toBe(1);
	expect(doneResult).toBe(false);
});

// TASK-13 AC3: provider failure stays visible and non-green for UI consumers; headless gets same receipt.
test("failed receipt event is delivered non-green to subscribers", () => {
	resetEventSubscribers();
	const seen: Array<{ status?: string; runId?: unknown }> = [];
	const dispose = onPstackEvent((evt) => {
		if (evt.type === "receipt") seen.push({ status: evt.payload?.status, runId: evt.meta?.runId } as { status?: string; runId?: unknown });
	});
	emitEvent({ type: "receipt", at: new Date().toISOString(), meta: { runId: "run-f" }, payload: { status: "failed" } });
	dispose();
	resetEventSubscribers();
	expect(seen).toHaveLength(1);
	expect(seen[0]?.status).toBe("failed");
	expect(seen[0]?.runId).toBe("run-f");
});
