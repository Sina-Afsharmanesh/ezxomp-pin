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
import { ompMainGenerationFile, ompStateFile } from "../extensions/evo/paths.ts";

const TOOL_POOL = [
  { name: "read" },
  { name: "write" },
  { name: "bash" },
  { name: "eval" },
  { name: "task" },
  { name: "hub" },
  { name: "ask" },
  { name: "yield" },
  { name: "codesight_get_summary" },
  { name: "code_nav_get_symbol" },
  { name: "backlog_task_view" },
];

let previousOmpHome: string | undefined;
let tmpHome: string;

async function freshExtension(pi: PiStub): Promise<void> {
  vi.resetModules();
  const extension = await import("../extensions/index.ts");
  extension.default(pi as never);
}

async function writeFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf-8");
}

beforeEach(async () => {
  __resetHandlers();
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "evo-transactional-main-"));
  previousOmpHome = process.env.OMP_HOME;
  process.env.OMP_HOME = tmpHome;
  await writeFile(path.join(tmpHome, "agent", "config.yml"), "extensions: []\n");
});

afterEach(async () => {
  if (previousOmpHome === undefined) delete process.env.OMP_HOME;
  else process.env.OMP_HOME = previousOmpHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("transactional EVO main policy", () => {
  it("persists the exact original grants and restores them after a process restart", async () => {
    const original = ["read", "eval", "task", "backlog_task_view"];
    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await pi.setActiveTools(original);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: "/project" });

    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    const generation = JSON.parse(await fs.readFile(ompMainGenerationFile(), "utf-8")) as {
      schemaVersion?: number;
      generationId?: string;
      policyVersion?: string;
      status?: string;
      main?: { originalToolNames?: string[] };
    };
    expect(generation.schemaVersion).toBe(1);
    expect(generation.generationId).toEqual(expect.any(String));
    expect(generation.policyVersion).toEqual(expect.any(String));
    expect(generation.status).toBe("active");
    expect(generation.main?.originalToolNames).toEqual(original);

    __resetHandlers();
    __seedToolPool(TOOL_POOL);
    const restartedPi = makePi();
    await freshExtension(restartedPi);
    const restartedCtx = makeCtx({ cwd: "/project" });
    await __emitHook("session_start", {}, restartedCtx);
    await restartedPi.__handlers.commands.get("evo")!.handler("off", restartedCtx);

    expect(await restartedPi.getActiveTools()).toEqual(original);
  });

  it("injects the canonical routing ladder and returns stable hook reason codes while allowing xd:// reads", async () => {
    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: "/project" });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo")!.handler("on", ctx);

    const promptResults = await __emitHook(
      "before_agent_start",
      { prompt: "inspect policy", systemPrompt: ["base"] },
      ctx,
    );
    const promptResult = promptResults.find(Boolean) as { systemPrompt?: string[] } | undefined;
    const injected = promptResult?.systemPrompt?.join("\n") ?? "";
    expect(injected).toContain("Domain operation");
    expect(injected).toContain("Repository orientation");
    expect(injected).toContain("Protocol artifact");
    expect(injected).toContain("xd://");
    expect(injected).toContain("persistent eval");

    const protocolResults = await __emitHook(
      "tool_call",
      { toolName: "read", input: { path: "xd://code_nav_get_symbol" } },
      ctx,
    );
    expect(protocolResults.every((result) => result === undefined)).toBe(true);

    const blockedResults = await __emitHook(
      "tool_call",
      { toolName: "read", input: { path: "/project/src/policy.ts" } },
      ctx,
    );
    const blocked = blockedResults.find(Boolean) as { block?: boolean; reason?: string } | undefined;
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toMatch(/^EVO_FS_READ_USE_NAV:/);
  });

  it("blocks task dispatch when sub mode cannot prove an active matching generation", async () => {
    const profile = path.join(tmpHome, "agents", "cook-worker.md");
    await writeFile(profile, "---\nname: cook-worker\ntools: eval, hub, yield\n---\nworker\n");

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: "/project" });
    await __emitHook("session_start", {}, ctx);
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    await fs.writeFile(ompStateFile(), "{truncated", "utf-8");
    const results = await __emitHook(
      "tool_call",
      { toolName: "task", input: { agent: "cook-worker", task: "implement" } },
      ctx,
    );
    const blocked = results.find(Boolean) as { block?: boolean; reason?: string } | undefined;
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toMatch(/^EVO_SUBSTATE_INVALID:/);
    expect(blocked?.reason).toContain("/evo-sub");
  });
});
