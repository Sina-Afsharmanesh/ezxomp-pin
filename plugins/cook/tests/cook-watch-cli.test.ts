import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import makePi, {
	__resetHandlers,
	__getCommandHandler,
	makeCtx,
	type CtxStub,
} from "./__mocks__/pi-coding-agent";

// Asserts the /cook CLI grows start|stop|status subcommands that drive the
// same watch helpers as the cook_watch tool.
//
// Note: `await import("../extensions/index.ts")` is intentional — the
// extension module holds closure-scoped state and we need fresh imports
// after each __resetHandlers(). Static import would leak watcher state.

let ctx: CtxStub;
let cwd: string;

beforeEach(() => {
	__resetHandlers();
	cwd = mkdtempSync(join(tmpdir(), "ezxomp-cook-watch-cli-"));
	ctx = makeCtx({ cwd });
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("/cook start|stop|status", () => {
	it("registerCommand('cook') description mentions start/stop/status subcommands", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const cmd = pi.__handlers.commands.get("cook");
		expect(cmd).toBeDefined();
		expect(cmd?.description ?? "").toMatch(/start/);
		expect(cmd?.description ?? "").toMatch(/stop/);
		expect(cmd?.description ?? "").toMatch(/status/);
	});

	it("/cook status notifies with the watch summary", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const handler = __getCommandHandler("cook");
		await handler("status", ctx);
		const calls = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const text = calls.map((c) => String(c[0])).join("\n");
		expect(text.toLowerCase()).toMatch(/watch/);
	});

	it("/cook start errors when no chain exists", async () => {
		const pi = makePi();
		const mod = await import("../extensions/index.ts");
		mod.default(pi as never);
		const handler = __getCommandHandler("cook");
		await handler("start", ctx);
		const calls = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		const text = calls.map((c) => String(c[0])).join("\n");
		expect(text.toLowerCase()).toMatch(/cook_start|no.*(chain|workflow)/);
	});
});
