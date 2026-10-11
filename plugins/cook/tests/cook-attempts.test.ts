import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext, defaultCookState } from "../extensions/state.ts";
import { appendIntent, readJournal } from "../extensions/journal.ts";
import type { TypedFinding } from "../extensions/types.ts";

let cwd: string;
beforeEach(() => { __resetHandlers(); cwd = mkdtempSync(join(tmpdir(), "cook-attempts-")); });
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function setup(stage = "review", roles = ["judge", "judge"]) {
	const pi = makePi();
	const sc = createStoreContext(pi);
	sc.currentCwd = cwd;
	const dispatches = roles.map((role, index) => {
		const identity = `dispatch:${role}:${index}`;
		const intent = appendIntent(cwd, "TASK-1", identity, "dispatch payload");
		return { taskId: "TASK-1", stage: identity, role, model: "test", timestamp: intent.at };
	});
	sc.setStoreFor(cwd, { ...defaultCookState(), chain: ["plan", "implement", "verify", "review", "done"],
		currentStage: ["plan", "implement", "verify", "review", "done"].indexOf(stage),
		currentTaskId: "TASK-1", taskIds: ["TASK-1"], agentLog: dispatches });
	registerCookTools(pi, sc);
	const ctx = makeCtx({ cwd });
	return { sc, dispatches, invoke: async (name: string, params: Record<string, unknown> = {}) =>
		__getToolHandler(name).execute("test", params, undefined, undefined, ctx) as Promise<{ isError?: boolean; content: { text: string }[] }> };
}

const finding: TypedFinding = { source: "judge", file: "src/a.ts", line: 4, what: "broken", kickTo: "implement" };

function result(dispatchStage: string, outcome: "failed" | "success", typedFinding = finding) {
	return { task_id: "TASK-1", stage: "review", dispatch_stage: dispatchStage, outcome,
		evidence: "verified", receipt: dispatchStage, ...(outcome === "failed" ? { finding: typedFinding } : {}) };
}

describe("Cook attempt lineage", () => {
	it.each([true, false])("settles mixed parallel verdicts once regardless of failed-first=%s", async (failedFirst) => {
		const { sc, dispatches, invoke } = setup();
		const records = [result(dispatches[0].stage, "failed"), result(dispatches[1].stage, "success")];
		if (!failedFirst) records.reverse();
		expect((await invoke("cook_record_result", records[0])).isError).toBeUndefined();
		expect(sc.getStoreFor(cwd).currentStage).toBe(3);
		expect(sc.getStoreFor(cwd).reviewCycles["TASK-1"] ?? 0).toBe(0);
		expect((await invoke("cook_record_result", records[1])).isError).toBeUndefined();
		const state = sc.getStoreFor(cwd);
		expect(state.currentStage).toBe(1);
		expect(state.reviewCycles["TASK-1"]).toBe(1);
		expect(state.lastFindings["TASK-1"]).toEqual([finding]);
		expect((await invoke("cook_record_result", records[0])).isError).toBe(true);
		expect(sc.getStoreFor(cwd).reviewCycles["TASK-1"]).toBe(1);
	});

	it.each([true, false])("chooses earliest surviving recovery without dropping blockers, first=%s", async (reverse) => {
		const { sc, dispatches, invoke } = setup();
		const planning = { ...finding, file: "src/b.ts", kickTo: "plan" as const };
		const records = [result(dispatches[0].stage, "failed"), result(dispatches[1].stage, "failed", planning)];
		if (reverse) records.reverse();
		for (const record of records) expect((await invoke("cook_record_result", record)).isError).toBeUndefined();
		expect(sc.getStoreFor(cwd).currentStage).toBe(0);
		expect(sc.getStoreFor(cwd).reviewCycles["TASK-1"]).toBe(1);
		expect(sc.getStoreFor(cwd).lastFindings["TASK-1"]).toEqual([finding, planning]);
	});

	it("allows repaired review to pass while retaining failed attempt history", async () => {
		const { sc, dispatches, invoke } = setup("review", ["judge"]);
		await invoke("cook_record_result", result(dispatches[0].stage, "failed"));
		expect((await invoke("cook_record_result", { task_id: "TASK-1", stage: "implement", outcome: "success",
			evidence: "verified", receipt: "fixed", modified_files: ["src/a.ts"] })).isError).toBeUndefined();
		await invoke("cook_advance");
		await invoke("cook_dispatch_validator", { task_id: "TASK-1" });
		const validator = sc.getStoreFor(cwd).agentLog.at(-1)!;
		await invoke("cook_journal", { task_id: "TASK-1", event: "gate", stage: "verify", dispatch_stage: validator.stage, hash: "fixed-revision", green: true });
		expect((await invoke("cook_advance")).isError).toBeUndefined();
		await invoke("cook_dispatch_judge", { task_id: "TASK-1" });
		const fresh = sc.getStoreFor(cwd).agentLog.at(-1)!;
		expect((await invoke("cook_record_result", result(fresh.stage, "success"))).isError).toBeUndefined();
		expect((await invoke("cook_advance")).isError).toBeUndefined();
		expect(sc.getStoreFor(cwd).currentStage).toBe(4);
		expect(readJournal(cwd, "TASK-1").some((entry) => entry.stage === dispatches[0].stage && entry.event === "record" && JSON.parse(entry.note!).outcome === "failed")).toBe(true);
	});

	it("never lets unrelated, wrong-task, stale, or unbound gates finish verify", async () => {
		const { sc, dispatches, invoke } = setup("verify", ["validator"]);
		const before = readJournal(cwd, "TASK-1").length;
		expect((await invoke("cook_journal", { task_id: "TASK-1", event: "gate", stage: "audit", hash: "audit", green: true })).isError).toBeUndefined();
		expect((await invoke("cook_advance")).isError).toBe(true);
		for (const params of [
			{ task_id: "TASK-1", stage: "audit", dispatch_stage: dispatches[0].stage },
			{ task_id: "TASK-OTHER", stage: "verify", dispatch_stage: dispatches[0].stage },
			{ task_id: "TASK-1", stage: "verify" },
		]) expect((await invoke("cook_journal", { ...params, event: "gate", hash: "wrong", green: true })).isError).toBe(true);
		expect(sc.getStoreFor(cwd).currentStage).toBe(2);
		expect(readJournal(cwd, "TASK-1").length).toBe(before + 1);
		await invoke("cook_dispatch_validator", { task_id: "TASK-1", supersede: dispatches[0].stage });
		const fresh = sc.getStoreFor(cwd).agentLog.at(-1)!;
		expect((await invoke("cook_journal", { task_id: "TASK-1", stage: "verify", event: "gate", dispatch_stage: dispatches[0].stage, hash: "stale", green: true })).isError).toBe(true);
		expect((await invoke("cook_journal", { task_id: "TASK-1", stage: "verify", event: "gate", dispatch_stage: fresh.stage, hash: "current", green: true })).isError).toBeUndefined();
		expect((await invoke("cook_advance")).isError).toBeUndefined();
	});

	it("does not replace failed validator evidence with a green gate", async () => {
		const { sc, dispatches, invoke } = setup("verify", ["validator"]);
		await invoke("cook_record_result", { task_id: "TASK-1", stage: "verify", dispatch_stage: dispatches[0].stage,
			outcome: "failed", evidence: "verified", receipt: "red", finding: { ...finding, source: "validator" } });
		expect((await invoke("cook_journal", { task_id: "TASK-1", event: "gate", stage: "verify", dispatch_stage: dispatches[0].stage, hash: "green", green: true })).isError).toBe(true);
		expect(sc.getStoreFor(cwd).currentStage).toBe(1);
		expect(sc.getStoreFor(cwd).reviewCycles["TASK-1"]).toBe(1);
	});
});
