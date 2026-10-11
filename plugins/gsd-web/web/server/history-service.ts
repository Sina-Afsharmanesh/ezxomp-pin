import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { HistoryData } from "../lib/remaining-command-types.ts"

const HISTORY_MAX_BUFFER = 2 * 1024 * 1024
const HISTORY_MODULE_ENV = "GSD_HISTORY_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Loads history/metrics data via a child process.
 * Reads the metrics ledger from disk and computes aggregation views
 * (totals, byPhase, bySlice, byModel) for browser consumption.
 */
export async function collectHistoryData(projectCwdOverride?: string): Promise<HistoryData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "metrics.mjs"), useCompiledJs: true }
  const historyModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(historyModulePath))) {
    throw new Error(
      `history data provider not found; checked=${resolveTsLoader},${historyModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(historyModulePath)) {
    throw new Error(`history data provider not found; checked=${historyModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${HISTORY_MODULE_ENV}).href);`,
    `const ledger = mod.loadLedgerFromDisk(process.env.GSD_HISTORY_BASE);`,
    'const units = ledger ? ledger.units : [];',
    'const totals = mod.getProjectTotals(units);',
    'const byPhase = mod.aggregateByPhase(units);',
    'const bySlice = mod.aggregateBySlice(units);',
    'const byModel = mod.aggregateByModel(units);',
    'process.stdout.write(JSON.stringify({ units, totals, byPhase, bySlice, byModel }));',
  ].join(" ")

  return await runSubprocess<HistoryData>({
    packageRoot,
    script,
    env: {
      [HISTORY_MODULE_ENV]: historyModulePath,
      GSD_HISTORY_BASE: projectCwd,
    },
    label: "history",
    maxBuffer: HISTORY_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
