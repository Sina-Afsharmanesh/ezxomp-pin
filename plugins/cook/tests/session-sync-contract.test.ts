/**
 * session_start profile-sync contract (TASK-39 F3, spawn race).
 *
 * session_start launches the cook profile sync as a DETACHED async IIFE
 * (void (async () => {...})()). A task-spawn (cook dispatch) immediately
 * after session_start may therefore read the PRE-SYNC profile snapshot —
 * exactly how 2026-08-28 workers came up with stale frontmatter (no eval
 * grant). Contract under test:
 *
 *   1. RED: by the time session_start settles, project-scope profiles must
 *      already be on disk — the first dispatch must never race the sync.
 *   2. Ordering: project scope syncs strictly before personal scope.
 *
 * The syncCookAgents mock emulates the real effect (writes the profile
 * file) with a 50ms delay on the first call, so the race is deterministic
 * instead of timing-dependent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import makePi, {
  __emitHook,
  __resetHandlers,
  makeCtx,
  type PiStub,
} from "./__mocks__/pi-coding-agent";

const syncMock = vi.hoisted(() =>
  vi.fn(async (cwd: string, scope: string): Promise<string> => {
    if (scope === "project") {
      // Simulate a slow first-time install (cold cache / disk contention).
      await new Promise((r) => setTimeout(r, 50));
      const dir = join(cwd, ".omp", "agents");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "cook-worker.md"), "---\nname: cook-worker\n---\n");
      return "installed";
    }
    const home = process.env.HOME;
    const dir = join(home, ".omp", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cook-worker.md"), "---\nname: cook-worker\n---\n");
    return "installed";
  }),
);

const syncScopes: Array<{ seq: number; scope: string }> = [];
let callSeq = 0; // global: survives mockClear, exposes cross-test residue

vi.mock("../extensions/agents.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../extensions/agents.ts")>();
  return {
    ...actual,
    syncCookAgents: (cwd: string, scope: "project" | "personal") => {
      callSeq += 1;
      syncScopes.push({ seq: callSeq, scope });
      return syncMock(cwd, scope);
    },
  };
});

let tmpProject: string;
let tmpHome: string;
let homeBackup: string | undefined;
let ompHomeBackup: string | undefined;

beforeEach(async () => {
  // Drain any detached sync left over from the previous test so the mock
  // counters start clean (the handler is fire-and-forget in current code).
  await new Promise((r) => setTimeout(r, 80));
  __resetHandlers();
  syncScopes.length = 0;
  syncMock.mockClear();
  tmpProject = mkdtempSync(join(tmpdir(), "session-sync-proj-"));
  mkdirSync(join(tmpProject, "backlog"), { recursive: true });
  tmpHome = mkdtempSync(join(tmpdir(), "session-sync-home-"));
  homeBackup = process.env.HOME;
  ompHomeBackup = process.env.OMP_HOME;
  process.env.HOME = tmpHome;
  delete process.env.OMP_HOME;
});

afterEach(() => {
  process.env.HOME = homeBackup;
  if (ompHomeBackup === undefined) delete process.env.OMP_HOME;
  else process.env.OMP_HOME = ompHomeBackup;
  rmSync(tmpProject, { recursive: true, force: true });
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function freshExtension(pi: PiStub): Promise<void> {
  const mod = await import("../extensions/index.ts");
  mod.default(pi as never);
}

describe("session_start profile-sync contract (spawn race)", () => {
  it("RED: project profiles are on disk before session_start settles (first dispatch must not race the sync)", async () => {
    const pi = makePi();
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: tmpProject, hasUI: false });

    await __emitHook("session_start", {}, ctx);

    // A task-spawn immediately after session_start reads .omp/agents/*.md.
    // With the detached IIFE this file does not exist yet (sync still in
    // flight) - the stale-snapshot race observed on 2026-08-28.
    expect(existsSync(join(tmpProject, ".omp", "agents", "cook-worker.md"))).toBe(true);
  });

  it("syncs project scope strictly before personal scope (ordering contract)", async () => {
    const pi = makePi();
    await freshExtension(pi);
    const ctx = makeCtx({ cwd: tmpProject, hasUI: false });

    await __emitHook("session_start", {}, ctx);

    // Both scopes are eventually synced (detached or not); the order is
    // load-bearing: project (session-local) first, personal second.
    await vi.waitFor(() => {
      expect(syncScopes.some((c) => c.scope === "personal")).toBe(true);
    }, { timeout: 2000 });
    // Both scopes are eventually synced (detached or not); the order is
    // load-bearing: project (session-local) first, personal second.
    // A second full [project, personal] pair in the same test would mean the
    // handler ran twice - expose that explicitly.
    const scopes = syncScopes.map((c) => c.scope);
    if (scopes.length !== 2) {
      console.error("[diagnostic] full scope sequence:", JSON.stringify(syncScopes));
    }
    expect(scopes).toEqual(["project", "personal"]);
  });
});
