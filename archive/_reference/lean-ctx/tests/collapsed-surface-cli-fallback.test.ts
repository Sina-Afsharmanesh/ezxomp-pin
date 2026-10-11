import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, {
	__getToolHandler,
	__resetHandlers,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

// Hoisted mock state — registered BEFORE the dynamic import in freshExtension()
// so index.ts binds the mocked ensureGateway at module load.
const { ensureGatewayMock, callToolMock } = vi.hoisted(() => {
	const callToolMock = vi.fn();
	const ensureGatewayMock = vi.fn(async () => ({ callTool: callToolMock }));
	return { ensureGatewayMock, callToolMock };
});

vi.mock("../extensions/gateway", () => ({
	ensureGateway: ensureGatewayMock,
	disposeAllGateways: vi.fn(async () => {}),
}));

async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

function firstText(result: unknown): string {
	if (!result || typeof result !== "object") return JSON.stringify(result);
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content) || content.length === 0) return JSON.stringify(result);
	const text = (content[0] as { text?: unknown })?.text;
	return typeof text === "string" ? text : JSON.stringify(result);
}

describe("collapsed lean-ctx surface: generic CLI fallback", () => {
	beforeEach(() => {
		__resetHandlers();
		callToolMock.mockReset();
		ensureGatewayMock.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("dispatches ctx_compose through lean-ctx call, forwards JSON, and returns the decoded result", async () => {
		const pi = makePi();
		const payload = {
			task: "trace the extension registration path",
			path: "extensions/index.ts",
			task_aware: true,
		};
		const decodedResult = {
			content: [{ type: "text", text: "ranked registration result" }],
			details: { tool: "ctx_compose", files: ["extensions/index.ts"] },
		};
		callToolMock.mockResolvedValueOnce(decodedResult);

		await freshExtension(pi);
		const ctx = makeCtx({ cwd: "/workspace/omp-lean-ctx" });
		const execute = __getToolHandler("ctx_call").execute;
		expect(execute).toEqual(expect.any(Function));

		const result = await execute!(
			"call-ctx-compose",
			{ tool: "ctx_compose", args: payload },
			new AbortController().signal,
			undefined,
			ctx,
		);

		expect(ensureGatewayMock).toHaveBeenCalledWith(ctx.cwd);
		expect(callToolMock).toHaveBeenCalledTimes(1);
		expect(callToolMock).toHaveBeenCalledWith("ctx_compose", payload);
		expect(result).toEqual(decodedResult);
	});

	it("preserves a structured CLI failure as an error result", async () => {
		const pi = makePi();
		const payload = { task: "invalid fallback payload" };
		callToolMock.mockResolvedValueOnce({
			content: [{ type: "text", text: "boom" }],
			isError: true,
		});

		await freshExtension(pi);
		const ctx = makeCtx({ cwd: "/workspace/omp-lean-ctx" });
		const execute = __getToolHandler("ctx_call").execute;
		const result = await execute!(
			"call-ctx-compose-error",
			{ tool: "ctx_compose", args: payload },
			new AbortController().signal,
			undefined,
			ctx,
		);

		expect(callToolMock).toHaveBeenCalledTimes(1);
		expect(callToolMock).toHaveBeenCalledWith("ctx_compose", payload);
		expect(result).toMatchObject({ isError: true });
		const serialized = JSON.stringify(result);
		expect(serialized).toContain("boom");
		expect(firstText(result)).toContain("ctx_compose");
	});

	it("surfaces a resolved non-zero CLI exit as a structured error result", async () => {
		const pi = makePi();
		const payload = { task: "resolved non-zero failure payload" };
		// TASK-31.4: the gateway rejects when the lean-ctx child reports an MCP
		// error or exits non-zero; runCtxTool must map that rejection to a
		// structured error result instead of throwing.
		callToolMock.mockRejectedValueOnce(new Error("exit code 1: lean-ctx call failed"));

		await freshExtension(pi);
		const ctx = makeCtx({ cwd: "/workspace/omp-lean-ctx" });
		const execute = __getToolHandler("ctx_call").execute;
		const result = await execute!(
			"call-ctx-compose-resolved-failure",
			{ tool: "ctx_compose", args: payload },
			new AbortController().signal,
			undefined,
			ctx,
		);

		expect(callToolMock).toHaveBeenCalledTimes(1);
		expect(callToolMock).toHaveBeenCalledWith("ctx_compose", payload);
		expect(result).toMatchObject({ isError: true });
		expect(firstText(result)).not.toBe("");
		expect(firstText(result)).toContain("ctx_compose");
		expect(firstText(result)).toContain("exit code 1");
	});
});
