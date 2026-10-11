import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import makePi, {
	__getToolHandler,
	__resetHandlers,
	__toolCall,
	makeCtx,
	type PiStub,
} from "./__mocks__/pi-coding-agent";

async function freshExtension(pi: PiStub): Promise<void> {
	vi.resetModules();
	const mod = await import("../extensions/index.ts");
	mod.default(pi as never);
}

function redirectResult(result: unknown): { block?: boolean; reason?: string } {
	return (result ?? {}) as { block?: boolean; reason?: string };
}

function makeEvoHome(main: boolean): string {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-lean-ctx-compat-"));
	fs.mkdirSync(path.join(home, "agent"), { recursive: true });
	fs.writeFileSync(
		path.join(home, "agent", "config.yml"),
		`evo-mode:\n  main: ${main}\n  sub: true\n`,
	);
	return home;
}

describe("collapsed lean-ctx surface: compatibility", () => {
	let previousOmpHome: string | undefined;
	let tempHomes: string[] = [];

	beforeEach(() => {
		__resetHandlers();
		previousOmpHome = process.env.OMP_HOME;
		tempHomes = [];
	});

	afterEach(() => {
		if (previousOmpHome === undefined) delete process.env.OMP_HOME;
		else process.env.OMP_HOME = previousOmpHome;
		for (const home of tempHomes) fs.rmSync(home, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("keeps native read/grep/glob redirects on their exact ctx_* names", async () => {
		const pi = makePi();
		const home = makeEvoHome(false);
		tempHomes.push(home);
		process.env.OMP_HOME = home;
		await freshExtension(pi);
		const ctx = makeCtx({ mode: "tui", hasUI: true });

		for (const [nativeName, expectedCtxName] of [
			["read", "ctx_read"],
			["grep", "ctx_search"],
			["glob", "ctx_glob"],
		] as const) {
			const result = redirectResult(
				await __toolCall(
					{ toolName: nativeName, input: { path: "/workspace/file.ts" } },
					ctx,
				),
			);
			expect(result.block).toBe(true);
			expect(result.reason).toContain(expectedCtxName);
		}
	});

	it("defers filesystem redirects while evo-mode main is active", async () => {
		const pi = makePi();
		const home = makeEvoHome(true);
		tempHomes.push(home);
		process.env.OMP_HOME = home;
		await freshExtension(pi);
		const ctx = makeCtx({ mode: "tui", hasUI: true });

		for (const nativeName of ["read", "grep", "glob"] as const) {
			const result = await __toolCall(
				{ toolName: nativeName, input: { path: "/workspace/file.ts" } },
				ctx,
			);
			expect(result).toBeUndefined();
		}
	});

	it("rejects unknown ctx_call tools deterministically without spawning the CLI", async () => {
		const pi = makePi();
		await freshExtension(pi);
		const execute = __getToolHandler("ctx_call").execute;
		const result = await execute!(
			"unknown-ctx-tool",
			{ tool: "not_a_ctx_tool", args: {} },
			new AbortController().signal,
			undefined,
			makeCtx({ cwd: "/workspace/omp-lean-ctx" }),
		);

		expect(result).toMatchObject({ isError: true });
		expect(JSON.stringify(result)).toContain("not_a_ctx_tool");
		expect(pi.exec).not.toHaveBeenCalledWith(
			"lean-ctx",
			expect.arrayContaining(["call", "not_a_ctx_tool"]),
			expect.anything(),
		);
	});
});
