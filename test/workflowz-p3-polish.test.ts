import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Key } from "@oh-my-pi/pi-tui";
import { Settings } from "../plugins/extensible-workflows/node_modules/@oh-my-pi/pi-coding-agent";
type SettingsTestModule = { resetSettingsForTest(): void };
const { resetSettingsForTest } = await import(new URL("../plugins/extensible-workflows/node_modules/@oh-my-pi/pi-coding-agent/src/config/settings.ts", import.meta.url).href) as SettingsTestModule;
import extensibleWorkflows, { capNoticeBytes, openWorkflowLibrary, openWorkflowRunOverlay } from "../plugins/extensible-workflows/src/index.ts";
import { appendRunEvent, createRun, saveWorkflowDefinition } from "../plugins/extensible-workflows/src/runtime.ts";
import { approveGate, draftGate, saveGateFile } from "../plugins/extensible-workflows/src/templates.ts";

type CompletionItem = { value: string; label: string; description?: string; hint?: string };
type CommandSpec = { handler?: (args: string, ctx: unknown) => Promise<void> | void; getArgumentCompletions?: (argumentPrefix: string) => CompletionItem[] | null | Promise<CompletionItem[] | null> };
type ProviderFactory = (current: unknown) => unknown;

function tempCwd(): string {
	return mkdtempSync(join(tmpdir(), "workflowz-p3-"));
}

function definition(name: string, description = `Description for ${name}`) {
	return {
		schemaVersion: 2 as const,
		name,
		description,
		inputs: {},
		stages: [{ id: "verify", label: "Verify", tasks: [{ id: "worker", prompt: "Verify" }], gates: [] }],
	};
}

function extensionProbe(toolNames: string[] = ["eval", "task"]): { api: unknown; commands: Map<string, CommandSpec>; handlers: Map<string, Function> } {
	const commands = new Map<string, CommandSpec>();
	const handlers = new Map<string, Function>();
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		api: {
			zod: schema,
			registerTool: () => {},
			registerCommand: (name: string, spec: CommandSpec) => commands.set(name, spec),
			on: (event: string, handler: Function) => handlers.set(event, handler),
			appendEntry: () => {},
			getAllTools: () => toolNames.map(name => ({ name, description: "", parameters: {}, sourceInfo: {} })),
			getActiveTools: () => toolNames,
		},
		commands,
		handlers,
	};
}

function overlayHarness(cwd: string) {
	const customs: Array<{ component: any; options: unknown }> = [];
	const overlays: Array<{ component: any; options: unknown }> = [];
	const intervals: Array<() => void> = [];
	const cleared: unknown[] = [];
	const notified: Array<{ message: string; level: string }> = [];
	const { promise, resolve } = Promise.withResolvers<unknown>();
	const tui = {
		showOverlay(component: any, options: unknown) {
			overlays.push({ component, options });
			return { hide() {} };
		},
		setFocus() {},
		requestRender() {},
	};
	const ctx = {
		cwd,
		hasUI: true,
		editor: {},
		editorContainer: { clear() {}, addChild() {} },
		ui: {
			custom<T>(factory: (tui: unknown, theme: unknown, done: (value?: T) => void) => any, options?: unknown): Promise<T> {
				const component = factory(tui, { fg: (_name: string, text: string) => text }, (value?: T) => resolve(value));
				customs.push({ component, options });
				return promise as Promise<T>;
			},
			notify(message: string, level: string) {
				notified.push({ message, level });
			},
		},
		setInterval(callback: () => void, _ms?: number) {
			intervals.push(callback);
			return { id: intervals.length };
		},
		clearTimer(timer: unknown) {
			cleared.push(timer);
		},
	};
	return { ctx, customs, overlays, intervals, cleared, notified, resolve };
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("workflowz P3 polish contracts", () => {
	test("registers exactly one recipe autocomplete provider for a session UI", async () => {
		const { api, handlers } = extensionProbe();
		extensibleWorkflows(api as never);
		const providers: ProviderFactory[] = [];
		const ctx = {
			cwd: tempCwd(),
			hasUI: true,
			ui: {
				addAutocompleteProvider: (factory: ProviderFactory) => providers.push(factory),
				setTitle() {},
				setWorkingMessage() {},
			},
			sessionManager: { getBranch: () => [] },
		};
		try {
			const onSessionStart = handlers.get("session_start");
			expect(onSessionStart).toBeTypeOf("function");
			await onSessionStart!({}, ctx);
			await onSessionStart!({}, ctx);
			expect(providers).toHaveLength(1);
		} finally {
			rmSync(ctx.cwd, { recursive: true, force: true });
		}
	});

	test("returns full-prefix AutocompleteItems for recipe chain list and run-control grammar", async () => {
		const cwd = tempCwd();
		const originalCwd = process.cwd();
		try {
			process.chdir(cwd);
			expect(saveWorkflowDefinition(definition("release-candidate"), "project", false, cwd).path).toBeDefined();
			const runId = createRun(cwd, "release-candidate", {});
			const { api, commands } = extensionProbe();
			extensibleWorkflows(api as never);
			const complete = commands.get("workflows")?.getArgumentCompletions;
			expect(complete).toBeTypeOf("function");

			expect(await complete!("run rele")).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: "run release-candidate ", label: "release-candidate", description: expect.any(String) }),
			]));
			expect(await complete!("chain release-candidate -> ")).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: "chain release-candidate -> release-candidate ", label: "release-candidate", description: expect.any(String) }),
			]));
			expect(await complete!("list ")).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: "list recipes ", label: "recipes", description: expect.any(String) }),
				expect.objectContaining({ value: "list gates ", label: "gates", description: expect.any(String) }),
			]));
			expect(await complete!(`status ${runId.slice(0, 8)}`)).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: `status ${runId} `, label: runId, description: expect.any(String) }),
			]));
		} finally {
			process.chdir(originalCwd);
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("requires configured eval and task tools before injecting a workflow catalog notice", async () => {
		const cwd = tempCwd();
		const { api, handlers } = extensionProbe([]);
		extensibleWorkflows(api as never);
		try {
			expect(saveWorkflowDefinition(definition("catalog"), "project", false, cwd).path).toBeDefined();
			await Settings.init({ inMemory: true, cwd, overrides: { "magicKeywords.enabled": true, "magicKeywords.workflow": "workflowz" } });
			const beforeAgentStart = handlers.get("before_agent_start");
			expect(beforeAgentStart).toBeTypeOf("function");
			await expect(beforeAgentStart!({ prompt: "Please use workflowz now.", systemPrompt: ["base"] }, { cwd, hasUI: false, ui: {}, sessionManager: { getBranch: () => [] } })).resolves.toBeUndefined();
		} finally {
			resetSettingsForTest();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("bounds configured workflow catalog notices to 8 KiB", async () => {
		const cwd = tempCwd();
		const { api, handlers } = extensionProbe();
		extensibleWorkflows(api as never);
		try {
			for (let index = 0; index < 12; index++) {
				expect(saveWorkflowDefinition(definition(`catalog-${index}`, "x".repeat(1_024)), "project", false, cwd).path).toBeDefined();
			}
			await Settings.init({ inMemory: true, cwd, overrides: { "magicKeywords.enabled": true, "magicKeywords.workflow": "workflowz" } });
			const beforeAgentStart = handlers.get("before_agent_start");
			const result = await beforeAgentStart!({ prompt: "Please use workflowz now.", systemPrompt: ["base"] }, { cwd, hasUI: false, ui: {}, sessionManager: { getBranch: () => [] } }) as { systemPrompt: string[] };
			const notice = result.systemPrompt.at(-1) ?? "";
			expect(new TextEncoder().encode(notice).byteLength).toBeLessThanOrEqual(8 * 1024);
		} finally {
			resetSettingsForTest();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("renders journal-authoritative aggregate statistics in the Runs tab", async () => {
		const cwd = tempCwd();
		const direct = createRun(cwd, "direct", {}, { routeRef: "route://direct", routeMode: "direct" });
		appendRunEvent(cwd, direct, { event: "completed", workflow: "direct", status: "completed" });
		const chain = createRun(cwd, "chain", {}, { routeRef: "route://chain", routeMode: "chain" });
		appendRunEvent(cwd, chain, { event: "completed", workflow: "chain", status: "completed" });
		const gateFailure = createRun(cwd, "gate", {});
		appendRunEvent(cwd, gateFailure, { event: "gate", workflow: "gate", stageId: "verify", gateId: "lint", status: "failed", report: { violations: ["lint failed"] } });
		appendRunEvent(cwd, gateFailure, { event: "failed", workflow: "gate", status: "failed" });
		const missingTool = createRun(cwd, "missing", {});
		appendRunEvent(cwd, missingTool, { event: "gate", workflow: "missing", stageId: "verify", gateId: "tool", status: "failed", report: { violations: ["command not found"], exitCode: 127 } });
		appendRunEvent(cwd, missingTool, { event: "failed", workflow: "missing", status: "failed" });
		const checkpoints = createRun(cwd, "checkpoints", {});
		appendRunEvent(cwd, checkpoints, { event: "checkpoint", workflow: "checkpoints", status: "approved" });
		appendRunEvent(cwd, checkpoints, { event: "checkpoint", workflow: "checkpoints", status: "rejected" });
		appendRunEvent(cwd, checkpoints, { event: "completed", workflow: "checkpoints", status: "completed" });
		const harness = overlayHarness(cwd);
		const pending = openWorkflowLibrary(harness.ctx as never, { listWorkflows: () => ({ scope: "effective", workflows: [], diagnostics: [] }) });
		try {
			await flush();
			const overlay = harness.overlays[0]?.component;
			expect(overlay).toBeDefined();
			overlay.handleInput(Key.right);
			overlay.handleInput(Key.right);
			const rendered = overlay.render(120).join("\n");
			expect(rendered).toContain("Runs");
			expect(rendered).toMatch(/total runs\D+5/i);
			expect(rendered).toMatch(/route plans\D+2/i);
			expect(rendered).toMatch(/chain completions\D+1/i);
			expect(rendered).toMatch(/gate failures\D+1/i);
			expect(rendered).toMatch(/missing-tool failures\D+1/i);
			expect(rendered).toMatch(/approved\D+1/i);
			expect(rendered).toMatch(/rejected\D+1/i);
		} finally {
			harness.resolve(undefined);
			await pending;
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("preserves quoted entered text across chain list and run-control completions", async () => {
		const cwd = tempCwd();
		const originalCwd = process.cwd();
		try {
			process.chdir(cwd);
			expect(saveWorkflowDefinition(definition("release-candidate"), "project", false, cwd).path).toBeDefined();
			expect(saveWorkflowDefinition(definition("deploy"), "project", false, cwd).path).toBeDefined();
			const runId = createRun(cwd, "deploy", {});
			const { api, commands } = extensionProbe();
			extensibleWorkflows(api as never);
			const complete = commands.get("workflows")?.getArgumentCompletions;
			expect(complete).toBeTypeOf("function");

			// A completed quoted recipe segment is preserved byte-for-byte.
			const chainItems = await complete!('chain "release-candidate" -> dep');
			expect(chainItems).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: 'chain "release-candidate" -> deploy ', label: "deploy", description: expect.any(String) }),
			]));

			// A quoted partial recipe token completes to a balanced quoted value
			// carrying the full typed prefix.
			const runQuoted = await complete!('run "rel');
			expect(runQuoted).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: 'run "release-candidate" ', label: "release-candidate", description: expect.any(String) }),
			]));

			// A single-quoted partial completes symmetrically: same quote opens
			// and closes (F3 judge regression).
			const runSingleQuoted = await complete!("run 'rel");
			expect(runSingleQuoted).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: "run 'release-candidate' ", label: "release-candidate", description: expect.any(String) }),
			]));

			// Run-control completion keeps every typed run-control token.
			const stopItems = await complete!(`stop ${runId.slice(0, 8)}`);
			expect(stopItems).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: `stop ${runId} `, label: runId, description: expect.any(String) }),
			]));
		} finally {
			process.chdir(originalCwd);
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("lists gate completion candidates with trust state without mutating gate files", async () => {
		const cwd = tempCwd();
		const originalCwd = process.cwd();
		try {
			process.chdir(cwd);
			const approvedGate = draftGate({ id: "approved-lint", version: "1.0.0", description: "Approved lint gate", kind: "exec", executable: "bun", args: ["run", "lint"] });
			const approved = approveGate(approvedGate);
			expect(saveGateFile(approved, "project", false, cwd).path).toBeDefined();
			const draft = draftGate({ id: "draft-check", version: "1.0.0", description: "Draft check gate", kind: "exec", executable: "bun", args: ["run", "check"] });
			expect(saveGateFile(draft, "project", false, cwd).path).toBeDefined();

			const { api, commands } = extensionProbe();
			extensibleWorkflows(api as never);
			const complete = commands.get("workflows")?.getArgumentCompletions;
			expect(complete).toBeTypeOf("function");
			const items = await complete!("list gates ");
			expect(items).toEqual(expect.arrayContaining([
				expect.objectContaining({ value: "list gates approved-lint ", label: "approved-lint", description: expect.stringContaining("approved"), hint: "prerequisites ready" }),
				expect.objectContaining({ value: "list gates draft-check ", label: "draft-check", description: expect.stringContaining("draft"), hint: "prerequisites unverified" }),
			]));
		} finally {
			process.chdir(originalCwd);
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});


function extensionProbeWithShortcuts(toolNames: string[] = ["eval", "task"]): { api: unknown; commands: Map<string, CommandSpec>; handlers: Map<string, Function>; shortcuts: Array<{ shortcut: string; options: unknown }>; renderers: Map<string, Function> } {
	const commands = new Map<string, CommandSpec>();
	const handlers = new Map<string, Function>();
	const shortcuts: Array<{ shortcut: string; options: unknown }> = [];
	const renderers = new Map<string, Function>();
	let schema: any;
	schema = new Proxy(() => schema, {
		get: (_target, property) => property === "then" ? undefined : schema,
		apply: () => schema,
	});
	return {
		api: {
			zod: schema,
			registerTool: () => {},
			registerCommand: (name: string, spec: CommandSpec) => commands.set(name, spec),
			on: (event: string, handler: Function) => handlers.set(event, handler),
			appendEntry: () => {},
			getAllTools: () => toolNames.map(name => ({ name, description: "", parameters: {}, sourceInfo: {} })),
			getActiveTools: () => toolNames,
			registerShortcut: (shortcut: string, options: unknown) => shortcuts.push({ shortcut, options }),
			registerMessageRenderer: (customType: string, renderer: Function) => renderers.set(customType, renderer),
		},
		commands,
		handlers,
		shortcuts,
		renderers,
	};
}

describe("workflowz TUI surfaces (TASK-15.4)", () => {
	test("library overlay v2 transitions tab state across Recipes Templates Runs Gates", async () => {
		const cwd = tempCwd();
		try {
			expect(saveWorkflowDefinition(definition("tab-recipe"), "project", false, cwd).path).toBeDefined();
			const approvedGate = approveGate(draftGate({ id: "tab-gate", version: "1.0.0", description: "Tab gate", kind: "exec", executable: "bun", args: ["run", "lint"] }));
			expect(saveGateFile(approvedGate, "project", false, cwd).path).toBeDefined();
			createRun(cwd, "tab-recipe", {});
			createRun(cwd, "tab-recipe", { note: "second" });
			const harness = overlayHarness(cwd);
			const pending = openWorkflowLibrary(harness.ctx as never, { listWorkflows: () => ({ scope: "effective", workflows: [{ name: "tab-recipe", description: "d", scope: "project" as const, path: join(cwd, "x.json") }], diagnostics: [] }) });
			await flush();
			const overlay = harness.overlays[0]?.component;
			expect(overlay.tabIndex).toBe(0);

			overlay.handleInput(Key.right);
			expect(overlay.render(120).join("\n")).toContain("Templates");
			overlay.handleInput(Key.left);
			overlay.handleInput(Key.right);
			overlay.handleInput(Key.right);
			expect(overlay.render(120).join("\n")).toContain("Runs");

			// Up at index 0 clamps; down moves the row marker within Runs.
			overlay.handleInput(Key.down);
			expect(overlay.selectedIndex).toBe(1);
			overlay.handleInput(Key.up);
			expect(overlay.selectedIndex).toBe(0);
			overlay.handleInput(Key.up);
			expect(overlay.selectedIndex).toBe(0);

			overlay.handleInput(Key.right);
			const gatesRender = overlay.render(120).join("\n");
			expect(gatesRender).toContain("Gates");
			expect(gatesRender).toContain("trust:");
			// Right is clamped at the last tab.
			overlay.handleInput(Key.right);
			expect(overlay.render(120).join("\n")).toContain("Gates");
			// Move the cursor onto tab-gate regardless of unrelated global entries,
			// then open its detail; Escape returns to the list.
			const gateLines: string[] = overlay.render(120).join("\n").split("\n");
			const firstRow = gateLines.findIndex((line: string) => line.trim().length > 0 && /^[>\s] [a-z]/.test(line));
			const gateRow = gateLines.findIndex((line: string, index: number) => index >= firstRow && line.includes("tab-gate"));
			expect(gateRow).toBeGreaterThanOrEqual(firstRow);
			for (let step = 0; step < gateRow - firstRow; step++) overlay.handleInput(Key.down);
			expect(overlay.render(120).join("\n")).toContain("> tab-gate");
			overlay.handleInput(Key.enter);
			expect(overlay.render(120).join("\n")).toContain("Gate: tab-gate");
			overlay.handleInput(Key.escape);
			expect(overlay.render(120).join("\n")).not.toContain("Gate: tab-gate");
			harness.resolve(undefined);
			await pending;
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("run strip caps widget content at ten lines and reports backing store", async () => {
		const { runStripLines, MAX_RUN_STRIP_LINES, buildRunSnapshot } = await import("../plugins/extensible-workflows/src/workflow-overlay.ts");
		const cwd = tempCwd();
		try {
			const runId = createRun(cwd, "strip", {}, { routeRef: "route://strip" });
			for (let stage = 0; stage < 12; stage++) {
				appendRunEvent(cwd, runId, { event: "stage_start", workflow: "strip", stageId: `stage-${stage}`, status: "running" });
				appendRunEvent(cwd, runId, { event: "gate", workflow: "strip", stageId: `stage-${stage}`, gateId: `gate-${stage}`, status: "failed", report: { violations: [`violation ${stage}`] } });
				appendRunEvent(cwd, runId, { event: "stage_complete", workflow: "strip", stageId: `stage-${stage}`, status: "running" });
			}
			const snapshot = buildRunSnapshot(cwd, runId);
			expect(snapshot).toBeDefined();
			const lines = runStripLines(snapshot, false);
			expect(lines.length).toBeLessThanOrEqual(MAX_RUN_STRIP_LINES);
			expect(MAX_RUN_STRIP_LINES).toBe(10);
			expect(lines[0]).toContain(`run ${runId.slice(0, 8)}`);
			expect(lines[0]).toContain("backing: workflow journal");
			const bothBacking = runStripLines(snapshot, true);
			expect(bothBacking[0]).toContain("workflow journal + native session snapshot");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers alt+w library and alt+shift+w run inspector shortcuts plus lifecycle card renderers", () => {
		const { api, shortcuts, renderers } = extensionProbeWithShortcuts();
		extensibleWorkflows(api as never);
		const keys = shortcuts.map(entry => entry.shortcut);
		expect(keys).toEqual(expect.arrayContaining(["alt+w", "alt+shift+w"]));
		expect(keys.filter(key => key === "alt+w")).toHaveLength(1);
		expect(keys.filter(key => key === "alt+shift+w")).toHaveLength(1);
		for (const entry of shortcuts) {
			if (entry.shortcut !== "alt+w" && entry.shortcut !== "alt+shift+w") continue;
			expect((entry.options as { handler?: unknown }).handler).toBeTypeOf("function");
		}
		for (const customType of [
			"ezxomp.workflowz.started",
			"ezxomp.workflowz.completed",
			"ezxomp.workflowz.failed",
			"ezxomp.workflowz.checkpoint",
		]) {
			expect(renderers.get(customType)).toBeTypeOf("function");
		}
	});

	test("/workflows <prompt> shows a strict route preview without executing", async () => {
		const cwd = tempCwd();
		const originalCwd = process.cwd();
		try {
			process.chdir(cwd);
			const previewA = { ...definition("preview-a"), inputs: { scope: { description: "Scope", required: true } } };
			expect(saveWorkflowDefinition(previewA, "project", false, cwd).path).toBeDefined();
			expect(saveWorkflowDefinition(definition("preview-b"), "project", false, cwd).path).toBeDefined();
			const { api, commands } = extensionProbeWithShortcuts();
			extensibleWorkflows(api as never);
			const handler = commands.get("workflows")?.handler;
			expect(handler).toBeTypeOf("function");

			const harness = overlayHarness(cwd);
			const pending = handler!("preview-a scope=x -> preview-b", harness.ctx as never);
			await new Promise(resolveTick => setTimeout(resolveTick, 0));
			const overlay = harness.overlays[0]?.component;
			expect(overlay).toBeDefined();
			const rendered = overlay.render(120).join("\n");
			expect(rendered).toContain("Route Preview");
			expect(rendered).toContain("preview-a");
			expect(rendered).toContain("preview-b");
			expect(rendered).toContain("chain");
			expect(rendered).toContain("Approval: required");
			expect(rendered).toContain("input scope=x");
			harness.resolve(undefined);
			await pending;

			// Free-form natural language is NOT a strict route: no preview overlay opens.
			const harness2 = overlayHarness(cwd);
			let notified: Array<{ message: string; level: string }> = [];
			(harness2.ctx.ui as { notify: (message: string, level: string) => void }).notify = (message: string, level: string) => { notified.push({ message, level }); };
			await handler!("please check everything carefully", harness2.ctx as never);
			expect(harness2.overlays).toHaveLength(0);
			expect(notified.some(entry => entry.level === "warning")).toBe(true);
			notified = [];
		} finally {
			process.chdir(originalCwd);
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("closing the run inspector clears the journal poll interval (F1)", async () => {
		const cwd = tempCwd();
		try {
			const runId = createRun(cwd, "leak-probe", {});
			appendRunEvent(cwd, runId, { workflow: "leak-probe", event: "stage_start", stageId: "verify", status: "running" });
			const harness = overlayHarness(cwd);
			const pending = openWorkflowRunOverlay(harness.ctx as never, runId);
			await flush();
			expect(harness.intervals).toHaveLength(1);

			// Escape closes the overlay; the poll must be cleared through the real close path.
			const overlay = harness.overlays[0]?.component;
			expect(overlay).toBeDefined();
			overlay.handleInput(Key.escape);
			harness.resolve(undefined);
			await pending;
			expect(harness.cleared).toHaveLength(1);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("library launch action sends the /workflows prompt via sendUserMessage (F2)", async () => {
		const cwd = tempCwd();
		try {
			expect(saveWorkflowDefinition(definition("launchable"), "project", false, cwd).path).toBeDefined();
			const sent: Array<{ content: string; options?: { deliverAs?: string } }> = [];
			const pi = { sendUserMessage: (content: string, options?: { deliverAs?: string }) => sent.push({ content, options }) };
			const harness = overlayHarness(cwd);
			const pending = openWorkflowLibrary(harness.ctx as never, { listWorkflows: () => ({ scope: "effective" as const, workflows: [{ name: "launchable", description: "d", scope: "project" as const, path: join(cwd, "x.json") }], diagnostics: [] }) }, pi as never);
			await flush();
			const overlay = harness.overlays[0]?.component;
			expect(overlay).toBeDefined();

			// `l` on the Recipes tab launches the selected recipe.
			overlay.handleInput("l");
			await flush();

			expect(sent).toHaveLength(1);
			expect(sent[0]!.content).toBe("/workflows run launchable");
			expect(sent[0]!.options?.deliverAs).toBe("followUp");
			expect(harness.notified.some(entry => entry.level === "info")).toBe(true);
			harness.resolve(undefined);
			await pending;
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("catalog cap truncates at UTF-8 boundaries without mojibake or character loss (F4)", () => {
		const euro = "€"; // 3 bytes U+20AC

		// Mid-character cut: output ends on a complete char, never U+FFFD.
		const mid = capNoticeBytes([`abcde ${euro.repeat(3)}`], 8);
		expect(mid).not.toContain("\uFFFD");
		for (const char of mid) expect(char.codePointAt(0)).not.toBe(0xFFFD);

		// Cut before an incomplete trailing sequence preserves every complete
		// character before it — including the separating space.
		const incomplete = capNoticeBytes([`abcde ${euro}`], 8); // € spans bytes 6-8; only 6-7 fit
		expect(incomplete).toBe("abcde ");
		expect(new TextEncoder().encode(incomplete).byteLength).toBeLessThanOrEqual(8);

		// A cut landing exactly at the end of a multi-byte char keeps that char.
		const boundary = capNoticeBytes([`ab${euro}cd`], 5); // € ends exactly at byte 5
		expect(boundary).toBe(`ab${euro}`);

		// A string fitting the cap is returned untouched.
		const fitsExactly = capNoticeBytes([`ab${euro}`], 5);
		expect(fitsExactly).toBe(`ab${euro}`);

		// Multi-byte content under the cap is returned byte-for-byte.
		const intact = capNoticeBytes([`${euro}${euro} ok`], 100);
		expect(intact).toBe(`${euro}${euro} ok`);

		// Whole-entry dropping still runs before truncation.
		const dropped = capNoticeBytes(["keep-1", "keep-2", "x".repeat(64)], 16);
		expect(dropped).toBe("keep-1\nkeep-2");

		// ASCII behavior unchanged.
		expect(capNoticeBytes(["plain ascii"], 4)).toBe("plai");
	});
});
