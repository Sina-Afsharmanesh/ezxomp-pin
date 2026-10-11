import type { Component } from "@oh-my-pi/pi-tui";

// Re-export types used as part of the overlay public API
export type { FindingRow, RenderTarget } from "./render.js";
import { formatBadge, clamp, formatRow, formatDetail, mountOverlay } from "./render.js";
import type { FindingRow, CheckStatus, RenderTarget } from "./render.js";

/** A view mode for the findings overlay. */
export type OverlayView = "list" | "detail";

/** Options for constructing a FindingsOverlay. */
export interface FindingsOverlayOptions {
    /** List of findings to display. */
    findings: FindingRow[];
    /** Overlay title string. */
    title?: string;
    /** Sort by severity (highest first). Default true. */
    sortBySeverity?: boolean;
    /** Callback when user selects an actionable finding. */
    onAction?: ((finding: FindingRow) => Promise<void>) | undefined;
}

/** Precomputed severity order — lower = more severe. */
const SEVERITY: Record<string, number> = {
    "block": 0,
    "fail": 1,
    "warn": 2,
    "pending": 3,
    "pass": 4,
    "skipped": 5,
    "cancelled": 6,
    "unknown": 7,
};

/**
 * FindingsOverlay — list/detail TUI overlay for CI checks and review findings.
 *
 * PURE: no terminal side-effects until `open()` is called.
 * Testable: inject a fake RenderTarget.
 * Keyboard: up/down navigate, Enter expand, Esc back/close.
 * AC4: malformed/missing data renders as unknown (never green).
 */
export class FindingsOverlay {
    readonly findings: FindingRow[];
    readonly title: string;
    readonly onAction: ((finding: FindingRow) => Promise<void>) | undefined;

    #view: OverlayView = "list";
    #selectedIndex: number = 0;
    #expandedIndex: number | null = null;
    #closed: boolean = false;
    #keyDispose: (() => void) | undefined;

    constructor(options: FindingsOverlayOptions) {
        const { sortBySeverity = true } = options;
        this.findings = sortBySeverity
            ? [...options.findings].sort((a, b) => (SEVERITY[a.status] ?? 99) - (SEVERITY[b.status] ?? 99))
            : options.findings;
        this.title = options.title ?? "Findings";
        this.onAction = options.onAction;
    }

    /** Render the header line. */
    #renderHeader(width: number): string {
        const title = `${this.title} (${this.findings.length})`;
        const hint = "↑↓ nav · Enter detail · Esc close";
        const titleLen = title.length;
        const hintLen = hint.length;
        const gap = Math.max(1, width - titleLen - hintLen);
        return `${title}${gap > 0 ? " ".repeat(gap) : ""}${hintLen <= width - titleLen ? hint : ""}`;
    }

    /** Render separator line. */
    #renderSep(width: number): string {
        return "─".repeat(Math.min(width, 80));
    }

    /** Render the full overlay as lines of text. */
    render(width: number): string[] {
        if (this.#closed) return [];
        const lines: string[] = [];
        const contentWidth = Math.max(width, 40);

        // Header
        lines.push(this.#renderHeader(contentWidth));
        lines.push(this.#renderSep(contentWidth));

        if (this.#view === "list") {
            // Summary counts
            lines.push(this.#renderSummary(contentWidth));
            lines.push("");

            // Findings list
            for (let i = 0; i < this.findings.length; i++) {
                const row = this.findings[i];
                if (row === undefined) continue;
                const line = formatRow(row, contentWidth - 4);
                const cursor = i === this.#selectedIndex ? " ▸" : "   ";
                const expanded = i === this.#expandedIndex ? " [expanded]" : "";
                lines.push(`${cursor}${clamp(line, contentWidth - 8)}${expanded}`);
            }
        } else if (this.#expandedIndex !== null) {
            // Detail view
            const row = this.findings[this.#expandedIndex];
            if (row) {
                const detail = formatDetail(row, contentWidth - 4);
                lines.push(...detail);
                lines.push("");
                lines.push("Press Esc to return to list");
                if (row.nextAction && this.onAction) {
                    lines.push("Press 'a' to execute next action");
                }
            }
        }

        lines.push(this.#renderSep(contentWidth));
        return lines.map(l => clamp(l, width));
    }

    /** Render summary count line. */
    #renderSummary(width: number): string {
        const counts: Record<string, number> = {};
        for (const f of this.findings) {
            counts[f.status] = (counts[f.status] ?? 0) + 1;
        }
        const parts: string[] = [];
        for (const status of ["block", "fail", "warn", "pending", "pass", "skipped", "cancelled", "unknown"]) {
            const c = counts[status];
            if (c) {
                parts.push(`${formatBadge(status as CheckStatus)} ${c}`);
            }
        }
        return clamp(parts.join("  "), width);
    }

    /** Handle a keypress event. Returns true if handled. */
    handleKey(key: string): boolean {
        if (this.#closed) return false;

        if (key === "Escape") {
            if (this.#view === "detail") {
                this.#view = "list";
                this.#expandedIndex = null;
            } else {
                this.close();
            }
            return true;
        }

        if (this.#view === "detail") {
            if (key === "a" && this.onAction && this.#expandedIndex !== null) {
                const finding = this.findings[this.#expandedIndex];
                if (finding?.nextAction) {
                    this.onAction(finding);
                }
                return true;
            }
            return true;
        }

        // List view
        if (key === "ArrowUp" || key === "k") {
            if (this.#selectedIndex > 0) {
                this.#selectedIndex--;
            } else if (this.findings.length > 0) {
                this.#selectedIndex = this.findings.length - 1;
            }
            return true;
        }

        if (key === "ArrowDown" || key === "j") {
            if (this.findings.length > 0 && this.#selectedIndex < this.findings.length - 1) {
                this.#selectedIndex++;
            } else {
                this.#selectedIndex = 0;
            }
            return true;
        }

        if (key === "Enter" && this.#selectedIndex < this.findings.length) {
            this.#expandedIndex = this.#selectedIndex;
            this.#view = "detail";
            return true;
        }

        return false;
    }

    /** Get the currently selected finding. */
    getSelected(): FindingRow | undefined {
        return this.findings[this.#selectedIndex] ?? undefined;
    }

    /** Get current view mode. */
    getView(): OverlayView {
        return this.#view;
    }

    /** Whether the overlay is closed. */
    isClosed(): boolean {
        return this.#closed;
    }

    /** Close the overlay and dispose key handler. */
    close(): void {
        this.#closed = true;
        this.#keyDispose?.();
        this.#openResolve?.();
    }

    /**
     * Open the overlay with a RenderTarget.
     * Returns a promise that resolves when the overlay is closed.
     */
    #openResolve: (() => void) | undefined;

    async open(target: RenderTarget): Promise<void> {
        return new Promise((resolve) => {
            if (this.#closed) { resolve(); return; }
            this.#openResolve = resolve;

            const renderAndFlush = () => {
                const w = target.width;
                const lines = this.render(w);
                target.flush(lines);
            };

            renderAndFlush();

            this.#keyDispose = target.onKey((key) => {
                const handled = this.handleKey(key);
                if (handled) {
                    if (this.#closed) {
                        resolve();
                    } else {
                        renderAndFlush();
                    }
                }
            });
        });
    }
}

/**
 * Create a findings overlay from CI check names with statuses.
 */
export function createCiOverlay(
    checks: Array<{ name: string; status: string; detail?: string }>,
    options?: { title?: string; onAction?: (finding: FindingRow) => Promise<void> }
): FindingsOverlay {
    const findings: FindingRow[] = checks.map((c) => {
        const base: FindingRow = {
            label: c.name,
            status: normalizeStatus(c.status),
        };
        if (c.detail) base.detail = c.detail;
        if (c.detail) base.evidence = c.detail;
        return base;
    });
    return new FindingsOverlay({
        findings,
        title: options?.title ?? "CI Checks",
        onAction: options?.onAction,
    });
}

/**
 * Create a findings overlay from review findings.
 */
export function createReviewOverlay(
    findings: Array<{
        label: string;
        severity: string;
        file?: string;
        line?: number;
        evidence?: string;
        nextAction?: string;
    }>,
    options?: { title?: string; onAction?: (finding: FindingRow) => Promise<void> }
): FindingsOverlay {
    const rows: FindingRow[] = findings.map((f) => {
        const status = normalizeStatus(f.severity);
        const fileLine = f.file && f.line !== undefined ? `${f.file}:${f.line}` : undefined;
        const evidenceParts = [fileLine, f.evidence].filter(Boolean);
        const evidence = evidenceParts.join("\n");
        const row: FindingRow = { label: f.label, status };
        if (fileLine) row.detail = fileLine;
        else if (evidence) row.detail = evidence;
        if (evidence) row.evidence = evidence;
        if (f.nextAction) row.nextAction = f.nextAction;
        return row;
    });
    return new FindingsOverlay({
        findings: rows,
        title: options?.title ?? "Review Findings",
        onAction: options?.onAction,
    });
}

/**
 * Merge multiple findings into a single overlay.
 */
export function mergeFindingsOverlays(
    overlays: FindingsOverlay[]
): FindingsOverlay {
    const all: FindingRow[] = [];
    for (const o of overlays) {
        all.push(...o.findings);
    }
    return new FindingsOverlay({
        findings: all,
        title: "All Findings",
        sortBySeverity: true,
    });
}

/** Normalize an arbitrary status string to a known CheckStatus. */
function normalizeStatus(status: string): FindingRow["status"] {
    const lower = String(status).toLowerCase();
    // Map common aliases
    const alias: Record<string, string> = {
        "failure": "fail",
        "error": "fail",
        "blocked": "block",
        "canceled": "cancelled",
        "success": "pass",
        "warning": "warn",
    };
    const mapped = alias[lower] ?? lower;
    const known: string[] = ["pass", "fail", "pending", "skipped", "unknown", "cancelled", "block", "warn"];
    if (known.includes(mapped)) return mapped as FindingRow["status"];
    // AC4: unknown/malformed data is visible as unknown, never green
    return "unknown";
}

/**
 * Host a FindingsOverlay on a real TUI via ctx.ui.custom. Headless-safe: returns undefined when no UI.
 * Mirrors the progress-overlay bridge contract (lazy import, retained handle, idempotent finish).
 */
export function startFindingsOverlayForCtx(
	ctx: unknown,
	overlay: FindingsOverlay,
	opts?: { width?: number },
): { close(): void; done: Promise<void> } | undefined {
	const anyCtx = ctx as { hasUI?: boolean; ui?: { custom?: unknown } };
	if (!anyCtx?.hasUI || typeof anyCtx.ui?.custom !== "function") return undefined;
	const width = opts?.width ?? 78;
	let closed = false;
	let finishBridge: (() => void) | undefined;
	let settleOverlay!: () => void;
	const done = new Promise<void>((resolve) => { settleOverlay = resolve; });

	type CustomFn = <T>(factory: (tui: any, theme: any, keybindingsOrDone: any, maybeDone?: (r: boolean) => void) => unknown, options?: { overlay?: boolean }) => Promise<T>;
	const ctrl = {
		close() {
			if (closed) return;
			closed = true;
			finishBridge?.();
			settleOverlay();
		},
		done,
	};

	void import("@oh-my-pi/pi-tui").then(({ Box, Text, Spacer }) => {
		if (closed) return;
		const custom = (anyCtx.ui as { custom: CustomFn }).custom;
		try {
			const customPromise = custom<boolean>((tui, _theme, keybindingsOrDone, maybeDone) => {
				const done = typeof maybeDone === "function" ? maybeDone : keybindingsOrDone as (r: boolean) => void;
				let finished = false;
				let overlayHandle: { hide?(): void } | undefined;
				const finish = (): void => {
					if (finished) return;
					finished = true;
					overlayHandle?.hide?.();
					done(true);
				};
				finishBridge = finish;

				let disposeKey: ((key: string) => void) | undefined;
				const target = {
					width,
					render(_component: unknown): readonly string[] { return []; },
					flush(lines: readonly string[]): void {
						if (finished || closed) return;
						box.clear();
						for (const line of lines) box.addChild(new Text(line));
						tui.requestRender?.();
					},
					onKey(handler: (key: string) => void): () => void {
						disposeKey = handler;
						return () => { if (disposeKey === handler) disposeKey = undefined; };
					},
					hasAltScreen: false,
				};
				const box = new Box(1, 0) as Component & { addChild(c: unknown): void; clear(): void };
				box.handleInput = (data: string) => {
					disposeKey?.(data);
				};

				void overlay.open(target).then(() => { finish(); settleOverlay(); });

				mountOverlay(tui, box, {
					shouldSkip: () => finished || closed,
					onMount: (handle) => { overlayHandle = handle; },
				});

				if (closed) finish();
				return new Spacer(0);
			}, { overlay: false });
			Promise.resolve(customPromise).catch(() => finishBridge?.());
		} catch {
			finishBridge?.();
			closed = true;
		}
	}).catch(() => { closed = true; });

	return ctrl;
}
