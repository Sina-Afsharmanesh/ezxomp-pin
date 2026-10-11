import { describe, expect, it } from "vitest";
import makePi, { __getToolHandler, __emitHook, __resetHandlers } from "./__mocks__/pi-coding-agent";

describe("@ezxomp/backlog extension", () => {
	it("registers the backlog_* tool suite on load", async () => {
		__resetHandlers();
		const mod = await import("../extensions/index.ts");
		const pi = makePi();
		mod.default(pi);
		const names = [...pi.__handlers.tools.keys()];
		expect(names.length).toBeGreaterThan(30);
		expect(names.filter((n) => n.startsWith("backlog_")).length).toBe(names.length);
		for (const required of [
			"backlog_task_create",
			"backlog_task_edit",
			"backlog_task_list",
			"backlog_doc_create",
			"backlog_search",
			"backlog_board_export",
		]) {
			expect(names).toContain(required);
		}
	});

	it("registers tool over the backlog CLI with cwd passthrough", async () => {
		const mod = await import("../extensions/index.ts");
		const pi = makePi();
		mod.default(pi);
		const handler = __getToolHandler("backlog_task_list");
		const result = (await handler.execute(
			"t1",
			{},
			new AbortController().signal,
			undefined,
			{ cwd: "/tmp/fake-cwd", hasUI: false } as never,
		)) as { content: Array<{ type: string; text: string }>; isError?: boolean };
		expect(pi.exec).toHaveBeenCalledWith(
			"backlog",
			expect.arrayContaining(["task", "list"]),
			expect.objectContaining({ cwd: "/tmp/fake-cwd" }),
		);
	});

	it("injects default overlay unconditionally before every agent start", async () => {
		const mod = await import("../extensions/index.ts");
		const pi = makePi();
		mod.default(pi);
		const results = await __emitHook(
			"before_agent_start",
			{ systemPrompt: ["base"] },
			{ cwd: "/tmp/x" },
		);
		expect(results.length).toBe(1);
		const overlay = results[0] as { systemPrompt: string[] };
		expect(overlay.systemPrompt[0]).toBe("base");
		expect(overlay.systemPrompt[1]).toContain("## Backlog.md Overview");
		expect(overlay.systemPrompt[1]).toContain("[BACKLOG.MD — Quality Standards]");
		expect(overlay.systemPrompt[1]).toContain("Task Creation Guide");
	});

	it("exports BACKLOG_QUALITY_STANDARDS byte-identical to cook's historical block", async () => {
		const mod = await import("../extensions/index.ts");
		expect(mod.BACKLOG_QUALITY_STANDARDS).toContain("Plans → backlog_task_edit --plan:");
		expect(mod.BACKLOG_QUALITY_STANDARDS).toContain(
			"Labels: feature/bug/refactor/design/architecture/spike/research/investigation — these select the workflow chain",
		);
	});
});
