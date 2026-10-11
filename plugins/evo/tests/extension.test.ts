/**
 * Tests for omp-evo-mode extension.
 *
 * Covers 13 cases from the plan:
 *   1. /evo on snapshots current set, then activates Evo list
 *   2. /evo off restores snapshot
 *   3. tool_call blocks native read/grep/bash/edit/write/glob when Evo on
 *   4. Protocol URIs bypass the block
 *   5. /evo off clears the block
 *   6. Config persistence round-trips
 *   7. /evo-sub on rewrites agent profiles and creates byte-exact state file
 *   8. /evo-sub on is idempotent — second call aborts
 *   9. /evo-sub off restores original content byte-for-byte
 *  10. /evo-sub off is idempotent
 *  11. /evo-sub off tolerates user-deleted profile
 *  12. /evo-sub off overwrites user drift with warning
 *  13. /evo debug + /evo-sub debug return status without mutating
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import makePi, {
  __emitHook,
  __resetHandlers,
  __seedToolPool,
  makeCtx,
  type PiStub,
} from "./__mocks__/pi-coding-agent";
import * as evoFrontmatter from "../extensions/evo/frontmatter.ts";
import * as evoTools from "../extensions/evo/tools.ts";

/** Fake tool surface spanning natives + MCP prefixes + core utilities. */
const FULL_TOOLS = [
  { name: "read" }, { name: "write" }, { name: "bash" }, { name: "edit" },
  { name: "glob" }, { name: "grep" }, { name: "launch" },
  { name: "eval" }, { name: "task" }, { name: "hub" }, { name: "ask" },
  { name: "todo" }, { name: "learn" }, { name: "recall" }, { name: "reflect" },
  { name: "web_search" },
  { name: "mcp__backlog_task_list" }, { name: "mcp__backlog_task_view" },
  { name: "agent_experience_apply_review" },
  { name: "codesight_get_summary" }, { name: "code_nav_get_symbol" },
  { name: "cook_start" }, { name: "omp_workflow_list" },
  { name: "read_skills" },
  { name: "backlog_task_list" },
];

let ompHomeBackup: string | undefined;
let tmpHome: string;

async function freshExtension(pi: PiStub): Promise<void> {
  vi.resetModules();
  const mod = await import("../extensions/index.ts");
  mod.default(pi as never);
}

async function writeFile(p: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf-8");
}

const PROFILE_WITH_FM = `---
name: cook-worker
description: test
tools: read, write, bash
---
body content
`;

const PROFILE_NO_FM = `# Plain markdown
no frontmatter here
`;

const PROFILE_NO_TOOLS = `---
name: empty-profile
description: no tools key
---
body
`;

const EVO_SUB_BRIEF_START = "<!-- evo-sub:brief:start -->";

beforeEach(async () => {
  __resetHandlers();
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "evo-test-"));
  ompHomeBackup = process.env.OMP_HOME;
  process.env.OMP_HOME = tmpHome;
  await fs.mkdir(path.join(tmpHome, "agent"), { recursive: true });
  await writeFile(path.join(tmpHome, "agent", "config.yml"), "extensions: {}\n");
});

afterEach(async () => {
  if (ompHomeBackup === undefined) delete process.env.OMP_HOME;
  else process.env.OMP_HOME = ompHomeBackup;
  await fs.rm(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("evo mode — main agent", () => {
  it("1: /evo on snapshots current set then activates Evo list", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    const evoActive = await pi.getActiveTools();
    expect(evoActive).toContain("eval");
    expect(evoActive).toContain("launch");
    expect(evoActive).toContain("mcp__backlog_task_list");
    expect(evoActive).toContain("read");
    expect(evoActive).not.toContain("write");
    expect(evoActive).not.toContain("bash");
    // Marketplace-plugin tools are all active in evo mode.
    expect(evoActive).toContain("codesight_get_summary");
    expect(evoActive).toContain("code_nav_get_symbol");
    expect(evoActive).toContain("cook_start");
    expect(evoActive).toContain("omp_workflow_list");
    expect(evoActive).toContain("agent_experience_apply_review");
    expect(evoActive).toContain("read_skills");
    expect(evoActive).toContain("backlog_task_list");
  });

  it("1b: protected floor keeps task/hub/eval active even when getAllTools omits them", async () => {
    const pi = makePi();
    // Simulate the failure from the 2026-08-27 session: the orchestrator's
    // getAllTools() snapshot contained only MCP tools — no task/hub/eval —
    // so the pre-floor allowlist stripped orchestration primitives and the
    // cook dispatch flow dead-ended.
    __seedToolPool([
      { name: "mcp__backlog_task_list" },
      { name: "cook_start" },
    ]);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    const evoActive = await pi.getActiveTools();
    expect(evoActive).toContain("task");
    expect(evoActive).toContain("hub");
    expect(evoActive).toContain("eval");
    expect(evoActive).toContain("mcp__backlog_task_list");
    // read only joins the floor when the host registers it — absent here.
    expect(evoActive).not.toContain("read");
  });

  it("1c: read joins the protected floor only when the host registers it", async () => {
    const pi = makePi();
    __seedToolPool([{ name: "read" }, { name: "mcp__backlog_task_list" }]);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo")!.handler("on", ctx);
    const evoActive = await pi.getActiveTools();
    expect(evoActive).toContain("read");
    expect(evoActive).toContain("task");
    expect(evoActive).toContain("eval");
    // filesystem-path read is still blocked by the tool_call hook.
    const results = await __emitHook("tool_call", { toolName: "read", input: { path: "/foo" } }, ctx);
    const blocked = results.find(Boolean) as { block?: boolean; reason?: string } | undefined;
    expect(blocked?.block).toBe(true);
    // Block reason must teach the routing: context → codesight/code-nav ladder.
    expect(blocked?.reason).toMatch(/codesight_get_summary/);
    expect(blocked?.reason).toMatch(/code_nav_get_symbol/);
    expect(blocked?.reason).toMatch(/eval .*writes\/shell/);
  });

  it("2: /evo off restores the snapshotted pre-toggle set", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    // Simulate a session where user previously restricted tools manually.
    const manualList = ["read", "eval", "task"];
    await pi.setActiveTools(manualList);

    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo")!.handler("on", ctx);
    const duringEvo = await pi.getActiveTools();
    expect(duringEvo).not.toEqual(manualList);

    await pi.__handlers.commands.get("evo")!.handler("off", ctx);
    const afterOff = await pi.getActiveTools();
    expect(afterOff).toEqual(manualList);
  });

  it("2b: /evo off with no snapshot restores full getAllTools list", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    // Directly persist main:true but no snapshot in memory — simulating fresh process.
    await fs.writeFile(
      path.join(tmpHome, "agent", "config.yml"),
      "evo-mode:\\n  main: true\\n  sub: false\\n",
    );
    await __emitHook("turn_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("off", ctx);
    const afterOff = await pi.getActiveTools();
    // Restored full pool
    expect(afterOff.length).toBe(FULL_TOOLS.length);
  });

  it("3: tool_call blocks native tools when evo on", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    for (const tool of ["read", "write", "bash", "edit", "glob", "grep"]) {
      const results = await __emitHook("tool_call", { toolName: tool, input: { path: "/foo" } }, ctx);
      const blocked = results.find(Boolean) as { block?: boolean } | undefined;
      expect(blocked?.block).toBe(true);
    }

    // Allowed tools pass through (no hook result).
    const allowedResults = await __emitHook("tool_call", { toolName: "code_nav_get_symbol", input: { symbol: "foo" } }, ctx);
    expect(allowedResults.every((r) => r === undefined)).toBe(true);
  });

  it("4: protocol URIs bypass the block even when evo on", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    const results = await __emitHook(
      "tool_call",
      { toolName: "read", input: { path: "memory://abc123" } },
      ctx,
    );
    const blocked = results.find(Boolean) as { block?: boolean } | undefined;
    expect(blocked?.block).toBeFalsy();
  });

  it("5: /evo off clears the block", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("on", ctx);
    await pi.__handlers.commands.get("evo")!.handler("off", ctx);

    const results = await __emitHook("tool_call", { toolName: "read", input: { path: "/foo" } }, ctx);
    const blocked = results.find(Boolean) as { block?: boolean } | undefined;
    expect(blocked?.block).toBeFalsy();
  });

  it("6: config persistence round-trip across session_start", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo")!.handler("on", ctx);
    const configRaw = await fs.readFile(path.join(tmpHome, "agent", "config.yml"), "utf-8");
    expect(configRaw).toContain("evo-mode:");
    expect(configRaw).toContain("main: true");

    // New process: fresh module state, hydrate from file.
    __resetHandlers();
    __seedToolPool(FULL_TOOLS);
    const pi2 = makePi();
    await freshExtension(pi2);
    const ctx2 = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx2);

    const active = await pi2.getActiveTools();
    expect(active).toContain("eval");
    expect(active).toContain("read");
  });

  it("13a: /evo debug returns status without calling setActiveTools or writing files", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    pi.setActiveTools.mockClear();

    await pi.__handlers.commands.get("evo")!.handler("debug", ctx);
    expect(pi.setActiveTools).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalled();
    const msg = (ctx.ui.notify.mock.calls[0]?.[0] ?? "") as string;
    expect(msg).toContain("evo main:");
    expect(msg).toContain("persisted:");
  });
});

describe("evo-sub — subagent profiles", () => {
  async function seedProfiles(): Promise<{ aPath: string; bPath: string; cPath: string }> {
    const agentsDir = path.join(tmpHome, "agents");
    const aPath = path.join(agentsDir, "cook-worker.md");
    const bPath = path.join(agentsDir, "plain.md");
    const cPath = path.join(agentsDir, "no-tools.md");
    await writeFile(aPath, PROFILE_WITH_FM);
    await writeFile(bPath, PROFILE_NO_FM);
    await writeFile(cPath, PROFILE_NO_TOOLS);
    return { aPath, bPath, cPath };
  }

  it("7: /evo-sub on rewrites profiles and captures byte-exact backup", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath, bPath, cPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    const aAfter = await fs.readFile(aPath, "utf-8");
    expect(aAfter).not.toBe(PROFILE_WITH_FM);
    const aTools = aAfter.match(/^tools: (.+)$/m)?.[1]?.split(", ").sort() ?? [];
    expect(aTools).toEqual(
      expect.arrayContaining([
        "eval", "hub", "yield", "code_nav_get_symbol",
        "backlog_task_edit", "backlog_task_view",
        "codesight_get_summary", "codesight_get_wiki_index",
        "codesight_get_wiki_article", "codesight_get_symbol_index",
      ]),
    );
    // TASK-55.3: web_search left the flat base; the derived floor is
    // {eval, hub, yield} plus the cook-worker role set plus code_nav.
    expect(aTools).not.toContain("web_search");
    expect(aTools).not.toContain("task");
    expect(aTools).not.toContain("bash");
    expect(aAfter).toContain(EVO_SUB_BRIEF_START);

    const bAfter = await fs.readFile(bPath, "utf-8");
    expect(bAfter).toBe(PROFILE_NO_FM);

    const cAfter = await fs.readFile(cPath, "utf-8");
    expect(cAfter).toBe(PROFILE_NO_TOOLS);

    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    const stateRaw = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(stateRaw) as { files: Array<{ path: string; originalContent: string }> };
    expect(state.files.length).toBe(1);
    const aBackup = state.files.find((f) => f.path === aPath);
    expect(aBackup?.originalContent).toBe(PROFILE_WITH_FM);
  });

  it("8: /evo-sub on is idempotent — second call refuses", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    const firstState = await fs.readFile(statePath, "utf-8");

    ctx.ui.notify.mockClear();
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const secondState = await fs.readFile(statePath, "utf-8");
    expect(secondState).toBe(firstState); // untouched

    const msgs = ctx.ui.notify.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(msgs.some((m: string) => /already active|refusal/.test(m))).toBe(true);
  });

  it("9: /evo-sub off restores original content byte-for-byte and clears state", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath, bPath, cPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    const aNow = await fs.readFile(aPath, "utf-8");
    const bNow = await fs.readFile(bPath, "utf-8");
    const cNow = await fs.readFile(cPath, "utf-8");
    expect(aNow).toBe(PROFILE_WITH_FM);
    expect(bNow).toBe(PROFILE_NO_FM);
    expect(cNow).toBe(PROFILE_NO_TOOLS);

    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    await expect(fs.readFile(statePath, "utf-8")).rejects.toThrow();
  });

  it("10: /evo-sub off a second time is a no-op", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    ctx.ui.notify.mockClear();
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);
    const msgs = ctx.ui.notify.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(msgs.some((m: string) => /not active|nothing to restore/.test(m))).toBe(true);

    const aNow = await fs.readFile(aPath, "utf-8");
    expect(aNow).toBe(PROFILE_WITH_FM);
  });

  it("11: /evo-sub off tolerates a user-deleted profile without aborting", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath, bPath, cPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    await fs.unlink(bPath); // user deleted one mid-active
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    // Remaining profiles still restored.
    expect(await fs.readFile(aPath, "utf-8")).toBe(PROFILE_WITH_FM);
    expect(await fs.readFile(cPath, "utf-8")).toBe(PROFILE_NO_TOOLS);
    // State file cleaned up.
    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    await expect(fs.readFile(statePath, "utf-8")).rejects.toThrow();
  });

  it("12: /evo-sub off refuses to restore over user drift and retains recovery evidence", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    // User sneaks in an edit while evo-sub is on.
    const during = await fs.readFile(aPath, "utf-8");
    const drifted = `${during}\nuser drift\n`;
    await fs.writeFile(aPath, drifted, "utf-8");

    ctx.ui.notify.mockClear();
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    // doc-13 restore-refusal: the drifted bytes are RETAINED (never
    // overwritten by the original), the generation is marked failed, and the
    // recovery evidence (state file) stays on disk for manual resolution.
    const aAfter = await fs.readFile(aPath, "utf-8");
    expect(aAfter).toBe(drifted); // drift retained, original NOT restored
    const msgs = ctx.ui.notify.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(msgs.some((m: string) => /EVO_RESTORE_CONFLICT/.test(m))).toBe(true);
    expect(msgs.some((m: string) => /recovery evidence retained/.test(m))).toBe(true);
    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    const state = JSON.parse(await fs.readFile(statePath, "utf-8")) as { status: string };
    expect(state.status).toBe("failed");
  });

  it("13b: /evo-sub debug returns status without mutating files", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const { aPath } = await seedProfiles();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("debug", ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
    const msg = (ctx.ui.notify.mock.calls[0]?.[0] ?? "") as string;
    expect(msg).toContain("evo-sub:");
    expect(msg).toContain("profile dir");
    expect(await fs.readFile(aPath, "utf-8")).toBe(PROFILE_WITH_FM);
  });
});


describe("evo-sub — minimal child profile contract", () => {
  const COOK_PROFILE_NAMES = [
    "cook-audit.md",
    "cook-council.md",
    "cook-council-synthesis.md",
    "cook-judge.md",
    "cook-planner.md",
    "cook-refute.md",
    "cook-researcher.md",
    "cook-scout.md",
    "cook-validator.md",
    "cook-worker.md",
  ] as const;

  /** Seed the ten cook profiles under the temp agents dir; returns name -> path. */
  async function seedProfiles(): Promise<Record<(typeof COOK_PROFILE_NAMES)[number], string> & { aPath: string }> {
    const agentsDir = path.join(tmpHome, "agents");
    const paths = {} as Record<(typeof COOK_PROFILE_NAMES)[number], string>;
    for (const name of COOK_PROFILE_NAMES) {
      const p = path.join(agentsDir, name);
      const content = [
        "---",
        "name: " + name.slice(0, -3),
        "tools: read, write, bash",
        "---",
        "body for " + name,
        "",
      ].join("\n");
      await writeFile(p, content);
      paths[name] = p;
    }
    // cook-worker carries PROFILE_WITH_FM; alias its path as aPath for tests
    // that seed a single legacy backup entry.
    return { ...paths, aPath: paths["cook-worker.md"] };
  }
  it("14: the dedicated child allowlist is eval+hub plus per-role plugin tools", async () => {
    type BuildEvoSubTools = (profileFile?: string) => string[] | Promise<string[]>;
    const buildEvoSubTools = (evoTools as {
      buildEvoSubTools?: BuildEvoSubTools;
    }).buildEvoSubTools;

    expect(buildEvoSubTools).toBeTypeOf("function");
    const base = await buildEvoSubTools!();
    // TASK-55.3: the base floor is exactly eval+hub+yield — web_search left
    // the flat base and code_nav is role-added only for known cook roles.
    expect(base).toEqual(expect.arrayContaining(["eval", "hub", "yield"]));
    expect(base).not.toContain("web_search");
    expect(base).not.toContain("code_nav_get_symbol");
    expect(base).not.toContain("task");
    expect(base).not.toContain("cook_dispatch_worker");
    expect(await buildEvoSubTools!("cook-scout.md")).toEqual(
      expect.arrayContaining([
        "eval", "hub", "yield", "code_nav_get_symbol",
        "codesight_get_summary", "codesight_get_wiki_index",
        "codesight_get_wiki_article", "codesight_get_symbol_index",
      ]),
    );
    const scout = await buildEvoSubTools!("cook-scout.md");
    expect(scout).not.toContain("backlog_task_edit"); // not a scout duty
    const worker = await buildEvoSubTools!("cook-worker.md");
    expect(worker).toContain("backlog_task_edit");
    expect(worker).toContain("backlog_task_view");
    // Every mapped role: base + codesight orientation + no orchestration/natives.
    const roleExpectations: Record<string, string[]> = {
      "cook-judge.md": ["backlog_task_edit", "codesight_get_blast_radius", "codesight_get_change_impact"],
      "cook-planner.md": ["backlog_task_create", "backlog_task_list", "backlog_doc_create", "codesight_get_wiki_index"],
      "cook-researcher.md": ["backlog_doc_create", "codesight_get_import_graph"],
      "cook-scout.md": ["codesight_get_summary", "codesight_get_wiki_article"],
      "cook-validator.md": ["backlog_task_edit", "cook_journal", "codesight_get_change_impact", "codesight_get_blast_radius"],
      "cook-worker.md": ["backlog_task_edit", "codesight_get_summary", "codesight_get_wiki_article"],
      "cook-audit.md": ["backlog_task_view", "codesight_get_blast_radius", "codesight_get_change_impact"],
      "cook-refute.md": ["backlog_task_view", "codesight_get_blast_radius", "codesight_get_change_impact"],
    };
    for (const [file, mustHave] of Object.entries(roleExpectations)) {
      const tools = await buildEvoSubTools!(file);
      expect(tools, file).toEqual(expect.arrayContaining(["eval", "hub", "yield", "code_nav_get_symbol", ...mustHave]));
      for (const banned of ["task", "read", "bash", "write", "edit", "grep", "glob", "cook_dispatch_worker", "cook_next", "cook_advance", "cook_decompose", "web_search"]) {
        expect(tools, `${file} must not expose ${banned}`).not.toContain(banned);
      }
    }
    // Role separation: scout never writes backlog; planner never blasts.
    expect(await buildEvoSubTools!("cook-scout.md")).not.toContain("backlog_task_edit");
    expect(await buildEvoSubTools!("cook-judge.md")).not.toContain("backlog_doc_create");
    expect(await buildEvoSubTools!("unknown-profile.md")).toEqual(base);
  });

  it("15: profile transformation preserves frontmatter and injects one complete marked brief", () => {
    const rewritten = evoFrontmatter.rewriteToolsFrontmatter(
      PROFILE_WITH_FM,
      ["eval", "hub"],
    ).content;
    expect(rewritten.replace("tools: eval, hub", "tools: read, write, bash")).toBe(PROFILE_WITH_FM);

    type InjectEvoSubInstructions = (content: string) => string;
    const injectEvoSubInstructions = (evoFrontmatter as {
      injectEvoSubInstructions?: InjectEvoSubInstructions;
    }).injectEvoSubInstructions;

    expect(injectEvoSubInstructions).toBeTypeOf("function");
    const once = injectEvoSubInstructions!(rewritten);
    const twice = injectEvoSubInstructions!(once);
    expect(twice).toBe(once);
    expect(once.indexOf(EVO_SUB_BRIEF_START)).toBeGreaterThan(once.indexOf("\n---\n"));
    expect(once.match(new RegExp(EVO_SUB_BRIEF_START, "g"))?.length).toBe(1);
    expect(once).toMatch(/hub.*Main|Main.*hub/i);
    expect(once).toMatch(/findings.*status.*blockers/i);
    expect(once).toMatch(/milestones?.*completion|completion.*milestones?/i);
    expect(once).toMatch(/pre-digested evidence/i);
    expect(once).toMatch(/no exploration homework/i);
    expect(once).toMatch(/within about 3 tool calls/i);
    expect(once).toMatch(/single-file ownership/i);
  });

  it("16: on and off touch all and only the ten cook profiles and restore their original bytes", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const agentsDir = path.join(tmpHome, "agents");
    const originals = new Map<string, string>();
    for (const name of COOK_PROFILE_NAMES) {
      const original = [
        "---",
        "name: " + name.slice(0, -3),
        "tools: read, write, bash",
        "---",
        "body for " + name,
        "",
      ].join("\n");
      originals.set(name, original);
      await writeFile(path.join(agentsDir, name), original);
    }
    const unrelatedPath = path.join(agentsDir, "custom-agent.md");
    const unrelatedOriginal = "---\nname: custom-agent\ntools: read, write\n---\ncustom body\n";
    await writeFile(unrelatedPath, unrelatedOriginal);

    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    for (const [name, original] of originals) {
      const profilePath = path.join(agentsDir, name);
      const active = await fs.readFile(profilePath, "utf-8");
      expect(active).not.toBe(original);
      const tools = active.match(/^tools: (.+)$/m)?.[1]?.split(", ") ?? [];
      // TASK-55.3 derivation: base {eval, hub, yield} + role set + code_nav.
      expect(tools).toContain("eval");
      expect(tools).toContain("hub");
      expect(tools).toContain("yield");
      expect(tools).not.toContain("web_search");
      expect(tools).toContain("code_nav_get_symbol");
      expect(tools.some((t) => t.startsWith("codesight_"))).toBe(true);
      expect(tools).not.toContain("bash");
      expect(tools).not.toContain("read");
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("task");
      expect(tools).not.toContain("cook_next");
      expect(tools).not.toContain("cook_decompose");
      // Role-specific differentiation through the real rewrite path:
      if (name === "cook-planner.md") expect(tools).toContain("backlog_task_create");
      if (name === "cook-researcher.md") expect(tools).toContain("backlog_doc_create");
      if (name === "cook-validator.md") {
        expect(tools).toContain("backlog_task_edit");
        expect(tools).toContain("cook_journal");
        expect(tools).not.toContain("backlog_doc_create"); // validator doesn't author docs
      }
      if (name === "cook-scout.md") expect(tools).not.toContain("backlog_task_edit");
      if (name === "cook-audit.md" || name === "cook-refute.md") {
        expect(tools).toContain("backlog_task_view");
        expect(tools).toContain("codesight_get_blast_radius");
        expect(tools).toContain("codesight_get_change_impact");
        expect(tools).not.toContain("backlog_task_edit");
      }
      if (name === "cook-worker.md") {
        expect(tools).toContain("backlog_task_edit");
        expect(tools).toContain("backlog_task_view");
      }
      expect(tools).not.toContain("cook_dispatch_worker");
      expect(active.match(new RegExp(EVO_SUB_BRIEF_START, "g"))?.length).toBe(1);
      expect(active).toMatch(/eval kernel/i); // brief names the routing
    }
    expect(await fs.readFile(unrelatedPath, "utf-8")).toBe(unrelatedOriginal);

    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);
    for (const [name, original] of originals) {
      expect(await fs.readFile(path.join(agentsDir, name), "utf-8")).toBe(original);
    }
    expect(await fs.readFile(unrelatedPath, "utf-8")).toBe(unrelatedOriginal);
  });

  it("17: /evo-sub no longer imports the broad main builder and leaves the /evo command boundary alone", async () => {
    const evoSubSource = await fs.readFile(
      new URL("../extensions/evo/evoSub.ts", import.meta.url),
      "utf-8",
    );
    expect(evoSubSource).toContain("buildEvoSubTools");
    expect(evoSubSource).not.toContain("buildEvoMainTools");

    const indexSource = await fs.readFile(
      new URL("../extensions/index.ts", import.meta.url),
      "utf-8",
    );
    const evoStart = indexSource.indexOf('pi.registerCommand("evo",');
    const evoSubStart = indexSource.indexOf('pi.registerCommand("evo-sub",');
    expect(evoStart).toBeGreaterThanOrEqual(0);
    expect(evoSubStart).toBeGreaterThan(evoStart);
    expect(indexSource.slice(evoStart, evoSubStart)).not.toContain("buildEvoSubTools");
  });

  it("18: hydrated active sub mode re-proves a committed generation read-only", async () => {
    // Seed a cook profile under the (temp) global agents dir. The test cwd
    // (plugins/evo) has no .omp/agents, so the command path activates in
    // global scope only — the one generation shape the extension's
    // cwd-less subCtl can re-prove on a fresh hydrate.
    const agentsDir = path.join(tmpHome, "agents");
    const prof = path.join(agentsDir, "cook-worker.md");
    await writeFile(prof, PROFILE_WITH_FM);

    // Process 1: activate through the real command path.
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    const statePath = path.join(tmpHome, "agent", "evo-mode", "sub-state.json");
    const stateBefore = await fs.readFile(statePath, "utf-8");
    const profileBefore = await fs.readFile(prof, "utf-8");
    expect(profileBefore).toContain(EVO_SUB_BRIEF_START); // activation rewrote it

    // Process 2: fresh module state. Hydration must re-prove the committed
    // generation (not a legacy snapshot) and report it WITHOUT rewriting or
    // retouching the record or the profile.
    __resetHandlers();
    __seedToolPool(FULL_TOOLS);
    const pi2 = makePi();
    await freshExtension(pi2);
    const ctx2 = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx2);
    await pi2.__handlers.commands.get("evo-sub")!.handler("status", ctx2);

    const msg = (ctx2.ui.notify.mock.calls.at(-1)?.[0] ?? "") as string;
    expect(msg).toContain("evo-sub: ON");
    // Base floor post-TASK-55.3: eval, hub, yield.
    expect(msg).toContain("allowlist size: 3");
    // Read-only hydration: state bytes and profile bytes untouched.
    expect(await fs.readFile(statePath, "utf-8")).toBe(stateBefore);
    expect(await fs.readFile(prof, "utf-8")).toBe(profileBefore);
  });
});
