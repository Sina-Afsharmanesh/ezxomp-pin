import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS, resolveGsdLoopSettings } from "../src/settings.js";

describe("resolveGsdLoopSettings", () => {
	it("returns full defaults for {}", () => {
		expect(resolveGsdLoopSettings({})).toEqual(SETTINGS_DEFAULTS);
	});

	it("returns full defaults for non-object input", () => {
		expect(resolveGsdLoopSettings(null)).toEqual(SETTINGS_DEFAULTS);
		expect(resolveGsdLoopSettings("junk")).toEqual(SETTINGS_DEFAULTS);
		expect(resolveGsdLoopSettings([1])).toEqual(SETTINGS_DEFAULTS);
	});

	it("persisted valid override wins", () => {
		const out = resolveGsdLoopSettings({ "loop.maxIterations": 42, "verify.timeoutMs": 5000 });
		expect(out["loop.maxIterations"]).toBe(42);
		expect(out["verify.timeoutMs"]).toBe(5000);
		// untouched keys keep defaults
		expect(out["loop.memoryCheckInterval"]).toBe(SETTINGS_DEFAULTS["loop.memoryCheckInterval"]);
	});

	it("invalid types fall back to defaults", () => {
		const out = resolveGsdLoopSettings({
			"loop.maxIterations": "many",
			"verify.timeoutMs": true,
			"loop.memoryHeapThresholdRatio": Number.NaN,
		});
		expect(out["loop.maxIterations"]).toBe(SETTINGS_DEFAULTS["loop.maxIterations"]);
		expect(out["verify.timeoutMs"]).toBe(SETTINGS_DEFAULTS["verify.timeoutMs"]);
		expect(out["loop.memoryHeapThresholdRatio"]).toBe(SETTINGS_DEFAULTS["loop.memoryHeapThresholdRatio"]);
	});

	it("out-of-range values fall back to defaults (below min)", () => {
		const out = resolveGsdLoopSettings({
			"loop.maxIterations": 0,
			"verify.maxRetries": -1,
			"loop.cooldownFallbackWaitMs": 500,
			"verify.timeoutMs": 999,
		});
		expect(out["loop.maxIterations"]).toBe(SETTINGS_DEFAULTS["loop.maxIterations"]);
		expect(out["verify.maxRetries"]).toBe(SETTINGS_DEFAULTS["verify.maxRetries"]);
		expect(out["loop.cooldownFallbackWaitMs"]).toBe(SETTINGS_DEFAULTS["loop.cooldownFallbackWaitMs"]);
		expect(out["verify.timeoutMs"]).toBe(SETTINGS_DEFAULTS["verify.timeoutMs"]);
	});

	it("verify.maxRetries accepts 0 (min boundary)", () => {
		expect(resolveGsdLoopSettings({ "verify.maxRetries": 0 })["verify.maxRetries"]).toBe(0);
	});

	it("floats for int keys are floored", () => {
		expect(resolveGsdLoopSettings({ "loop.maxIterations": 10.9 })["loop.maxIterations"]).toBe(10);
	});

	it("constants expose backoff and stub threshold", async () => {
		const constants = await import("../src/settings.js");
		expect(constants.GSD_LOOP_CONSTANTS.stubRecoveryThreshold).toBe(2);
	});
});
