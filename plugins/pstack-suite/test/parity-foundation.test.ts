import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spawnSync } from "node:child_process";
import { onPstackEvent, resetEventSubscribers } from "../src/events.js";
import type { PstackEvent } from "../src/events.js";

function gitInit(dir: string): void {
  spawnSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["config", "user.name", "ParityTest"], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["remote", "add", "origin", "https://github.com/test/repo.git"], { cwd: dir, stdio: "pipe" });
  // Real code paths resolve HEAD; an empty repo has an unborn branch.
  writeFileSync(join(dir, "README.md"), "# test", "utf-8");
  spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
}

describe("AC4a: helper-level preflight + receipt determinism", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-parity-"));
    resetEventSubscribers();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });


  it("preflight + receipt flow produces identical results for UI and headless contexts", async () => {
    const { runPreflight, preflightSafe, beginRun, addAction, finishRun, saveRun, loadRun } = await import("../src/run.js");
    const uiDir = join(tmpDir, "ui-repo");
    const headlessDir = join(tmpDir, "headless-repo");
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(headlessDir, { recursive: true });
    gitInit(uiDir);
    gitInit(headlessDir);

    const eventsUI: PstackEvent[] = [];
    resetEventSubscribers();
    onPstackEvent((ev) => eventsUI.push(ev));
    const pf1 = await runPreflight(uiDir, { requestedAction: "verify", required: [] });
    const rec1 = beginRun({ playbook: "verify", phase: "preflight", target: "main" });
    const acted1 = addAction(rec1, "preflight", preflightSafe(pf1) ? "ok" : "failed", pf1.overall);
    saveRun(finishRun(acted1, "success"), uiDir);

    const eventsHeadless: PstackEvent[] = [];
    resetEventSubscribers();
    onPstackEvent((ev) => eventsHeadless.push(ev));
    const pf2 = await runPreflight(headlessDir, { requestedAction: "verify", required: [] });
    const rec2 = beginRun({ playbook: "verify", phase: "preflight", target: "main" });
    const acted2 = addAction(rec2, "preflight", preflightSafe(pf2) ? "ok" : "failed", pf2.overall);
    saveRun(finishRun(acted2, "success"), headlessDir);

    const normalizePf = (pf?: typeof pf1) => pf
      ? { overall: pf.overall, checks: pf.checks.map((c) => ({ name: c.name, status: c.status })) }
      : undefined;
    expect(normalizePf(pf1)).toEqual(normalizePf(pf2));

    const loaded1 = loadRun(uiDir, rec1.runId)!;
    const loaded2 = loadRun(headlessDir, rec2.runId)!;
    const normalize = (r: typeof loaded1) => ({
      playbook: r.playbook,
      phase: r.phase,
      target: r.target,
      status: r.status,
      actions: r.actions.map((a) => ({ action: a.action, result: a.result, detail: a.detail })),
      lastConfirmedAction: r.lastConfirmedAction,
      preflight: normalizePf(r.preflight),
    });
    expect(normalize(loaded1)).toEqual(normalize(loaded2));

    const normalizeEvent = (e: PstackEvent) => {
      const p = e.payload;
      let stripped: Record<string, unknown> | undefined;
      if (p) {
        const { runId, at, ...rest } = p as Record<string, unknown>;
        stripped = Object.keys(rest).length > 0 ? rest : undefined;
      }
      return { type: e.type, payload: stripped };
    };
    expect(eventsUI.map(normalizeEvent)).toEqual(eventsHeadless.map(normalizeEvent));
  });
});

describe("AC4b: handler-level parity — handleShip --dry-run with hasUI true vs false", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pstack-parity-h-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });


  function makeCtx(dir: string, hasUI: boolean) {
    return { cwd: dir, hasUI, ui: { notify: vi.fn() } } as any;
  }

  function readRunId(dir: string): string {
    const runDir = join(dir, ".omp", "pstack-runs");
    const files = readdirSync(runDir);
    const file = files.find((f: string) => f.endsWith(".json"));
    if (!file) throw new Error("no receipt written for " + dir);
    return file.replace(/\.json$/, "");
  }

  it("same flow, same terminal status, same persisted receipt in both UI modes", async () => {
    const uiDir = join(tmpDir, "ui-repo");
    const headlessDir = join(tmpDir, "headless-repo");
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(headlessDir, { recursive: true });
    gitInit(uiDir);
    gitInit(headlessDir);

    const { handleShip } = await import("../src/commands/ship.js");
    const { loadRun } = await import("../src/run.js");

    // --- hasUI=true ---
    const ctxUI = makeCtx(uiDir, true);
    await handleShip("--dry-run", ctxUI);
    const uiNotify = ctxUI.ui.notify.mock.calls.map((c: unknown[]) => String(c[0]));

    // --- hasUI=false ---
    const ctxHeadless = makeCtx(headlessDir, false);
    await handleShip("--dry-run", ctxHeadless);
    const hlNotify = ctxHeadless.ui.notify.mock.calls.map((c: unknown[]) => String(c[0]));

    // Terminal notifications identical (same dry-run text: branch, remote, argv, irreversible)
    expect(hlNotify).toEqual(uiNotify);
    expect(uiNotify.some((m: string) => m.includes("DRY-RUN"))).toBe(true);
    expect(uiNotify.some((m: string) => m.includes("remote:"))).toBe(true);
    expect(uiNotify.some((m: string) => m.includes("IRREVERSIBLE"))).toBe(true);

    // Persisted receipts: same terminal status + same actions (normalized)
    const uiRun = loadRun(uiDir, readRunId(uiDir))!;
    const hlRun = loadRun(headlessDir, readRunId(headlessDir))!;
    const norm = (r: typeof uiRun) => ({
      playbook: r.playbook,
      phase: r.phase,
      status: r.status,
      actions: r.actions.map((a) => ({ action: a.action, result: a.result, detail: a.detail })),
      lastConfirmedAction: r.lastConfirmedAction,
    });
    expect(norm(hlRun)).toEqual(norm(uiRun));
    expect(uiRun.status).toBe("success");
    expect(uiRun.actions.map((a) => a.action)).toContain("remote_confirm");
  });
});
