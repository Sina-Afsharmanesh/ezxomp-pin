import { describe, it, expect } from "vitest";
import type { FindingRow, RenderTarget } from "./render.js";
import {
    FindingsOverlay,
    createCiOverlay,
    createReviewOverlay,
    mergeFindingsOverlays,
} from "./findings-overlay.js";
import { formatBadge, clamp } from "./render.js";

/** Fake render target for testing — no terminal side effects. */
class FakeTarget implements RenderTarget {
    width = 80;
    hasAltScreen = false;
    readonly flushedLines: string[][] = [];
    keyHandlers: Array<(key: string) => void> = [];

    render(): readonly string[] { return []; }
    flush(lines: readonly string[]) {
        this.flushedLines.push([...lines]);
    }
    onKey(handler: (key: string) => void): () => void {
        this.keyHandlers.push(handler);
        return () => {
            const idx = this.keyHandlers.indexOf(handler);
            if (idx >= 0) this.keyHandlers.splice(idx, 1);
        };
    }
    emitKey(key: string) {
        for (const handler of [...this.keyHandlers]) {
            handler(key);
        }
    }
}

describe("findings-overlay: render helpers", () => {
    it("formatBadge renders PASS in green for pass status", () => {
        const badge = formatBadge("pass");
        expect(badge).toContain("PASS");
    });

    it("formatBadge renders FAIL in red for fail status", () => {
        const badge = formatBadge("fail");
        expect(badge).toContain("FAIL");
    });

    it("formatBadge renders unknown as visible non-green marker", () => {
        const badge = formatBadge("unknown");
        expect(badge).toContain("????");
        expect(badge).not.toContain("PASS");
        expect(badge).not.toContain("\x1b[32m");
    });

    it("clamp truncates long text with ellipsis", () => {
        const result = clamp("a".repeat(50), 10);
        expect(result).toHaveLength(10);
        expect(result).toContain("...");
    });

    it("clamp returns short text unchanged", () => {
        expect(clamp("hi", 10)).toBe("hi");
    });
});

describe("findings-overlay: FindingsOverlay class", () => {
    const sampleFindings: FindingRow[] = [
        { label: "build", status: "pass" },
        { label: "lint", status: "fail", detail: "eslint error on line 42" },
        { label: "test", status: "pending" },
        { label: "security", status: "unknown", detail: "scanner unavailable" },
        { label: "deploy", status: "skipped" },
    ];

    it("sorts findings by severity (fail before pass)", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: true });
        expect(overlay.findings[0]!.status).toBe("fail");
    });

    it("preserves original order when sortBySeverity is false", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: false });
        expect(overlay.findings[0]!.status).toBe("pass");
    });

    it("render returns lines at given width", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        const lines = overlay.render(80);
        expect(lines.length).toBeGreaterThan(4);
        expect(lines[0]).toContain("Findings");
    });

    it("render includes summary line with status counts", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        const lines = overlay.render(80);
        const summary = lines[2];
        expect(summary).toBeTruthy();
    });

    it("ArrowDown navigates to next item", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: false });
        expect(overlay.getSelected()?.label).toBe("build");
        overlay.handleKey("ArrowDown");
        expect(overlay.getSelected()?.label).toBe("lint");
    });

    it("ArrowUp wraps to last item", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: false });
        overlay.handleKey("ArrowUp");
        expect(overlay.getSelected()?.label).toBe("deploy");
    });

    it("Enter enters detail view", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: false });
        overlay.handleKey("Enter");
        expect(overlay.getView()).toBe("detail");
    });

    it("Esc from detail returns to list", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings, sortBySeverity: false });
        overlay.handleKey("Enter");
        expect(overlay.getView()).toBe("detail");
        overlay.handleKey("Escape");
        expect(overlay.getView()).toBe("list");
    });

    it("Esc from list closes overlay", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        overlay.handleKey("Escape");
        expect(overlay.isClosed()).toBe(true);
    });

    it("Esc from list after entering detail then returning closes", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        overlay.handleKey("Enter");
        overlay.handleKey("Escape");
        expect(overlay.isClosed()).toBe(false);
        overlay.handleKey("Escape");
        expect(overlay.isClosed()).toBe(true);
    });

    it("closed overlay render returns empty", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        overlay.close();
        expect(overlay.render(80)).toEqual([]);
    });

    it("detail view renders file:line evidence when present", () => {
        const findings: FindingRow[] = [
            {
                label: "null pointer",
                status: "fail",
                detail: "src/api.ts:42",
                evidence: "src/api.ts:42: possible null dereference",
                nextAction: "Add null check",
            },
        ];
        const overlay = new FindingsOverlay({ findings });
        overlay.handleKey("Enter");
        const lines = overlay.render(80);
        const hasEvidence = lines.some((l) => l.includes("src/api.ts:42"));
        expect(hasEvidence).toBe(true);
    });

    it("narrow terminal does not throw and clamps lines", () => {
        const overlay = new FindingsOverlay({ findings: sampleFindings });
        expect(() => overlay.render(20)).not.toThrow();
        const lines = overlay.render(20);
        for (const line of lines) {
            expect(line.length).toBeLessThanOrEqual(20);
        }
    });

    it("onAction callback is invoked on 'a' key in detail view", async () => {
        let actionCalled = false;
        const finding: FindingRow = {
            label: "fix-me",
            status: "fail",
            nextAction: "Create task",
        };
        const overlay = new FindingsOverlay({
            findings: [finding],
            onAction: async () => { actionCalled = true; },
        });
        overlay.handleKey("Enter");
        overlay.handleKey("a");
        expect(actionCalled).toBe(true);
    });

    it("getSelected returns undefined for empty findings", () => {
        const overlay = new FindingsOverlay({ findings: [] });
        expect(overlay.getSelected()).toBeUndefined();
    });
});

describe("findings-overlay: createCiOverlay", () => {
    it("creates overlay with correct findings", () => {
        const overlay = createCiOverlay([
            { name: "build", status: "pass" },
            { name: "test", status: "failure" },
            { name: "lint", status: "pending" },
        ]);
        expect(overlay.findings.length).toBe(3);
        expect(overlay.findings.some((f) => f.label === "build")).toBe(true);
    });

    it("normalizes 'failure' to 'fail' status", () => {
        const overlay = createCiOverlay([
            { name: "test", status: "failure" },
        ]);
        expect(overlay.findings[0]!.status).toBe("fail");
    });

    it("normalizes unknown provider status to 'unknown'", () => {
        const overlay = createCiOverlay([
            { name: "mystery-check", status: "🤷" },
        ]);
        expect(overlay.findings[0]!.status).toBe("unknown");
    });
});

describe("findings-overlay: createReviewOverlay", () => {
    it("creates overlay with file:line evidence", () => {
        const overlay = createReviewOverlay([
            {
                label: "Unreachable code",
                severity: "warn",
                file: "src/main.ts",
                line: 42,
                evidence: "Line is after return",
                nextAction: "Remove dead code",
            },
        ]);
        expect(overlay.findings[0]!.evidence).toContain("src/main.ts:42");
    });

    it("normalizes unknown severity to 'unknown' status", () => {
        const overlay = createReviewOverlay([
            { label: "weird", severity: "???" },
        ]);
        expect(overlay.findings[0]!.status).toBe("unknown");
    });
});

describe("findings-overlay: mergeFindingsOverlays", () => {
    it("combines findings from multiple overlays", () => {
        const ci = createCiOverlay([{ name: "build", status: "pass" }]);
        const review = createReviewOverlay([{ label: "Style", severity: "warn" }]);
        const merged = mergeFindingsOverlays([ci, review]);
        expect(merged.findings.length).toBe(2);
        expect(merged.title).toBe("All Findings");
    });
});

describe("findings-overlay: AC4 — unknown never green", () => {
    it("unknown status badge does not contain green escape code", () => {
        const badge = formatBadge("unknown");
        expect(badge).not.toContain("\x1b[32m");
        expect(badge).not.toContain("PASS");
    });

    it("malformed status normalizes to unknown (not pass)", () => {
        const overlay = createCiOverlay([{ name: "bad", status: "not-a-status" }]);
        expect(overlay.findings[0]!.status).toBe("unknown");
    });

    it("missing severity normalizes to unknown", () => {
        const overlay = createReviewOverlay([{ label: "ghost", severity: "" }]);
        expect(overlay.findings[0]!.status).toBe("unknown");
    });
});

describe("findings-overlay: AC5 — keyboard navigation", () => {
    it("handles k/j vim-style navigation", () => {
        const overlay = new FindingsOverlay({
            findings: [
                { label: "a", status: "pass" },
                { label: "b", status: "fail" },
                { label: "c", status: "warn" },
            ],
            sortBySeverity: false,
        });
        overlay.handleKey("j");
        expect(overlay.getSelected()?.label).toBe("b");
        overlay.handleKey("k");
        expect(overlay.getSelected()?.label).toBe("a");
    });

    it("Esc exits overlay completely when in list view", () => {
        const overlay = new FindingsOverlay({ findings: [{ label: "x", status: "pass" }] });
        expect(overlay.isClosed()).toBe(false);
        overlay.handleKey("Escape");
        expect(overlay.isClosed()).toBe(true);
    });
});

describe("findings-overlay: FakeTarget integration", () => {
    it("open() renders initial frame to target", async () => {
        const target = new FakeTarget();
        const overlay = new FindingsOverlay({
            findings: [{ label: "test", status: "pass" }],
        });

        const openPromise = overlay.open(target);
        expect(target.flushedLines.length).toBeGreaterThanOrEqual(1);
        expect(target.flushedLines[0]![0]!).toContain("Findings");

        overlay.close();
        await openPromise;
    });

    it("key presses re-render to target", async () => {
        const target = new FakeTarget();
        const findings: FindingRow[] = [
            { label: "first", status: "pass" },
            { label: "second", status: "fail" },
        ];
        const overlay = new FindingsOverlay({ findings, sortBySeverity: false });

        const openPromise = overlay.open(target);
        const initialFlushCount = target.flushedLines.length;

        target.emitKey("ArrowDown");
        expect(target.flushedLines.length).toBeGreaterThan(initialFlushCount);

        overlay.close();
        await openPromise;
    });
});

describe("findings-overlay: AC6 — headless parity", () => {
    it("overlay findings data is identical regardless of UI presence", () => {
        const checks = [
            { name: "build", status: "pass", detail: "ok" },
            { name: "test", status: "fail", detail: "3 failures" },
            { name: "scan", status: "unknown", detail: "unreachable" },
        ];
        const overlay = createCiOverlay(checks);

        const headlessReport = overlay.findings.map((f) => ({
            name: f.label,
            status: f.status,
            detail: f.detail,
        }));

        expect(headlessReport).toEqual([
            { name: "test", status: "fail", detail: "3 failures" },
            { name: "build", status: "pass", detail: "ok" },
            { name: "scan", status: "unknown", detail: "unreachable" },
        ]);
    });
});
