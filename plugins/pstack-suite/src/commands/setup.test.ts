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

describe("handleSetup", () => {
  let tmpDir: string;
  let ctx: any;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-test-"));
    ctx = makeCtx(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates config file with roles + default when missing", async () => {
    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("implementer");
    expect(output).toContain("reviewer");
    expect(output).toContain("architect");
    expect(output).toContain("writer");
    expect(output).toContain("default");
    expect(existsSync(join(tmpDir, ".omp", "pstack-models.json"))).toBe(true);
  });

  it("shows existing config when file already present", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "claude-sonnet-4-5-20250514" },
      default: "claude-sonnet-4-5-20250514",
    }));
    const { handleSetup } = await import("./setup.js");
    await handleSetup("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("implementer");
    expect(output).toContain("claude-sonnet-4-5-20250514");
  });

  it("edits config when first arg is edit", async () => {
    const ompDir = join(tmpDir, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(join(ompDir, "pstack-models.json"), JSON.stringify({
      roles: { implementer: "old-model" },
      default: "old-default",
    }));
    const { handleSetup } = await import("./setup.js");
    await handleSetup("edit implementer=new-model", ctx);
    const content = JSON.parse(readFileSync(join(ompDir, "pstack-models.json"), "utf8"));
    expect(content.roles.implementer).toBe("new-model");
  });
});
