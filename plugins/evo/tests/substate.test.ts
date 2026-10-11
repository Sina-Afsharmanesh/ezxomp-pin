/**
 * substate.json read/write contract (TASK-39 F5).
 *
 * readSubState is the only gate between evo-sub's byte-exact backup file and
 * every consumer: activate refusal, hydrate, deactivate restore, and cook's
 * personal-scope skip. A corrupt or foreign state file must be treated as
 * "evo-sub state present" (fail-closed) — never as "no state" — and
 * readSubState must NEVER delete the file. Backup evidence is for manual
 * recovery; silent deletion or flag-clearing loses the user's original
 * profiles permanently.
 *
 * RED (vs current unvalidated JSON.parse): wrong-shape cases and foreign
 * paths — readSubState currently returns the object cast as SubStateFile.
 * Contract pins (green today, guard the fix): round-trip, missing file,
 * malformed JSON → null + file preserved, and the extension-level
 * fail-closed behaviors (describe 2).
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
import { readSubState, writeSubState } from "../extensions/evo/substate.ts";
import { ompAgentProfilesDir, ompStateFile } from "../extensions/evo/paths.ts";
import { readEvoConfig } from "../extensions/evo/config.ts";

let tmpHome: string;
let ompHomeBackup: string | undefined;

beforeEach(async () => {
  __resetHandlers();
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "substate-test-"));
  ompHomeBackup = process.env.OMP_HOME;
  process.env.OMP_HOME = tmpHome;
  await fs.mkdir(path.join(tmpHome, "agent"), { recursive: true });
  await fs.writeFile(path.join(tmpHome, "agent", "config.yml"), "extensions: {}\n", "utf-8");
});

afterEach(async () => {
  if (ompHomeBackup === undefined) delete process.env.OMP_HOME;
  else process.env.OMP_HOME = ompHomeBackup;
  await fs.rm(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeRaw(raw: string): Promise<string> {
  const p = ompStateFile();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, raw, "utf-8");
  return p;
}

describe("readSubState — validation contract (F5)", () => {
  it("round-trips a valid state file", async () => {
    const entry = { path: path.join(tmpHome, "agents", "cook-worker.md"), originalContent: "# profile\n" };
    await writeSubState([entry], ["eval", "hub"]);
    const state = await readSubState();
    expect(state).not.toBeNull();
    expect(state!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state!.toolListHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state!.files).toEqual([entry]);
  });

  it("returns null when the state file does not exist", async () => {
    expect(await readSubState()).toBeNull();
  });

  it("returns null for malformed JSON and does NOT delete the file (fail-closed)", async () => {
    const p = await writeRaw("{{{ not json");
    await expect(readSubState()).resolves.toBeNull();
    // Backup evidence is preserved for manual recovery — never auto-deleted.
    await expect(fs.readFile(p, "utf-8")).resolves.toBe("{{{ not json");
  });

  it("returns null for a wrong shape (bare object — no timestamp/hash/files) [RED]", async () => {
    const p = await writeRaw("{}");
    // RED: current code returns the object cast as SubStateFile.
    await expect(readSubState()).resolves.toBeNull();
    await expect(fs.access(p)).resolves.toBeUndefined(); // file preserved
  });

  it("returns null for a wrong shape (files not an array) [RED]", async () => {
    const p = await writeRaw(JSON.stringify({ timestamp: "t", toolListHash: "h", files: "nope" }));
    await expect(readSubState()).resolves.toBeNull();
    await expect(fs.access(p)).resolves.toBeUndefined();
  });

  it("returns null for a wrong shape (entry missing originalContent) [RED]", async () => {
    const p = await writeRaw(JSON.stringify({
      timestamp: "t",
      toolListHash: "h",
      files: [{ path: path.join(tmpHome, "agents", "cook-worker.md") }],
    }));
    await expect(readSubState()).resolves.toBeNull();
    await expect(fs.access(p)).resolves.toBeUndefined();
  });

  it("returns null for a foreign file path outside the agent profiles dir [RED]", async () => {
    const p = await writeRaw(JSON.stringify({
      timestamp: "t",
      toolListHash: "h",
      files: [{ path: "/etc/hostname", originalContent: "root\n" }],
    }));
    // RED: current code returns the object. A backup that references paths
    // outside OMP_HOME/agents must never be accepted — restore would touch
    // arbitrary filesystem locations.
    await expect(readSubState()).resolves.toBeNull();
    await expect(fs.access(p)).resolves.toBeUndefined();
    // The in-dir containment check is anchored at OMP_HOME/agents.
    expect(ompAgentProfilesDir()).toBe(path.join(tmpHome, "agents"));
  });
});

describe("evo-sub with a corrupt state file — fail-closed end-to-end (F5)", () => {
  const FULL_TOOLS = [
    { name: "read" }, { name: "write" }, { name: "bash" }, { name: "edit" },
    { name: "eval" }, { name: "hub" }, { name: "web_search" },
    { name: "backlog_task_list" }, { name: "codesight_get_summary" },
  ];

  const PROFILE_WITH_FM = `---\nname: cook-worker\ndescription: test\ntools: read, write, bash\n---\nbody content\n`;

  async function freshExtension(pi: PiStub): Promise<void> {
    vi.resetModules();
    const mod = await import("../extensions/index.ts");
    mod.default(pi as never);
  }

  async function seedProfile(): Promise<string> {
    const aPath = path.join(ompAgentProfilesDir(), "cook-worker.md");
    await fs.mkdir(path.dirname(aPath), { recursive: true });
    await fs.writeFile(aPath, PROFILE_WITH_FM, "utf-8");
    return aPath;
  }

  it("/evo-sub off with corrupt state refuses: flag kept, file kept, rewrite kept [RED]", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const aPath = await seedProfile();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const aAfterOn = await fs.readFile(aPath, "utf-8");
    expect(aAfterOn).not.toBe(PROFILE_WITH_FM); // rewritten by evo-sub

    // Corrupt the backup evidence mid-active.
    const statePath = ompStateFile();
    await fs.writeFile(statePath, "{{{ corrupt", "utf-8");

    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);

    // Fail-closed: a present-but-unreadable state file must never clear the
    // persisted flag (that would orphan the backup and leave the profile
    // rewritten with no restore path) and must never delete the file.
    // RED: current deactivate() takes the "state file missing — cleared flag"
    // branch and flips persisted.sub to false.
    const cfg = await readEvoConfig();
    expect(cfg.sub).toBe(true);
    await expect(fs.access(statePath)).resolves.toBeUndefined();
    expect(await fs.readFile(aPath, "utf-8")).toBe(aAfterOn); // rewrite untouched
  });

  it("/evo-sub on over a corrupt state file refuses: unreadable backup is never overwritten [RED]", async () => {
    const pi = makePi();
    __seedToolPool(FULL_TOOLS);
    const aPath = await seedProfile();
    await freshExtension(pi);
    const ctx = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx);

    await pi.__handlers.commands.get("evo-sub")!.handler("on", ctx);
    const aAfterOn = await fs.readFile(aPath, "utf-8");

    // Simulate: previous session's backup is corrupt; user tries to re-activate.
    const statePath = ompStateFile();
    await fs.writeFile(statePath, "{{{ corrupt", "utf-8");
    // Reset in-memory active flag so activate() is re-enterable.
    await pi.__handlers.commands.get("evo-sub")!.handler("off", ctx);
    // Restore the persisted flag the (fail-open) off may have cleared, then
    // force in-memory off by re-hydrating a fresh extension instance.
    await fs.writeFile(path.join(tmpHome, "agent", "config.yml"), "extensions: { evo-mode: { main: false, sub: false } }\n", "utf-8");
    const pi2 = makePi();
    __seedToolPool(FULL_TOOLS);
    await freshExtension(pi2);
    const ctx2 = makeCtx({ mode: "tui", hasUI: true });
    await __emitHook("session_start", {}, ctx2);

    await pi2.__handlers.commands.get("evo-sub")!.handler("on", ctx2);

    // Fail-closed: the unreadable backup must be preserved for manual
    // recovery. RED: current activate() treats a corrupt state as absent and
    // overwrites it with a backup of the ALREADY-REWRITTEN profile (original
    // content lost forever).
    await expect(fs.readFile(statePath, "utf-8")).resolves.toBe("{{{ corrupt");
    expect(await fs.readFile(aPath, "utf-8")).toBe(aAfterOn); // no second rewrite
  });
});
