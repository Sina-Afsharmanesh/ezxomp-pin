import { describe, it, expect, vi, afterEach } from "vitest";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync as realReadSync,
} from "node:fs";
import { join } from "node:path";

function makeCtx(cwd: string) {
  return { cwd, ui: { notify: vi.fn() }, hasUI: true } as any;
}

describe("deslop — basic", () => {
  let tmpDir: string;
  let ctx: any;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("notifies error when no TypeScript files found", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no TypeScript files found.",
      "error",
    );
  });

  it("notifies info when no candidates found", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "clean.ts"), "export const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("no candidates with --confirm returns no candidates message", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "clean.ts"), "export const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("finds 3+ consecutive comment-only lines as comment-block", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "block.ts"),
      "export const x = 1;\n// comment 1\n// comment 2\n// comment 3\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("comment-block");
  });

  it("ignores comment groups shorter than 3 lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "short.ts"),
      "export const x = 1;\n// comment 1\n// comment 2\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("finds comment blocks with mixed styles", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "block.ts"),
      "export const x = 1;\n/* block start\n * middle\n * end\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("comment-block");
  });

  it("finds multiple comment blocks in one file", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "multi.ts"),
      "// block 1 line 1\n// block 1 line 2\n// block 1 line 3\nconst a = 1;\n// block 2 line 1\n// block 2 line 2\n// block 2 line 3\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("2 comment-block");
  });

  it("finds TODO markers in comment-only lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "todo.ts"),
      "export const x = 1;\n// TODO: implement later\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("1 TODO marker");
  });

  it("finds FIXME, HACK, XXX markers", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "markers.ts"),
      "// FIXME: broken\n// HACK: workaround\n// XXX: review\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("3 TODO marker");
  });

  it("does NOT match TODO in non-comment lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "code.ts"),
      "const x = \'TODO\';\nconsole.log(\'TODO here\');\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("does NOT match inline comments with code", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "inline.ts"),
      "const x = 1; // TODO not a block comment\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("finds both comment-blocks and TODO markers", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "mixed.ts"),
      "// block 1\n// block 2\n// block 3\n// TODO: fix this\nexport const x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("comment-block");
    expect(output).toContain("TODO marker");
  });

  it("lists each candidate with relative path and line range", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "example.ts"),
      "// c1\n// c2\n// c3\nexport const x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const calls = ctx.ui.notify.mock.calls;
    expect(calls.length).toBe(3);
    expect(calls[1][0]).toContain("example.ts");
    expect(calls[1][0]).toContain("comment-block");
  });

  it("stops after listing without --confirm", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "example.ts"),
      "// c1\n// c2\n// c3\nexport const x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(realReadSync(join(tmpDir, "src", "example.ts"), "utf8")).toContain("// c1");
  });

  it("handles --list flag same as default", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "example.ts"),
      "// c1\n// c2\n// c3\nexport const x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--list", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("comment-block");
  });

  it("deletes comment blocks with --confirm", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "block.ts"),
      "export const x = 1;\n// c1\n// c2\n// c3\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);
    const after = realReadSync(join(tmpDir, "src", "block.ts"), "utf8");
    expect(after).not.toContain("// c1");
    expect(after).toContain("export const x = 1;");
  });

  it("deletes TODO markers with --confirm", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "todo.ts"),
      "export const x = 1;\n// TODO: fix this\nexport const y = 2;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);
    const after = realReadSync(join(tmpDir, "src", "todo.ts"), "utf8");
    expect(after).not.toContain("TODO");
    expect(after).toContain("export const x = 1;");
  });

  it("deletes across multiple files with --confirm", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "a.ts"),
      "// a1\n// a2\n// a3\nexport const a = 1;\n",
    );
    writeFileSync(
      join(tmpDir, "src", "b.ts"),
      "// b1\n// b2\n// b3\nexport const b = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);
    expect(realReadSync(join(tmpDir, "src", "a.ts"), "utf8")).not.toContain("// a1");
    expect(realReadSync(join(tmpDir, "src", "b.ts"), "utf8")).not.toContain("// b1");
  });

  it("deletion removes correct lines and preserves code", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "file.ts"),
      "export const x = 1;\n// c1\n// c2\n// c3\nexport const y = 2;\n// TODO: fix\nexport const z = 3;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("--confirm", ctx);
    const after = realReadSync(join(tmpDir, "src", "file.ts"), "utf8");
    expect(after).toContain("export const x = 1;");
    expect(after).toContain("export const y = 2;");
    expect(after).toContain("export const z = 3;");
    expect(after).not.toContain("// c1");
    expect(after).not.toContain("TODO");
  });

  it("scans .ts and .tsx files in nested dirs", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "a.ts"),
      "// a1\n// a2\n// a3\nexport const a = 1;\n",
    );
    mkdirSync(join(tmpDir, "src", "inner"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "inner", "b.tsx"),
      "// b1\n// b2\n// b3\nexport const b = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("2 comment-block");
  });

  it("ignores non-TS files like .js", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "x.js"),
      "// j1\n// j2\n// j3\nconst x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("no TypeScript files");
  });

  it("skips node_modules, dist, .git, test directories", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    for (const d of ["node_modules", "dist", ".git", "test"]) {
      mkdirSync(join(tmpDir, d), { recursive: true });
      writeFileSync(
        join(tmpDir, d, "skip.ts"),
        "// s1\n// s2\n// s3\nconst x = 1;\n",
      );
    }
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "keep.ts"),
      "// k1\n// k2\n// k3\nexport const x = 1;\n",
    );
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    const output = ctx.ui.notify.mock.calls[0][0];
    expect(output).toContain("1 comment-block");
  });

  it("handles empty comment-only files", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "empty.ts"), "// only one line\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("handles files with only whitespace", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "ws.ts"), "  \n\n  \n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });

  it("handles empty args string", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "a.ts"), "export const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("", ctx);
  });

  it("handles whitespace-only args", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "a.ts"), "export const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("   ", ctx);
  });

  it("only recognizes --prefixed flags", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-deslop-"));
    ctx = makeCtx(tmpDir);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "a.ts"), "export const x = 1;\n");
    const { handleDeslop } = await import("./deslop.js");
    await handleDeslop("confirm", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "pstack deslop: no candidates found.",
      "info",
    );
  });
});
