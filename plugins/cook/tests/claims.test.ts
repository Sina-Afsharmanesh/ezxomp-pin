import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext } from "../extensions/state.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-claims-"));
	execSync("git init -q .", { cwd: workDir });
	bl('init testproj --agent-instructions none');
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function makeRealPi() {
	const pi = makePi();
	pi.exec.mockImplementation(async (_cmd: string, args: string[], opts?: { cwd?: string }) => {
		const cwd = opts?.cwd ?? workDir;
		const r = spawnSync("backlog", args, { cwd, encoding: "utf-8" });
		return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
	});
	return pi;
}

async function claim(taskId: string, by?: string): Promise<{ isError?: boolean; content: { text: string }[] }> {
	const pi = makeRealPi();
	const sc = createStoreContext(pi);
	registerCookTools(pi, sc);
	const handler = __getToolHandler("cook_claim");
	return handler.execute("t1", { task_id: taskId, by }, {} as AbortSignal, null, makeCtx({ cwd: workDir }));
}

describe("cook_claim (slate item 7)", () => {
	it("claims a ready task, journals the intent, and records the holder", async () => {
		bl('task create "A" --ac "x"');
		bl('task create "B"');
		const r = await claim("TASK-1", "lane-1");
		expect(r.isError).toBeUndefined();
		expect(r.content[0].text).toContain("Claimed TASK-1");
		expect(r.content[0].text).toContain("lane-1");
		// journal intent written
		const journal = require("node:fs").readFileSync(path.join(workDir, "backlog", ".cook-journal", "TASK-1.jsonl"), "utf-8");
		expect(journal).toContain('"event":"intent"');
	});

	it("refuses a double claim and names the holder", async () => {
		bl('task create "A"');
		await claim("TASK-1", "lane-1");
		const r2 = await claim("TASK-1", "lane-2");
		expect(r2.isError).toBe(true);
		expect(r2.content[0].text).toContain("lane-1");
	});

	it("enforces maxParallelTasks", async () => {
		bl('task create "A"');
		bl('task create "B"');
		await claim("TASK-1", "lane-1");
		// maxParallelTasks default 1 -> second claim refused
		const r2 = await claim("TASK-2", "lane-2");
		expect(r2.isError).toBe(true);
		expect(r2.content[0].text).toContain("maxParallelTasks");
	});

	it("release errors when unclaimed; release then re-claim works", async () => {
		bl('task create "A"');
		const pi = makeRealPi();
		const sc = createStoreContext(pi);
		registerCookTools(pi, sc);
		const ctx = makeCtx({ cwd: workDir });
		const execute = async (tool: string, params: unknown) => {
			const h = __getToolHandler(tool);
			return h.execute("t", params, {} as AbortSignal, null, ctx) as Promise<{ isError?: boolean; content: { text: string }[] }>;
		};
		const r0 = await execute("cook_release", { task_id: "TASK-1" });
		expect(r0.isError).toBe(true);
		const claimResult = await execute("cook_claim", { task_id: "TASK-1", by: "lane-1" });
		expect(claimResult.isError).toBeUndefined();
		const r1 = await execute("cook_release", { task_id: "TASK-1" });
		expect(r1.isError).toBeUndefined();
		expect(r1.content[0].text).toContain("Released");
		// re-claim after release succeeds
		const r2 = await execute("cook_claim", { task_id: "TASK-1", by: "lane-2" });
		expect(r2.isError).toBeUndefined();
	});

	it("normalizes mixed-case task IDs across claim and release", async () => {
		bl('task create "A"');
		const pi = makeRealPi();
		const sc = createStoreContext(pi);
		registerCookTools(pi, sc);
		const ctx = makeCtx({ cwd: workDir });
		const execute = async (tool: string, params: unknown) => {
			const handler = __getToolHandler(tool);
			return handler.execute("t", params, {} as AbortSignal, null, ctx) as Promise<{ isError?: boolean; content: { text: string }[] }>;
		};
		expect((await execute("cook_claim", { task_id: "task-1", by: "lane-1" })).isError).toBeUndefined();
		expect((await execute("cook_release", { task_id: "TaSk-1" })).isError).toBeUndefined();
		expect((await execute("cook_claim", { task_id: "TASK-1", by: "lane-2" })).isError).toBeUndefined();
	});

	it("cook_claims lists active claims with age", async () => {
		bl('task create "A"');
		await claim("TASK-1", "lane-1");
		const pi = makeRealPi();
		const sc = createStoreContext(pi);
		registerCookTools(pi, sc);
		const handler = __getToolHandler("cook_claims");
		const r = await handler.execute("t1", {}, {} as AbortSignal, null, makeCtx({ cwd: workDir }));
		expect(r.content[0].text).toContain("TASK-1");
		expect(r.content[0].text).toContain("lane-1");
		expect(r.content[0].text).toContain("m ago");
	});
});
