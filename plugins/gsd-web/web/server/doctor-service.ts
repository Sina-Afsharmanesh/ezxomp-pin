import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { DoctorReport, DoctorFixResult } from "../lib/diagnostics-types.ts"

const DOCTOR_MAX_BUFFER = 2 * 1024 * 1024
const DOCTOR_MODULE_ENV = "GSD_DOCTOR_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Loads doctor diagnostic data (GET — read-only, no fixes applied).
 * Returns full issues array + summary for the doctor panel.
 */
export async function collectDoctorData(scope?: string, projectCwdOverride?: string): Promise<DoctorReport> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "doctor.mjs"), useCompiledJs: true }
  const doctorModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(doctorModulePath))) {
    throw new Error(
      `doctor data provider not found; checked=${resolveTsLoader},${doctorModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(doctorModulePath)) {
    throw new Error(`doctor data provider not found; checked=${doctorModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${DOCTOR_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_DOCTOR_BASE;',
    'const scope = process.env.GSD_DOCTOR_SCOPE || undefined;',
    'const report = await mod.runGSDDoctor(basePath, { fix: false, scope });',
    'const summary = mod.summarizeDoctorIssues(report.issues);',
    'const result = {',
    '  ok: report.ok,',
    '  issues: report.issues,',
    '  fixesApplied: report.fixesApplied,',
    '  summary,',
    '};',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return await runSubprocess<DoctorReport>({
    packageRoot,
    script,
    env: {
      [DOCTOR_MODULE_ENV]: doctorModulePath,
      GSD_DOCTOR_BASE: projectCwd,
      GSD_DOCTOR_SCOPE: scope ?? "",
    },
    label: "doctor",
    maxBuffer: DOCTOR_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}

/**
 * Applies doctor fixes (POST — mutating action).
 * Returns fix result with list of applied fixes.
 */
export async function applyDoctorFixes(scope?: string, projectCwdOverride?: string): Promise<DoctorFixResult> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "doctor.mjs"), useCompiledJs: true }
  const doctorModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(doctorModulePath))) {
    throw new Error(
      `doctor data provider not found; checked=${resolveTsLoader},${doctorModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(doctorModulePath)) {
    throw new Error(`doctor data provider not found; checked=${doctorModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${DOCTOR_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_DOCTOR_BASE;',
    'const scope = process.env.GSD_DOCTOR_SCOPE || undefined;',
    'const report = await mod.runGSDDoctor(basePath, { fix: true, scope });',
    'const result = {',
    '  ok: report.ok,',
    '  fixesApplied: report.fixesApplied,',
    '};',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return await runSubprocess<DoctorFixResult>({
    packageRoot,
    script,
    env: {
      [DOCTOR_MODULE_ENV]: doctorModulePath,
      GSD_DOCTOR_BASE: projectCwd,
      GSD_DOCTOR_SCOPE: scope ?? "",
    },
    label: "doctor",
    maxBuffer: DOCTOR_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
