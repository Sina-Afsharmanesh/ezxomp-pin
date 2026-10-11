import { describe, expect, test } from "bun:test";
import extensibleWorkflows from "../plugins/extensible-workflows/src/index.ts";

type CommandSpec = {
	getArgumentCompletions?: (argumentPrefix: string) => Promise<Array<{ value: string }>> | Array<{ value: string }>;
};

function createExtensionApiProbe(): { api: unknown; commands: Map<string, CommandSpec> } {
	const commands = new Map<string, CommandSpec>();
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
			on: () => {},
		},
		commands,
	};
}

describe("workflowz command", () => {
	test("preserves a nested chain prefix in argument completions", async () => {
		const { api, commands } = createExtensionApiProbe();
		extensibleWorkflows(api as never);

		const complete = commands.get("workflows")?.getArgumentCompletions;
		expect(complete).toBeTypeOf("function");
		const items = await complete!("chain plan -> ");
		expect(items).not.toHaveLength(0);
		expect(items.every(item => item.value.startsWith("chain plan -> "))).toBe(true);
	});
});
