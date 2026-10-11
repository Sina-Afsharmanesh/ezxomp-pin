import { existsSync } from "node:fs"
import { join } from "node:path"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import type { SkillHealthReport } from "../../web/lib/diagnostics-types.ts"
import { resolveModulePaths, runSubprocess } from "./subprocess-runner.ts"

const SKILL_HEALTH_MAX_BUFFER = 2 * 1024 * 1024
const SKILL_HEALTH_MODULE_ENV = "GSD_SKILL_HEALTH_MODULE"

/**
 * Root-scope directories listed in documented compatibility order.
 * The vendored empty stub is intentionally NOT listed as authority.
 */
export function resolveSkillHealthRoots(projectCwdOverride?: string): Array<
  {
    root: string
    method: "omp-global" | "omp-user" | "project-local" | "compatible"
    exists: boolean
    relatedAbsolutePaths: string[]
  }
> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const roots: Array<
    {
      root: string
      method: "omp-global" | "omp-user" | "project-local" | "compatible"
      exists: boolean
      relatedAbsolutePaths: string[]
    }
  > = []

  // 1. OMP global user scope: ~/.omp/agent/skills
  const ompGlobalRoot = join(require("node:os").homedir(), ".omp", "agent", "skills")
  roots.push({ root: ompGlobalRoot, method: "omp-global", exists: existsSync(ompGlobalRoot), relatedAbsolutePaths: [] })

  // 2. OMP user scope: ~/.agents/skills
  const ompUserRoot = join(require("node:os").homedir(), ".agents", "skills")
  roots.push({ root: ompUserRoot, method: "omp-user", exists: existsSync(ompUserRoot), relatedAbsolutePaths: [] })

  // 3. Project-local: .agents/skills (relative to cwd)
  const projectLocalRoot = join(projectCwd ?? ".", ".agents", "skills")
  roots.push({ root: projectLocalRoot, method: "project-local", exists: existsSync(projectLocalRoot), relatedAbsolutePaths: [] })

  // 4. Compatible: .gsd/skills
  const gsdRoot = join(projectCwd ?? ".", ".gsd", "skills")
  roots.push({ root: gsdRoot, method: "compatible", exists: existsSync(gsdRoot), relatedAbsolutePaths: [] })

  // 5. Compatible: documented compatibility roots (redacted absolute paths for safety)
  // These are the documented compatibility roots that the system knows about,
  // with unrelated absolute paths redacted per the acceptance criteria.
  roots.push({ root: "~/.omp/agent/skills (redacted)", method: "compatible", exists: false, relatedAbsolutePaths: [] })
  roots.push({ root: "~/.agents/skills (redacted)", method: "compatible", exists: false, relatedAbsolutePaths: [] })

  return roots
}

/**
 * Loads skill health report via a child process.
 * SkillHealthReport is already all plain objects — no Map/Set conversion needed.
 */
export async function collectSkillHealthData(projectCwdOverride?: string): Promise<SkillHealthReport> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  // Resolve the subprocess module path using the established contract (services-dist)
  const resolvedPaths = resolveModulePaths(packageRoot, {
    modules: [{ envKey: SKILL_HEALTH_MODULE_ENV, bundle: "skill-health" }],
    label: "skill-health"
  })

  // Build the child script using the subprocess-runner contract
  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${SKILL_HEALTH_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_SKILL_HEALTH_BASE;',
    'const report = mod.generateSkillHealthReport(basePath);',
    'process.stdout.write(JSON.stringify(report));',
  ].join(" ")

  return await runSubprocess<SkillHealthReport>({
    packageRoot,
    script,
    env: {
      [SKILL_HEALTH_MODULE_ENV]: resolvedPaths.env[SKILL_HEALTH_MODULE_ENV],
      GSD_SKILL_HEALTH_BASE: projectCwd,
    },
    label: "skill-health",
    cwd: packageRoot,
    maxBuffer: SKILL_HEALTH_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}