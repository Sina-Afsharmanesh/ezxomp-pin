import { describe, expect, test } from "bun:test";
import { Key, Spacer } from "@oh-my-pi/pi-tui";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKFLOW_INDEX = join(ROOT, "plugins", "extensible-workflows", "src", "index.ts");
const SKILLFORGE_INDEX = join(ROOT, "plugins", "agent-learning", "src", "procedures", "extension.ts");
const PROMOTION_MODULE = join(ROOT, "plugins", "agent-learning", "src", "procedures", "promotion", "promotion.ts");

const theme = { fg: (_name: string, text: string) => text };

function makeHarness(hasUI = true) {
	const customs: Array<{ component: any; options: unknown }> = [];
	const overlays: Array<{ component: any; options: unknown; hidden: boolean }> = [];
	const notifications: Array<{ message: string; level: string }> = [];
	const { promise, resolve: resolveCustom } = Promise.withResolvers<unknown>();
	const tui = {
		showOverlay(component: any, options: unknown) {
			const record = { component, options, hidden: false };
			overlays.push(record);
			return { hide: () => { record.hidden = true; } };
		},
		setFocus() {},
		requestRender() {},
	};
	const ctx = {
		hasUI,
		cwd: "/isolated/project",
		editor: {},
		editorContainer: { clear() {}, addChild() {} },
		ui: {
			custom<T>(factory: (tui: unknown, theme: unknown, done: (value?: T) => void) => any, options?: unknown): Promise<T> {
				let component: any;
				component = factory(tui, theme, (value?: T) => resolveCustom(value));
				customs.push({ component, options });
				return promise as Promise<T>;
			},
			notify(message: string, level: string) { notifications.push({ message, level }); },
			confirm: async () => false,
		},
	} as any;
	return { ctx, customs, overlays, notifications, resolveCustom };
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function mountedOverlay(harness: ReturnType<typeof makeHarness>): any {
	expect(harness.customs[0]?.component).toBeDefined();
	expect(harness.overlays[0]?.component).toBeDefined();
	expect(harness.customs[0]?.component).not.toBe(harness.overlays[0]?.component);
	const placeholder = harness.customs[0]?.component;
	expect(placeholder).toBeInstanceOf(Spacer);
	expect(placeholder.render(100)).toEqual([]);
	return harness.overlays[0]?.component;
}

const workflow = {
	schemaVersion: 1 as const,
	name: "release",
	description: "Build and publish the release",
	inputs: { environment: { description: "Deployment environment", required: true } },
	stages: [{
		id: "build",
		label: "Build",
		tasks: [{ id: "compile", agent: "builder", prompt: "Compile for {{environment}}" }],
	}],
};

const workflowList = {
	scope: "effective" as const,
	workflows: [{ name: workflow.name, description: workflow.description, scope: "project" as const, path: "/isolated/project/.omp/workflows/release.json" }],
	diagnostics: [{ path: "/isolated/project/.omp/workflows/broken.json", code: "WORKFLOW_INVALID", message: "invalid JSON" }],
};

describe("workflow-library centered overlay", () => {
	test("interactive branch hosts a centered overlay, reports diagnostics, inspects selection, and closes", async () => {
		const mod = await import(WORKFLOW_INDEX);
		expect(typeof (mod as any).openWorkflowLibrary).toBe("function");
		const harness = makeHarness(true);
		const pending = (mod as any).openWorkflowLibrary(harness.ctx, {
			listWorkflows: () => workflowList,
			resolveWorkflow: () => ({ workflow }),
		});
		await flush();

		expect(harness.customs[0]?.options).toEqual({ overlay: false });
		expect((harness.overlays[0]?.options as any)?.anchor).toBe("center");
		const overlay = mountedOverlay(harness);
		expect(overlay.render(120).join("\n")).toContain("release");
		expect(overlay.render(120).join("\n")).toContain("broken.json");

		overlay.handleInput(Key.enter);
		const detail = overlay.render(120).join("\n");
		expect(detail).toContain("environment");
		expect(detail).toContain("Build");
		expect(detail).toContain("compile");
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("empty interactive workflow data renders an empty state without invoking mutation APIs", async () => {
		const mod = await import(WORKFLOW_INDEX);
		expect(typeof (mod as any).openWorkflowLibrary).toBe("function");
		const harness = makeHarness(true);
		let saves = 0;
		let renders = 0;
		const pending = (mod as any).openWorkflowLibrary(harness.ctx, {
			listWorkflows: () => ({ scope: "effective", workflows: [], diagnostics: [] }),
			resolveWorkflow: () => ({ workflow }),
			saveWorkflow: () => { saves++; },
			renderWorkflow: () => { renders++; },
		});
		await flush();
		const overlay = mountedOverlay(harness);
		expect(saves).toBe(0);
		expect(renders).toBe(0);
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("headless workflow output stays on the existing notify path", async () => {
		const mod = await import(WORKFLOW_INDEX);
		expect(typeof (mod as any).openWorkflowLibrary).toBe("function");
		const harness = makeHarness(false);
		await (mod as any).openWorkflowLibrary(harness.ctx, { listWorkflows: () => workflowList });
		expect(harness.customs).toHaveLength(0);
		expect(harness.notifications[0]?.message).toContain("Saved Workflow Recipes:");
		expect(harness.notifications[0]?.message).toContain("release");
	});
});

const memoryReport = {
	partition: "project" as const,
	projectId: "project-a",
	path: "~/skillforge/memory/projects/project-a/gotchas/safe.md",
	absolutePath: "/private/agent/skillforge/memory/projects/project-a/gotchas/safe.md",
	valid: true,
	errors: [],
	entry: {
		id: "safe-memory",
		type: "gotcha" as const,
		title: "Use the safe import boundary",
		scope: { projects: ["project-a"] },
		confidence: "confirmed" as const,
		hits: 3,
		created_at: "2026-07-01",
		updated_at: "2026-07-02",
		trigger: ["PRIVATE_TRIGGER_SHOULD_NOT_RENDER"],
		symptom: ["PRIVATE_SYMPTOM_SHOULD_NOT_RENDER"],
		root_cause: ["PRIVATE_ROOT_CAUSE_SHOULD_NOT_RENDER"],
		fix: ["PRIVATE_FIX_SHOULD_NOT_RENDER"],
		verification: ["PRIVATE_EVIDENCE_SHOULD_NOT_RENDER"],
	},
};

const malformedMemory = {
	partition: "global" as const,
	path: "~/skillforge/memory/global/broken.md",
	absolutePath: "/private/agent/skillforge/memory/global/broken.md",
	valid: false,
	errors: ["invalid memory entry"],
};

const proposal = {
	version: 1 as const,
	id: "proposal-1",
	status: "pending" as const,
	partition: "global" as const,
	target_skill: "omp-extensions",
	target_path: "/private/agent/skills/omp-extensions/SKILL.md",
	source_memory_id: "safe-memory",
	source_memory_path: "/private/agent/skillforge/memory/global/gotchas/safe.md",
	memory_title: "Use the safe import boundary",
	memory_type: "gotcha",
	proposed_guidance: "Use the approved import boundary.",
	rationale: "The confirmed memory recurred three times.",
	verification: ["Typecheck passed", "Package load passed"],
	created_at: "2026-07-02",
	updated_at: "2026-07-02",
};

const persistedProposalFixture = JSON.stringify(proposal);

describe("skillforge centered memory and proposal overlays", () => {
	test("memory browser applies filters, shows safe detail metadata, and hides raw private content", async () => {
		const mod = await import(SKILLFORGE_INDEX);
		expect(typeof (mod as any).openSkillforge).toBe("function");
		const harness = makeHarness(true);
		const pending = (mod as any).openSkillforge("list project gotchas", harness.ctx, {
			listMemoryReports: async () => [memoryReport, malformedMemory],
		});
		await flush();

		expect(harness.customs[0]?.options).toEqual({ overlay: false });
		expect((harness.overlays[0]?.options as any)?.anchor).toBe("center");
		const overlay = mountedOverlay(harness);
		const list = overlay.render(120).join("\n");
		expect(list).toContain("safe-memory");
		expect(list).toContain("Skipped");
		expect(list).not.toContain(malformedMemory.absolutePath);
		overlay.handleInput(Key.enter);
		const detail = overlay.render(120).join("\n");
		expect(detail).toContain("Use the safe import boundary");
		expect(detail).toContain(memoryReport.path);
		expect(detail).not.toContain(memoryReport.absolutePath);
		expect(detail).not.toContain("PRIVATE_TRIGGER_SHOULD_NOT_RENDER");
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("memory deletion requires explicit approval and preserves decline before successful mutation", async () => {
		const mod = await import(SKILLFORGE_INDEX);
		expect(typeof (mod as any).openSkillforge).toBe("function");
		const harness = makeHarness(true);
		let deleted = 0;
		let approved = false;
		harness.ctx.ui.confirm = async () => approved;
		const pending = (mod as any).openSkillforge("list project gotchas", harness.ctx, {
			listMemoryReports: async () => [memoryReport],
			deleteMemoryById: async () => { deleted++; return { report: memoryReport, indexEntryCount: 0 }; },
		});
		await flush();
		const overlay = mountedOverlay(harness);
		overlay.handleInput("d");
		await flush();
		expect(deleted).toBe(0);
		expect(harness.notifications.some((item) => item.message.includes("Did not delete memory safe-memory."))).toBe(true);
		approved = true;
		overlay.handleInput("d");
		await flush();
		expect(deleted).toBe(1);
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("memory deletion errors surface without reporting success", async () => {
		const mod = await import(SKILLFORGE_INDEX);
		const harness = makeHarness(true);
		harness.ctx.ui.confirm = async () => true;
		let attempts = 0;
		const pending = (mod as any).openSkillforge("list project gotchas", harness.ctx, {
			listMemoryReports: async () => [memoryReport],
			deleteMemoryById: async () => {
				attempts++;
				throw new Error("index rebuild failed");
			},
		});
		await flush();
		const overlay = mountedOverlay(harness);
		overlay.handleInput("d");
		await flush();
		expect(attempts).toBe(1);
		expect(harness.notifications.some((item) => item.level === "error" && item.message.includes("index rebuild failed"))).toBe(true);
		expect(harness.notifications.some((item) => item.message.startsWith("Deleted "))).toBe(false);
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("proposal review renders target, rationale, and evidence and applies only after confirmation", async () => {
		const mod = await import(SKILLFORGE_INDEX);
		expect(typeof (mod as any).openSkillforge).toBe("function");
		const harness = makeHarness(true);
		let applied = 0;
		let approved = false;
		harness.ctx.ui.confirm = async () => approved;
		const pending = (mod as any).openSkillforge("review omp-extensions", harness.ctx, {
			listPendingProposals: async () => [JSON.parse(persistedProposalFixture)],
			applyProposal: async () => { applied++; return { ...proposal, status: "applied" }; },
		});
		await flush();
		const overlay = mountedOverlay(harness);
		const review = overlay.render(120).join("\n");
		expect(review).toContain("omp-extensions");
		expect(review).toContain("The confirmed memory recurred three times.");
		expect(review).toContain("Typecheck passed");
		expect(review).not.toContain(proposal.source_memory_path);
		overlay.handleInput(Key.enter);
		await flush();
		expect(applied).toBe(0);
		approved = true;
		overlay.handleInput(Key.enter);
		await flush();
		expect(applied).toBe(1);
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});

	test("proposal apply failures surface an actionable error without auto-mutating", async () => {
		const mod = await import(SKILLFORGE_INDEX);
		expect(typeof (mod as any).openSkillforge).toBe("function");
		const harness = makeHarness(true);
		harness.ctx.ui.confirm = async () => true;
		const pending = (mod as any).openSkillforge("review omp-extensions", harness.ctx, {
			listPendingProposals: async () => [JSON.parse(persistedProposalFixture)],
			applyProposal: async () => { throw new Error("target skill file not found"); },
		});
		await flush();
		const overlay = mountedOverlay(harness);
		overlay.handleInput(Key.enter);
		await flush();
		expect(harness.notifications.some((item) => item.message.includes("target skill file not found"))).toBe(true);
		overlay.handleInput(Key.escape);
		harness.resolveCustom();
		await pending;
	});
});

test("applyProposal rejects an untrusted target outside the canonical skill path", async () => {
	const { applyProposal } = await import(PROMOTION_MODULE);
	await expect(applyProposal({
		...JSON.parse(persistedProposalFixture),
		id: "proposal-outside-target",
		target_path: "/tmp/skillforge-untrusted/SKILL.md",
	})).rejects.toThrow(/outside canonical target path/i);
});

test("proposal review redacts absolute home source paths before display formatting", async () => {
	const { formatProposalForReview } = await import(PROMOTION_MODULE);
	const sourcePath = join(homedir(), "skillforge", "memory", "global", "gotchas", "private.md");
	const rendered = formatProposalForReview({
		...JSON.parse(persistedProposalFixture),
		source_memory_path: sourcePath,
	});
	expect(rendered).toContain("Source path: (redacted)");
	expect(rendered).not.toContain(sourcePath);
});

test("applyProposal rejects target-skill traversal before filesystem access", async () => {
	const { applyProposal } = await import(PROMOTION_MODULE);
	const { getAgentDir } = await import("@oh-my-pi/pi-utils");
	const targetSkill = "../__skillforge_test_escape__";
	const targetPath = resolve(getAgentDir(), "skills", targetSkill, "SKILL.md");
	await expect(applyProposal({
		...JSON.parse(persistedProposalFixture),
		id: "proposal-traversal-target",
		target_skill: targetSkill,
		target_path: targetPath,
	})).rejects.toThrow(/outside canonical target path/i);
});

test("skillforge_capture_memory requires write approval for filesystem mutation", async () => {
	const mod = await import(SKILLFORGE_INDEX);
	const tools: any[] = [];
	const pi = {
		zod: new Proxy({}, { get: () => () => fakeSchema() }),
		on() {},
		registerTool(tool: any) { tools.push(tool); },
		registerCommand() {},
	} as any;
	((mod as any).proceduresExtension ?? (mod as any).default)(pi);
	const capture = tools.find((tool) => tool.name === "skillforge_capture_memory");
	expect(capture).toBeDefined();
	expect(capture.approval).toBe("write");
});

function fakeSchema(): any {
	const schema: Record<string, any> = {};
	for (const method of ["array", "default", "describe", "int", "min", "optional"]) {
		schema[method] = () => schema;
	}
	return schema;
}
