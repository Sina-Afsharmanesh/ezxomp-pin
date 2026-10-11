import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { canonicalCookRoot, withCookLock, withCookLockSync } from "../extensions/coordination.ts";
import { createStoreContext, defaultCookState, loadCookState, saveCookState } from "../extensions/state.ts";
import { appendIntent, readJournal } from "../extensions/journal.ts";
import { STATE_FILE } from "../extensions/constants.ts";

let cwd: string;
beforeEach(() => { cwd = fs.mkdtempSync(join(tmpdir(), "cook-durable-")); });
afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(cwd, { recursive: true, force: true });
});

function store() {
	const entries: unknown[] = [];
	const sc = createStoreContext({ appendEntry: (_id: string, state: unknown) => entries.push(state) } as unknown as ExtensionAPI);
	sc.currentCwd = cwd;
	return { sc, entries };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

describe("atomic writer failure reporting", () => {
	it.each([
		["success", [], undefined],
		["primary", ["EISDIR"], null],
		["dual", ["EISDIR", "EACCES"], "EISDIR"],
	] as const)("preserves primary and cleanup failures (%s)", (mode, expectedCodes, expectedCause) => {
		const moduleUrl = pathToFileURL(fileURLToPath(new URL("../extensions/coordination.ts", import.meta.url))).href;
		const script = `
			import fs from "node:fs";
			import { syncBuiltinESMExports } from "node:module";
			const failure = (code) => Object.assign(new Error(code), { code });
			if (process.argv[2] === "primary" || process.argv[2] === "dual") fs.renameSync = () => { throw failure("EISDIR"); };
			if (process.argv[2] === "dual") fs.unlinkSync = () => { throw failure("EACCES"); };
			syncBuiltinESMExports();
			const { writeCookFileAtomic } = await import(${JSON.stringify(moduleUrl)});
			let result;
			try { writeCookFileAtomic(process.argv[1], "durable"); result = { codes: [], cause: null }; }
			catch (error) { result = { codes: error instanceof AggregateError ? error.errors.map((item) => item.code) : [error.code], cause: error.cause?.code ?? null }; }
			console.log(JSON.stringify(result));
		`;
		const path = join(cwd, "target");
		const result = spawnSync("node", ["--input-type=module", "-e", script, path, mode], { encoding: "utf-8" });
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ codes: expectedCodes, cause: expectedCause ?? null });
		if (mode === "success") expect(fs.readFileSync(path, "utf-8")).toBe("durable");
		if (mode === "primary") expect(fs.readdirSync(cwd)).toEqual([]);
	});
});

describe("durable Cook state acceptance", () => {
	it.each(["{broken", "null", "[]", '{"claims":null}', '{"chain":"implement"}'])
	("rejects corrupt state without accepting or overwriting it (%s)", (content) => {
		fs.mkdirSync(join(cwd, "backlog"));
		const path = join(cwd, STATE_FILE);
		fs.writeFileSync(path, content);
		const { sc, entries } = store();
		expect(() => sc.getStore()).toThrow("Invalid Cook state");
		expect(() => sc.setStore(defaultCookState())).toThrow("Invalid Cook state");
		expect(sc.stores.size).toBe(0);
		expect(entries).toEqual([]);
		expect(fs.readFileSync(path, "utf-8")).toBe(content);
	});

	it("rejects an unreadable state path instead of returning defaults", () => {
		fs.mkdirSync(join(cwd, STATE_FILE), { recursive: true });
		expect(() => loadCookState(cwd)).toThrow("Cannot read Cook state");
		expect(() => saveCookState(cwd, defaultCookState())).toThrow();
		expect(fs.readdirSync(join(cwd, "backlog"))).toEqual(["cook-state.json"]);
	});

	it("does not accept a failed commit when state target is unreadable", () => {
		const { sc, entries } = store();
		sc.setStore(defaultCookState());
		const path = join(cwd, STATE_FILE);
		const previous = fs.readFileSync(path, "utf-8");
		const diskState = loadCookState(cwd);
		fs.renameSync(path, `${path}.backup`);
		fs.mkdirSync(path);
		try {
			expect(() => sc.setStore({ ...sc.getStore(), cookmode: true })).toThrow();
			expect(sc.getStore().cookmode).toBe(false);
			expect(entries).toEqual([diskState]);
			expect(fs.readFileSync(`${path}.backup`, "utf-8")).toBe(previous);
			expect(fs.readdirSync(join(cwd, "backlog"))).toEqual(["cook-state.json", "cook-state.json.backup"]);
		} finally {
			fs.rmdirSync(path);
			fs.renameSync(`${path}.backup`, path);
		}
		expect(loadCookState(cwd).cookmode).toBe(false);
	});

	it("preserves other lanes, watch changes and history when a stale setter changes one field", () => {
		const laneA = store();
		const laneB = store();
		laneA.sc.getStore();
		laneB.sc.getStore();
		laneA.sc.setStore({ ...laneA.sc.getStore(), claims: { "TASK-1": "lane-a" },
			watch: { ...defaultCookState().watch, enabled: true },
			agentLog: [{ taskId: "TASK-1", stage: "implement", role: "worker", model: "m", timestamp: "t" }] });
		laneB.sc.setStore({ ...laneB.sc.getStore(), claims: { "TASK-2": "lane-b" },
			watch: { ...defaultCookState().watch, lastFiredAt: "2026-09-29T00:00:00Z" },
			agentLog: [{ taskId: "TASK-2", stage: "implement", role: "worker", model: "m", timestamp: "t" }] });
		const accepted = laneB.sc.getStore();
		expect(accepted.claims).toEqual({ "TASK-1": "lane-a", "TASK-2": "lane-b" });
		expect(accepted.watch.enabled).toBe(true);
		expect(accepted.watch.lastFiredAt).toBe("2026-09-29T00:00:00Z");
		expect(accepted.agentLog.map((entry) => entry.taskId)).toEqual(["TASK-1", "TASK-2"]);
		expect(loadCookState(cwd)).toEqual(accepted);
	});

	it("refreshes delta baseline when a transaction reloads the shared store map", () => {
		const { sc } = store();
		sc.getStore();
		saveCookState(cwd, { ...defaultCookState(), claims: { "TASK-1": "other" }, cookmode: true });
		sc.stores.set(sc.normalizeCwd(cwd), loadCookState(cwd));
		const fresh = sc.getStore();
		sc.setStore({ ...fresh, claims: {}, cookmode: false });
		expect(loadCookState(cwd).claims).toEqual({});
		expect(loadCookState(cwd).cookmode).toBe(false);
	});
});

describe("canonical Cook transaction ownership", () => {
	it("coordinates symlink aliases across state, journal and lock ownership", async () => {
		const alias = join(cwd, "alias");
		fs.symlinkSync(cwd, alias, "dir");
		expect(canonicalCookRoot(alias)).toBe(cwd);
		const { sc } = store();
		await withCookLock(alias, async () => {
			sc.setStoreFor(cwd, { ...defaultCookState(), claims: { "TASK-1": "owner" } });
			appendIntent(alias, "TASK-1", "implement");
		});
		expect(loadCookState(alias).claims).toEqual(loadCookState(cwd).claims);
		expect(readJournal(alias, "TASK-1")).toEqual(readJournal(cwd, "TASK-1"));
		expect(sc.stores.size).toBe(1);
	});

	it("rejects outside sync writes while allowing only owning async reentrancy", async () => {
		const entered = deferred();
		const release = deferred();
		const first = withCookLock(cwd, async () => {
			await withCookLock(cwd, async () => {
				withCookLockSync(cwd, () => appendIntent(cwd, "TASK-1", "implement"));
			});
			entered.resolve();
			await release.promise;
		});
		await entered.promise;
		try {
			expect(() => saveCookState(cwd, defaultCookState())).toThrow("Cook project is locked");
			expect(() => appendIntent(cwd, "TASK-2", "implement")).toThrow("Cook project is locked");
		} finally {
			release.resolve();
			await first;
		}
		saveCookState(cwd, { ...defaultCookState(), cookmode: true });
		expect(loadCookState(cwd).cookmode).toBe(true);
	});

	it("expires inherited ownership when the async action returns", async () => {
		const detached = deferred();
		let inherited!: Promise<void>;
		await withCookLock(cwd, async () => {
			inherited = detached.promise.then(() => {
				expect(() => saveCookState(cwd, defaultCookState())).toThrow("Cook project is locked");
			});
		});
		const entered = deferred();
		const release = deferred();
		const holder = withCookLock(cwd, async () => { entered.resolve(); await release.promise; });
		await entered.promise;
		try {
			detached.resolve();
			await inherited;
		} finally {
			release.resolve();
			await holder;
		}
	});

	it("fails closed on unverified orphan ownership without replacing its lock", async () => {
		fs.mkdirSync(join(cwd, "backlog"));
		const path = join(cwd, "backlog", ".cook.lock");
		const bytes = JSON.stringify({ pid: -1, token: "not-verified" });
		fs.writeFileSync(path, bytes);
		expect(() => saveCookState(cwd, defaultCookState())).toThrow("Cook project is locked");
		await expect(withCookLock(cwd, async () => { throw new Error("entered orphan lock"); })).rejects.toThrow("Cook project is locked");
		expect(fs.readFileSync(path, "utf-8")).toBe(bytes);
	});

	it("cleans up only its own lock when the action fails", async () => {
		await expect(withCookLock(cwd, async () => { throw new Error("action failed"); })).rejects.toThrow("action failed");
		expect(fs.existsSync(join(cwd, "backlog", ".cook.lock"))).toBe(false);
		await withCookLock(cwd, async () => appendIntent(cwd, "TASK-1", "recovered"));
		expect(readJournal(cwd, "TASK-1")[0].stage).toBe("recovered");
	});

	it("does not delete replacement lock ownership during cleanup", async () => {
		const path = join(cwd, "backlog", ".cook.lock");
		await expect(withCookLock(cwd, async () => {
			fs.renameSync(path, `${path}.old`);
			fs.writeFileSync(path, "replacement owner");
		})).rejects.toThrow("Cook lock ownership changed");
		expect(fs.readFileSync(path, "utf-8")).toBe("replacement owner");
	});

	it("serializes independent processes and preserves state claims plus journal sequence", async () => {
		const source = fileURLToPath(new URL("../extensions/", import.meta.url));
		const script = join(cwd, "race.ts");
		fs.writeFileSync(script, `
import { createInterface } from "node:readline";
import { withCookLock } from ${JSON.stringify(join(source, "coordination.ts"))};
import { loadCookState, saveCookState } from ${JSON.stringify(join(source, "state.ts"))};
import { appendIntent } from ${JSON.stringify(join(source, "journal.ts"))};
const input = createInterface({ input: process.stdin });
const gate = new Promise<void>((resolve) => input.once("line", () => { input.close(); resolve(); }));
console.log("ready");
await gate;
await withCookLock(process.argv.at(-2)!, async () => {
 const root = process.argv.at(-2)!;
 const id = process.argv.at(-1)!;
 const state = loadCookState(root);
 await new Promise<void>((resolve) => setImmediate(resolve));
 saveCookState(root, { ...state, claims: { ...state.claims, [id]: id } });
 appendIntent(root, "TASK-RACE", id);
});
`);
		const alias = join(cwd, "alias");
		fs.symlinkSync(cwd, alias, "dir");
		const children = [cwd, alias].map((root, index) => {
			const child = spawn("bun", [script, root, `TASK-${index + 1}`], { cwd: dirname(source), stdio: ["pipe", "pipe", "pipe"] });
			let errors = "";
			child.stderr.setEncoding("utf-8").on("data", (chunk) => { errors += chunk; });
			const exited = once(child, "exit").then(([code]) => {
				if (code !== 0) throw new Error(`Cook race child failed (${code}): ${errors}`);
			});
			const ready = new Promise<void>((resolve, reject) => {
				let output = "";
				child.stdout.setEncoding("utf-8").on("data", (chunk) => {
					output += chunk;
					if (output.includes("ready\n")) resolve();
				});
				child.once("error", reject);
				child.once("exit", () => { if (!output.includes("ready\n")) reject(new Error(errors || "child exited before ready")); });
			});
			return { child, exited, ready };
		});
		try {
			await Promise.all(children.map((worker) => worker.ready));
			for (const worker of children) worker.child.stdin.end("go\n");
			await Promise.all(children.map((worker) => worker.exited));
			expect(loadCookState(cwd).claims).toEqual({ "TASK-1": "TASK-1", "TASK-2": "TASK-2" });
			const journal = readJournal(cwd, "TASK-RACE");
			expect(journal.map((entry) => entry.seq)).toEqual([0, 1]);
			expect(journal.map((entry) => entry.stage).sort()).toEqual(["TASK-1", "TASK-2"]);
		} finally {
			for (const worker of children) if (worker.child.exitCode === null) worker.child.kill();
			await Promise.allSettled(children.map((worker) => worker.exited));
		}
	});
});
