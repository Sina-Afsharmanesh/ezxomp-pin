/**
 * backlog_doc_create CLI flag contract (TASK-39 F6).
 *
 * The installed backlog CLI (1.5.0) rejects `doc create --content`: `doc
 * create` only accepts title, -p/--path, -t/--type, --plain. Content is
 * delivered by `doc update <docId> --content <content>`. The wrapper
 * (plugins/backlog/extensions/tools.ts, backlog_doc_create) instead emits
 * `doc create <title> --content <content> -t <type>` and maps the wrapper
 * type enum (spec|research|adr|guide|report) verbatim, while the CLI type
 * enum is readme|guide|specification|other.
 *
 * This test pins the wrapper's argv contract against the installed CLI's
 * accepted surface (verified 2026-08-28: `backlog doc create --help`).
 * RED cases: --content on create (rejected by CLI), verbatim type mapping.
 * Green control: -p passthrough, title position.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import makePi, {
  __getToolHandler,
  __resetHandlers,
  makeCtx,
  type CtxStub,
  type PiStub,
} from "./__mocks__/pi-coding-agent";
import { registerBacklogTools } from "@ezxomp/backlog/extensions/tools.ts";

interface ExecCall {
  cmd: string;
  args: string[];
}

let tmpDir: string;
let execCalls: ExecCall[];

beforeEach(() => {
  __resetHandlers();
  tmpDir = mkdtempSync(path.join(tmpdir(), "backlog-doc-"));
  execCalls = [];
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function freshRegister(): { pi: PiStub; ctx: CtxStub } {
  const pi = makePi();
  (pi.exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (cmd: string, args: string[]) => {
      execCalls.push({ cmd, args });
      if (args[0] === "doc" && args[1] === "create") {
        return { code: 0, stdout: "Created document doc-1\n", stderr: "" };
      }
      return { code: 0, stdout: "Updated document doc-1\n", stderr: "" };
    },
  );
  registerBacklogTools(pi as never, { currentCwd: tmpDir });
  const ctx = makeCtx({ cwd: tmpDir, hasUI: false });
  return { pi, ctx };
}

async function runDocCreate(
  pi: PiStub,
  ctx: CtxStub,
  params: Record<string, unknown>,
): Promise<{ content: { text: string }[]; isError?: boolean }> {
  const h = __getToolHandler("backlog_doc_create");
  return (await h.execute!(
    "id",
    params,
    new AbortController().signal,
    undefined,
    ctx,
  )) as { content: { text: string }[]; isError?: boolean };
}

describe("backlog_doc_create CLI flag contract (F6)", () => {
  it("RED: content is not passed via `doc create` (CLI rejects --content there); it goes via a follow-up doc update", async () => {
    const { pi, ctx } = freshRegister();
    const r = await runDocCreate(pi, ctx, {
      title: "T39 Probe",
      content: "body text",
      type: "guide",
    });
    expect(r.isError).toBeFalsy();

    const create = execCalls.find((c) => c.args[0] === "doc" && c.args[1] === "create");
    expect(create).toBeDefined();
    const args = create!.args;
    expect(args[2]).toBe("T39 Probe");
    // The installed CLI's `doc create` has no --content option.
    expect(args).not.toContain("--content");
    expect(args).not.toContain("body text");

    // Content must be delivered via `doc update <docId> --content <body>`
    // using the doc id parsed from create's stdout.
    const update = execCalls.find((c) => c.args[0] === "doc" && c.args[1] === "update");
    expect(update).toBeDefined();
    const u = update!.args;
    expect(u).toContain("doc-1");
    expect(u).toContain("--content");
    expect(u[u.indexOf("--content") + 1]).toBe("body text");
  });

  it("RED: maps the wrapper type enum onto the CLI enum (readme|guide|specification|other)", async () => {
    const cases: Array<[string, string]> = [
      ["spec", "specification"],
      ["research", "other"],
      ["adr", "other"],
      ["guide", "guide"],
      ["report", "other"],
    ];
    for (const [input, cliType] of cases) {
      execCalls.length = 0;
      const { pi, ctx } = freshRegister();
      await runDocCreate(pi, ctx, { title: `T39 ${input}`, content: "c", type: input });
      const create = execCalls.find((c) => c.args[0] === "doc" && c.args[1] === "create");
      expect(create).toBeDefined();
      const tIdx = create!.args.indexOf("-t");
      expect(tIdx).toBeGreaterThan(0);
      expect(create!.args[tIdx + 1]).toBe(cliType);
    }
  });

  it("passes the optional path through as -p (control: green today)", async () => {
    const { pi, ctx } = freshRegister();
    await runDocCreate(pi, ctx, {
      title: "T39 Path",
      content: "c",
      type: "guide",
      path: "guides/api",
    });
    const create = execCalls.find((c) => c.args[0] === "doc" && c.args[1] === "create");
    expect(create).toBeDefined();
    const pIdx = create!.args.indexOf("-p");
    expect(pIdx + 1 < create!.args.length).toBe(true);
    expect(create!.args[pIdx + 1]).toBe("guides/api");
  });
});
