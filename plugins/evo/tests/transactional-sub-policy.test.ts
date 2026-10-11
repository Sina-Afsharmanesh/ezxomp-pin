import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import makePi, {
  __resetHandlers,
  __seedToolPool,
  makeCtx,
  type PiStub,
} from "./__mocks__/pi-coding-agent";
import { ompStateFile } from "../extensions/evo/paths.ts";

const TOOL_POOL = [
  { name: "read" },
  { name: "write" },
  { name: "bash" },
  { name: "eval" },
  { name: "task" },
  { name: "hub" },
  { name: "yield" },
  { name: "web_search" },
  { name: "role_capability" },
  { name: "codesight_get_summary" },
  { name: "code_nav_get_symbol" },
];

let previousOmpHome: string | undefined;
let tmpHome: string;
let project: string;

async function freshExtension(pi: PiStub): Promise<void> {
  vi.resetModules();
  // The extension owns process-local controller state, so this test intentionally reloads it.
  const extension = await import("../extensions/index.ts");
  extension.default(pi as never);
}

async function writeFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf-8");
}

function toolsFromProfile(content: string): string[] {
  const match = content.match(/^tools:\s*(.*)$/m);
  return (match?.[1] ?? "").split(",").map((tool) => tool.trim()).filter(Boolean);
}

beforeEach(async () => {
  __resetHandlers();
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "evo-transactional-sub-"));
  project = path.join(tmpHome, "project");
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

describe("transactional EVO subagent policy", () => {
  it("derives least-privilege grants from the project-nearest original profile", async () => {
    const globalProfile = path.join(tmpHome, "agents", "cook-worker.md");
    const projectProfile = path.join(project, ".omp", "agents", "cook-worker.md");
    const globalOriginal = "---\nname: cook-worker\ntools: read, global_only\n---\nglobal\n";
    const projectOriginal = "---\nname: cook-worker\ntools: read, write, task, yield, role_capability\n---\nproject\n";
    await writeFile(globalProfile, globalOriginal);
    await writeFile(projectProfile, projectOriginal);

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    expect(await fs.readFile(globalProfile, "utf-8")).toBe(globalOriginal);
    const effective = toolsFromProfile(await fs.readFile(projectProfile, "utf-8"));
    expect(effective).toEqual(expect.arrayContaining(["eval", "hub", "yield", "role_capability"]));
    expect(effective).not.toEqual(expect.arrayContaining(["read", "write", "bash", "task", "web_search"]));
  });

  it("persists a versioned active generation with original and effective hashes before reporting success", async () => {
    const profile = path.join(project, ".omp", "agents", "cook-worker.md");
    await writeFile(profile, "---\nname: cook-worker\ntools: yield, role_capability\n---\nworker\n");

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    const generation = JSON.parse(await fs.readFile(ompStateFile(), "utf-8")) as {
      schemaVersion?: number;
      generationId?: string;
      policyVersion?: string;
      catalogHash?: string;
      status?: string;
      profiles?: Array<{
        canonicalPath?: string;
        scope?: string;
        originalHash?: string;
        effectiveContentHash?: string;
        originalToolNames?: string[];
        effectiveToolNames?: string[];
        phase?: string;
      }>;
    };
    expect(generation).toMatchObject({
      schemaVersion: 1,
      generationId: expect.any(String),
      policyVersion: expect.any(String),
      catalogHash: expect.any(String),
      status: "active",
    });
    expect(generation.profiles).toHaveLength(1);
    expect(generation.profiles?.[0]).toMatchObject({
      canonicalPath: await fs.realpath(profile),
      scope: "project",
      originalHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      effectiveContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      originalToolNames: ["yield", "role_capability"],
      phase: "applied",
    });
    expect(generation.profiles?.[0]?.effectiveToolNames).toEqual(
      expect.arrayContaining(["eval", "hub", "yield", "role_capability"]),
    );
  });

  it("refuses conflict restoration without overwriting drift or deleting recovery evidence", async () => {
    const profile = path.join(project, ".omp", "agents", "cook-worker.md");
    await writeFile(profile, "---\nname: cook-worker\ntools: yield, role_capability\n---\noriginal\n");

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const drifted = `${await fs.readFile(profile, "utf-8")}\noperator edit\n`;
    await fs.writeFile(profile, drifted, "utf-8");
    ctx.ui.notify.mockClear();

    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    expect(await fs.readFile(profile, "utf-8")).toBe(drifted);
    await expect(fs.access(ompStateFile())).resolves.toBeUndefined();
    const config = await fs.readFile(path.join(tmpHome, "agent", "config.yml"), "utf-8");
    expect(config).toContain("sub: true");
    const notification = String(ctx.ui.notify.mock.calls.at(-1)?.[0] ?? "");
    expect(notification).toContain("EVO_RESTORE_CONFLICT");
  });

  it("refresh rotates only the effective generation while preserving immutable originals", async () => {
    const profile = path.join(project, ".omp", "agents", "cook-worker.md");
    const original = "---\nname: cook-worker\ntools: yield, role_capability\n---\nworker\n";
    await writeFile(profile, original);

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const before = JSON.parse(await fs.readFile(ompStateFile(), "utf-8")) as {
      generationId: string;
      profiles: Array<{ originalContent: string; originalHash: string }>;
    };

    await pi.__handlers.commands.get("evo-sub")!.handler("refresh", ctx);
    const after = JSON.parse(await fs.readFile(ompStateFile(), "utf-8")) as typeof before;

    expect(after.generationId).not.toBe(before.generationId);
    expect(after.profiles[0]?.originalContent).toBe(original);
    expect(after.profiles[0]?.originalHash).toBe(before.profiles[0]?.originalHash);
  });

  it("regenerate restores first and starts a new generation without adopting an EVO overlay as original", async () => {
    const profile = path.join(project, ".omp", "agents", "cook-worker.md");
    const original = "---\nname: cook-worker\ntools: yield, role_capability\n---\nworker\n";
    await writeFile(profile, original);

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const before = JSON.parse(await fs.readFile(ompStateFile(), "utf-8")) as {
      generationId: string;
      profiles: Array<{ originalContent: string }>;
    };

    await pi.__handlers.commands.get("evo-sub")!.handler("regenerate", ctx);
    const after = JSON.parse(await fs.readFile(ompStateFile(), "utf-8")) as typeof before;

    expect(after.generationId).not.toBe(before.generationId);
    expect(after.profiles[0]?.originalContent).toBe(original);
    expect(after.profiles[0]?.originalContent).not.toContain("evo-sub:brief:start");
  });

  it("parses YAML-array grants and restores CRLF profile bytes exactly", async () => {
    const profile = path.join(project, ".omp", "agents", "cook-worker.md");
    const original = "---\r\nname: cook-worker\r\ntools:\r\n  - yield\r\n  - role_capability\r\n---\r\nworker\r\n";
    await writeFile(profile, original);

    const pi = makePi();
    __seedToolPool(TOOL_POOL);
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: project });
    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);

    const active = await fs.readFile(profile, "utf-8");
    const effective = toolsFromProfile(active);
    expect(effective).toEqual(expect.arrayContaining(["eval", "hub", "yield", "role_capability"]));
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);
    expect(await fs.readFile(profile, "utf-8")).toBe(original);
  });
});
