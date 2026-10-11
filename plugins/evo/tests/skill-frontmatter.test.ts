import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "../vendor/js-yaml.mjs";

// Regression gate: every bundled skill must have strictly-parseable YAML
// frontmatter. An unparseable skill silently never surfaces in OMP sessions.
const skillsRoot = join(dirname(__dirname), "skills");

function bundledSkills(): string[] {
  if (!existsSync(skillsRoot)) {
    throw new Error(`missing bundled skills directory: ${skillsRoot}`);
  }
  const found: string[] = [];
  for (const entry of readdirSync(skillsRoot)) {
    const p = join(skillsRoot, entry);
    if (statSync(p).isDirectory()) {
      const sk = join(p, "SKILL.md");
      if (!existsSync(sk)) {
        throw new Error(`skill directory without SKILL.md: ${entry}`);
      }
      found.push(sk);
    }
  }
  return found;
}

describe("bundled SKILL.md frontmatter", () => {
  const files = bundledSkills();

  it("bundles at least one skill", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.slice(skillsRoot.length + 1);

    it(`${label}: frontmatter strictly parses as YAML`, () => {
      const raw = readFileSync(file, "utf8");
      expect(raw.startsWith("---\n")).toBe(true);
      const end = raw.indexOf("\n---\n", 4);
      expect(end).toBeGreaterThan(0);
      const fm = raw.slice(4, end);
      const parsed = yaml.load(fm) as Record<string, unknown> | null;
      expect(parsed).not.toBeNull();
    });

    it(`${label}: has name and non-empty string description`, () => {
      const raw = readFileSync(file, "utf8");
      const end = raw.indexOf("\n---\n", 4);
      const parsed = yaml.load(raw.slice(4, end)) as {
        name?: unknown;
        description?: unknown;
      };
      expect(typeof parsed.name).toBe("string");
      expect(parsed.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(typeof parsed.description).toBe("string");
      expect((parsed.description as string).length).toBeGreaterThan(20);
    });
  }
});
