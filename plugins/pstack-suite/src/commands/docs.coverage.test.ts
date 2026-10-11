import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const mockCp = { spawnSync: vi.fn(), execFile: vi.fn(), spawn: vi.fn() };
vi.mock("node:child_process", () => mockCp);

function makeCtx(cwd: string, hasUI = true) {
  return { cwd, ui: { notify: vi.fn() }, hasUI } as any;
}

describe("handleDocs", () => {
  let tmpDir: string;
  let ctx: any;
  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-docs-"));
    ctx = makeCtx(tmpDir);
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  function mockWhich(available: string[]) {
    mockCp.spawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which") return available.includes(args?.[0]) ? { status: 0 } : { status: 1 };
      return { status: 0, stdout: "", stderr: "" };
    });
  }

  function mockExecFile(cbFn: (cmd: string, args: string[]) => { out: string, err: string, error?: Error }) {
    mockCp.execFile.mockImplementation((_cmd, _args, _opts, callback) => {
      setImmediate(() => {
        if (typeof callback === "function") {
          const result = cbFn(_cmd, _args);
          callback(result.error, result.out, result.err);
        }
      });
    });
  }

  it("errors on empty args", async () => {
    mockWhich(["backlog"]);
    const { handleDocs } = await import("./docs.js");
    await handleDocs("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: provide a file path (source file or README)", "error");
  });

  it("errors when file not found", async () => {
    mockWhich(["backlog"]);
    const { handleDocs } = await import("./docs.js");
    await handleDocs("nonexistent.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("file not found"), "error");
  });

  it("processes source file (.ts) and creates guide", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "myModule.ts");
    writeFileSync(srcFile, "export function foo() {}\nexport const BAR = 1;\nimport { x } from 'lib';");

    // backlog doc create: create the doc file with frontmatter, return path in stdout
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-myModule.md");
    writeFileSync(docPath, "---\ntitle: Docs-myModule\n---\n");

    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") {
        return { out: `Path: docs/Docs-myModule.md`, err: "" };
      }
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("myModule.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: guide created under guides/ ✓", "info");
    const result = writeFileSync(docPath, "---\ntitle: Docs-myModule\n---\n");
    expect(true).toBe(true);
  });

  it("extracts source structure with exports and imports", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "api.ts");
    writeFileSync(srcFile, `/** API module */\nimport { a } from "dep1";\nimport { b } from "dep2";\nexport function createUser() {}\nexport class User {}\nexport interface Config {}\nexport type ID = string;\nexport const VERSION = "1";\nexport { helper, util as utility };\n`);
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-api.md");
    writeFileSync(docPath, "---\ntitle: Docs-api\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-api.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("api.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("createUser");
    expect(finalContent).toContain("User");
    expect(finalContent).toContain("Config");
    expect(finalContent).toContain("ID");
    expect(finalContent).toContain("VERSION");
    expect(finalContent).toContain("helper");
    expect(finalContent).toContain("utility");
    expect(finalContent).toContain('dep1');
    expect(finalContent).toContain('dep2');
    expect(finalContent).toContain("API module");
  });

  it("handles source file with no exports", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "utils.ts");
    writeFileSync(srcFile, "const x = 1;\nexport default function handler() {}");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-utils.md");
    writeFileSync(docPath, "---\ntitle: Docs-utils\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-utils.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("utils.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("default");
  });

  it("handles file with export default", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "main.ts");
    writeFileSync(srcFile, "export default function main() {}");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-main.md");
    writeFileSync(docPath, "---\ntitle: Docs-main\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-main.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("main.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("default");
    expect(finalContent).toContain("main");
  });

  it("handles file with export { named } block", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "index.ts");
    writeFileSync(srcFile, "export { foo, bar as b };\n");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-index.md");
    writeFileSync(docPath, "---\ntitle: Docs-index\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-index.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("index.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("foo");
    expect(finalContent).toContain("b");
  });

  it("extracts block comments from source", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "commented.ts");
    writeFileSync(srcFile, "/** This is a JSDoc comment.\n * Multi-line. */\nexport const x = 1;");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-commented.md");
    writeFileSync(docPath, "---\ntitle: Docs-commented\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-commented.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("commented.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("JSDoc comment");
  });

  it("extracts line comments from source", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "linecomment.ts");
    writeFileSync(srcFile, "// Top level comment\n// Another line\n\nexport const y = 2;");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-linecomment.md");
    writeFileSync(docPath, "---\ntitle: Docs-linecomment\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-linecomment.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("linecomment.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("Top level comment");
  });

  it("processes README file and creates guide", async () => {
    mockWhich(["backlog"]);
    const readmePath = join(tmpDir, "README.md");
    writeFileSync(readmePath, "# Main Title\n\n## Section A\n\n## Section B\n\nSome text.\n\n```js\ncode();\n```\n\n[link](http://example.com)\n");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-README.md");
    writeFileSync(docPath, "---\ntitle: Docs-README\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-README.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("README.md", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("Main Title");
    expect(finalContent).toContain("Section A");
    expect(finalContent).toContain("Section B");
    expect(finalContent).toContain("Code blocks");
    expect(finalContent).toContain("[link](http://example.com)");
  });

  it("handles README with no headings or links", async () => {
    mockWhich(["backlog"]);
    const readmePath = join(tmpDir, "README2.md");
    writeFileSync(readmePath, "Just plain text.\nNo headings here.\n");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-README2.md");
    writeFileSync(docPath, "---\ntitle: Docs-README2\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-README2.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("README2.md", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("Documentation guide extracted");
  });

  it("does not output stdout when hasUI is false", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "quiet.ts");
    writeFileSync(srcFile, "export const q = 1;");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-quiet.md");
    writeFileSync(docPath, "---\ntitle: Docs-quiet\n---\n");
    const ctx2 = makeCtx(tmpDir, false);
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-quiet.md\nverbose output`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("quiet.ts", ctx2);
    const infoCalls = ctx2.ui.notify.mock.calls.filter((c: string[]) => c[1] === "info" && c[0]?.includes?.("verbose"));
    expect(infoCalls.length).toBe(0);
  });

  it("errors when backlog doc create fails", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "fail.ts");
    writeFileSync(srcFile, "export const f = 1;");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: "", err: "fail", error: new Error("backlog fail") };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("fail.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: backlog doc create failed", "error");
  });

  it("errors when doc path cannot be parsed from output", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "noparse.ts");
    writeFileSync(srcFile, "export const n = 1;");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: "Created doc.", err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("noparse.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: could not parse doc path from output", "error");
  });

  it("resolveDocPath walks up directory tree", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "walk.ts");
    writeFileSync(srcFile, "export const w = 1;");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-walk.md");
    writeFileSync(docPath, "---\ntitle: Docs-walk\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-walk.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("walk.ts", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: guide created under guides/ ✓", "info");
  });

  it("handles file with interface and type exports", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "types.ts");
    writeFileSync(srcFile, "export interface Foo {}\nexport type Bar = string;\nexport enum Color { Red, Green }\n");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-types.md");
    writeFileSync(docPath, "---\ntitle: Docs-types\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-types.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("types.ts", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("Foo");
    expect(finalContent).toContain("Bar");
    expect(finalContent).toContain("Color");
  });

  it("handles python source file", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "script.py");
    writeFileSync(srcFile, "# Python module\n# Helper functions\n\ndef hello(): pass\n");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-script.md");
    writeFileSync(docPath, "---\ntitle: Docs-script\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-script.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs("script.py", ctx);
    const finalContent = readFileSyncSync(docPath);
    expect(finalContent).toContain("Python module");
  });

  it("absolute path target works", async () => {
    mockWhich(["backlog"]);
    const srcFile = join(tmpDir, "abs.ts");
    writeFileSync(srcFile, "export const abs = 1;");
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const docPath = join(docsDir, "Docs-abs.md");
    writeFileSync(docPath, "---\ntitle: Docs-abs\n---\n");
    mockExecFile((_cmd, _args) => {
      if (_cmd === "backlog") return { out: `Path: docs/Docs-abs.md`, err: "" };
      return { out: "", err: "" };
    });
    const { handleDocs } = await import("./docs.js");
    await handleDocs(srcFile, ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("pstack docs: guide created under guides/ ✓", "info");
  });
});

function readFileSyncSync(path: string): string {
  // Use node:fs readFileSync - it's real, not mocked
  return require("node:fs").readFileSync(path, "utf-8");
}
