import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import makePi, {
	__resetHandlers,
	__getToolHandler,
	makeCtx,
	type ToolDefinition,
} from "./__mocks__/pi-coding-agent";

let workDir: string;

async function invoke(
	tool: ToolDefinition,
	params: Record<string, unknown>,
	ctx = makeCtx({ cwd: workDir }),
): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
	const out = (await tool.execute?.(
		"test-id",
		params,
		new AbortController().signal,
		null,
		ctx,
	)) as { isError?: boolean; content: Array<{ type: string; text: string }> };
	return out;
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-watch-tasks-"));
	mkdirSync(path.join(workDir, "backlog"), { recursive: true });
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("cook_watch add_tasks/remove_tasks/list_tasks", () => {
	it("add_tasks registers task IDs in watch list", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		const r = await invoke(t, { action: "add_tasks", tasks: ["TASK-100", "TASK-101"] });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text).toContain("2 task(s)");
		expect(text).toContain("TASK-100");
		expect(text).toContain("TASK-101");
	});

	it("add_tasks without tasks param returns error", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		const r = await invoke(t, { action: "add_tasks" });
		expect(r.isError).toBe(true);
	});

	it("add_tasks is idempotent — re-adding returns 'already watched'", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		await invoke(t, { action: "add_tasks", tasks: ["TASK-200"] });
		const r = await invoke(t, { action: "add_tasks", tasks: ["TASK-200"] });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text.toLowerCase()).toContain("already watched");
	});

	it("remove_tasks removes from watch list", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		await invoke(t, { action: "add_tasks", tasks: ["TASK-300"] });
		const r = await invoke(t, { action: "remove_tasks", tasks: ["TASK-300"] });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text).toContain("1 task(s)");
		expect(text).toContain("TASK-300");
		// Verify list is empty
		const list = await invoke(t, { action: "list_tasks" });
		const listText = list.content.map((c) => c.text).join(" ");
		expect(listText.toLowerCase()).toContain("no tasks");
	});

	it("remove_tasks for non-watched returns 'none were watched'", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		const r = await invoke(t, { action: "remove_tasks", tasks: ["TASK-999"] });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text.toLowerCase()).toContain("none");
	});

	it("list_tasks shows watched tasks with status", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		await invoke(t, { action: "add_tasks", tasks: ["TASK-400", "TASK-401"] });
		const r = await invoke(t, { action: "list_tasks" });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text).toContain("2 task(s)");
		expect(text).toContain("TASK-400");
		expect(text).toContain("TASK-401");
	});

	it("add_tasks uppercases task IDs for consistent keys", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		await invoke(t, { action: "add_tasks", tasks: ["task-500"] });
		const r = await invoke(t, { action: "list_tasks" });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text).toContain("TASK-500");
	});
});
