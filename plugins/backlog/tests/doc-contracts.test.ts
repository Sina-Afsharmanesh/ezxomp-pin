import { describe, expect, it } from "vitest";
import { registerBacklogTools } from "../extensions/tools.ts";

type Result = { content: Array<{ text: string }>; isError: boolean };
type Tool = { name: string; execute: (id: string, params: unknown, signal: undefined, update: undefined, ctx: { cwd: string }) => Promise<Result> };

function register(exec: (command: string, args: string[], opts: { cwd: string }) => Promise<{ code: number; stdout: string; stderr: string }>) {
	const tools = new Map<string, Tool>();
	registerBacklogTools({ registerTool: (tool: Tool) => tools.set(tool.name, tool), exec } as never, { currentCwd: "/fixture" });
	return tools;
}

describe("document completion and metadata", () => {
	it("reports partial creation failure and preserves created ID for retry", async () => {
		const documents = new Map<string, string>();
		const tools = register(async (_command, args) => {
			if (args[1] === "create") {
				documents.set("doc-1", "");
				return { code: 0, stdout: "Created document doc-1", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "fixture content write failed" };
		});
		const result = await tools.get("backlog_doc_create")!.execute("id", { title: "Report", content: "Evidence", type: "report" }, undefined, undefined, { cwd: "/fixture" });
		expect(result.isError).toBe(true);
		expect(documents.get("doc-1")).toBe("");
		expect(result.content[0].text).toContain("doc-1");
		expect(result.content[0].text).toContain("doc update");
	});

	it("reports unknown creation identity as incomplete rather than claiming saved content", async () => {
		const tools = register(async () => ({ code: 0, stdout: "Created without parseable ID", stderr: "" }));
		const result = await tools.get("backlog_doc_create")!.execute("id", { title: "Report", content: "Evidence", type: "report" }, undefined, undefined, { cwd: "/fixture" });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("content was not saved");
	});
});
