import type { Component } from "@oh-my-pi/pi-tui";

/** Rendering target abstraction — injectable, terminal-agnostic. */
export interface RenderTarget {
    /** Current terminal width in columns. */
    readonly width: number;
    /** Render a component tree, returning the line array. */
    render(component: Component): readonly string[];
    /** Flush rendered lines to stdout (differential or full). */
    flush(lines: readonly string[]): void;
    /** Register a keypress handler. Returns dispose fn. */
    onKey(handler: (key: string) => void): () => void;
    /** Whether the terminal supports alternate screen. */
    readonly hasAltScreen: boolean;
}

/** An item displayed in a findings list row. */
export interface FindingRow {
    /** Primary label (check name, finding title). */
    label: string;
    /** Status badge value. */
    status: CheckStatus;
    /** Secondary detail line (bounded). */
    detail?: string;
    /** File:line evidence for expanded view. */
    evidence?: string;
    /** Recommended next action. */
    nextAction?: string;
}

/** Severity ordering for sorting findings. */
/** Status type alias for check states. */
export type CheckStatus = "pass" | "fail" | "pending" | "skipped" | "unknown" | "cancelled" | "block" | "warn";

/** Format a status badge for display — UNKNOWN is never green. */
export function formatBadge(status: CheckStatus): string {
    const map: Record<CheckStatus, [string, string]> = {
        "pass": ["\x1b[32m", "PASS"],
        "fail": ["\x1b[31m", "FAIL"],
        "pending": ["\x1b[33m", "PEND"],
        "skipped": ["\x1b[90m", "SKIP"],
        "unknown": ["\x1b[93m", "????"],
        "cancelled": ["\x1b[36m", "CANC"],
        "block": ["\x1b[41m\x1b[97m", "BLOCK"],
        "warn": ["\x1b[33m", "WARN"],
    };
    const [color, label] = map[status];
    return `${color}${label}\x1b[0m`;
}

/** Clamp text to max width, truncating with ellipsis. */
export function clamp(text: string, max: number): string {
    if (text.length <= max) return text;
    if (max <= 4) return text.slice(0, max);
    return text.slice(0, max - 3) + "...";
}

/** Build a single row line: badge + label (+ truncated detail). */
export function formatRow(row: FindingRow, width: number): string {
    const badge = formatBadge(row.status);
    const remaining = Math.max(0, width - badge.length - 2);
    const label = clamp(row.label, Math.max(remaining - 6, 4));
    let line = `${badge} ${label}`;
    if (row.detail) {
        const detailBudget = Math.max(0, width - line.length - 3);
        if (detailBudget > 4) {
            line += " " + clamp(row.detail, detailBudget);
        }
    }
    return line;
}

/** Build expanded detail lines for a finding row. */
export function formatDetail(row: FindingRow, width: number): string[] {
    const lines: string[] = [];
    lines.push(formatRow(row, width));
    lines.push("");
    if (row.evidence) {
        lines.push(`\x1b[36mEvidence:\x1b[0m ${clamp(row.evidence, width - 12)}`);
    }
    if (row.detail) {
        lines.push(`\x1b[90mDetail:\x1b[0m ${clamp(row.detail, width - 10)}`);
    }
    if (row.nextAction) {
        lines.push(`\x1b[32mNext:\x1b[0m ${clamp(row.nextAction, width - 8)}`);
    }
    if (!row.evidence && !row.detail && !row.nextAction) {
        lines.push("\x1b[90m(no details available)\x1b[0m");
    }
    return lines;
}
/** Mount options for {@link mountOverlay}. */
export interface MountOverlayOptions {
    /** When truthy, the deferred mount is skipped (e.g. overlay already closed). */
    shouldSkip?: () => boolean;
    /** Receives the overlay handle once mounted (to hide on close). */
    onMount?: (handle: { hide?: () => void }) => void;
}

/** Overlay surface subset needed to mount a box. */
export interface OverlayMountTui {
    showOverlay(box: Component, options?: { anchor: string; maxHeight: string; margin: { top: number; bottom: number; left: number; right: number } }): { hide?: () => void };
    setFocus(box: Component): void;
    requestRender(): void;
}

/**
 * Mount a box overlay deferred to the next microtask turn, then focus and
 * render it. Shared by the confirm and findings overlays so the mount
 * sequence and overlay options stay identical.
 */
export function mountOverlay(
    tui: OverlayMountTui,
    box: Component,
    options?: MountOverlayOptions,
): void {
    const { shouldSkip, onMount } = options ?? {};
    Promise.resolve().then(() => Promise.resolve().then(() => {
        if (shouldSkip?.()) return;
        const handle = tui.showOverlay(box, { anchor: "center", maxHeight: "80%", margin: { top: 2, bottom: 2, left: 2, right: 2 } });
        tui.setFocus(box);
        tui.requestRender();
        onMount?.(handle);
    }));
}

/** Truncate an evidence string to max lines, wrapping at width. */
