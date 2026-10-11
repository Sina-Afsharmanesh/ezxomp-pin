import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { ForensicReport } from "../lib/diagnostics-types.ts"

const FORENSICS_MAX_BUFFER = 2 * 1024 * 1024
const FORENSICS_MODULE_ENV = "GSD_FORENSICS_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Loads forensic report data via a child process. Converts the full upstream
 * ForensicReport into a browser-safe subset: deep ExecutionTrace objects are
 * replaced with trace counts and simplified entries, MetricsLedger is flattened
 * to summary totals, and doctorIssues is replaced with a count (doctor panel
 * has its own dedicated API route).
 */
export async function collectForensicsData(projectCwdOverride?: string): Promise<ForensicReport> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "forensics.mjs"), useCompiledJs: true }
  const forensicsModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(forensicsModulePath))) {
    throw new Error(
      `forensics data provider not found; checked=${resolveTsLoader},${forensicsModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(forensicsModulePath)) {
    throw new Error(`forensics data provider not found; checked=${forensicsModulePath}`)
  }

  // The child script loads the upstream module, calls buildForensicReport(),
  // simplifies the output for browser consumption, and writes JSON to stdout.
  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${FORENSICS_MODULE_ENV}).href);`,
    `const report = await mod.buildForensicReport(process.env.GSD_FORENSICS_BASE);`,
    // Simplify unitTraces: strip deep ExecutionTrace, keep file/unitType/unitId/seq/mtime
    'const unitTraces = (report.unitTraces || []).map(t => ({',
    '  file: t.file, unitType: t.unitType, unitId: t.unitId, seq: t.seq, mtime: t.mtime,',
    '}));',
    // Flatten metrics to summary
    'let metrics = null;',
    'if (report.metrics && report.metrics.units) {',
    '  const units = report.metrics.units;',
    '  const totalCost = units.reduce((s, u) => s + u.cost, 0);',
    '  const totalDuration = units.reduce((s, u) => s + (u.finishedAt - u.startedAt), 0);',
    '  metrics = { totalUnits: units.length, totalCost, totalDuration };',
    '}',
    'const result = {',
    '  gsdVersion: report.gsdVersion,',
    '  timestamp: report.timestamp,',
    '  basePath: report.basePath,',
    '  activeMilestone: report.activeMilestone,',
    '  activeSlice: report.activeSlice,',
    '  anomalies: report.anomalies,',
    '  recentUnits: report.recentUnits,',
    '  crashLock: report.crashLock,',
    '  doctorIssueCount: (report.doctorIssues || []).length,',
    '  unitTraceCount: unitTraces.length,',
    '  unitTraces,',
    '  completedKeyCount: (report.completedKeys || []).length,',
    '  metrics,',
    '  journalSummary: report.journalSummary || null,',
    '  activityLogMeta: report.activityLogMeta || null,',
    '};',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return await runSubprocess<ForensicReport>({
    packageRoot,
    script,
    env: {
      [FORENSICS_MODULE_ENV]: forensicsModulePath,
      GSD_FORENSICS_BASE: projectCwd,
    },
    label: "forensics",
    maxBuffer: FORENSICS_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
