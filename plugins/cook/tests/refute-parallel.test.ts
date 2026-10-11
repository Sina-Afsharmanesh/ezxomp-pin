import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext } from "../extensions/state.ts";
import { readJournal } from "../extensions/journal.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-refute-"));
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
	registerCookTools(pi, sc);
	const ctx = makeCtx({ cwd: workDir });
	return { pi, sc, ctx };
}

const FINDINGS = [
	{ source: "judge", file: "src/a.ts", line: 1, what: "off-by-one" },
	{ source: "judge", file: "src/b.ts", line: 2, what: "missing guard" },
	{ source: "judge", file: "src/c.ts", line: 3, what: "leak" },
];

describe("parallel refute fan-out (slate item 1)", () => {
	it("each refute dispatch names exactly one finding and is blind to the others", async () => {
		bl('task create "A"');
		const { ctx } = setup();
		const handler = __getToolHandler("cook_dispatch_refute");
		// N refutes for N blockers dispatched as independent calls
		const results = [];
		for (const f of FINDINGS) {
			results.push(await handler.execute("t" + f.line, { task_id: "TASK-1", finding: f }, {} as AbortSignal, null, ctx));
		}
		for (const r of results) {
			const text = (r as { content: { text: string }[] }).content[0].text;
			// each brief names one finding; the others are absent
			expect(text).toMatch(/REFUTE/);
			expect(text).toContain('task({ agent: "cook-refute"');
			const named = FINDINGS.filter((f) => text.includes(f.file)).length;
			expect(named).toBe(1);
		}
	});

	it("journal records one refute intent per finding, in any order, identical final state", async () => {
		bl('task create "A"');
		const { ctx } = setup();
		const handler = __getToolHandler("cook_dispatch_refute");
		// deliberately shuffled dispatch order
		const order = [FINDINGS[2], FINDINGS[0], FINDINGS[1]];
		for (const f of order) {
			await handler.execute("t" + f.line, { task_id: "TASK-1", finding: f }, {} as AbortSignal, null, ctx);
		}
		const entries = readJournal(workDir, "TASK-1");
		const refutes = entries.filter((e) => e.stage === "refute");
		expect(refutes.length).toBe(3);
		// seq monotonic regardless of dispatch order
		expect(refutes.map((e) => e.seq)).toEqual([...refutes.map((e) => e.seq)].sort((a, b) => a - b));
		// same set of files journaled as findings
		const files = refutes.map((e) => e.note ?? "").sort();
		expect(files).toEqual([
			"judge: src/a.ts:1",
			"judge: src/b.ts:2",
			"judge: src/c.ts:3",
		]);
	});
});
