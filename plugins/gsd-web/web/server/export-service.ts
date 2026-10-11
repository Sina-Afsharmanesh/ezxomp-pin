import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { ExportResult } from "../lib/remaining-command-types.ts"

const EXPORT_MAX_BUFFER = 4 * 1024 * 1024
const EXPORT_MODULE_ENV = "GSD_EXPORT_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Generates an export file via a child process and returns its content.
 * The child calls writeExportFile() which creates a timestamped file in .gsd/,
 * then reads its content back for browser display.
 */
export async function collectExportData(
  format: "markdown" | "json" = "markdown",
  projectCwdOverride?: string,
): Promise<ExportResult> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "export.mjs"), useCompiledJs: true }
  const exportModulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(exportModulePath))) {
    throw new Error(
      `export data provider not found; checked=${resolveTsLoader},${exportModulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(exportModulePath)) {
    throw new Error(`export data provider not found; checked=${exportModulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${EXPORT_MODULE_ENV}).href);`,
    'const format = process.env.GSD_EXPORT_FORMAT || "markdown";',
    'const basePath = process.env.GSD_EXPORT_BASE;',
    'const filePath = mod.writeExportFile(basePath, format);',
    'if (filePath) {',
    '  const { readFileSync } = await import("node:fs");',
    '  const { basename } = await import("node:path");',
    '  const content = readFileSync(filePath, "utf-8");',
    '  process.stdout.write(JSON.stringify({ content, format, filename: basename(filePath) }));',
    '} else {',
    '  process.stdout.write(JSON.stringify({ content: "No metrics data available for export.", format, filename: "export." + (format === "json" ? "json" : "md") }));',
    '}',
  ].join(" ")

  return await runSubprocess<ExportResult>({
    packageRoot,
    script,
    env: {
      [EXPORT_MODULE_ENV]: exportModulePath,
      GSD_EXPORT_BASE: projectCwd,
      GSD_EXPORT_FORMAT: format,
    },
    label: "export",
    maxBuffer: EXPORT_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
