import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function waitUntil(fn: () => boolean, timeoutMs = 1000): Promise<void> {
	const start = Date.now();
	while (!fn()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}
import makePi from "./__mocks__/pi-coding-agent";
import {
	CookDagOverlay,
	cookToolRenderers,
	composeCookDagLines,
	composeCookDagRows,
	fitCookRows,
	StableCookRows,
	sanitizeCookText,
} from "../extensions/renderers.ts";
import { defaultCookState } from "../extensions/state.ts";
import type { CookState } from "../extensions/types.ts";

interface FakeTask {
	id: string;
	title: string;
	status: string;
	dependencies?: string[];
	parent_task_id?: string;
	priority?: string;
	assignee?: unknown[];
	labels?: string[];
}

function task(overrides: Partial<FakeTask>): FakeTask {
	return { id: "TASK-1", title: "t", status: "To Do", priority: "high", assignee: [], labels: [], ...overrides };
}

function stateWithParent(parentId: string | null): CookState {
	const s = defaultCookState();
	s.currentTaskId = parentId;
	return s;
}

describe("sanitizeCookText (TASK-34 AC4)", () => {
	it("removes tabs and control characters", () => {
		const tabbed = sanitizeCookText("a\tb");
		expect(tabbed).not.toContain("\t");
		const belled = sanitizeCookText("ok\u0007!");
		expect(belled).not.toContain("\u0007");
		expect(belled.startsWith("ok")).toBe(true);
		expect(belled.endsWith("!")).toBe(true);
	});
});

describe("cookToolRenderers (TASK-34 AC1-4)", () => {
	for (const kind of ["planner", "scout", "researcher", "worker", "validator", "judge", "next"] as const) {
		it(`renders call + result for ${kind}`, () => {
			const { renderCall, renderResult } = cookToolRenderers(kind);
			const call = renderCall({ task_id: "TASK-9" }, {}, {});
			const rows = call.render(80);
			expect(Array.isArray(rows)).toBe(true);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.join(" ")).toContain("TASK-9");

			const ok = renderResult({ content: [{ type: "text", text: "ok done" }] }, {}, {});
			expect(ok.render(80).join(" ").length).toBeGreaterThan(0);

			const expanded = renderResult({ content: [{ type: "text", text: "detail line" }] }, { expanded: true }, {});
			expect(expanded.render(80).join(" ")).toContain("detail line");

			const partial = renderResult({ content: [{ type: "text", text: "working" }] }, { isPartial: true }, {});
			expect(partial.render(80).length).toBeGreaterThan(0);

			const errored = renderResult({ isError: true, content: [{ type: "text", text: "boom" }] }, {}, {});
			expect(errored.render(80).length).toBeGreaterThan(0);
		});
	}

	it("keeps stable row references for unchanged state", () => {
		const rows = new StableCookRows((w) => ["same"]);
		const a = rows.render(40);
		const b = rows.render(40);
		expect(b).toBe(a);
	});

	it("returns new rows when width changes", () => {
		const rows = new StableCookRows((w) => [`w=${w}`]);
		rows.render(40);
		const next = rows.render(50);
		expect(next.join("")).toContain("50");
	});

	it("never overflows narrow widths (AC4)", () => {
		const { renderCall } = cookToolRenderers("worker");
		const rows = renderCall({ task_id: "TASK-LONG-NAME", plan: "x".repeat(300) }, {}, {}).render(12);
		for (const line of rows) expect(line.length).toBeLessThanOrEqual(12);
	});
});

function parentChildTasks(): FakeTask[] {
	return [
		task({ id: "TASK-P", title: "parent", status: "In Progress" }),
		task({ id: "TASK-D1", title: "done child", status: "Done", parent_task_id: "TASK-P" }),
		task({ id: "TASK-B", title: "blocked child", status: "To Do", parent_task_id: "TASK-P", dependencies: ["TASK-B2"] }),
		task({ id: "TASK-B2", title: "blocker", status: "To Do", parent_task_id: "TASK-P" }),
	];
}

describe("composeCookDagRows (TASK-33 AC2-3)", () => {
	it("shows parent identity, chain, children with status, deps, readiness", () => {
		const rows = composeCookDagRows(stateWithParent("TASK-P"), parentChildTasks() as never);
		const text = rows.map((r) => r.text).join("\n");
		expect(text).toContain("Parent: TASK-P");
		expect(text).toContain("TASK-D1");
		expect(text).toContain("deps: TASK-B2");
		const blocked = rows.find((r) => r.id === "TASK-B");
		const blocker = rows.find((r) => r.id === "TASK-B2");
		expect(blocker?.readiness).toBe("ready");
		expect(blocked?.readiness).toBe("blocked");
		const doneRow = rows.find((r) => r.id === "TASK-D1");
		expect(doneRow?.readiness).toBe("done");
	});

	it("handles empty chains and no ready work without throwing", () => {
		const empty = composeCookDagRows(stateWithParent(null), [] as never);
		expect(empty.some((r) => r.text.includes("No active workflow"))).toBe(true);
		const noReady = composeCookDagRows(stateWithParent("TASK-P"), parentChildTasks() as never);
		expect(noReady.some((r) => r.text.includes("Enter: claim"))).toBe(true);
		const noneReadyState = composeCookDagRows(stateWithParent("TASK-P"), [
			task({ id: "TASK-P", title: "p", status: "In Progress" }),
			task({ id: "TASK-X", title: "child", status: "To Do", parent_task_id: "TASK-P", dependencies: ["MISSING-DEP"] }),
		] as never);
		// dependency never terminal → blocked, no ready
		expect(noneReadyState.some((r) => r.text.includes("No ready sub-tickets"))).toBe(true);
	});

	it("handles failed backlog reads (undefined tasks)", () => {
		const rows = composeCookDagRows(stateWithParent("TASK-P"), undefined);
		expect(rows.some((r) => r.text.includes("unavailable"))).toBe(true);
	});
});

describe("composeCookDagLines bounded rendering (TASK-33 AC3)", () => {
	it("clips to height with overflow marker and respects narrow width", () => {
		const tasks = parentChildTasks();
		const many: FakeTask[] = [task({ id: "TASK-P", title: "p", status: "In Progress" })];
		for (let i = 0; i < 30; i++) tasks.push(task({ id: `TASK-C${i}`, title: `child ${i}`, status: "Done", parent_task_id: "TASK-P" }));
		const lines = composeCookDagLines(stateWithParent("TASK-P"), tasks as never, 30, 5);
		expect(lines.length).toBeLessThanOrEqual(5);
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(30);
		expect(lines[lines.length - 1]).toContain("more rows");
	});
});

describe("CookDagOverlay lifecycle (TASK-33 AC1, DoD1)", () => {
	function makeOverlay(overrides?: { onClaim?: () => unknown; tasks?: FakeTask[]; state?: CookState }) {
		const done = vi.fn();
		const tui = { requestRender: vi.fn() };
		const keybindings = {
			matches: (input: string, binding: string) =>
				(binding === "tui.select.cancel" && input === "\u001b") ||
				(binding === "tui.select.confirm" && input === "\r"),
		};
		const overlay = new CookDagOverlay(
			{
				state: overrides?.state ?? stateWithParent("TASK-P"),
				tasks: (overrides?.tasks ?? parentChildTasks()) as never,
				onClaim: overrides?.onClaim ?? (() => "claimed!"),
			},
			tui as never,
			keybindings as never,
			done,
		);
		return { overlay, done, tui };
	}

	it("Enter claims next ready via onClaim and finishes exactly once", async () => {
		const { overlay, done } = makeOverlay();
		overlay.handleInput("\r");
		await waitUntil(() => done.mock.calls.length >= 1);
		expect(done).toHaveBeenCalledWith({ action: "claimed", result: "claimed!" });
	});

	it("Escape closes without mutation", () => {
		const onClaim = vi.fn();
		const { overlay, done } = makeOverlay({ onClaim });
		overlay.handleInput("\u001b");
		expect(done).toHaveBeenCalledWith({ action: "closed" });
		expect(onClaim).not.toHaveBeenCalled();
	});

	it("dispose is idempotent and done fires at most once", () => {
		const { overlay, done } = makeOverlay();
		overlay.dispose();
		overlay.dispose();
		expect(done).toHaveBeenCalledTimes(1);
	});

	it("claim errors surface as error result, not a throw", async () => {
		const { overlay, done } = makeOverlay({ onClaim: () => { throw new Error("claim failed"); } });
		overlay.handleInput("\r");
		await waitUntil(() => done.mock.calls.length >= 1);
		expect(done).toHaveBeenCalledWith({ action: "error", error: "claim failed" });
	});
});
