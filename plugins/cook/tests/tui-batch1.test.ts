import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __emitHook, __resetHandlers, makeCtx, makeUiStub } from "./__mocks__/pi-coding-agent";
import {
	clipWidgetLine,
	composeWidgetLines,
	createStoreContext,
	defaultCookState,
	WIDGET_MAX_WIDTH,
	widgetCountsFor,
} from "../extensions/state.ts";
import { createCookAutocompleteProvider, registerCookAutocompleteProvider } from "../extensions/autocomplete.ts";
import type { AutocompleteProvider } from "@oh-my-pi/pi-tui";

let workDir: string;

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-tui-batch1-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("cook chain widget", () => {
	it("composes chain, task, active role, stage markers, watch activity, and counts", () => {
		const state = defaultCookState();
		state.chain = ["explore", "research", "report"];
		state.currentStage = 1;
		state.currentTaskId = "TASK-32";
		state.watch.enabled = true;
		state.watch.lastFiredAt = "2026-08-27T00:00:00.000Z";
		const parent = {
			id: "TASK-32.1",
			title: "done",
			status: "Done",
			dependencies: [],
			priority: "high",
			assignee: [],
			labels: [],
			parent_task_id: "TASK-32",
		};
		const ready = { ...parent, id: "TASK-32.2", title: "ready", status: "To Do", dependencies: ["TASK-32.1"] };
		const lines = composeWidgetLines(state, widgetCountsFor(state, [parent, ready]));
		const rendered = lines.join("\n");

		expect(lines.length).toBeLessThanOrEqual(10);
		expect(rendered).toContain("scout");
		expect(rendered).toContain("TASK-32");
		expect(rendered).toContain("RESEARCH [researcher]");
		expect(rendered).toContain("✓ explore");
		expect(rendered).toContain("▶ research");
		expect(rendered).toContain("○ report");
		expect(rendered).toContain("last fired: 2026-08-27T00:00:00.000Z");
		expect(rendered).toContain("ready 1");
		expect(rendered).toContain("done 1/2");
	});

	it("renders an explicit empty activity state before the first fire", () => {
		const state = defaultCookState();
		state.chain = ["implement"];
		state.watch.enabled = true;
		state.watch.lastFiredAt = null;
		const lines = composeWidgetLines(state, undefined, undefined, 32);
		const watchLine = lines.find((line) => line.startsWith("watch:"));
		expect(watchLine).toBe("watch: ON");
		expect(lines.join("\n")).not.toContain("last fired:");
		expect(lines.length).toBeLessThanOrEqual(5);
		expect(lines.every((line) => Array.from(line).length <= 32)).toBe(true);
	});

	it("keeps empty and cookmode-only widgets bounded and explicit", () => {
		const state = defaultCookState();
		expect(composeWidgetLines(state)).toEqual([]);

		state.cookmode = true;
		const lines = composeWidgetLines(state, undefined, undefined, 20);
		expect(lines).toHaveLength(1);
		expect(Array.from(lines[0]!).length).toBeLessThanOrEqual(20);
		expect(lines[0]).toContain("cook: COOKMODE ON");
	});

	it("distinguishes unavailable data from a known empty parent", () => {
		const state = defaultCookState();
		state.chain = ["implement"];
		state.currentTaskId = "TASK-32";
		state.watchList = {
			"TASK-32.1": { taskId: "TASK-32.1", since: "now", lastStatus: "Archived", lastChecked: null },
			"TASK-32.2": { taskId: "TASK-32.2", since: "now", lastStatus: "To Do", lastChecked: null },
		};

		expect(widgetCountsFor(state, undefined)).toEqual({ ready: 0, done: 1, total: 2 });
		const parent = { id: "TASK-32", title: "parent", status: "In Progress", dependencies: [], priority: "high", assignee: [], labels: [] };
		expect(widgetCountsFor(state, [parent])).toEqual({ ready: 0, done: 0, total: 0 });
	});

	it("clips controls and Unicode without exceeding the supplied width", () => {
		const clipped = clipWidgetLine(`prefix\u0000${"界".repeat(40)}`, 12);
		expect(clipped).not.toContain("\u0000");
		expect(Array.from(clipped).length).toBe(12);
		expect(clipped.endsWith("…")).toBe(true);

		const state = defaultCookState();
		state.chain = ["custom-stage".repeat(80)];
		const lines = composeWidgetLines(state, undefined, undefined, 24);
		expect(lines.every((line) => Array.from(line).length <= 24)).toBe(true);
		expect(lines.every((line) => typeof line === "string")).toBe(true);
		expect(WIDGET_MAX_WIDTH).toBe(160);
	});

	it("renders the resolved parent consistently for direct composition", () => {
		const state = defaultCookState();
		state.chain = ["implement"];
		state.currentTaskId = "TASK-32.2";
		const child = {
			id: "TASK-32.2",
			title: "child",
			status: "To Do",
			dependencies: [],
			priority: "high",
			assignee: [],
			labels: [],
			parent_task_id: "TASK-32",
		};
		const lines = composeWidgetLines(state, widgetCountsFor(state, [child]), [child]);
		expect(lines[0]).toContain("task: TASK-32");
	});

	it("refreshes the widget through every setStoreFor mutation", () => {
		const pi = makePi();
		const sc = createStoreContext(pi as never);
		const ui = makeUiStub();
		sc.currentCwd = workDir;
		sc.hasUI = true;
		sc.lastUi = ui as never;
		const state = defaultCookState();
		state.chain = ["implement", "review"];
		state.currentTaskId = "TASK-32";
		sc.setStoreFor(workDir, state);
		expect(ui.setWidget).toHaveBeenCalledTimes(1);
	});
});

describe("/cook autocomplete", () => {
	function hostProvider(): AutocompleteProvider {
		return {
			getSuggestions: vi.fn(async () => ({ items: [{ value: "host", label: "host" }], prefix: "host" })),
			applyCompletion: vi.fn((lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol })),
		};
	}

	it("offers subcommands while preserving the typed argument prefix", async () => {
		const host = hostProvider();
		const provider = createCookAutocompleteProvider(host);
		const result = await provider.getSuggestions(["/cook st"], 0, 8);
		expect(result?.prefix).toBe("st");
		expect(result?.items).toEqual(expect.arrayContaining([
			expect.objectContaining({ value: "start ", label: "start" }),
			expect.objectContaining({ value: "status ", label: "status" }),
		]));
		expect(host.getSuggestions).not.toHaveBeenCalled();
	});

	it("delegates non-cook input to the host provider", async () => {
		const host = hostProvider();
		const provider = createCookAutocompleteProvider(host);
		const result = await provider.getSuggestions(["plain text"], 0, 10);
		expect(result?.items).toEqual([{ value: "host", label: "host" }]);
		const unrelatedCommand = await provider.getSuggestions(["/other va"], 0, 9);
		expect(unrelatedCommand?.items).toEqual([{ value: "host", label: "host" }]);
		expect(host.getSuggestions).toHaveBeenCalledTimes(2);
	});

	it("registers one provider only for interactive session UIs", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const providers: unknown[] = [];
		const ui = Object.assign(makeUiStub(), { addAutocompleteProvider: (factory: unknown) => providers.push(factory) });
		const noUiCtx = makeCtx({ cwd: workDir, ui: ui as never, hasUI: false });
		await __emitHook("session_start", {}, noUiCtx);
		expect(providers).toHaveLength(0);
		const ctx = makeCtx({ cwd: workDir, ui: ui as never, hasUI: true });
		await __emitHook("session_start", {}, ctx);
		await __emitHook("session_start", {}, ctx);
		await __emitHook("turn_start", {}, ctx);
		expect(providers).toHaveLength(1);
	});

	it("returns all documented subcommands in stable order for an empty argument", async () => {
		const host = hostProvider();
		const provider = createCookAutocompleteProvider(host);
		const result = await provider.getSuggestions(["/cook "], 0, 6);
		expect(result?.prefix).toBe("");
		expect(result?.items.map((item) => item.label)).toEqual([
			"on",
			"off",
			"status",
			"config",
			"install",
			"start",
			"stop",
			"propose",
			"validate",
			"ready",
			"claim",
			"snapshot",
			"all",
		]);
		expect(result?.items.every((item) => item.description)).toBe(true);
	});

	it("applies argument-only completion without duplicating command or trailing text", async () => {
		const host = hostProvider();
		host.applyCompletion = vi.fn((lines, cursorLine, cursorCol, item, prefix) => {
			const line = lines[cursorLine] ?? "";
			const beforePrefix = line.slice(0, cursorCol - prefix.length);
			const afterCursor = line.slice(cursorCol);
			const completed = [...lines];
			completed[cursorLine] = beforePrefix + item.value + afterCursor;
			return { lines: completed, cursorLine, cursorCol: beforePrefix.length + item.value.length };
		});
		const provider = createCookAutocompleteProvider(host);
		const result = await provider.getSuggestions(["/cook st --keep"], 0, 8);
		const start = result?.items.find((item) => item.label === "start");
		expect(result?.prefix).toBe("st");
		expect(start).toBeDefined();
		const applied = provider.applyCompletion(["/cook st --keep"], 0, 8, start!, result!.prefix);
		expect(applied.lines).toEqual(["/cook start --keep"]);
		expect(host.applyCompletion).toHaveBeenCalledTimes(1);
	});

	it("does not register autocomplete in a non-interactive context", () => {
		const providers: unknown[] = [];
		const ui = { addAutocompleteProvider: (factory: unknown) => providers.push(factory) };
		registerCookAutocompleteProvider({ hasUI: false, ui } as never);
		expect(providers).toHaveLength(0);
	});
});
