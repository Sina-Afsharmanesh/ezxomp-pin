import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Asserts the README documents the watch feature in a stable shape.

describe("cook watch README", () => {
	it("README.md exists at package root", () => {
		const p = path.resolve(__dirname, "..", "README.md");
		expect(existsSync(p)).toBe(true);
	});

	it("README has a '## Watch mode' section", () => {
		const p = path.resolve(__dirname, "..", "README.md");
		const text = readFileSync(p, "utf8");
		expect(text).toContain("## Watch mode");
	});

	it("README mentions the cook_watch tool and /cook start|stop|status", () => {
		const p = path.resolve(__dirname, "..", "README.md");
		const text = readFileSync(p, "utf8");
		expect(text).toMatch(/cook_watch/);
		expect(text).toMatch(/\/cook start/);
		expect(text).toMatch(/\/cook stop/);
		expect(text).toMatch(/\/cook status/);
	});

	it("package.json files[] ships README.md", () => {
		const pkgPath = path.resolve(__dirname, "..", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		expect(Array.isArray(pkg.files)).toBe(true);
		expect(pkg.files).toContain("README.md");
	});
});
