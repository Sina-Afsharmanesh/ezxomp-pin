import { expect, test, vi, beforeEach } from "vitest";

vi.mock("./runner", () => ({
  runProcessSync: vi.fn(),
  runProcess: vi.fn(),
  isToolAvailable: vi.fn(),
}));

import {
  hasGh,
  hasBacklogMd,
  checkDependencies,
  loadPstackConfig,
  loadPstackConfigResult,
  savePstackConfig,
  resolveModel,
  resolveRoleModel,
  parseCursorModels,
  detectCursorMigration,
} from "./utils.js";
import { isToolAvailable, runProcessSync } from "./runner.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import tmp from "tmp";

// Store original env
const originalHome = process.env.HOME;

test("hasGh returns true when gh is available", () => {
  vi.mocked(isToolAvailable).mockReturnValue(true);
  expect(hasGh()).toBe(true);
});

test("hasGh returns false when gh is not available", () => {
  vi.mocked(isToolAvailable).mockReturnValue(false);
  expect(hasGh()).toBe(false);
});

test("hasBacklogMd returns true when backlog is available", () => {
  vi.mocked(isToolAvailable).mockReturnValue(true);
  expect(hasBacklogMd()).toBe(true);
});

test("hasBacklogMd returns false when backlog is not available", () => {
  vi.mocked(isToolAvailable).mockReturnValue(false);
  expect(hasBacklogMd()).toBe(false);
});

test("checkDependencies returns true when backlog is available", () => {
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return true;
    if (tool === "gh") return true;
    return false;
  });
  expect(checkDependencies()).toBe(true);
});

test("checkDependencies returns false when backlog is not available", () => {
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return false;
    if (tool === "gh") return true;
    return false;
  });
  expect(checkDependencies()).toBe(false);
});

test("checkDependencies warns when gh is missing", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(isToolAvailable).mockImplementation((tool) => {
    if (tool === "backlog") return true;
    if (tool === "gh") return false;
    return false;
  });
  checkDependencies();
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("gh (GitHub CLI) not found"),
  );
  warnSpy.mockRestore();
});

test("loadPstackConfig returns undefined for nonexistent file", () => {
  expect(loadPstackConfig("/nonexistent")).toBeUndefined();
});

test("savePstackConfig writes JSON and loadPstackConfig reads it back", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  const config = {
    roles: { architect: "claude-sonnet-4-20250514", implementer: "claude-sonnet-4-20250514" },
    default: "claude-sonnet-4-20250514",
  };
  savePstackConfig(dir, config);
  expect(existsSync(join(dir, ".omp", "pstack-models.json"))).toBe(true);
  const loaded = loadPstackConfig(dir);
  expect(loaded).toEqual(config);
  rmSync(dir, { recursive: true, force: true });
});

test("savePstackConfig creates .omp directory if missing", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  expect(existsSync(join(dir, ".omp"))).toBe(false);
  savePstackConfig(dir, { roles: {}, default: "claude-sonnet-4-20250514" });
  expect(existsSync(join(dir, ".omp"))).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("loadPstackConfig rejects malformed JSON", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  mkdirSync(join(dir, ".omp"), { recursive: true });
  writeFileSync(join(dir, ".omp", "pstack-models.json"), "{ invalid json }");
  expect(loadPstackConfig(dir)).toBeUndefined();
  rmSync(dir, { recursive: true, force: true });
});

test("loadPstackConfig rejects non-object JSON", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  mkdirSync(join(dir, ".omp"), { recursive: true });
  writeFileSync(join(dir, ".omp", "pstack-models.json"), '"just a string"');
  expect(loadPstackConfig(dir)).toBeUndefined();
  rmSync(dir, { recursive: true, force: true });
});

test("loadPstackConfig rejects objects without roles key", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  mkdirSync(join(dir, ".omp"), { recursive: true });
  writeFileSync(join(dir, ".omp", "pstack-models.json"), JSON.stringify({ other: "key" }));
  expect(loadPstackConfig(dir)).toBeUndefined();
  rmSync(dir, { recursive: true, force: true });
});

test("resolveModel returns config role when present", () => {
  const config = {
    roles: { architect: "claude-sonnet-4-20250514" },
    default: "claude-sonnet-4-20250514",
  };
  expect(resolveModel(config, "architect")).toBe("claude-sonnet-4-20250514");
});

test("resolveModel falls back to sessionDefault when role missing", () => {
  const config = {
    roles: { architect: "claude-sonnet-4-20250514" },
  };
  expect(resolveModel(config, "reviewer", "claude-opus-4-20250514")).toBe("claude-opus-4-20250514");
});

test("resolveModel falls back to config default", () => {
  const config = {
    roles: { architect: "claude-sonnet-4-20250514" },
    default: "claude-sonnet-4-20250514",
  };
  expect(resolveModel(config, "reviewer")).toBe("claude-sonnet-4-20250514");
});

test("resolveModel returns undefined when nothing available", () => {
  const config = { roles: { architect: "claude-sonnet-4-20250514" } };
  expect(resolveModel(config, "reviewer")).toBeUndefined();
});

test("resolveModel returns undefined for config without default", () => {
  const config = { roles: {} };
  expect(resolveModel(config, "architect")).toBeUndefined();
});

test("parseCursorModels extracts role = model pairs", () => {
  const content = `architect = claude-sonnet-4-20250514
implementer = claude-opus-4-20250514
// comment line
writer = claude-haiku-4-20250514`;
  const result = parseCursorModels(content);
  expect(result).toEqual({
    architect: "claude-sonnet-4-20250514",
    implementer: "claude-opus-4-20250514",
    writer: "claude-haiku-4-20250514",
  });
});

test("parseCursorModels ignores comments and blank lines", () => {
  const content = `// this is a comment
<!-- HTML comment -->

default = claude-sonnet-4-20250514
`;
  const result = parseCursorModels(content);
  expect(result).toEqual({ default: "claude-sonnet-4-20250514" });
});

test("parseCursorModels handles case-insensitive roles", () => {
  const content = "ARCHITECT = claude-sonnet-4-20250514";
  const result = parseCursorModels(content);
  expect(result).toEqual({ architect: "claude-sonnet-4-20250514" });
});

test("parseCursorModels ignores unknown roles", () => {
  const content = "unknown_role = some-value";
  const result = parseCursorModels(content);
  expect(result).toEqual({});
});

test("detectCursorMigration returns undefined when HOME not set", () => {
  const saved = process.env.HOME;
  delete process.env.HOME;
  try {
    expect(detectCursorMigration()).toBeUndefined();
  } finally {
    if (saved !== undefined) process.env.HOME = saved;
  }
});

test("detectCursorMigration returns undefined when cursor config missing", () => {
  const tempHome = tmp.dirSync({ unsafeCleanup: true }).name;
  process.env.HOME = tempHome;
  try {
    expect(detectCursorMigration()).toBeUndefined();
  } finally {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("detectCursorMigration parses roles from config file", () => {
  const tempHome = tmp.dirSync({ unsafeCleanup: true }).name;
  const cursorDir = join(tempHome, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "pstack-models.mdc"),
    "architect = claude-sonnet-4-20250514\nimplementer = claude-opus-4-20250514\n",
  );
  process.env.HOME = tempHome;
  try {
    const result = detectCursorMigration();
    expect(result).toEqual({
      architect: "claude-sonnet-4-20250514",
      implementer: "claude-opus-4-20250514",
    });
  } finally {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  }
});


// ===========================================================================
// loadPstackConfigResult
// ===========================================================================

test("loadPstackConfigResult returns ok:true for valid config", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    savePstackConfig(dir, {
      roles: { architect: "claude-sonnet-4-20250514", implementer: "claude-opus" },
      default: "claude-sonnet",
    });
    const result = loadPstackConfigResult(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.roles.architect).toBe("claude-sonnet-4-20250514");
      expect(result.config.default).toBe("claude-sonnet");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=missing for nonexistent file", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    const result = loadPstackConfigResult(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=invalid for malformed JSON", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pstack-models.json"), "{ not valid json }");
    const result = loadPstackConfigResult(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=invalid for non-object JSON", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pstack-models.json"), '"just a string"');
    const result = loadPstackConfigResult(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=invalid for object without roles", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pstack-models.json"), JSON.stringify({ other: "key" }));
    const result = loadPstackConfigResult(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// resolveRoleModel (integration: cwd + config + session default)
// ===========================================================================

test("resolveRoleModel returns config role when present", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    savePstackConfig(dir, {
      roles: { architect: "claude-sonnet-4-20250514", implementer: "claude-opus" },
    });
    const model = resolveRoleModel(dir, "architect", "session-default");
    expect(model).toBe("claude-sonnet-4-20250514");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel falls back to sessionDefault when role missing in config", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    savePstackConfig(dir, { roles: { architect: "claude-sonnet-4-20250514" } });
    const model = resolveRoleModel(dir, "reviewer", "session-default");
    expect(model).toBe("session-default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel falls back to config.default when role missing", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    savePstackConfig(dir, {
      roles: { architect: "claude-sonnet-4-20250514" },
      default: "project-default",
    });
    const model = resolveRoleModel(dir, "reviewer", undefined);
    expect(model).toBe("project-default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel returns sessionDefault when config missing", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    const model = resolveRoleModel(dir, "architect", "session-default");
    expect(model).toBe("session-default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel returns undefined when config missing and no session default", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    const model = resolveRoleModel(dir, "architect", undefined);
    expect(model).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel returns undefined for empty-string role value", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    savePstackConfig(dir, { roles: { architect: "" } });
    const model = resolveRoleModel(dir, "architect", "session-default");
    // empty string is falsy, so falls through to sessionDefault
    expect(model).toBe("session-default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=invalid for {roles: null}", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pstack-models.json"), JSON.stringify({ roles: null }));
    const result = loadPstackConfigResult(dir);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
    } else {
      throw new Error("expected ok:false for {roles: null}");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRoleModel falls through to sessionDefault when config has {roles: null}", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pstack-models.json"), JSON.stringify({ roles: null }));
    const model = resolveRoleModel(dir, "architect", "session-default");
    // {roles: null} is invalid → loadPstackConfigResult returns ok:false → falls back to sessionDefault
    expect(model).toBe("session-default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPstackConfigResult returns ok:false reason=invalid for EISDIR (config path is a directory)", () => {
  const dir = tmp.dirSync({ unsafeCleanup: true }).name;
  try {
    // Create a directory at the config path instead of a file
    mkdirSync(join(dir, ".omp", "pstack-models.json"), { recursive: true });
    const result = loadPstackConfigResult(dir);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
    } else {
      throw new Error("expected ok:false for directory-at-config-path");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
