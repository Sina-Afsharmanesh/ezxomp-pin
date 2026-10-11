import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, {
	__getToolHandler,
	__resetHandlers,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

const CORE_TOOLS = [
	"ctx_glob",
	"ctx_read",
	"ctx_search",
	"ctx_shell",
	"ctx_tree",
	"ctx_call",
] as const;

// Keep module-level extension state isolated in the same way as extension.test.ts.
async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

describe("collapsed lean-ctx surface: core registration", () => {
	beforeEach(() => {
		__resetHandlers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("registers exactly the six default ctx_* tools with callable handlers and schemas", async () => {
		const pi = makePi();
		await freshExtension(pi);

		const registeredCtxTools = [...pi.__handlers.tools.keys()]
			.filter((name) => name.startsWith("ctx_"))
			.sort();
		expect(registeredCtxTools).toEqual([...CORE_TOOLS].sort());

		for (const name of CORE_TOOLS) {
			const definition = __getToolHandler(name);
			expect(definition.parameters).toBeDefined();
			expect(definition.execute).toEqual(expect.any(Function));
		}
	});
});
