/**
 * Shared host rule for non-footer TUI modals.
 *
 * `ctx.ui.custom(factory, {overlay:true})` is implemented by `showHookCustom`,
 * which hardcodes `tui.showOverlay(component, {anchor:"bottom-center",
 * width:"100%", maxHeight:"100%", margin:0})` — the "pop up under the footer"
 * anti-pattern. Hosting the overlay directly via `tui.showOverlay` inside the
 * factory and passing `{overlay:false}` to `ctx.ui.custom` avoids the
 * bottom-center stack.
 *
 * The factory must NOT return the real modal: `showHookCustom`'s `{overlay:false}`
 * branch clears `editorContainer` and adds whatever the factory returns as the
 * main custom view. Returning the modal would double-mount it (floated overlay
 * AND editor replacement) — the bug this corrected design fixes. The factory
 * therefore returns a harmless placeholder (`Spacer(0)`, a single empty line),
 * so the editor is replaced by the placeholder, not the modal.
 *
 * The overlay hosting is double-deferred so that `showHookCustom`'s
 * post-factory `.then(setFocus(placeholder))` runs BEFORE `tui.showOverlay` +
 * `tui.setFocus(real)` — leaving focus on the modal, not the placeholder.
 * `showHookCustom` runs the factory synchronously and only attaches its
 * `.then` after the factory returns, so a single microtask scheduled inside the
 * factory would run before that `.then`. The outer microtask of the
 * double-deferral schedules the inner one AFTER the `.then` is queued, so the
 * overlay+focus runs last. Do NOT use an `await`-ing async factory: `Promise.try`
 * awaits it, deferring the `.then` until the factory resolves, which reverses
 * the order again.
 *
 * Headless contexts (`!ctx.hasUI`) are preserved: `ctx.ui.custom` and the builder
 * are not called; the caller's own headless path handles the notify/return.
 */
import type { ExtensionContext, Theme } from "@oh-my-pi/pi-coding-agent";
import { Key, Spacer } from "@oh-my-pi/pi-tui";
import type { Component, OverlayOptions, TUI } from "@oh-my-pi/pi-tui";

export function isOverlayEscape(input: string): boolean {
	return input === Key.escape || input === "\u001b" || input === "q";
}

export function isOverlayUp(input: string): boolean {
	return input === Key.up || input === "\u001b[A";
}

export function isOverlayDown(input: string): boolean {
	return input === Key.down || input === "\u001b[B";
}

export function isOverlayLeft(input: string): boolean {
	return input === Key.left || input === "\u001b[D";
}

export function isOverlayRight(input: string): boolean {
	return input === Key.right || input === "\u001b[C";
}

/** Centered, viewport-bounded placement for dashboard-style overlays. */
export const CENTERED_OVERLAY_OPTIONS: OverlayOptions = {
	anchor: "center",
	maxHeight: "80%",
	margin: { top: 2, bottom: 2, left: 2, right: 2 },
};

/**
 * Build an overlay component inside the `ctx.ui.custom` factory. Receives the
 * real TUI and theme; call `done(result)` when the modal completes to hide the
 * overlay and resolve `hostCenteredOverlay` with `result`.
 */
export type OverlayComponentBuilder<T> = (
	tui: TUI,
	theme: Theme,
	done: (result: T | undefined) => void,
) => Component;

/**
 * Host a centered overlay via the corrected shared host rule.
 *
 * 1. Gate on `ctx.hasUI`: headless contexts skip `ctx.ui.custom` entirely — the
 *    caller owns the headless notify/return path.
 * 2. Call `ctx.ui.custom(factory, {overlay:false})` so `showHookCustom` does
 *    not stack its bottom-center overlay underneath.
 * 3. Inside the factory, build the real modal via `buildComponent` (capturing
 *    the `finish` wrapper), then return a HARMLESS PLACEHOLDER (`Spacer(0)`) —
 *    NOT the real modal — so `showHookCustom`'s false-branch replaces the
 *    editor with the placeholder, not the modal (no double-mount).
 * 4. Double-defer `tui.showOverlay(real) + tui.setFocus(real) + tui.requestRender`
 *    so they run AFTER `showHookCustom`'s `.then(setFocus(placeholder))`,
 *    leaving focus on the modal.
 * 5. Wrap `done` so the overlay handle is hidden before the promise resolves;
* `showHookCustom`'s `close()` then restores the editor (false-branch).
 *
 * Returns the value passed to `done`, or `undefined` in headless mode.
 */
export function hostCenteredOverlay<T>(
	ctx: ExtensionContext,
	buildComponent: OverlayComponentBuilder<T>,
	options: OverlayOptions = CENTERED_OVERLAY_OPTIONS,
): Promise<T | undefined> {
	if (!ctx.hasUI) return Promise.resolve(undefined);
	return ctx.ui.custom<T | undefined>((tui, theme, keybindingsOrDone, maybeDone) => {
		let handle: ReturnType<TUI["showOverlay"]> | undefined;
		let finished = false;
		const done = typeof maybeDone === "function"
			? maybeDone
			: keybindingsOrDone as unknown as (result: T | undefined) => void;
		const finish = (result: T | undefined): void => {
			if (finished) return;
			finished = true;
			handle?.hide();
			done(result);
		};
		const real = buildComponent(tui, theme, finish);
		Promise.resolve().then(() =>
			Promise.resolve().then(() => {
				if (finished) return;
				handle = tui.showOverlay(real, options);
				tui.setFocus(real);
				tui.requestRender();
			}),
		);
		return new Spacer(0);
	}, { overlay: false });
}
