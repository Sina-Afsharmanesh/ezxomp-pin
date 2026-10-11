import { describe, it, expect, vi, afterEach } from "vitest";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  mode: null as string | null,
  file: null as string | null,
  callCount: 0,
}));

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn((path: any, ...rest: any[]) => {
      state.callCount++;
      if (state.mode && state.file === path && state.callCount >= 2) {
        if (state.mode === "swap") return "const a = 1\nconst b = 2\nconst c = 3";
        if (state.mode === "boom") throw new Error("file vanished");
      }
      return actual.readFileSync(path, ...rest);
    }),
  };
});

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

describe("deslop — coverage gaps", () => {
  let tmpDir: string;
  let ctx: any;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    state.mode = null;
    state.file = null;
    state.callCount = 0;
  });

  it("SKIPPED safety check when lines became non-comment (lines 124,128,129)", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-gap-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    const file = join(tmpDir, "src", "swap.ts");
    writeFileSync(file, "// c1\n// c2\n// c3\n");
    state.mode = "swap";
    state.file = file;

    vi.resetModules();
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);

    const calls = ctx.ui.notify.mock.calls;
    const skipCall = calls.find((c: any[]) => c[0]?.includes("SKIPPED"));
    expect(skipCall).toBeDefined();
  });

  it("catches error when readFileSync throws during apply (lines 146-148)", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-gap-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    const file = join(tmpDir, "src", "boom.ts");
    writeFileSync(file, "// c1\n// c2\n// c3\nexport const x = 1;\n");
    state.mode = "boom";
    state.file = file;

    vi.resetModules();
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);

    const calls = ctx.ui.notify.mock.calls;
    const errCall = calls.find((c: any[]) => c[0]?.includes("failed to edit"));
    expect(errCall).toBeDefined();
  });
});
