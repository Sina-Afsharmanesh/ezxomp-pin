import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makePi, {
	__emitHook,
	__resetHandlers,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

const { disposeAllGateways, ensureGateway } = vi.hoisted(() => ({
	disposeAllGateways: vi.fn(async () => {}),
	ensureGateway: vi.fn(async () => ({
		callTool: vi.fn(),
		reset: vi.fn(async () => {}),
		dispose: vi.fn(async () => {}),
	})),
}));

vi.mock("../extensions/gateway.js", () => ({
	disposeAllGateways,
	ensureGateway,
}));

async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

describe("lean-ctx gateway lifecycle", () => {
	beforeEach(() => {
		__resetHandlers();
		disposeAllGateways.mockClear();
		ensureGateway.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("disposes session gateways when the extension receives session_shutdown", async () => {
		const pi = makePi();
		await freshExtension(pi);

		await __emitHook("session_shutdown", {}, makeCtx());

		expect(disposeAllGateways).toHaveBeenCalledTimes(1);
	});
});
