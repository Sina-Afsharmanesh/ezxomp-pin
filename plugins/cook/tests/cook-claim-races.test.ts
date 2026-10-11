import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCookState } from "../extensions/state.ts";
import type { CookState } from "../extensions/types.ts";
import type { FixtureTask, ProcessOutcome, ProcessRequest } from "./fixtures/claim-process.ts";

const fixture = fileURLToPath(new URL("./fixtures/claim-process.ts", import.meta.url));
let scratch: string;
let root: string;
let alias: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "cook-claim-process-"));
	root = join(scratch, "repo");
	alias = join(scratch, "repo-alias");
	mkdirSync(join(root, "backlog"), { recursive: true });
	symlinkSync(root, alias, "dir");
	seed();
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function seed(patch: Partial<CookState> = {}): void {
	writeFileSync(join(root, "backlog", "cook-state.json"), JSON.stringify({ ...defaultCookState(), ...patch }));
}

function persisted(): CookState {
	return JSON.parse(readFileSync(join(root, "backlog", "cook-state.json"), "utf-8"));
}

function task(id: string, patch: Partial<FixtureTask> = {}): FixtureTask {
	return { id, title: id, status: "To Do", dependencies: [], ...patch };
}

function claim(cwd: string, tasks: FixtureTask[], taskId: string, by: string): ProcessRequest {
	return { cwd, tasks, tool: "cook_claim", params: { task_id: taskId, by } };
}

function startProcess(request: ProcessRequest) {
	const ready = Promise.withResolvers<void>();
	const done = Promise.withResolvers<ProcessOutcome>();
	// Attach immediately: startup errors may arrive before the batch awaits its barrier.
	void ready.promise.catch(() => {});
	void done.promise.catch(() => {});
	const child = spawn("bun", [fixture, JSON.stringify(request)], {
		cwd: request.cwd,
		env: {
			...process.env,
			HOME: join(scratch, "home"),
			OMP_HOME: join(scratch, "home", "omp"),
			DAGR_BIN: join(scratch, "no-dagr-validator"),
		},
		stdio: ["pipe", "pipe", "pipe"],
		timeout: 10_000,
		killSignal: "SIGKILL",
	});
	let output = "";
	let outcome: ProcessOutcome | undefined;
	child.stderr!.on("data", (chunk) => { output += chunk; });
	const fail = (error: Error) => { ready.reject(error); done.reject(error); };
	child.on("error", fail);
	const lines = createInterface({ input: child.stdout! });
	lines.on("line", (line) => {
		output += `${line}\n`;
		try {
			const message: unknown = JSON.parse(line);
			if (!message || typeof message !== "object" || !("event" in message)) return;
			if (message.event === "ready") ready.resolve();
			if (message.event === "result" && "outcome" in message) {
				const result = message.outcome;
				if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) {
					fail(new Error("claim subprocess returned an invalid outcome"));
					return;
				}
				outcome = result as ProcessOutcome;
			}
		} catch (error) {
			fail(error instanceof Error ? error : new Error(String(error)));
		}
	});
	const exited = Promise.withResolvers<void>();
	child.once("close", (code, signal) => {
		if (code !== 0 || !outcome) fail(new Error(`claim subprocess exited ${code}/${signal}: ${output}`));
		else done.resolve(outcome);
		exited.resolve();
	});
	return { child, ready: ready.promise, done: done.promise, exited: exited.promise };
}

async function runTogether(...requests: ProcessRequest[]): Promise<ProcessOutcome[]> {
	const processes = requests.map(startProcess);
	try {
		// All stores have loaded the same pre-transaction state before any contender starts.
		await Promise.all(processes.map((process) => process.ready));
		for (const process of processes) process.child.stdin!.end("start\n");
		return await Promise.all(processes.map((process) => process.done));
	} finally {
		for (const process of processes) {
			if (process.child.exitCode === null && process.child.signalCode === null) process.child.kill("SIGKILL");
		}
		await Promise.all(processes.map((process) => process.exited));
	}
}

function winner(outcomes: ProcessOutcome[]): number {
	const accepted = outcomes.flatMap((outcome, index) => outcome.isError ? [] : [index]);
	expect(accepted).toHaveLength(1);
	expect(outcomes.filter((outcome) => outcome.isError === true)).toHaveLength(1);
	return accepted[0];
}

function owners(state: CookState): Record<string, string> {
	return Object.fromEntries(Object.entries(state.claims).map(([id, holder]) => [id, typeof holder === "string" ? holder : holder.by]));
}

describe("registered Cook tools across independent processes", () => {
	it.each([false, true])("accepts one owner when two lanes claim the same task (alias root: %s)", async (useAlias) => {
		seed({ maxParallelTasks: 2 });
		const tasks = [task("TASK-1")];
		const requests = [claim(root, tasks, "TASK-1", "lane-a"), claim(useAlias ? alias : root, tasks, "task-1", "lane-b")];
		const outcomes = await runTogether(...requests);
		const accepted = winner(outcomes);
		expect(owners(persisted())).toEqual({ "TASK-1": accepted === 0 ? "lane-a" : "lane-b" });
		expect(outcomes[1 - accepted].content[0].text).toContain(accepted === 0 ? "lane-a" : "lane-b");
	});

	it("admits one task when independent claims race for a single lane", async () => {
		seed({ maxParallelTasks: 1 });
		const tasks = [task("TASK-1"), task("TASK-2")];
		const requests = [claim(root, tasks, "TASK-1", "lane-a"), claim(alias, tasks, "TASK-2", "lane-b")];
		const outcomes = await runTogether(...requests);
		const accepted = winner(outcomes);
		expect(owners(persisted())).toEqual(accepted === 0 ? { "TASK-1": "lane-a" } : { "TASK-2": "lane-b" });
		expect(outcomes[1 - accepted].content[0].text).toContain("maxParallelTasks");
	});

	it("retains both owners when independent claims have two available lanes", async () => {
		seed({ maxParallelTasks: 2 });
		const tasks = [task("TASK-1"), task("TASK-2")];
		const outcomes = await runTogether(claim(root, tasks, "TASK-1", "lane-a"), claim(alias, tasks, "TASK-2", "lane-b"));
		expect(outcomes.map((outcome) => Boolean(outcome.isError))).toEqual([false, false]);
		expect(owners(persisted())).toEqual({ "TASK-1": "lane-a", "TASK-2": "lane-b" });
	});

	it("retains a claim and unrelated watch-list write from concurrently cached stores", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const outcomes = await runTogether(
			claim(root, tasks, "TASK-1", "lane-a"),
			{ cwd: alias, tasks, tool: "cook_watch", params: { action: "add_tasks", tasks: ["TASK-2"] } },
		);
		expect(outcomes.map((outcome) => Boolean(outcome.isError))).toEqual([false, false]);
		const state = persisted();
		expect(owners(state)).toEqual({ "TASK-1": "lane-a" });
		expect(Object.keys(state.watchList)).toEqual(["TASK-2"]);
	});

	it("does not acknowledge a claim whose state commit fails, then allows a durable retry", async () => {
		const tasks = [task("TASK-1")];
		const [failed] = await runTogether({ ...claim(root, tasks, "TASK-1", "failed-lane"), failPersistence: true });
		expect(failed.isError).toBe(true);
		expect(failed.activationCount).toBe(0);
		const statePath = join(root, "backlog", "cook-state.json");
		expect(statSync(statePath).isDirectory()).toBe(true);
		const saved = JSON.parse(readFileSync(`${statePath}.before-failure`, "utf-8")) as CookState;
		expect(owners(saved)).toEqual({});
		rmSync(statePath, { recursive: true });
		renameSync(`${statePath}.before-failure`, statePath);
		const [retried] = await runTogether(claim(alias, tasks, "TASK-1", "retry-lane"));
		expect(Boolean(retried.isError)).toBe(false);
		expect(retried.activationCount).toBe(1);
		expect(owners(persisted())).toEqual({ "TASK-1": "retry-lane" });
	});

	it("orders To Do tasks by high, medium, low, absent priority and numeric task ID", async () => {
		const tasks = selectionTasks();
		seedSelection();
		const [ready] = await runTogether({ cwd: root, tasks, tool: "cook_ready", params: {} });
		expect(Boolean(ready.isError)).toBe(false);
		const ids = ready.content.flatMap((block) => block.text.split("\n").map((line) => line.split(" | ")[0]));
		expect(ids).toEqual(["TASK-100.8", "TASK-100.10", "TASK-100.7", "TASK-100.9", "TASK-100.11"]);
	});

	it("cook_next skips claimed, Blocked, Closed and dependency-blocked children, then respects the lane cap", async () => {
		const tasks = selectionTasks();
		seedSelection();
		const request = { cwd: alias, tasks, tool: "cook_next", params: {} };
		const [next] = await runTogether(request);
		expect(Boolean(next.isError)).toBe(false);
		const state = persisted();
		expect(state.currentTaskId).toBe("TASK-100.8");
		expect(state.chain[state.currentStage]).toBe("implement");
		expect(owners(state)).toEqual({ "task-100.1": "existing-lane", "TASK-100.8": "main" });
		const [capped] = await runTogether(request);
		expect(capped.isError).toBe(true);
		expect(owners(persisted())).toEqual(owners(state));
		expect(persisted().currentTaskId).toBe("TASK-100.8");
	});

	it.each(["Blocked", "Closed"])("cook_next never reactivates an otherwise top-priority %s child", async (status) => {
		seed({ chain: ["plan", "implement", "verify"], currentTaskId: "TASK-100", taskIds: ["TASK-100"] });
		const tasks = [
			task("TASK-100", { status: "To Do" }),
			task("TASK-100.1", { parent_task_id: "TASK-100", priority: "high", status }),
			task("TASK-100.2", { parent_task_id: "TASK-100", priority: "low" }),
		];
		const [next] = await runTogether({ cwd: root, tasks, tool: "cook_next", params: {} });
		expect(Boolean(next.isError)).toBe(false);
		expect(persisted().currentTaskId).toBe("TASK-100.2");
		expect(owners(persisted())).toEqual({ "TASK-100.2": "main" });
	});

	it("cook_next and cook_claim cannot both consume the final available lane", async () => {
		seed({ chain: ["plan", "implement", "verify"], currentTaskId: "TASK-100", taskIds: ["TASK-100"], maxParallelTasks: 1 });
		const tasks = [task("TASK-100", { status: "Closed" }), task("TASK-100.1", { parent_task_id: "TASK-100" }), task("TASK-100.2", { parent_task_id: "TASK-100" })];
		const outcomes = await runTogether(
			{ cwd: root, tasks, tool: "cook_next", params: {} },
			claim(alias, tasks, "TASK-100.2", "claim-lane"),
		);
		const accepted = winner(outcomes);
		expect(owners(persisted())).toEqual(accepted === 0 ? { "TASK-100.1": "main" } : { "TASK-100.2": "claim-lane" });
		expect(persisted().currentTaskId).toBe(accepted === 0 ? "TASK-100.1" : "TASK-100");
	});
});

function seedSelection(): void {
	seed({
		chain: ["plan", "implement", "verify"], currentTaskId: "TASK-100", taskIds: ["TASK-100"], maxParallelTasks: 2,
		claims: { "task-100.1": { by: "existing-lane", at: "2026-01-01T00:00:00.000Z" } },
	});
}

function selectionTasks(): FixtureTask[] {
	const child = (id: string, patch: Partial<FixtureTask> = {}) => task(`TASK-100.${id}`, { parent_task_id: "TASK-100", ...patch });
	return [
		child("11"), child("9", { priority: "low" }), child("7", { status: "In Progress", priority: "medium" }),
		child("10", { priority: "high", dependencies: ["TASK-91", "TASK-92"] }), child("8", { priority: "high", dependencies: ["task-90"] }),
		child("1", { priority: "high" }), child("2", { status: "Blocked", priority: "high" }), child("3", { status: "Closed", priority: "high" }),
		child("4", { priority: "high", dependencies: ["TASK-404"] }), child("5", { priority: "high", dependencies: ["TASK-80"] }),
		task("TASK-100", { status: "Closed" }), task("TASK-80", { status: "Review" }),
		task("TASK-90", { status: "Closed" }), task("TASK-91", { status: "Archived" }), task("TASK-92", { status: "Done" }),
	];
}
