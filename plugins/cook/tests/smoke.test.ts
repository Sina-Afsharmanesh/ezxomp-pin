import { describe, expect, it } from "vitest";
import makePi, { __resetHandlers, __emitHook } from "./__mocks__/pi-coding-agent";

describe("pi-coding-agent mock", () => {
	it("registers tools, commands, flags and dispatches lifecycle hooks", async () => {
		__resetHandlers();
		const pi = makePi();
		pi.registerTool({ name: "x" });
		pi.registerCommand("c", { handler: () => "ok" });
		pi.registerFlag("f", { type: "string" });
		let called = 0;
		pi.on("session_start", () => {
			called += 1;
		});
		await __emitHook("session_start", {}, {});
		expect(called).toBe(1);
	});

	it("exposes the cook protocol prose", async () => {
		const { COOK_PROTOCOL } = await import("../extensions/constants.ts");
		expect(typeof COOK_PROTOCOL).toBe("string");
		expect(COOK_PROTOCOL.length).toBeGreaterThan(0);
		expect(COOK_PROTOCOL).toContain("[COOK MODE");
		expect(COOK_PROTOCOL).toContain("## Chain discipline");
	});
});
