/**
 * tests/helpers.ts — shared test fixtures.
 */

import { initialState, type GsdLoopState } from "../src/state.js";
import { SETTINGS_DEFAULTS } from "../src/settings.js";
import type { Unit } from "../src/units.js";

export function testSettings(overrides: Partial<typeof SETTINGS_DEFAULTS> = {}) {
	return { ...SETTINGS_DEFAULTS, ...overrides };
}

export function testState(): GsdLoopState {
	return initialState();
}

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
	return {
		id: "u1",
		title: "Unit one",
		brief: "do the thing",
		briefFile: null,
		verifyCommand: null,
		maxRetries: null,
		dispatch: "inline",
		subagentAgent: null,
		status: "pending",
		attempts: 0,
		verifyAttempts: 0,
		lastError: null,
		failureHash: null,
		startedAt: null,
		completedAt: null,
		failedAt: null,
		resultSummary: null,
		...overrides,
	};
}

export const fixedDeps = {
	now: () => "2026-01-01T00:00:00.000Z",
	heapRatio: () => 0.1,
	uuid: (() => {
		let n = 0;
		return () => `wedge-${++n}`;
	})(),
};
