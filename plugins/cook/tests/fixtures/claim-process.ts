import { mock } from "bun:test";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import * as tui from "../__mocks__/pi-tui.ts";

// Headless transactions do not render. Reuse the suite's native-addon-free TUI alias.
mock.module("@oh-my-pi/pi-tui", () => tui);
// Import only after Bun installs the native-addon alias in this standalone child.
const { registerCookTools } = await import("../../extensions/cook-tools.ts");
const { createStoreContext } = await import("../../extensions/state.ts");

export interface FixtureTask {
	id: string;
	title: string;
	status: string;
	priority?: string;
	dependencies: string[];
	parent_task_id?: string;
}

export interface ProcessRequest {
	cwd: string;
	tasks: FixtureTask[];
	tool: string;
	params: Record<string, unknown>;
	failPersistence?: boolean;
}

export interface ProcessOutcome {
	isError?: boolean;
	activationCount: number;
	content: Array<{ type: string; text: string }>;
}

function awaitStart(): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const input = createInterface({ input: process.stdin });
	let received = false;
	input.once("line", (line) => {
		received = true;
		if (line === "start") resolve();
		else reject(new Error(`unexpected start command ${line}`));
		input.close();
	});
	input.once("close", () => {
		if (!received) reject(new Error("parent closed the start barrier"));
	});
	return promise;
}

async function main(): Promise<void> {
	const request = JSON.parse(process.argv[2]) as ProcessRequest;
	let activationCount = 0;
	const tasks = structuredClone(request.tasks);
	const tools = new Map<string, { execute: Function }>();
	const pi = {
		registerTool(tool: { name: string; execute: Function }) { tools.set(tool.name, tool); },
		registerCommand() {},
		getFlag() { return undefined; },
		appendEntry() {},
		async exec(command: string, args: string[]) {
			if (command !== "backlog" || args[0] !== "task")
				throw new Error(`unexpected CLI boundary: ${command} ${args.join(" ")}`);
			if (args[1] === "list") {
				if (request.failPersistence) {
					// After lock/reload, replace state path with directory before commit.
					const statePath = join(request.cwd, "backlog", "cook-state.json");
					renameSync(statePath, `${statePath}.before-failure`);
					mkdirSync(statePath);
				}
				return { code: 0, stdout: JSON.stringify({ tasks }), stderr: "" };
			}
			const id = args[1] === "edit" ? args[2] : args[1];
			const task = tasks.find((entry) => entry.id.toUpperCase() === id.toUpperCase());
			if (!task) return { code: 1, stdout: "", stderr: `unknown fixture task ${id}` };
			if (args[1] === "edit") {
				const status = args.indexOf("-s");
				if (status < 0 || args[status + 1] !== "In Progress")
					throw new Error(`unexpected fixture mutation: ${args.join(" ")}`);
				task.status = args[status + 1];
				activationCount++;
			}
			return { code: 0, stdout: JSON.stringify({ task }), stderr: "" };
		},
	} as unknown as ExtensionAPI;
	const sc = createStoreContext(pi);
	sc.currentCwd = request.cwd;
	// Every contender caches the same initial state before the parent releases any tool.
	sc.getStoreFor(request.cwd);
	registerCookTools(pi, sc);
	const tool = tools.get(request.tool);
	if (!tool) throw new Error(`unregistered fixture tool ${request.tool}`);
	const ctx = { cwd: request.cwd, hasUI: false, ui: {} } as ExtensionContext;
	const started = awaitStart();
	console.log(JSON.stringify({ event: "ready" }));
	await started;
	const outcome = await tool.execute("claim-process", request.params, new AbortController().signal, undefined, ctx);
	console.log(JSON.stringify({ event: "result", outcome: { ...outcome, activationCount } }));
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
}
