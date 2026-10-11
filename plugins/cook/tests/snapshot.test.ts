import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext, saveCookState } from "../extensions/state.ts";
import { STATE_FILE } from "../extensions/constants.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-snapshot-"));
	execSync("git init -q .", { cwd: workDir });
	bl("init testproj --agent-instructions none");
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function setup() {
	const pi = makePi();
	pi.exec.mockImplementation(async (_cmd: string, args: string[], opts?: { cwd?: string }) => {
		const cwd = opts?.cwd ?? workDir;
		const r = spawnSync("backlog", args, { cwd, encoding: "utf-8" });
		return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
	});
	const sc = createStoreContext(pi);
	sc.currentCwd = workDir;
	registerCookTools(pi, sc);
	const ctx = makeCtx({ cwd: workDir });
	return { pi, sc, ctx };
}

async function snapshot(): Promise<{ doc: any; raw: string }> {
	const { ctx } = setup();
	const handler = __getToolHandler("cook_snapshot");
	const r = (await handler.execute("t", {}, {} as AbortSignal, null, ctx)) as { content: { text: string }[] };
	const raw = r.content[0].text;
	return { doc: JSON.parse(raw), raw };
}

describe("cook_snapshot (slate item 8)", () => {
	it("emits the documented versioned schema with tasks sorted", async () => {
		bl('task create "B"');
		bl('task create "A"');
		const { doc } = await snapshot();
		expect(doc.schemaVersion).toBe(1);
		expect(doc.generatedAt).toBeTruthy();
		expect(typeof doc.maxParallelTasks).toBe("number");
		expect(Array.isArray(doc.tasks)).toBe(true);
		// sorted by id
		const ids = doc.tasks.map((t: { id: string }) => t.id);
		expect(ids).toEqual([...ids].sort());
	});

	it("optional fields appear only when present (additive-only)", async () => {
		bl('task create "A"');
		bl('task create "B"');
		// seed state: claim + convergence + complexity on TASK-1, nothing on TASK-2
		const { sc } = setup();
		const cs = sc.getStore();
		sc.setStore({
			...cs,
			claims: { "TASK-1": { by: "lane-1", at: "2026-08-28T00:00:00Z" } },
			convergence: { "TASK-1": { judge: { cycles: 2, bonusGranted: true } } },
			complexity: { "TASK-1": "complex" },
		});
		// persist so the snapshot's fresh store instance sees it
		saveCookState(workDir, sc.getStore());
		const { doc } = await snapshot();
		const t1 = doc.tasks.find((t: { id: string }) => t.id === "TASK-1");
		const t2 = doc.tasks.find((t: { id: string }) => t.id === "TASK-2");
		expect(t1.claim).toEqual({ by: "lane-1", at: "2026-08-28T00:00:00Z" });
		expect(t1.convergence.judge.bonusGranted).toBe(true);
		expect(t1.complexity).toBe("complex");
		// TASK-2 carries none of the optional fields (absent = legacy semantics)
		expect(t2.claim).toBeUndefined();
		expect(t2.convergence).toBeUndefined();
		expect(t2.complexity).toBeUndefined();
	});

	it("never mutates state: store bytes identical before and after", async () => {
		bl('task create "A"');
		const statePath = path.join(workDir, STATE_FILE);
		const before = existsSync(statePath) ? readFileSync(statePath, "utf-8") : null;
		await snapshot();
		const after = existsSync(statePath) ? readFileSync(statePath, "utf-8") : null;
		expect(after).toBe(before);
		// also: no journal or dagr side effects from a pure projection
		expect(existsSync(path.join(workDir, "backlog", ".cook-journal"))).toBe(false);
	});
});
