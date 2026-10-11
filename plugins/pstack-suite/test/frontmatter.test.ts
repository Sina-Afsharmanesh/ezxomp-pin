import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("omfg rules — frontmatter structure", () => {
  const rulesDir = join(ROOT, ".omp", "rules");
  const files = readdirSync(rulesDir).filter((f: string | undefined) => (f ?? "").endsWith(".md")) as string[];

  it("has 12 rule files", () => {
    expect(files.length).toBe(12);
  });

  for (const file of files) {
    it(`${file} has name, description, condition array, scope`, () => {
      const content = readFileSync(join(rulesDir, file), "utf8");
      const match = content.match(/^---\n([\s\S]*?)\n---/m);
      expect(match, `${file} should have YAML frontmatter`).not.toBeNull();
      const fm = match![1]!;
      expect(fm).toContain("name:");
      expect(fm).toContain("description:");
      expect(fm).toContain("condition:");
      // condition must have at least one list item
      expect(/condition:\s*\n\s*[-*]/m.test(fm), `${file} condition should be an array`).toBe(true);
      expect(fm).toContain("scope:");
    });
  }
});

describe("agents — frontmatter structure", () => {
  const agentsDir = join(ROOT, "agents");
  const files = readdirSync(agentsDir).filter((f: string | undefined) => (f ?? "").endsWith(".md")) as string[];

  it("has 5 agent files", () => {
    expect(files.length).toBe(5);
  });

  for (const file of files) {
    it(`${file} has name and description frontmatter`, () => {
      const content = readFileSync(join(agentsDir, file), "utf8");
      const match = content.match(/^---\n([\s\S]*?)\n---/m);
      expect(match, `${file} should have YAML frontmatter`).not.toBeNull();
      const fm = match![1]!;
      expect(fm).toContain("name:");
      expect(fm).toContain("description:");
    });
  }
});
