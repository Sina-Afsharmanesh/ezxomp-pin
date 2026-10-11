import { describe, it, expect, beforeEach } from "bun:test";
import {
	applyEditsDetailed,
	currentLearnedLines,
	extractLearned,
	setLearned,
	EditRecord,
} from "../plugins/agent-learning/src/procedures/promotion/edit-engine";

describe("agent-learning: edit-engine", () => {
	describe("extractLearned", () => {
		it("returns empty array when no markers present", () => {
			expect(extractLearned("some random text")).toEqual([]);
		});

		it("extracts bullet lines between markers", () => {
			const doc = `<!-- agent-learning:LEARNED START -->
- fact one
- fact two
<!-- agent-learning:LEARNED END -->
other content`;
			const result = extractLearned(doc);
			expect(result).toEqual(["fact one", "fact two"]);
		});

		it("handles document without learned region returns empty", () => {
			expect(
				extractLearned("just some regular text without markers")
			).toEqual([]);
		});
	});

	describe("currentLearnedLines", () => {
		it("delegates to extractLearned", () => {
			const doc = `<!-- agent-learning:LEARNED START -->
- bullet one
<!-- agent-learning:LEARNED END -->
other content`;
			expect(currentLearnedLines(doc)).toEqual(["bullet one"]);
		});
	});

	describe("setLearned", () => {
		it("wraps document with markers when absent", () => {
			const doc = "some content";
			const result = setLearned(doc, ["line1", "line2"]);
			expect(result).toContain("<!-- agent-learning:LEARNED START -->");
			expect(result).toContain("<!-- agent-learning:LEARNED END -->");
			expect(result).toContain("- line1");
			expect(result).toContain("- line2");
		});

		it("preserves document when markers already present", () => {
			const doc = `<!-- agent-learning:LEARNED START -->
- existing
<!-- agent-learning:LEARNED END -->
more content`;
			expect(setLearned(doc, ["new"])).toBe(doc);
		});
	});

	describe("applyEditsDetailed", () => {
		let doc: string;

		beforeEach(() => {
			doc = `<!-- agent-learning:LEARNED START -->
- fact one
- fact two
<!-- agent-learning:LEARNED END -->`;
		});

		describe("add operation", () => {
			it("adds a new bullet line when content is unique", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "fact three",
					},
				]);
				expect(applied).toHaveLength(1);
				expect(unmatched).toHaveLength(0);
				expect(nextDoc).toContain("fact three");
			});

			it("rejects empty add as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "",
					},
				]);
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
				expect(unmatched[0].op).toBe("add");
			});

			it("rejects duplicate add (normalized) as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "fact one",
					},
				]);
				// "fact one" already exists normalized, so it should be unmatched
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});

			it("adds line at end of learned region", () => {
				const { nextDoc } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "fact three",
					},
				]);
				// The new line should appear in the region
				expect(nextDoc).toMatch(/- fact three/);
			});
		});

		describe("delete operation", () => {
			it("deletes a bullet line by anchor match", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "delete",
						anchor: "fact one",
					},
				]);
				expect(applied).toHaveLength(1);
				expect(unmatched).toHaveLength(0);
				expect(nextDoc).not.toContain("- fact one");
				expect(nextDoc).toContain("- fact two");
			});

			it("rejects delete with no matching anchor as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "delete",
						anchor: "nonexistent",
					},
				]);
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});

			it("rejects delete without anchor as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "delete",
					},
				]);
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});
		});

		describe("replace operation", () => {
			it("replaces a bullet line when anchor matches", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "replace",
						anchor: "fact one",
						content: "fact one updated",
					},
				]);
				expect(applied).toHaveLength(1);
				expect(unmatched).toHaveLength(0);
				expect(nextDoc).toContain("- fact one updated");
				// Verify the old line is gone as an independent line
				const lines = nextDoc.split("\n");
				const hasExactFactOne = lines.some((l) => l.trim() === "- fact one");
				expect(hasExactFactOne).toBe(false);
			});

			it("rejects replace with identical content as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "replace",
						anchor: "fact one",
						content: "fact one",
					},
				]);
				// Identical replacement = unmatched
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});

			it("rejects replace with no matching anchor as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "replace",
						anchor: "nonexistent",
						content: "new content",
					},
				]);
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});
		});

		describe("unknown operation", () => {
			it("rejects unknown op as unmatched", () => {
				const { nextDoc, applied, unmatched } = applyEditsDetailed(doc, [
					{
						op: "move",
						content: "something",
					} as unknown as EditRecord,
				]);
				expect(applied).toHaveLength(0);
				expect(unmatched).toHaveLength(1);
			});
		});

		describe("preserves content outside learned region", () => {
			it("does not touch content outside the learned region", () => {
				const doc = `some hand-written content
<!-- agent-learning:LEARNED START -->
- fact one
- fact two
<!-- agent-learning:LEARNED END -->
more hand-written content`;

				const { nextDoc } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "fact three",
					},
				]);
				// Outside content should be preserved exactly
				expect(nextDoc).toContain("some hand-written content");
				expect(nextDoc).toContain("more hand-written content");
				// Learned region should have the new bullet
				expect(nextDoc).toContain("- fact three");
			});
		});

		describe("region creation on first apply", () => {
			it("creates learned region when absent on first apply", () => {
				const doc = "just some regular content without any learned region";
				const { nextDoc } = applyEditsDetailed(doc, [
					{
						op: "add",
						content: "my new learning",
					},
				]);
				// Region should be created with banner
				expect(nextDoc).toContain("<!-- agent-learning:LEARNED START -->");
				expect(nextDoc).toContain("<!-- agent-learning:LEARNED END -->");
				expect(nextDoc).toContain("- my new learning");
				// Original content should be preserved with the new region appended
				expect(nextDoc).toContain("just some regular content");
			});
		});
	});
});
