import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";

import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext } from "../extensions/state.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

function setup() {
	const pi = makePi();
	pi.exec.mockImplementation(async (_cmd: string, args: string[], opts?: { cwd?: string }) => {
		const result = spawnSync("backlog", args, { cwd: opts?.cwd ?? workDir, encoding: "utf-8" });
		return { code: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
	});
	const sc = createStoreContext(pi);
	registerCookTools(pi, sc);
	return { pi, sc, ctx: makeCtx({ cwd: workDir }) };
}

async function invoke(tool: string, params: Record<string, unknown>, ctx: ReturnType<typeof makeCtx>) {
	const handler = __getToolHandler(tool);
	return handler.execute("test", params, {} as AbortSignal, null, ctx) as Promise<{ isError?: boolean; content: { text: string }[] }>;
}

async function settleProjection(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-dagr-trigger-"));
	execSync("git init -q .", { cwd: workDir });
	bl("init testproj --agent-instructions none");
	const fakeBin = path.join(workDir, "fake-dagr-ok.sh");
	writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n");
	chmodSync(fakeBin, 0o755);
	process.env.DAGR_BIN = fakeBin;
});

afterEach(() => {
	delete process.env.DAGR_BIN;
	rmSync(workDir, { recursive: true, force: true });
});

describe("dagr projection freshness and recovery demo", () => {
	it("publishes a fresh projection after cook_next claims a child", async () => {
		bl('task create "Parent"');
		bl('task create "Child" -p TASK-1');
		const { ctx } = setup();
		await invoke("cook_start", { task_id: "TASK-1", chain_name: "full" }, ctx);
		const next = await invoke("cook_next", {}, ctx);
		expect(next.isError).toBeFalsy();
		await settleProjection();
		expect(existsSync(path.join(workDir, ".dagr", "run.json"))).toBe(true);
	});

	it("records a successful dispatch before projecting it", async () => {
		bl('task create "Child"');
		const { pi, sc, ctx } = setup();
		(pi as unknown as { getActiveTools: () => Promise<string[]> }).getActiveTools = async () => ["task", "hub", "eval"];
		const result = await invoke("cook_dispatch_worker", { task_id: "TASK-1", plan: "demo" }, ctx);
		expect(result.isError).toBeFalsy();
		const dispatch = sc.getStore().agentLog.find((entry) => entry.taskId === "TASK-1" && entry.role === "worker");
		expect(dispatch?.stage).toBe("dispatch:worker:0");
		await settleProjection();
		expect(existsSync(path.join(workDir, ".dagr", "run.json"))).toBe(true);
	});

	it("records a typed negative result and routes it to the declared stage", async () => {
		bl('task create "Child"');
		const { ctx, sc } = setup();
		await invoke("cook_start", { task_id: "TASK-1", chain_name: "full" }, ctx);
		const record = __getToolHandler("cook_record_result");
		expect(record).toBeTruthy();
		const result = await record.execute("test", {
			task_id: "TASK-1",
			stage: "verify",
			outcome: "failed",
			evidence: "verified",
			receipt: "bun test failed: 1 failure",
			finding: { source: "validator", file: "plugins/cook/tests/dagr-projection.test.ts", line: 1, what: "projection contract failed", kickTo: "plan" },
		}, {} as AbortSignal, null, ctx) as { isError?: boolean; content: { text: string }[] };
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("Next: plan");
		expect(sc.getStore().chain[sc.getStore().currentStage]).toBe("plan");
	});

	it("writes a validator gate receipt as a gate journal entry", async () => {
		bl('task create "Child"');
		const { ctx } = setup();
		const result = await invoke("cook_journal", {
			task_id: "TASK-1",
			event: "gate",
			stage: "verify",
			hash: "deadbeef",
			green: true,
			note: "green",
		}, ctx);
		expect(result.isError).toBeFalsy();
		const journal = readFileSync(path.join(workDir, "backlog", ".cook-journal", "TASK-1.jsonl"), "utf-8");
		expect(journal).toContain('"event":"gate"');
		expect(journal).toContain('"hash":"deadbeef"');
	});

	it("derives HERDR orchestration, locator, and liveness from a claim", async () => {
		bl('task create "Child"');
		const savedPane = process.env.HERDR_PANE_ID;
		process.env.HERDR_PANE_ID = "w1:p9";
		try {
			const { ctx } = setup();
			const result = await invoke("cook_claim", { task_id: "TASK-1", by: "cook-worker" }, ctx);
			expect(result.isError).toBeFalsy();
			await settleProjection();
			const doc = JSON.parse(readFileSync(path.join(workDir, ".dagr", "run.json"), "utf-8"));
			expect(doc.run.orchestrator).toEqual({ pane: "w1:p9" });
			const attempt = doc.tasks.find((task: any) => task.id === "TASK-1").attempts[0];
			expect(attempt.locator).toEqual({ pane: "w1:p9" });
			expect(attempt.liveness).toMatchObject({ prompt_acknowledged: true, last_output_at: expect.any(String), queued_input: 0 });
		} finally {
			if (savedPane === undefined) delete process.env.HERDR_PANE_ID;
			else process.env.HERDR_PANE_ID = savedPane;
		}
	});

	it("rejects a gate receipt without a hash before durable logging", async () => {
		bl('task create "Child"');
		const { ctx } = setup();
		const result = await invoke("cook_journal", {
			task_id: "TASK-1",
			event: "gate",
			stage: "dispatch:validator",
			green: true,
		}, ctx);
		expect(result.isError).toBe(true);
		expect(existsSync(path.join(workDir, "backlog", ".cook-journal", "TASK-1.jsonl"))).toBe(false);
	});

	it("fails closed when validator write-ahead intent cannot persist", async () => {
		bl('task create "Child"');
		const { pi } = setup();
		(pi as unknown as { getActiveTools: () => Promise<string[]> }).getActiveTools = async () => ["task"];
		const invalidCwd = path.join(workDir, "not-a-directory");
		writeFileSync(invalidCwd, "x");
		const result = await invoke("cook_dispatch_validator", { task_id: "TASK-1" }, makeCtx({ cwd: invalidCwd }));
		expect(result.isError).toBe(true);
	});

	it("uses the pure lifecycle builder for a live receipt projection", async () => {
		bl('task create "Child"');
		const { pi, sc, ctx } = setup();
		(pi as unknown as { getActiveTools: () => Promise<string[]> }).getActiveTools = async () => ["task"];
		expect((await invoke("cook_start", { task_id: "TASK-1", chain_name: "implement" }, ctx)).isError).toBeFalsy();
		expect((await invoke("cook_dispatch_worker", { task_id: "TASK-1" }, ctx)).isError).toBeFalsy();
		const dispatch = sc.getStore().agentLog.find((entry) => entry.taskId === "TASK-1" && entry.role === "worker");
		expect((await invoke("cook_record_result", { task_id: "TASK-1", stage: "implement", dispatch_stage: dispatch?.stage, outcome: "success", evidence: "verified", receipt: "worker-receipt" }, ctx)).isError).toBeFalsy();
		expect((await invoke("cook_claim", { task_id: "TASK-1", by: "cook-worker" }, ctx)).isError).toBeFalsy();
		await settleProjection();
		const doc = JSON.parse(readFileSync(path.join(workDir, ".dagr", "run.json"), "utf-8"));
		const attempt = doc.tasks.find((task: any) => task.id === "TASK-1").attempts[0];
		expect(attempt.outcome).toMatchObject({ result: "done", evidence: "verified", receipt: "worker-receipt" });
	});
});
