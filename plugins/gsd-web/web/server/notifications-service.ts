import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"

export interface NotificationsData {
  entries: Array<{
    id: string
    ts: string
    severity: string
    message: string
    source: string
    read: boolean
  }>
  unreadCount: number
  totalCount: number
}

const NOTIFICATIONS_MAX_BUFFER = 2 * 1024 * 1024
const NOTIFICATIONS_MODULE_ENV = "GSD_NOTIFICATIONS_MODULE"

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

/**
 * Loads notification data via a child process that imports the notification store.
 */
export async function collectNotificationsData(projectCwdOverride?: string): Promise<NotificationsData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "notification-store.mjs"), useCompiledJs: true }
  const modulePath = moduleResolution.modulePath

  if (!moduleResolution.useCompiledJs && (!existsSync(resolveTsLoader) || !existsSync(modulePath))) {
    throw new Error(
      `notifications data provider not found; checked=${resolveTsLoader},${modulePath}`,
    )
  }
  if (moduleResolution.useCompiledJs && !existsSync(modulePath)) {
    throw new Error(`notifications data provider not found; checked=${modulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${NOTIFICATIONS_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_NOTIFICATIONS_BASE;',
    'const entries = mod.readNotifications(basePath);',
    'const unread = entries.filter(e => !e.read).length;',
    'const result = { entries, unreadCount: unread, totalCount: entries.length };',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return await runSubprocess<NotificationsData>({
    packageRoot,
    script,
    env: {
      [NOTIFICATIONS_MODULE_ENV]: modulePath,
      GSD_NOTIFICATIONS_BASE: projectCwd,
    },
    label: "notifications",
    maxBuffer: NOTIFICATIONS_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}

/**
 * Clears notification data via a child process.
 */
export async function clearNotificationsData(projectCwdOverride?: string): Promise<void> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const moduleResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "notification-store.mjs"), useCompiledJs: true }
  const modulePath = moduleResolution.modulePath

  if (moduleResolution.useCompiledJs && !existsSync(modulePath)) {
    throw new Error(`notifications data provider not found; checked=${modulePath}`)
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${NOTIFICATIONS_MODULE_ENV}).href);`,
    'mod.clearNotifications(process.env.GSD_NOTIFICATIONS_BASE);',
    'process.stdout.write(JSON.stringify({ status: "ok" }));',
  ].join(" ")

  return await runSubprocess<void>({
    packageRoot,
    script,
    env: {
      [NOTIFICATIONS_MODULE_ENV]: modulePath,
      GSD_NOTIFICATIONS_BASE: projectCwd,
    },
    label: "notifications",
    maxBuffer: NOTIFICATIONS_MAX_BUFFER,
    timeoutMs: 30_000,
  })
}
