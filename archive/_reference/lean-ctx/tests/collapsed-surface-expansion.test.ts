import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, {
	__emitHook,
	__getToolHandler,
	__resetHandlers,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

const { ensureGateway } = vi.hoisted(() => ({
	ensureGateway: vi.fn(async () => ({
		callTool: vi.fn(async () => ({
			content: [{ type: "text", text: "graph result" }],
		})),
		reset: vi.fn(async () => {}),
		dispose: vi.fn(async () => {}),
	})),
}));

// This test covers tool activation, not the real gateway transport. Keeping the
// transport mocked avoids an unhandled spawn error from its synthetic cwd.
vi.mock("../extensions/gateway.js", () => ({ ensureGateway }));

const CORE_TOOLS = [
	"ctx_glob",
	"ctx_read",
	"ctx_search",
	"ctx_shell",
	"ctx_tree",
	"ctx_call",
] as const;

type MockFunction = {
	mockClear: () => void;
};

type ActivePi = PiStub & {
	getActiveTools: (() => string[]) & MockFunction;
	setActiveTools: ((toolNames: string[]) => Promise<void>) & MockFunction;
};

function makeActivePi(): ActivePi {
	const pi = makePi() as ActivePi;
	let activeTools: string[] = [];
	pi.getActiveTools = vi.fn(() => [...activeTools]);
	pi.setActiveTools = vi.fn(async (toolNames: string[]) => {
		activeTools = [...toolNames];
	});
	return pi;
}

async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

describe("collapsed lean-ctx surface: optional expansion", () => {
	beforeEach(() => {
		__resetHandlers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("activates ctx_graph on demand while retaining the unchanged core six", async () => {
		const pi = makeActivePi();
		pi.exec.mockResolvedValue({
			code: 0,
			stdout: JSON.stringify({ content: [{ type: "text", text: "graph result" }] }),
			stderr: "",
		});

		await freshExtension(pi);
		await __emitHook("session_start", {}, makeCtx({ cwd: "/workspace/omp-lean-ctx" }));
		expect(pi.getActiveTools()).toEqual([...CORE_TOOLS]);
		pi.setActiveTools.mockClear();

		const execute = __getToolHandler("ctx_call").execute;
		const result = await execute!(
			"expand-ctx-graph",
			{ tool: "ctx_graph", args: { path: "extensions/index.ts" } },
			new AbortController().signal,
			undefined,
			makeCtx({ cwd: "/workspace/omp-lean-ctx" }),
		);

		expect(result).toBeDefined();
		expect(pi.setActiveTools).toHaveBeenCalledWith([
			...CORE_TOOLS,
			"ctx_graph",
		]);
		expect(pi.getActiveTools()).toEqual([...CORE_TOOLS, "ctx_graph"]);
	});
});
