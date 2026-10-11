import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type FallowRun = { exitCode: number; stdout: string; stderr: string };
const FALLOW_TIMEOUT_MS = 120_000;

async function runFallowDeadCode(root: string): Promise<FallowRun> {
  const proc = Bun.spawn([
    "npx", "-y", "fallow@3.20.0", "dead-code",
    "--root", root,
    "--config", join(root, ".fallowrc.json"),
    "--unused-exports",
    "--fail-on-issues",
    "--format", "compact",
    "--quiet",
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, FALLOW_TIMEOUT_MS);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (timedOut) throw new Error(`fallow dead-code exceeded ${FALLOW_TIMEOUT_MS}ms`);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

describe("fallow dead-code negative control", () => {
  test("fails on an unused export in a reachable module, then passes after restoration", async () => {
    const root = await mkdtemp(join(tmpdir(), "fallow-negative-control-"));
    const config = {
      "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
      "production": false,
      "entry": ["index.ts"],
    };
    const reachableSource = 'export const usedExport = () => "used";\n';
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({
        name: "fallow-negative-control-fixture",
        private: true,
        type: "module",
        main: "./index.ts",
      }) + "\n");
      await writeFile(join(root, ".fallowrc.json"), JSON.stringify(config) + "\n");
      await writeFile(join(root, "index.ts"), 'import { usedExport } from "./reachable.ts";\nexport { usedExport };\n');
      const reachablePath = join(root, "reachable.ts");
      await writeFile(reachablePath, reachableSource + 'export const unusedExport = () => "unused";\n');

      const failing = await runFallowDeadCode(root);
      expect(failing.exitCode).toBe(1);
      expect(failing.stdout).toContain("unused-export");
      expect(failing.stdout).toContain("unusedExport");

      await writeFile(reachablePath, reachableSource);
      const passing = await runFallowDeadCode(root);
      expect(passing.exitCode).toBe(0);
      expect(passing.stdout).not.toContain("unused-export");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, FALLOW_TIMEOUT_MS * 2 + 10_000);
});
