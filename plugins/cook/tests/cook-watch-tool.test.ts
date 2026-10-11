import { describe, expect, it, beforeEach } from "vitest";
import makePi, {
	__resetHandlers,
	__getToolHandler,
	makeCtx,
	type ToolDefinition,
} from "./__mocks__/pi-coding-agent";

// Exercises the pi.registerTool('cook_watch', ...) surface that the
// implementation must add next to the other cook_* tools.

async function invoke(
	tool: ToolDefinition,
	params: Record<string, unknown>,
	ctx = makeCtx({ cwd: "/tmp/ezxomp-cook-watch-tool" }),
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
});

describe("cook_watch tool", () => {
	it("is registered under the name cook_watch", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		expect(() => __getToolHandler("cook_watch")).not.toThrow();
	});

	it("start without an active cook chain returns isError", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		const r = await invoke(t, { action: "start" });
		expect(r.isError).toBe(true);
		const text = r.content.map((c) => c.text).join(" ");
		expect(text.toLowerCase()).toMatch(/cook_start|no.*(chain|workflow)/);
	});

	it("status reports disabled before start", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const t = __getToolHandler("cook_watch");
		const r = await invoke(t, { action: "status" });
		const text = r.content.map((c) => c.text).join(" ");
		expect(text.toLowerCase()).toContain("disabled");
	});
	// The enabled-path tests live in cook-watch-fs.test.ts where fs.watch is
	// mocked; here we focus on contract: registration, schema, failure modes.
});
