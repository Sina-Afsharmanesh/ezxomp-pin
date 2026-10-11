/**
 * tests/tools.test.ts — WU-7: tool surface against a fake pi.
 *
 * AC: (1) every tool returns the envelope shape on success AND error paths;
 * (2) advance on an empty queue → terminal stop payload, not a throw;
 * (3) record_result drives the kernel (pointer moves, journal entries);
 * (4) no RPC-visible UI calls when hasUI:false.
 */
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import makePi, { makeCtx, type CtxStub, type PiStub } from "./__mocks__/pi-coding-agent.js";
import * as core from "../src/core.js";
import { registerGsdLoopTools, gsdLoopToolNames, buildGsdLoopToolRegistrations } from "../src/tools.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-tools-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	core.setFacadeSettings({});
});

function setup(): { pi: PiStub; ctx: CtxStub; cwd: string } {
	const cwd = tempRoot();
	const pi = makePi();
	registerGsdLoopTools(pi);
	const ctx = makeCtx({ cwd });
	core.setFacadeContext({ cwd, hasUI: ctx.hasUI });
	return { pi, ctx, cwd };
}

function tool(pi: PiStub, name: string) {
	return pi.__handlers.tools.get(name)!;
}

async function call(pi: PiStub, ctx: CtxStub, name: string, params: Record<string, unknown> = {}) {
	return tool(pi, name).execute!("t1", params, new AbortController().signal, null, ctx) as Promise<{
		content: { type: string; text: string }[];
		isError?: boolean;
		details?: unknown;
	}>;
}

describe("tool registration", () => {
	it("registers exactly the 10 gsd_loop tools with expected names", () => {
		const { pi } = setup();
		expect([...pi.__handlers.tools.keys()].sort()).toEqual([...gsdLoopToolNames].sort());
	});

	it("approval classes: status/list read, rest exec", () => {
		const { pi } = setup();
		for (const reg of buildGsdLoopToolRegistrations()) {
			const readNames = ["gsd_loop_status", "gsd_loop_list"];
			expect(reg.approval === (readNames.includes(reg.name) ? "read" : "exec")).toBe(true);
			expect(pi.__handlers.tools.has(reg.name)).toBe(true);
		}
	});
});

describe("envelope shape", () => {
	it("success path returns content[{type:text,text}]", async () => {
		const { pi, ctx } = setup();
		await call(pi, ctx, "gsd_loop_enqueue", { id: "u1", title: "One", brief: "do it" });
		const result = await call(pi, ctx, "gsd_loop_list");
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain("u1");
	});

	it("error path returns envelope with isError (duplicate enqueue)", async () => {
		const { pi, ctx } = setup();
		await call(pi, ctx, "gsd_loop_enqueue", { id: "u1", title: "One", brief: "do it" });
		const result = await call(pi, ctx, "gsd_loop_enqueue", { id: "u1", title: "Again", brief: "no" });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toMatch(/duplicate/i);
	});
});

describe("advance + record_result drive the kernel", () => {
	it("advance on empty queue → terminal stop payload, not throw", async () => {
		const { pi, ctx } = setup();
		await call(pi, ctx, "gsd_loop_start", {});
		const result = await call(pi, ctx, "gsd_loop_advance", {});
		expect(result.content[0].text).toMatch(/STOPPED:.*(complete|drained)/i);
	});

	it("start → advance → record_result moves pointer and journals", async () => {
		const { pi, ctx, cwd } = setup();
		await call(pi, ctx, "gsd_loop_enqueue", { id: "u1", title: "One", brief: "do it" });
		await call(pi, ctx, "gsd_loop_enqueue", { id: "u2", title: "Two", brief: "do more" });
		await call(pi, ctx, "gsd_loop_start", {});
		const advanced = await call(pi, ctx, "gsd_loop_advance", {});
		expect(advanced.content[0].text).toMatch(/NEXT: u1/);
		expect((advanced.details as { unit: { id: string } }).unit.id).toBe("u1");

		const recorded = await call(pi, ctx, "gsd_loop_record_result", {
			unitId: "u1",
			status: "completed",
			summary: "did it",
		});
		expect(recorded.isError).toBeUndefined();

		// pointer moved: next advance claims u2
		const next = await call(pi, ctx, "gsd_loop_advance", {});
		expect(next.content[0].text).toMatch(/NEXT: u2/);

		// journal has entries
		const journalDir = path.join(cwd, ".gsd-loop", "journal");
		expect(existsSync(journalDir)).toBe(true);
		const files = readdirSync(journalDir);
		expect(files.length).toBeGreaterThan(0);
		const raw = readFileSync(path.join(journalDir, files[0]), "utf8");
		expect(raw).toContain("unit-start");
		expect(raw).toContain("unit-end");
	});

	it("subagent dispatch instructs the native task tool", async () => {
		const { pi, ctx } = setup();
		await call(pi, ctx, "gsd_loop_enqueue", {
			id: "s1",
			title: "Sub work",
			brief: "delegate this",
			dispatch: "subagent",
		});
		await call(pi, ctx, "gsd_loop_start", {});
		const advanced = await call(pi, ctx, "gsd_loop_advance", {});
		expect(advanced.content[0].text).toMatch(/native task tool|task tool/i);
	});
});

describe("headless tolerance (hasUI:false)", () => {
	it("all tools work and never call ctx.ui", async () => {
		const cwd = tempRoot();
		const pi = makePi();
		registerGsdLoopTools(pi);
		const ctx = makeCtx({ cwd, hasUI: false });
		core.setFacadeContext({ cwd, hasUI: false });
		await call(pi, ctx, "gsd_loop_enqueue", { id: "u1", title: "One", brief: "b" });
		await call(pi, ctx, "gsd_loop_start", {});
		await call(pi, ctx, "gsd_loop_advance", {});
		await call(pi, ctx, "gsd_loop_record_result", { unitId: "u1", status: "completed", summary: "ok" });
		await call(pi, ctx, "gsd_loop_status", {});
		await call(pi, ctx, "gsd_loop_stop", {});
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
	});
});
