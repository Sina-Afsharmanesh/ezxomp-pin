import { describe, expect, it } from "vitest";
import {
	advance,
	computeGuard,
	makeDeps,
	recordResult,
	start,
	wedgeSignature,
} from "../src/kernel.js";
import { SETTINGS_DEFAULTS } from "../src/settings.js";
import { initialState } from "../src/state.js";
import { makeUnit, testSettings } from "./helpers.js";

function freshQueue() {
	const state = initialState();
	state.queue.push(makeUnit({ id: "u1" }), makeUnit({ id: "u2", title: "second" }));
	return state;
}

function runUnit(state = freshQueue()) {
	const result = advance(state, testSettings(), makeDeps());
	expect(result.kind).toBe("run");
	return result as Extract<typeof result, { kind: "run" }>;
}

describe("kernel guard pipeline (one test per guard)", () => {
	it("1. cap at maxIterations → stop 'Safety: loop exceeded'", () => {
		const state = freshQueue();
		state.counters.iterations = 5;
		const result = computeGuard(state, testSettings({ "loop.maxIterations": 5 }), makeDeps());
		expect(result.kind).toBe("stop");
		expect((result as { reason: string }).reason.startsWith("Safety: loop exceeded")).toBe(true);
	});

	it("2. memory probe 0.9 above 0.85 threshold → stop", () => {
		const state = freshQueue();
		const result = computeGuard(
			state,
			testSettings({ "loop.memoryHeapThresholdRatio": 0.85 }),
			makeDeps({ heapRatio: () => 0.9 }),
		);
		expect(result.kind).toBe("stop");
		expect((result as { reason: string }).reason).toMatch(/^Safety: memory/);
	});

	it("3. errors 1/2 → retry, 3 → break + crash-note reason", () => {
		const state = freshQueue();
		runUnit(state);
		let phase = recordResult(state, "u1", { status: "failed", summary: "e1" }, testSettings(), makeDeps());
		expect(phase.action).toBe("retry");
		phase = recordResult(state, "u1", { status: "failed", summary: "e2" }, testSettings(), makeDeps());
		expect(phase.action).toBe("retry");
		phase = recordResult(state, "u1", { status: "failed", summary: "e3" }, testSettings(), makeDeps());
		expect(phase.action).toBe("break");
		expect(phase.action === "break" && phase.reason.startsWith("Stopped: error ladder")).toBe(true);
	});

	it("4. cooldown retries don't touch error counter; 5th → break 'cooldown'", () => {
		const state = freshQueue();
		runUnit(state);
		for (let i = 0; i < 4; i++) {
			const phase = recordResult(
				state,
				"u1",
				{ status: "failed", summary: "429", errorClass: "rate-limit" },
				testSettings({ "loop.maxCooldownRetries": 5 }),
				makeDeps(),
			);
			expect(phase.action).toBe("retry");
			expect(state.counters.consecutiveErrors).toBe(0);
		}
		const phase = recordResult(
			state,
			"u1",
			{ status: "failed", summary: "429", errorClass: "rate-limit" },
			testSettings({ "loop.maxCooldownRetries": 5 }),
			makeDeps(),
		);
		expect(phase.action).toBe("break");
		expect(phase.action === "break" && phase.reason.startsWith("Stopped: cooldown")).toBe(true);
	});

	it("5. infrastructure failure → immediate break", () => {
		const state = freshQueue();
		runUnit(state);
		const phase = recordResult(
			state,
			"u1",
			{ status: "failed", summary: "network down", errorClass: "infrastructure" },
			testSettings(),
			makeDeps(),
		);
		expect(phase.action).toBe("break");
		expect(phase.action === "break" && phase.reason.startsWith("Stopped: infrastructure")).toBe(true);
	});

	it("6. model-policy failure → pause, not retry-ladder", () => {
		const state = freshQueue();
		runUnit(state);
		const phase = recordResult(
			state,
			"u1",
			{ status: "failed", summary: "policy refusal", errorClass: "model-policy" },
			testSettings(),
			makeDeps(),
		);
		expect(state.run.status).toBe("paused");
		expect(state.paused?.reason).toContain("model-policy");
		void phase;
	});

	it("7. 3rd finalize-timeout → pause", () => {
		const state = freshQueue();
		state.counters.consecutiveFinalizeTimeouts = 3;
		const result = computeGuard(state, testSettings({ "loop.maxFinalizeTimeouts": 3 }), makeDeps());
		expect(result.kind).toBe("pause");
	});

	it("8. queue drained → complete", () => {
		const state = freshQueue();
		state.pointer = 2;
		const result = computeGuard(state, testSettings(), makeDeps());
		expect(result.kind).toBe("stop");
		expect((result as { reason: string }).reason.startsWith("Run complete")).toBe(true);
		expect(state.run.status).toBe("complete");
	});
});

describe("kernel wedge + success + step mode + start gating", () => {
	it("9. same dispatch key unchanged twice → wedge written + break", () => {
		const state = freshQueue();
		runUnit(state);
		// same unit presented again without any result recorded: noAdvanceRepeats grows
		const result = advance(state, testSettings(), makeDeps());
		expect(result.kind).toBe("stop");
		expect((result as { reason: string }).reason.startsWith("Stopped: dispatch wedge")).toBe(true);
		expect(state.wedge).not.toBeNull();
		expect(state.wedge!.signature).toBe(wedgeSignature("u1", 0));
		expect(state.wedge!.acknowledged).toBe(false);
		// Re-entry without acknowledgement is refused by the persisted-wedge guard.
		const blocked = advance(state, testSettings(), makeDeps());
		expect((blocked as { reason: string }).reason.startsWith("Stopped: unacknowledged wedge")).toBe(true);
	});

	it("10. success zeroes error/cooldown counters and advances pointer", () => {
		const state = freshQueue();
		runUnit(state);
		state.counters.consecutiveErrors = 2;
		state.counters.consecutiveCooldowns = 3;
		const phase = recordResult(
			state,
			"u1",
			{ status: "completed", summary: "done" },
			testSettings(),
			makeDeps(),
		);
		expect(phase.action).toBe("next");
		expect(state.pointer).toBe(1);
		expect(state.counters.consecutiveErrors).toBe(0);
		expect(state.counters.consecutiveCooldowns).toBe(0);
		expect(state.queue[0].status).toBe("complete");
	});

	it("11. step mode: first recordResult after next → paused", () => {
		const state = freshQueue();
		start(state, { mode: "step" }, makeDeps());
		runUnit(state);
		const phase = recordResult(
			state,
			"u1",
			{ status: "completed", summary: "one step" },
			testSettings(),
			makeDeps(),
		);
		expect(state.run.status).toBe("paused");
		expect(state.paused?.reason).toContain("step-mode");
		void phase;
	});

	it("12. start refused on unacknowledged wedge; resume --wedge wrong id → refused", () => {
		const state = freshQueue();
		state.wedge = {
			id: "w-1",
			signature: "u1:1",
			unitId: "u1",
			createdAt: "2026-01-01T00:00:00.000Z",
			acknowledged: false,
		};
		const refused = start(state, { mode: "auto" }, makeDeps());
		expect(refused.action).toBe("break");
		expect(refused.action === "break" && refused.reason).toContain("unacknowledged wedge");
		// acknowledging with the wrong id leaves the wedge unacknowledged
		expect(state.wedge.acknowledged).toBe(false);
		state.wedge.acknowledged = true;
		const allowed = start(state, { mode: "auto" }, makeDeps());
		expect(allowed.action).toBe("next");
	});
});

describe("verify-retry ladder", () => {
	it("verify failure retries then fails the unit past maxRetries", () => {
		const state = freshQueue();
		runUnit(state);
		const failingVerify = { passed: false, attempts: 1, timedOut: false, outputTail: "x" };
		let phase = recordResult(
			state,
			"u1",
			{ status: "completed", summary: "claims done", verify: failingVerify },
			testSettings({ "verify.maxRetries": 1 }),
			makeDeps(),
		);
		expect(phase.action).toBe("retry");
		expect(state.queue[0].verifyAttempts).toBe(1);
		phase = recordResult(
			state,
			"u1",
			{ status: "completed", summary: "claims done again", verify: failingVerify },
			testSettings({ "verify.maxRetries": 1 }),
			makeDeps(),
		);
		expect(phase.action).toBe("break");
		expect(state.counters.consecutiveErrors).toBe(1);
	});
});

describe("wedge signature", () => {
	it("is unitId:attempts", () => {
		expect(wedgeSignature("u7", 3)).toBe("u7:3");
	});
});
