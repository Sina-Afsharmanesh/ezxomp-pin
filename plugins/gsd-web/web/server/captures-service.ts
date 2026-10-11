import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { CapturesData, CaptureResolveRequest, CaptureResolveResult } from "../lib/knowledge-captures-types.ts"

const CAPTURES_MAX_BUFFER = 2 * 1024 * 1024
const CAPTURES_MODULE_ENV = "GSD_CAPTURES_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Loads all capture entries via a child process. The child imports the upstream
 * captures module, calls loadAllCaptures() and loadActionableCaptures(), and
 * writes a CapturesData JSON to stdout.
 */
export async function collectCapturesData(projectCwdOverride?: string): Promise<CapturesData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "captures.mjs"), useCompiledJs: true }
  const capturesModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(capturesModulePath))) {
    throw new Error(
      `captures data provider not found; checked=${resolveTsLoader},${capturesModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(capturesModulePath)) {
    throw new Error(`captures data provider not found; checked=${capturesModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${CAPTURES_MODULE_ENV}).href);`,
    `const all = mod.loadAllCaptures(process.env.GSD_CAPTURES_BASE);`,
    'const pending = all.filter(c => c.status === "pending");',
    `const actionable = mod.loadActionableCaptures(process.env.GSD_CAPTURES_BASE);`,
    'const result = { entries: all, pendingCount: pending.length, actionableCount: actionable.length };',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return await runSubprocess<CapturesData>({
    packageRoot,
    script,
    env: {
      [CAPTURES_MODULE_ENV]: capturesModulePath,
      GSD_CAPTURES_BASE: projectCwd,
    },
    label: "captures",
    maxBuffer: CAPTURES_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}

/**
 * Resolves (triages) a single capture by calling markCaptureResolved() in a
 * child process. Returns { ok: true, captureId } on success.
 */
export async function resolveCaptureAction(request: CaptureResolveRequest, projectCwdOverride?: string): Promise<CaptureResolveResult> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "captures.mjs"), useCompiledJs: true }
  const capturesModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(capturesModulePath))) {
    throw new Error(
      `captures data provider not found; checked=${resolveTsLoader},${capturesModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(capturesModulePath)) {
    throw new Error(`captures data provider not found; checked=${capturesModulePath}`)
  }

  const safeId = JSON.stringify(request.captureId)
  const safeClassification = JSON.stringify(request.classification)
  const safeResolution = JSON.stringify(request.resolution)
  const safeRationale = JSON.stringify(request.rationale)

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${CAPTURES_MODULE_ENV}).href);`,
    `mod.markCaptureResolved(process.env.GSD_CAPTURES_BASE, ${safeId}, ${safeClassification}, ${safeResolution}, ${safeRationale});`,
    `process.stdout.write(JSON.stringify({ ok: true, captureId: ${safeId} }));`,
  ].join(" ")

  return await runSubprocess<CaptureResolveResult>({
    packageRoot,
    script,
    env: {
      [CAPTURES_MODULE_ENV]: capturesModulePath,
      GSD_CAPTURES_BASE: projectCwd,
    },
    label: "captures",
    maxBuffer: CAPTURES_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
