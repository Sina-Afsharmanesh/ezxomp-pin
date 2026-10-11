import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { VisualizerData } from "../lib/remaining-command-types.ts"

const VISUALIZER_MAX_BUFFER = 2 * 1024 * 1024
const VISUALIZER_MODULE_ENV = "GSD_VISUALIZER_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Collects visualizer data via a child process that loads the upstream module
 * and runs the vizualization pipeline. Also reads cache metadata from
 * .gsd/VISUALIZER_CACHE.json for browser display.
 */
export async function collectVisualizerData(projectCwdOverride?: string): Promise<VisualizerData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "visualizer-data.mjs"), useCompiledJs: true }
  const visualizerModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(visualizerModulePath))) {
    throw new Error(
      `visualizer data provider not found; checked=${resolveTsLoader},${visualizerModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(visualizerModulePath)) {
    throw new Error(`visualizer data provider not found; checked=${visualizerModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${VISUALIZER_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_VISUALIZER_BASE;',
    'const data = mod.loadVisualizerData(basePath);',
    'process.stdout.write(JSON.stringify(data));',
  ].join(" ")

  return await runSubprocess<VisualizerData>({
    packageRoot,
    script,
    env: {
      [VISUALIZER_MODULE_ENV]: visualizerModulePath,
      GSD_VISUALIZER_BASE: projectCwd,
    },
    label: "visualizer",
    maxBuffer: VISUALIZER_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
