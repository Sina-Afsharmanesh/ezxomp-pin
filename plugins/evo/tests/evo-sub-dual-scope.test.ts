import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SubEvoController } from "../extensions/evo/evoSub.ts";
import { deleteSubState } from "../extensions/evo/substate.ts";

/**
 * Dual-scope contract (TASK-55 / doc-13): when the same profile exists in both
 * the global dir ($OMP_HOME/agents) and the project-local dir
 * (<cwd>/.omp/agents), the PROJECT-NEAREST copy wins — only it is rewritten
 * with the evo allowlist; the global copy is left byte-untouched. Cook
 * installs profiles per-project via /cook install, so the project copy is the
 * authoritative one for the owning cwd.
 */

const PROFILE = `---
name: cook-worker
description: "worker"
tools: read, write, bash
---

Body.
`;

const COOK_PROFILES = [
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

function fakePiTools(): any {
  return {
    getAllTools: async () => [],
    getActiveTools: async () => [],
    setActiveTools: async () => {},
  };
}

let home: string;
let project: string;
let homeBackup: string | undefined;

beforeEach(() => {
  homeBackup = process.env.HOME;
  project = mkdtempSync(join(tmpdir(), "evo-sub-proj-"));
  home = mkdtempSync(join(tmpdir(), "evo-sub-home-"));
  process.env.HOME = home;
  delete process.env.OMP_HOME;
  mkdirSync(join(home, ".omp", "agents"), { recursive: true });
  mkdirSync(join(project, ".omp", "agents"), { recursive: true });
  for (const name of COOK_PROFILES) {
    const content = PROFILE.replaceAll("cook-worker", name.replace(/\.md$/, ""));
    writeFileSync(join(home, ".omp", "agents", name), content);
    writeFileSync(join(project, ".omp", "agents", name), content);
  }
});

afterEach(() => {
  process.env.HOME = homeBackup;
  rmSync(project, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  deleteSubState();
});

describe("evo-sub dual scope", () => {
  it("activate rewrites the project-local copies and leaves global copies untouched", async () => {
    const ctl = new SubEvoController(fakePiTools(), project);
    const r = await ctl.activate();
    expect(r.changed).toBe(true);
    // Project-nearest wins: only the ten project-local copies are rewritten.
    expect(r.rewritten).toBe(10);
    for (const name of ["cook-worker.md", "cook-audit.md", "cook-refute.md"]) {
      const g = readFileSync(join(home, ".omp", "agents", name), "utf-8");
      const p = readFileSync(join(project, ".omp", "agents", name), "utf-8");
      // Global copy is byte-untouched.
      expect(g).toContain("tools: read, write, bash");
      // Project copy carries the evo allowlist.
      expect(p).not.toContain("tools: read, write, bash");
      expect(p).toContain("eval");
    }
    // deactivate restores exactly the recorded project profiles.
    const off = await ctl.deactivate();
    expect(off.restored).toBe(10);
    expect(readFileSync(join(project, ".omp", "agents", "cook-worker.md"), "utf-8")).toContain("tools: read, write, bash");
    expect(readFileSync(join(project, ".omp", "agents", "cook-audit.md"), "utf-8")).toContain("tools: read, write, bash");
    // Global copies were never touched.
    expect(readFileSync(join(home, ".omp", "agents", "cook-worker.md"), "utf-8")).toContain("tools: read, write, bash");
  });

  it("activate tolerates a missing project-local dir (no /cook install yet)", async () => {
    rmSync(join(project, ".omp", "agents"), { recursive: true, force: true });
    const ctl = new SubEvoController(fakePiTools(), project);
    const r = await ctl.activate();
    expect(r.changed).toBe(true);
    expect(r.rewritten).toBe(10); // global only
    await ctl.deactivate();
  });

  it("setCwd threads the project scope for later activate calls", async () => {
    const ctl = new SubEvoController(fakePiTools());
    ctl.setCwd(project);
    const r = await ctl.activate();
    expect(r.changed).toBe(true);
    // Project scope selects the project-local copies (project-nearest wins).
    expect(r.rewritten).toBe(10);
    await ctl.deactivate();
  });
});
