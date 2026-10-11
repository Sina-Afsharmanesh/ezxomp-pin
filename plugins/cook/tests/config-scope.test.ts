import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	defaultModelConfig,
	describeModel,
	getCookConfigScope,
	listModels,
	loadModelConfig,
	providerFamily,
	resolveCookConfig,
	saveModelConfig,
	validateModelSelection,
} from "../extensions/config.ts";
import type { ModelConfig } from "../extensions/types.ts";

let workDir: string;
let homeDir: string;

const HOME_ENV = { OMP_HOME: "" as string };

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "cook-config-project-"));
	homeDir = mkdtempSync(path.join(tmpdir(), "cook-config-home-"));
	HOME_ENV.OMP_HOME = homeDir;
	process.env.OMP_HOME = homeDir;
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
	rmSync(homeDir, { recursive: true, force: true });
	delete process.env.OMP_HOME;
});

function projectProfile(role: string, content: string): string {
	const dir = path.join(workDir, ".omp", "agents");
	mkdirSync(dir, { recursive: true });
	const p = path.join(dir, `cook-${role}.md`);
	writeFileSync(p, content);
	return p;
}

function personalProfile(role: string, content: string): string {
	const dir = path.join(homeDir, "agents");
	mkdirSync(dir, { recursive: true });
	const p = path.join(dir, `cook-${role}.md`);
	writeFileSync(p, content);
	return p;
}

function profileWithModel(role: string, model: string | null, extra = ""): string {
	const fm = model === null ? `name: cook-${role}` : `name: cook-${role}\nmodel: ${model}`;
	return `---\n${fm}\n---\n\nbody${extra}\n`;
}

describe("resolveCookConfig precedence (TASK-36)", () => {
	it("reads project profile before personal and global", () => {
		projectProfile("worker", profileWithModel("worker", "project/model-a"));
		personalProfile("worker", profileWithModel("worker", "personal/model-b"));
		const resolved = resolveCookConfig(workDir);
		expect(resolved.config.worker).toBe("project/model-a");
		expect(resolved.sources.worker?.scope).toBe("project");
	});

	it("falls back to personal then global when project profile missing", () => {
		personalProfile("scout", profileWithModel("scout", "personal/model-b"));
		const resolved = resolveCookConfig(workDir);
		expect(resolved.config.scout).toBe("personal/model-b");
		expect(resolved.sources.scout?.scope).toBe("personal");
		expect(resolved.fallback).toBe("personal");
	});

	it("a profile without model key inherits session model and stops fallback", () => {
		projectProfile("planner", profileWithModel("planner", null));
		personalProfile("planner", profileWithModel("planner", "personal/model-x"));
		const resolved = resolveCookConfig(workDir);
		expect(resolved.config.planner).toBeNull();
		expect(resolved.sources.planner?.scope).toBe("project");
	});

	it("reads legacy backlog/cook-config.json last", () => {
		mkdirSync(path.join(workDir, "backlog"), { recursive: true });
		writeFileSync(
			path.join(workDir, "backlog", "cook-config.json"),
			JSON.stringify({ worker: "legacy/model-z" }),
		);
		const resolved = resolveCookConfig(workDir);
		expect(resolved.config.worker).toBe("legacy/model-z");
		expect(resolved.sources.worker?.scope).toBe("legacy");
	});

	it("warns on invalid profile frontmatter instead of failing", () => {
		projectProfile("judge", "not frontmatter at all\n");
		const resolved = resolveCookConfig(workDir);
		expect(resolved.config.judge).toBeNull();
		expect(resolved.warnings.some((w) => w.includes("invalid frontmatter"))).toBe(true);
	});
});

describe("saveModelConfig project-default write scope (TASK-36)", () => {
	it("writes to project-local profiles by default and round-trips", () => {
		const config: ModelConfig = { ...defaultModelConfig(), worker: "openai/gpt-x" };
		const info = saveModelConfig(workDir, config);
		expect(info.scope).toBe("project");
		expect(info.directory.startsWith(workDir)).toBe(true);
		const p = path.join(info.directory, "cook-worker.md");
		expect(readFileSync(p, "utf-8")).toContain("model: openai/gpt-x");
		// Cross-surface round-trip: resolver reads back the same value
		expect(loadModelConfig(workDir).worker).toBe("openai/gpt-x");
	});

	it("seeds missing project profile from shipped template preserving body", () => {
		saveModelConfig(workDir, { ...defaultModelConfig(), judge: "openai/gpt-j" });
		const p = path.join(workDir, ".omp", "agents", "cook-judge.md");
		const content = readFileSync(p, "utf-8");
		expect(content).toContain("model: openai/gpt-j");
		expect(content).toContain("name: cook-judge");
		expect(content).toContain("---");
	});

	it("preserves existing frontmatter tools and body when updating", () => {
		projectProfile(
			"worker",
			`---\nname: cook-worker\ndescription: "custom"\ntools: read\nmodel: old/m\n---\n\nMY BODY\n`,
		);
		saveModelConfig(workDir, { ...defaultModelConfig(), worker: "new/m" });
		const content = readFileSync(path.join(workDir, ".omp", "agents", "cook-worker.md"), "utf-8");
		expect(content).toContain("tools: read");
		expect(content).toContain("MY BODY");
		expect(content).toContain("model: new/m");
		expect(content).not.toContain("old/m");
	});

	it("clears model when config value is null (inherit session)", () => {
		projectProfile("worker", profileWithModel("worker", "old/m"));
		saveModelConfig(workDir, { ...defaultModelConfig(), worker: null });
		const content = readFileSync(path.join(workDir, ".omp", "agents", "cook-worker.md"), "utf-8");
		expect(content).not.toContain("model:");
	});

	it("personal scope writes only when explicitly requested", () => {
		saveModelConfig(workDir, { ...defaultModelConfig(), scout: "a/b" }, "personal");
		expect(readFileSync(path.join(homeDir, "agents", "cook-scout.md"), "utf-8")).toContain("model: a/b");
		expect(loadModelConfig(workDir).scout).toBe("a/b"); // project missing → personal resolves
	});
});

describe("cross-project isolation (TASK-36)", () => {
	it("configuring one project does not leak into another project", () => {
		const otherDir = mkdtempSync(path.join(tmpdir(), "cook-config-other-"));
		try {
			saveModelConfig(workDir, { ...defaultModelConfig(), worker: "proj-one/m" });
			const otherResolved = resolveCookConfig(otherDir);
			expect(otherResolved.config.worker).toBeNull();
			// other project writes are independent
			saveModelConfig(otherDir, { ...defaultModelConfig(), worker: "proj-two/m" });
			expect(loadModelConfig(workDir).worker).toBe("proj-one/m");
			expect(loadModelConfig(otherDir).worker).toBe("proj-two/m");
		} finally {
			rmSync(otherDir, { recursive: true, force: true });
		}
	});
});

describe("provider family display (TASK-35)", () => {
	it("normalizes known provider families", () => {
		expect(providerFamily("openai")).toBe("OpenAI");
		expect(providerFamily("openai-codex")).toBe("OpenAI Codex");
		expect(providerFamily("opencode")).toBe("OpenCode");
		expect(providerFamily("opencode-go")).toBe("OpenCode Go");
		expect(providerFamily("cohere")).toBe("Cohere Command");
		expect(providerFamily("meta-llama")).toBe("Llama");
		expect(providerFamily("nanogpt")).toBe("NanoGPT");
	});

	it("keeps unknown providers visible with normalized labels", () => {
		expect(providerFamily("someNewProvider")).toBe("Some New Provider");
		expect(providerFamily("weird_provider")).toBe("Weird Provider");
	});

	it("groups models by family and marks duplicate ids", () => {
		const ctx = {
			models: {
				list: () => [
					{ id: "same-id", name: "One", provider: "openai" },
					{ id: "same-id", name: "Two", provider: "opencode" },
					{ id: "unique", name: "Three", provider: "nanogpt" },
				],
				resolve: () => undefined,
			},
		} as never;
		const entries = listModels(ctx);
		expect(entries).toHaveLength(3);
		const dupes = entries.filter((e) => e.id === "same-id");
		for (const d of dupes) expect(d.label).toContain("[");
		expect(dupes.map((d) => d.selection).sort()).toEqual(["openai/same-id", "opencode/same-id"]);
	});
});

describe("validateModelSelection (TASK-36 AC5)", () => {
	const makeCtx = (models: unknown[]) =>
		({ models: { list: () => models, resolve: () => undefined } }) as never;

	it("accepts exact provider/id selection", () => {
		const ctx = makeCtx([{ id: "m", name: "", provider: "openai" }, { id: "m", name: "", provider: "opencode" }]);
		const v = validateModelSelection(ctx, "openai/m");
		expect(v.valid).toBe(true);
		expect(v.value).toBe("openai/m");
	});

	it("accepts unique bare id", () => {
		const ctx = makeCtx([{ id: "solo", name: "", provider: "openai" }]);
		const v = validateModelSelection(ctx, "solo");
		expect(v.valid).toBe(true);
		expect(v.value).toBe("solo");
	});

	it("rejects ambiguous bare id across providers", () => {
		const ctx = makeCtx([{ id: "m", name: "", provider: "openai" }, { id: "m", name: "", provider: "opencode" }]);
		const v = validateModelSelection(ctx, "m");
		expect(v.valid).toBe(false);
		expect(v.reason).toContain("ambiguous");
	});

	it("rejects unknown values clearly", () => {
		const ctx = makeCtx([]);
		const v = validateModelSelection(ctx, "nope");
		expect(v.valid).toBe(false);
		expect(v.reason).toContain("unknown");
	});

	it("synthesizes entry for alias resolved by ctx.models.resolve", () => {
		const ctx = {
			models: {
				list: () => [],
				resolve: (spec: string) => (spec === "@slow" ? { id: "big", name: "Big", provider: "openai" } : undefined),
			},
		} as never;
		const v = validateModelSelection(ctx, "@slow");
		expect(v.valid).toBe(true);
		expect(v.entry?.family).toBe("OpenAI");
	});
});

describe("describeModel", () => {
	it("distinguishes inherited vs explicit", () => {
		expect(describeModel(null)).toBe("(inherits session model)");
		expect(describeModel("openai/gpt")).toBe("openai/gpt");
	});
});

describe("runModelConfigWizard headless (TASK-36 no-UI fallback)", () => {
	it("returns resolved config unchanged without UI and writes nothing", async () => {
		const { runModelConfigWizard } = await import("../extensions/config.ts");
		const config: ModelConfig = { ...defaultModelConfig(), worker: "openai/gpt-x" };
		saveModelConfig(workDir, config);
		const ctx = { hasUI: false, ui: {}, models: { list: () => [], resolve: () => undefined } } as never;
		const result = await runModelConfigWizard(ctx, workDir);
		expect(result.worker).toBe("openai/gpt-x");
	});

	it("wizard picks inherit-session and persists null", async () => {
		const { runModelConfigWizard } = await import("../extensions/config.ts");
		const select = async () => "\u21ba Inherit session model";
		const ctx = { hasUI: true, ui: { select }, models: { list: () => [{ id: "m", name: "", provider: "openai" }], resolve: () => undefined } } as never;
		const result = await runModelConfigWizard(ctx, workDir);
		expect(result.planner).toBeNull();
		const content = readFileSync(path.join(workDir, ".omp", "agents", "cook-planner.md"), "utf-8");
		expect(content).not.toContain("model:");
	});
});

describe("cook_config tool cross-surface round-trip (TASK-36)", () => {
	it("tool writes project profile and resolver reads back the same value", async () => {
		const { registerCookTools } = await import("../extensions/cook-tools.ts");
		const { createStoreContext } = await import("../extensions/state.ts");
		const makePi = (await import("./__mocks__/pi-coding-agent")).default;
		const { makeCtx, __getToolHandler, __resetHandlers } = await import("./__mocks__/pi-coding-agent");
		__resetHandlers();
		const pi = makePi();
		const sc = createStoreContext();
		registerCookTools(pi as never, sc);
		const tool = __getToolHandler("cook_config");
		expect(tool).toBeTruthy();
		const handler = tool.execute.bind(tool);
		const ctx = makeCtx({ cwd: workDir, hasUI: false });
		(ctx as Record<string, unknown>).models = { list: () => [{ id: "gpt-x", name: "", provider: "openai" }], resolve: () => undefined };
		const result = await handler("t1", { role: "worker", model: "openai/gpt-x" }, undefined, undefined, ctx);
		expect(result.isError).toBeUndefined();
		expect(loadModelConfig(workDir).worker).toBe("openai/gpt-x");
		// Second surface: resolver readback (slash command uses same path)
		expect(resolveCookConfig(workDir).config.worker).toBe("openai/gpt-x");
	});

	it("tool rejects invalid model values clearly", async () => {
		const { registerCookTools } = await import("../extensions/cook-tools.ts");
		const { createStoreContext } = await import("../extensions/state.ts");
		const makePi = (await import("./__mocks__/pi-coding-agent")).default;
		const { makeCtx, __getToolHandler, __resetHandlers } = await import("./__mocks__/pi-coding-agent");
		__resetHandlers();
		const pi = makePi();
		registerCookTools(pi as never, createStoreContext());
		const tool = __getToolHandler("cook_config");
		const handler = tool.execute.bind(tool);
		const ctx = makeCtx({ cwd: workDir, hasUI: false });
		(ctx as Record<string, unknown>).models = { list: () => [{ id: "gpt-x", name: "", provider: "openai" }], resolve: () => undefined };
		const result = await handler("t2", { role: "worker", model: "definitely/not-a-model-xyz" }, undefined, undefined, ctx);
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Invalid model");
	});
});
