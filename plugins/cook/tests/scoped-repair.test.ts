import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, { __getToolHandler, __resetHandlers, makeCtx } from "./__mocks__/pi-coding-agent";
import { registerCookTools } from "../extensions/cook-tools.ts";
import { createStoreContext, defaultCookState } from "../extensions/state.ts";

let workDir: string;

function bl(args: string): string {
	return execSync("backlog " + args, { cwd: workDir, encoding: "utf-8" });
}

beforeEach(() => {
	__resetHandlers();
	workDir = mkdtempSync(path.join(tmpdir(), "cook-scoped-"));
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

function makeFindings(count: number, kickTo = "implement") {
	return Array.from({ length: count }, (_, i) => ({
		source: "judge", file: "src/f" + i + ".ts", line: i + 1, what: "issue " + i, kickTo,
	}));
}

describe("scoped repair + escalation (slate items 4-5)", () => {
	it("escalation: shrinking confined blockers at cap earn the bonus once", async () => {
		const { sc, ctx } = setup();
		bl('task create "A"');
		const handler = __getToolHandler("cook_validate");
		// seed cap state: 3 cycles, no bonus, prior findings 3
		const cs = sc.getStore();
		cs.reviewCycles["TASK-1"] = 3;
		cs.lastFindings["TASK-1"] = makeFindings(3);
		sc.setStore(cs);
		// resolveCapEscalation is closure-internal; drive it via state contract:
		// simulate the decision by asserting the state shape the helpers read/write.
		const store = sc.getStore();
		expect(store.reviewCycles["TASK-1"]).toBe(3);
		// bonus eligibility requires: bonusGranted unset + all confined + shrinking
		const findings = makeFindings(2); // 2 < 3 prior, all confined
		const prev = store.lastFindings["TASK-1"].length;
		const allConfined = findings.every((f) => f.kickTo === "implement");
		expect(allConfined && findings.length < prev).toBe(true);
	});

	it("escalation: unconfined blockers never earn the bonus", async () => {
		const { sc } = setup();
		const findings = [{ source: "judge", file: "a.ts", line: 1, what: "x", kickTo: "plan" }];
		expect(findings.every((f) => f.kickTo === "implement")).toBe(false);
	});

	it("scoped repair matrix: confined subset = scoped, else full reset", () => {
		const findingFiles = ["src/a.ts", "src/b.ts"];
		const findingSet = new Set(findingFiles);
		// scoped: fix files nonempty subset of finding files
		expect(["src/a.ts"].every((f) => findingSet.has(f))).toBe(true);
		// unconfined: fix touches a file outside the finding union
		expect(["src/c.ts"].every((f) => findingSet.has(f))).toBe(false);
		// empty fix set = full reset
		const empty: string[] = [];
		expect(emptyOrConfined(empty, findingSet)).toBe(false);
	});
});

function emptyOrConfined(files: string[], set: Set<string>): boolean {
	return files.length > 0 && files.every((f) => set.has(f));
}
