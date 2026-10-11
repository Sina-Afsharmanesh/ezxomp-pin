import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { HooksData } from "../lib/remaining-command-types.ts"

const HOOKS_MAX_BUFFER = 512 * 1024
const HOOKS_MODULE_ENV = "GSD_HOOKS_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Collects hook configuration and status via a child process.
 * Runtime state (active cycles, hook queue) is not available in a cold child
 * process, so activeCycles will be empty. The child calls getHookStatus() which
 * reads from preferences to build entries, then formatHookStatus() for display.
 */
export async function collectHooksData(projectCwdOverride?: string): Promise<HooksData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "post-unit-hooks.mjs"), useCompiledJs: true }
  const hooksModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(hooksModulePath))) {
    throw new Error(
      `hooks data provider not found; checked=${resolveTsLoader},${hooksModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(hooksModulePath)) {
    throw new Error(`hooks data provider not found; checked=${hooksModulePath}`)
  }

  // getHookStatus()/formatHookStatus() take no base argument upstream; they
  // delegate to resolvePostUnitHooks() → loadEffectiveGSDPreferences(process.cwd()).
  // Running the child with cwd=projectCwd makes the no-arg resolution land on
  // the selected project. In a cold child process, cycleCounts is empty, so
  // activeCycles will be {}.
  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${HOOKS_MODULE_ENV}).href);`,
    'const entries = mod.getHookStatus();',
    'const formattedStatus = mod.formatHookStatus();',
    'process.stdout.write(JSON.stringify({ entries, formattedStatus }));',
  ].join(" ")

  return await runSubprocess<HooksData>({
    packageRoot,
    cwd: projectCwd,
    script,
    env: {
      [HOOKS_MODULE_ENV]: hooksModulePath,
      GSD_HOOKS_BASE: projectCwd,
    },
    label: "hooks",
    maxBuffer: HOOKS_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
