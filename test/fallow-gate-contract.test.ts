// Fallow gate contract tests (TASK-40).
//
// Defend the observable contract of the fallow integration:
//   - the committed .fallowrc.json must exist and use ONLY documented
//     fallow v3.20.0 schema keys (fallow rejects unknown keys at load),
//     with audit.gate=new-only, CSS analytics off, production mode on;
//   - the justfile fallow recipes must keep the documented gate flags and
//     capture baselines with --save-baseline (NOT a --format json redirect,
//     which writes the report, not the baseline fingerprint).
// See backlog doc-11 for the documented schema + baseline mechanics.
//
// RED until slice 4a (.fallowrc.json) and 4b (fallow-baseline recipe fix)
// land. Read-only, deterministic, no network, no process spawning.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// fallow's .fallowrc.json is JSONC (comments allowed); plain JSON is valid JSONC.
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    return JSON.parse(stripped);
  }
}

let configExists = false;
let config: any = null;
let parseError: string | null = null;
try {
  configExists = existsSync(join(ROOT, ".fallowrc.json"));
  if (configExists) config = parseJsonc(read(".fallowrc.json"));
} catch (e) {
  parseError = String(e);
}

// Documented fallow v3.20.0 config keys (schema additionalProperties:false).
const ALLOWED_TOP = new Set<string>([
  "$schema", "extends", "entry", "ignorePatterns", "ignoreFindings", "framework",
  "workspaces", "ignoreDependencies", "ignoreUnresolvedImports", "ignoreExports",
  "ignoreCatalogReferences", "ignoreDependencyOverrides", "ignoreExportsUsedInFile",
  "ignoreDecorators", "usedClassMembers", "duplicates", "similarCode", "health",
  "typeAware", "rules", "unusedComponentProps", "boundaries", "flags", "security",
  "fix", "resolve", "production", "plugins", "rulePacks", "dynamicallyLoaded",
  "overrides", "codeowners", "publicPackages", "regression", "audit", "sealed",
  "includeEntryExports", "autoImports", "cache",
]);
const ALLOWED_AUDIT = new Set<string>([
  "gate", "css", "cssDeep", "deadCodeBaseline", "healthBaseline",
  "dupesBaseline", "cacheMaxAgeDays", "typeAware",
]);

describe("fallow config contract (.fallowrc.json)", () => {
  test("exists at repo root", () => {
    expect(configExists).toBe(true);
  });

  test("parses as JSONC into an object", () => {
    expect(configExists).toBe(true);
    expect(parseError).toBeNull();
    expect(config).not.toBeNull();
    expect(typeof config).toBe("object");
  });

  test("points at the fallow schema", () => {
    expect(configExists).toBe(true);
    expect(String(config?.$schema ?? "")).toContain("fallow-rs/fallow");
  });

  test("audit.gate is new-only", () => {
    expect(configExists).toBe(true);
    expect(config?.audit?.gate).toBe("new-only");
  });

  test("disables CSS styling analytics (audit.css false)", () => {
    expect(configExists).toBe(true);
    expect(config?.audit?.css).toBe(false);
  });

  test("enables production mode", () => {
    expect(configExists).toBe(true);
    expect(Boolean(config?.production)).toBe(true);
  });

  test("contains no undocumented keys (fallow rejects unknown keys at load)", () => {
    expect(configExists).toBe(true);
    expect(config).not.toBeNull();
    const unknownTop = Object.keys(config).filter((k) => !ALLOWED_TOP.has(k));
    expect(unknownTop).toEqual([]);
    if (config.audit && typeof config.audit === "object") {
      const unknownAudit = Object.keys(config.audit).filter((k) => !ALLOWED_AUDIT.has(k));
      expect(unknownAudit).toEqual([]);
    }
  });

  test("ignorePatterns, when present, is a string array without built-in defaults", () => {
    expect(configExists).toBe(true);
    const ip = config?.ignorePatterns;
    if (ip === undefined) return;
    expect(Array.isArray(ip)).toBe(true);
    for (const p of ip) expect(typeof p).toBe("string");
    // fallow already excludes these by default; re-listing them is drift.
    const builtIns = ["**/node_modules/**", "**/dist/**", "build/**", "**/.git/**", "**/coverage/**"];
    expect(ip.filter((p: string) => builtIns.includes(p))).toEqual([]);
  });
});

const justfile = existsSync(join(ROOT, "justfile")) ? read("justfile") : "";
const justLines = justfile.split("\n");

function headerRe(name: string): RegExp {
  return new RegExp(`^${name}(?:\\s+[^\\s:]+=[^\\s]+)*:(?:\\s|$)`);
}

function recipeHeader(name: string): string | null {
  const re = headerRe(name);
  return justLines.find((l) => re.test(l)) ?? null;
}

function recipeBody(name: string): string[] {
  const re = headerRe(name);
  const out: string[] = [];
  let inRecipe = false;
  for (const line of justLines) {
    if (!inRecipe) {
      if (re.test(line)) inRecipe = true;
      continue;
    }
    if (/^\S/.test(line)) break; // next column-0 line ends the body
    out.push(line);
  }
  return out;
}

describe("justfile fallow recipes", () => {
  test("verify chains check + test + fallow-audit", () => {
    const header = recipeHeader("verify");
    expect(header).not.toBeNull();
    expect(header).toMatch(/^verify:\s*check\s+test\s+fallow-audit\s*$/);
  });

  test("fallow-audit gates new-only with auto-detected base", () => {
    const header = recipeHeader("fallow-audit");
    expect(header).not.toBeNull();
    const body = recipeBody("fallow-audit").join("\n");
    expect(body).toMatch(/npx -y fallow@\S+ audit --gate new-only/);
    // A pinned --base main can silently skip commits newer than the pinned
    // base. Auto-detection is the corrected contract.
    expect(body).not.toContain("--base {{base}}");
  });

  test("fallow-audit does not pin --base main", () => {
    expect(
      justLines.some((l) => l.includes('env_var_or_default("FALLOW_AUDIT_BASE", "main")')),
    ).toBe(false);
  });

  test("fallow-baseline captures baselines with --save-baseline (not a stdout redirect)", () => {
    const body = recipeBody("fallow-baseline").join("\n");
    expect(body).toContain("--save-baseline fallow-baselines/dead-code.json");
    expect(body).toContain("--save-baseline fallow-baselines/health.json");
    expect(body).toContain("--save-baseline fallow-baselines/dupes.json");
    // `--format json > file` writes the report, not the baseline fingerprint.
    expect(body).not.toMatch(/fallow (dead-code|health|dupes)[^\n]*--format\s+json\s*>/);
  });

  test("fallow-scan and fallow-dead-code recipes exist for triage", () => {
    expect(recipeHeader("fallow-scan")).not.toBeNull();
    expect(recipeHeader("fallow-dead-code")).not.toBeNull();
  });
});
