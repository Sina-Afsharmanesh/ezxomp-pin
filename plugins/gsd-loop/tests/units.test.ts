import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initialState } from "../src/state.js";
import { UnitError, enqueue, listQueue, renderBrief } from "../src/units.js";
import { makeUnit, testState } from "./helpers.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-units-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("enqueue validation", () => {
	it("duplicate id rejected", () => {
		const state = testState();
		enqueue(state, makeUnit({ id: "a" }));
		expect(() => enqueue(state, makeUnit({ id: "a", title: "dup" }))).toThrow(/duplicate unit id/);
	});

	it("both brief and briefFile rejected", () => {
		const cwd = tempRoot();
		const file = path.join(cwd, "brief.md");
		writeFileSync(file, "file brief", "utf8");
		const state = initialState();
		expect(() =>
			enqueue(state, makeUnit({ id: "x", brief: "text", briefFile: "brief.md" }), cwd),
		).toThrow(/mutually exclusive/);
	});

	it("missing briefFile error names the path", () => {
		const cwd = tempRoot();
		const state = initialState();
		expect(() => enqueue(state, makeUnit({ id: "y", brief: null, briefFile: "nope/missing.md" }), cwd)).toThrow(
			/nope\/missing\.md/,
		);
	});

	it("briefFile outside project root rejected", () => {
		const cwd = tempRoot();
		const outside = mkdtempSync(path.join(tmpdir(), "outside-"));
		dirs.push(outside);
		const file = path.join(outside, "secret.md");
		writeFileSync(file, "secret", "utf8");
		const state = initialState();
		expect(() => enqueue(state, makeUnit({ id: "z", brief: null, briefFile: file }), cwd)).toThrow(/outside the project/);
	});

	it("valid briefFile inside project is accepted and empty title rejected", () => {
		const cwd = tempRoot();
		writeFileSync(path.join(cwd, "b.md"), "content", "utf8");
		const state = initialState();
		enqueue(state, makeUnit({ id: "ok", brief: null, briefFile: "b.md" }), cwd);
		expect(state.queue).toHaveLength(1);
		expect(() => enqueue(state, makeUnit({ id: "t", title: "  " }), cwd)).toThrow(/title/);
	});
});

describe("queue + renderBrief", () => {
	it("FIFO pointer correctness over enqueue/complete/interleave", () => {
		const state = initialState();
		enqueue(state, makeUnit({ id: "a", title: "first" }));
		enqueue(state, makeUnit({ id: "b", title: "second" }));
		enqueue(state, makeUnit({ id: "c", title: "third" }));
		expect(listQueue(state).map((u) => u.id)).toEqual(["a", "b", "c"]);
		state.pointer = 1; // a complete
		enqueue(state, makeUnit({ id: "d", title: "fourth" })); // interleaved enqueue still appends
		expect(listQueue(state).map((u) => u.id)).toEqual(["a", "b", "c", "d"]);
		expect(state.queue[state.pointer].id).toBe("b");
		state.pointer = 4;
		expect(state.pointer).toBe(state.queue.length); // drained
	});

	it("renderBrief returns inline brief verbatim", () => {
		const unit = makeUnit({ brief: "line1\nline2\twith tab" });
		expect(renderBrief(unit)).toBe("line1\nline2\twith tab");
	});

	it("renderBrief reads briefFile content verbatim", () => {
		const cwd = tempRoot();
		writeFileSync(path.join(cwd, "b.md"), "# verbatim **brief**\n", "utf8");
		const unit = makeUnit({ id: "f", brief: null, briefFile: "b.md" });
		expect(renderBrief(unit, cwd)).toBe("# verbatim **brief**\n");
	});

	it("renderBrief without brief source throws UnitError", () => {
		const unit = makeUnit({ id: "n", brief: null, briefFile: null });
		expect(() => renderBrief(unit)).toThrow(UnitError);
	});
});
