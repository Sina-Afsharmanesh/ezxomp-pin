import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeCtx(cwd: string) {
  return {
    cwd,
    ui: { notify: vi.fn() },
    hasUI: true,
  } as any;
}

describe("handleSetup coverage", () => {
  let tmpDir: string;
  let ctx: any;
  let originalHome: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-setup-cov-"));
    ctx = makeCtx(tmpDir);
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("merges cursor roles when .mdc file exists", async () => {
    const cursorRulesDir = join(tmpDir, ".cursor", "rules");
    mkdirSync(cursorRulesDir, { recursive: true });
    writeFileSync(
      join(cursorRulesDir, "pstack-models.mdc"),
      [
        "architect = cursor-architect",
        "implementer = cursor-implementer",
        "reviewer = cursor-reviewer",
        "default = cursor-default",
      ].join("\n"),
    );

    process.env.HOME = tmpDir;

    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);

    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Migrated roles from");
    expect(output).toContain("architect");
    const configPath = join(tmpDir, ".omp", "pstack-models.json");
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.roles.architect).toBe("cursor-architect");
    expect(config.default).toBe("cursor-default");
  });

  it("edit mode: shows current config when no updates", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "model-x", architect: "" },
      default: "model-default",
    }));

    const { handleSetup } = await import("./setup.js");
    await handleSetup("edit", ctx);

    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Current pstack-models.json");
    expect(output).toContain("model-default");
    expect(output).toContain("model-x");
    expect(output).not.toContain("architect:");
  });

  it("edit mode: sets default value", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "old" },
      default: "old",
    }));

    const { handleSetup } = await import("./setup.js");
    await handleSetup("edit implementer=new default=new-default", ctx);

    const config = JSON.parse(readFileSync(join(ompDir, "pstack-models.json"), "utf8"));
    expect(config.roles.implementer).toBe("new");
    expect(config.default).toBe("new-default");
  });

  it("edit mode: deletes default when set to empty", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "model-x" },
      default: "model-default",
    }));

    const { handleSetup } = await import("./setup.js");
    await handleSetup("edit default=", ctx);

    const config = JSON.parse(readFileSync(join(ompDir, "pstack-models.json"), "utf8"));
    expect(config.default).toBeUndefined();
  });

  it("edit mode: error when no config exists", async () => {
    const { handleSetup } = await import("./setup.js");
    await handleSetup("edit", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No config found"),
      "error",
    );
  });

  it("creates config without cursor migration when .mdc absent", async () => {
    process.env.HOME = undefined;

    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("Created .omp/pstack-models.json");
    expect(output).not.toContain("Migrated");
  });

  it("shows existing config with role entries", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "claude-sonnet", reviewer: "claude-opus" },
      default: "claude-sonnet",
    }));

    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("already exists");
    expect(output).toContain("claude-sonnet");
    expect(output).toContain("claude-opus");
  });
});
