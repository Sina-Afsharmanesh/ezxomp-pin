/**
 * test/overlay-host.test.ts — TUI overlay shared host rule (re-fire, 2026-07-31).
 *
 * Verifies the CORRECTED hosting that survives the dual-review finding: the
 * original `{overlay:false} + tui.showOverlay(real)` inside the factory
 * DOUBLE-MOUNTS, because `showHookCustom`'s `{overlay:false}` branch
 * (`@oh-my-pi/pi-coding-agent/.../extension-ui-controller.ts:1075-1094`) does
 * `editorContainer.clear(); editorContainer.addChild(component); setFocus(component)`
 * on whatever the factory RETURNS — so returning the real modal replaces the
 * editor with the modal AND floats it (AC4 violation).
 *
 * The corrected rule (candidate A): the factory returns a HARMLESS PLACEHOLDER
 * (so the editor is replaced by the placeholder, not the modal), and the real
 * modal is floated via `tui.showOverlay` deferred so that
 * `showHookCustom`'s post-factory `.then(setFocus(placeholder))` runs FIRST and
 * the deferred `tui.showOverlay(real) + tui.setFocus(real)` runs AFTER — leaving
 * focus on the modal, not the placeholder.
 *
 * These tests MODEL the `showHookCustom` false-branch dispatch faithfully: a
 * stub `editorContainer` (clear/addChild), `setFocus`, `requestRender`, a
 * `done()` that triggers `close()` (restore editor + resolve). No real
 * terminal, no network, no sleeps — microtask flushing via `Promise.resolve()`.
 *
 * Deterministic by construction: each test is a pure function of its own stub.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXPERIENCES_INDEX = join(ROOT, "plugins", "experiences", "extensions", "agent-experience", "index.ts");
const CODESIGHT_OVERLAY = join(ROOT, "plugins", "codesight", "src", "overlay.ts");
const HELPER_PATH = join(ROOT, "plugins", "experiences", "extensions", "agent-experience", "src", "overlay-host.ts");

/**
 * Minimal placeholder component: harmless when added to editorContainer.
 * Mirrors the shape the corrected factory returns (e.g. `new Spacer(0)`).
 */
function makePlaceholder(): { kind: "placeholder"; render: () => readonly string[]; invalidate: () => void; dispose?: () => void } {
	return {
		kind: "placeholder",
		render: () => [""],
		invalidate() {},
	};
}

/**
 * Minimal real-modal component stand-in (the thing the user actually sees).
 */
function makeRealModal(): { kind: "realModal"; render: () => readonly string[]; invalidate: () => void; dispose?: () => void } {
	return {
		kind: "realModal",
		render: () => ["modal"],
		invalidate() {},
	};
}

type StubComponent = { kind: string; render: () => readonly string[]; invalidate: () => void; dispose?: () => void };

/**
 * Stub TUI capturing showOverlay / setFocus / requestRender / hideOverlay.
 * `showOverlay` returns a handle with `hide()` (tracked).
 */
function makeStubTui() {
	const overlays: Array<{ component: StubComponent; options: unknown; handle: { hidden: boolean; hide(): void } }> = [];
	const focusCalls: StubComponent[] = [];
	const renderCalls: number[] = [];
	const tui = {
		showOverlay(component: StubComponent, options?: unknown) {
			const handle = {
				hidden: false,
				hide() { this.hidden = true; },
			};
			overlays.push({ component, options, handle });
			return handle;
		},
		setFocus(c: StubComponent) { focusCalls.push(c); },
		requestRender() { renderCalls.push(1); },
		hideOverlay() {},
		overlayStack: [],
	};
	return { overlays, focusCalls, renderCalls, tui };
}

/**
 * Stub `ctx.ui` that mimics `showHookCustom`'s FALSE-branch dispatch EXACTLY:
 *   Promise.try(() => factory(tui, theme, kb, close)).then(c => {
 *     if (closed) { c.dispose?.(); return; }
 *     component = c;
 *     editorContainer.clear();
 *     editorContainer.addChild(c);   // <-- whatever the factory returns
 *     ui.setFocus(c);                 // <-- setFocus(returnedComponent)
 *     ui.requestRender();
 *   });
 * and `close(result)` which, when `!options.overlay`, restores the editor.
 *
 * The factory may return a placeholder synchronously and schedule the real
 * overlay via a deferred microtask; this stub drives the dispatch so tests can
 * flush microtasks and observe ordering.
 */
function makeStubShowHookCustomCtx(hasUI: boolean, tui: ReturnType<typeof makeStubTui>["tui"]) {
	const customs: Array<{ factory: Function; options: unknown }> = [];
	const editor = { kind: "editor" } as unknown as StubComponent;
	const editorContainer = {
		children: [] as StubComponent[],
		clear() { this.children.length = 0; },
		addChild(c: StubComponent) { this.children.push(c); },
	};
	editorContainer.children.push(editor);

	const ctx = {
		hasUI,
		editorContainer,
		editor,
		customs,
		ui: {
			custom<T>(factory: Function, options?: unknown): Promise<T> {
				customs.push({ factory, options });
				const { promise, resolve } = Promise.withResolvers<T>();
				let component: StubComponent | undefined;
				let closed = false;
				const close = (result: T) => {
					if (closed) return;
					closed = true;
					component?.dispose?.();
					if (!options || !(options as { overlay?: boolean }).overlay) {
						editorContainer.clear();
						editorContainer.addChild(editor);
					}
					tui.setFocus(editor);
					tui.requestRender();
					resolve(result);
				};
				// showHookCustom dispatch: Promise.try(factory).then(false-branch).
				(Promise as any).try(() => factory(tui, {}, { getDisplayString: () => "" }, close)).then((c: StubComponent) => {
					if (closed) { c?.dispose?.(); return; }
					component = c;
					if (options && (options as { overlay?: boolean }).overlay) return;
					editorContainer.clear();
					editorContainer.addChild(c);
					tui.setFocus(c);
					tui.requestRender();
				});
				return promise;
			},
			notify() {},
		},
	} as any;
	return { ctx, customs, editorContainer, editor };
}

/** Flush the microtask queue so deferred overlay/setFocus settles. */
function flushMicrotasks(): Promise<void> {
	// Two ticks cover the double-deferral (Promise.resolve().then(Promise.resolve().then(...))).
	return Promise.resolve().then(() => Promise.resolve()).then(() => {});
}

describe("overlay host rule: shared helper — corrected dispatch", () => {
	test("overlay-host helper module exists at the shared location", () => {
		expect(readFileSync(HELPER_PATH, "utf-8")).toContain("showOverlay");
	});

	test("helper passes {overlay:false} to ctx.ui.custom and floats the REAL modal via tui.showOverlay centered", async () => {
		const { hostCenteredOverlay } = await import(HELPER_PATH);
		const { tui, overlays, focusCalls, renderCalls } = makeStubTui();
		const { ctx, customs } = makeStubShowHookCustomCtx(true, tui);

		const realModal = makeRealModal();
		const promise = hostCenteredOverlay(ctx, () => realModal);
		await flushMicrotasks();

		// ctx.ui.custom MUST be called with {overlay:false} (no bottom-center stack).
		expect(customs.length).toBe(1);
		expect(customs[0].options).toEqual({ overlay: false });

		// The REAL modal must be floated via tui.showOverlay, centered (not bottom-center).
		expect(overlays.length).toBe(1);
		expect(overlays[0].component).toBe(realModal);
		const opts = overlays[0].options as { anchor?: string; maxHeight?: string; margin?: unknown };
		expect(opts.anchor).toBe("center");
		expect(opts.anchor).not.toBe("bottom-center");
		expect(opts.maxHeight).toBe("80%");

		// Focus ends on the REAL modal (deferred setFocus runs after showHookCustom's
		// .then(setFocus(placeholder))). The last setFocus(realModal) wins.
		expect(focusCalls.length).toBeGreaterThanOrEqual(1);
		expect(focusCalls[focusCalls.length - 1]).toBe(realModal);
		// One render comes from showHookCustom adding the placeholder; one
		// comes from the deferred real-overlay mount.
		expect(renderCalls.length).toBe(2);

		// Settle the promise (done never called here is fine; the contract is the hosting).
		void promise;
	});

	test("factory returns a PLACEHOLDER (not the real modal) so the editor is not replaced by the modal", async () => {
		const { hostCenteredOverlay } = await import(HELPER_PATH);
		const { tui, overlays } = makeStubTui();
		const { ctx, customs, editorContainer } = makeStubShowHookCustomCtx(true, tui);

		const realModal = makeRealModal();
		// Do NOT await the host promise — the builder does not call done() here, so
		// the promise stays pending; we only need the hosting side-effects settled.
		void hostCenteredOverlay(ctx, () => realModal);
		await flushMicrotasks();

		// The factory's returned component is what showHookCustom adds to
		// editorContainer. It MUST be a placeholder — NOT the real modal — so the
		// editor is not replaced by the modal (the double-mount bug).
		expect(customs.length).toBe(1);
		const returnedComponent = editorContainer.children[0];
		expect(returnedComponent).not.toBe(realModal);
		// The placeholder is harmless: a Spacer-like 0-line component.
		const ph = returnedComponent as StubComponent;
		expect(ph.render().length).toBeLessThanOrEqual(1);
		expect(ph.render()[0] ?? "").toBe("");

		// The real modal floats ONLY via tui.showOverlay, never via editorContainer.
		expect(overlays.length).toBe(1);
		expect(overlays[0].component).toBe(realModal);
		expect(editorContainer.children).not.toContain(realModal);
	});

	test("done() hides the overlay handle and resolves hostCenteredOverlay with the done value", async () => {
		const { hostCenteredOverlay } = await import(HELPER_PATH);
		const { tui, overlays, renderCalls } = makeStubTui();
		const { ctx } = makeStubShowHookCustomCtx(true, tui);

		let callDone: (result: string | undefined) => void = () => {};
		const realModal = makeRealModal();
		const promise: Promise<string | undefined> = hostCenteredOverlay(ctx, (_t: unknown, _th: unknown, done: (r: string | undefined) => void) => {
			callDone = done;
			return realModal;
		});
		await flushMicrotasks();

		expect(overlays.length).toBe(1);
		const handle = overlays[0].handle;
		expect(handle.hidden).toBe(false);

		// User completes the modal: done("ok").
		callDone("ok");
		const result = await promise;

		// The overlay handle is hidden on done.
		expect(handle.hidden).toBe(true);
		expect(result).toBe("ok");
		// Hosting renders placeholder + overlay; close restores editor.
		expect(renderCalls.length).toBe(3);
	});

	test("close() restores the editor to editorContainer (false-branch restore)", async () => {
		const { hostCenteredOverlay } = await import(HELPER_PATH);
		const { tui } = makeStubTui();
		const { ctx, editorContainer, editor } = makeStubShowHookCustomCtx(true, tui);
		let callDone: (result: unknown) => void = () => {};
		// Do NOT await the host promise before done() — it stays pending until
		// the user triggers done(); capture it, flush the hosting, then drive done.
		const promise = hostCenteredOverlay(ctx, (_t: unknown, _th: unknown, done: (r: unknown) => void) => {
			callDone = done;
			return makeRealModal();
		});
		await flushMicrotasks();

		// While open, editorContainer holds the placeholder, not the editor.
		expect(editorContainer.children).not.toContain(editor);

		callDone(undefined);
		await flushMicrotasks();

		// After close(), the editor is restored (the {overlay:false} restore path).
		expect(editorContainer.children).toContain(editor);
		void promise;
	});

	test("helper preserves the headless path: buildComponent NOT called, ui.custom NOT called", async () => {
		const { hostCenteredOverlay } = await import(HELPER_PATH);
		const { tui } = makeStubTui();
		const { ctx, customs } = makeStubShowHookCustomCtx(false, tui);

		let built = false;
		const result = await hostCenteredOverlay(ctx, () => { built = true; return makeRealModal(); });

		// Headless: helper returns undefined WITHOUT calling ctx.ui.custom and
		// WITHOUT invoking the builder (the caller owns the headless notify path).
		expect(result).toBeUndefined();
		expect(built).toBe(false);
		expect(customs.length).toBe(0);
});

test("builder calling done() before the deferred mount does not strand a modal (race guard)", async () => {
	const { hostCenteredOverlay } = await import(HELPER_PATH);
	const { tui, overlays } = makeStubTui();
	const { ctx, editorContainer, editor } = makeStubShowHookCustomCtx(true, tui);

	// Builder completes synchronously BEFORE the double-deferred showOverlay
	// runs. Without the race guard, showHookCustom restores the editor (done),
	// then the deferred callback still mounts the modal — stranding it on
	// screen with no way to close. The guard must skip the deferred mount
	// when finish() already fired.
	const promise: Promise<string | undefined> = hostCenteredOverlay(ctx, (_t: unknown, _th: unknown, done: (r: string | undefined) => void) => {
		done("ok");
		return makeRealModal();
	});
	await flushMicrotasks();
	const result = await promise;

	// No overlay mounted: the deferred showOverlay saw `finished` and bailed.
	expect(overlays.length).toBe(0);
	// The promise resolved with the done value (immediate close).
	expect(result).toBe("ok");
	// Editor restored (close ran), not the placeholder/real modal.
	expect(editorContainer.children).toContain(editor);
});
});

describe("overlay host rule: call sites no longer use {overlay:true}", () => {
	test("codesight openCodesightOverlay does not pass {overlay:true} to ctx.ui.custom", () => {
		const src = readFileSync(CODESIGHT_OVERLAY, "utf-8");
		expect(src).not.toContain("{ overlay: true }");
		expect(src).not.toContain("{overlay:true}");
		expect(src).not.toContain("overlay: true,");
		expect(src).toContain("hostCenteredOverlay");
	});

	test("agent-experience call sites do not pass {overlay:true} to ctx.ui.custom", () => {
		const src = readFileSync(EXPERIENCES_INDEX, "utf-8");
		// The four converted sites must no longer use the bottom-center anti-pattern.
		expect(src).not.toContain("overlay: true,");
		expect(src).not.toContain("{ overlay: true }");
	});
});

describe("overlay host rule: detail panels keep {overlay:false}", () => {
	test("DETAIL_PANEL_CUSTOM_OPTIONS stays overlay:false (inline panels unchanged)", async () => {
		const mod = await import(EXPERIENCES_INDEX);
		expect((mod as any).__getAgentExperienceDetailPanelOptionsForTest().overlay).toBe(false);
	});
});
