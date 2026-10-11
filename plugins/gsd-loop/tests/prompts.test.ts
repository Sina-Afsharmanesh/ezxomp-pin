/**
 * tests/prompts.test.ts — WU-10: deterministic prompt templates.
 *
 * AC: (1) auto instruction contains the three tool names verbatim;
 * (2) unit envelope embeds the brief verbatim (no truncation);
 * (3) stop envelopes always carry the recovery hint when the kernel supplied one.
 */
import { describe, expect, it } from "vitest";
import { autoOperatingInstruction, nextActionLine, unitExecutionEnvelope } from "../src/prompts.js";
import { initialState } from "../src/state.js";
import type { AdvanceResult } from "../src/kernel.js";

describe("autoOperatingInstruction", () => {
	it("contains the three tool names verbatim", () => {
		const text = autoOperatingInstruction(initialState());
		expect(text).toContain("gsd_loop_advance");
		expect(text).toContain("gsd_loop_record_result");
		expect(text).toContain("task");
	});

	it("includes honesty rules", () => {
		const text = autoOperatingInstruction(initialState());
		expect(text).toContain("errorClass");
		expect(text).toMatch(/never call `record_result status:completed`/i);
	});

	it("is deterministic for a fixed state", () => {
		const state = initialState();
		const a = autoOperatingInstruction(state);
		const b = autoOperatingInstruction(state);
		expect(a).toBe(b);
	});
});

describe("unitExecutionEnvelope", () => {
	it("embeds the brief verbatim — no truncation", () => {
		const state = initialState();
		const longBrief = "x".repeat(5000) + "\nEND-MARKER-tail";
		const unit = {
			id: "u1", title: "One", brief: longBrief, briefFile: null, verifyCommand: null,
			maxRetries: null, dispatch: "inline" as const, subagentAgent: null, status: "running" as const,
			attempts: 1, verifyAttempts: 0, lastError: null, failureHash: null,
			startedAt: "t", completedAt: null, resultSummary: null,
		};
		const text = unitExecutionEnvelope(unit, state);
		expect(text).toContain(longBrief);
		expect(text).toContain("END-MARKER-tail");
		expect(text).toContain('unitId: "u1"');
	});

	it("includes verify command and honesty constraint when declared", () => {
		const state = initialState();
		const unit = {
			id: "v1", title: "Vee", brief: "b", briefFile: null, verifyCommand: "bun test",
			maxRetries: 2, dispatch: "inline" as const, subagentAgent: null, status: "running" as const,
			attempts: 1, verifyAttempts: 0, lastError: null, failureHash: null,
			startedAt: "t", completedAt: null, resultSummary: null,
		};
		const text = unitExecutionEnvelope(unit, state);
		expect(text).toContain("bun test");
		expect(text).toMatch(/only mark complete on pass/i);
	});

	it("subagent dispatch names the native task tool", () => {
		const state = initialState();
		const unit = {
			id: "s1", title: "Sub", brief: "b", briefFile: null, verifyCommand: null,
			maxRetries: null, dispatch: "subagent" as const, subagentAgent: "cook-worker", status: "running" as const,
			attempts: 1, verifyAttempts: 0, lastError: null, failureHash: null,
			startedAt: "t", completedAt: null, resultSummary: null,
		};
		expect(unitExecutionEnvelope(unit, state)).toMatch(/native task tool/);
	});
});

describe("nextActionLine", () => {
	it("NEXT envelope for run results", () => {
		const result: AdvanceResult = {
			kind: "run",
			unit: { id: "u1", title: "One" } as never,
			brief: "",
			instructions: "",
			signature: "u1:1",
		};
		expect(nextActionLine(result)).toBe("NEXT: u1 — One");
	});

	it("PAUSED envelope with resume hint", () => {
		expect(nextActionLine({ kind: "pause", reason: "stepped" })).toMatch(/^PAUSED: stepped/);
		expect(nextActionLine({ kind: "pause", reason: "stepped" })).toMatch(/resume/);
	});

	it("STOPPED envelope always carries the kernel's recovery hint", () => {
		const result: AdvanceResult = { kind: "stop", reason: "Safety: cap", recoveryHint: "/gsd-loop resume to continue" };
		const line = nextActionLine(result);
		expect(line).toMatch(/^STOPPED: Safety: cap/);
		expect(line).toContain("/gsd-loop resume to continue");
	});

	it("STOPPED without hint still renders", () => {
		expect(nextActionLine({ kind: "stop", reason: "Queue complete" })).toBe("STOPPED: Queue complete");
	});
});
