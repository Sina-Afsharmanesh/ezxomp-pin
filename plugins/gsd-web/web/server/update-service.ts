import { compareSemver } from "./update-check.ts"

// D6 (plan gsd-web §Design flags): the update banner re-points at the
// `@ezxomp/gsd-web` npm package. Self-update via `npm install -g` is gone —
// POST returns guidance text pointing at `omp plugin update`.
const NPM_PACKAGE_NAME = "@ezxomp/gsd-web"
const REGISTRY_URL = `https://registry.npmjs.org/@ezxomp%2fgsd-web/latest`
const FETCH_TIMEOUT_MS = 5000

// --- Version check ---

interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = process.env.GSD_VERSION || "0.0.0"

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal })
    clearTimeout(timeout)

    // Package not published (or registry unreachable) — hide the banner.
    if (!res.ok) {
      return { currentVersion, latestVersion: currentVersion, updateAvailable: false }
    }

    const data = (await res.json()) as { version?: string }
    const latestVersion = data.version || currentVersion

    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareSemver(latestVersion, currentVersion) > 0,
    }
  } catch {
    // Network error or timeout — report no update available (banner hidden)
    return { currentVersion, latestVersion: currentVersion, updateAvailable: false }
  } finally {
    clearTimeout(timeout)
  }
}

// --- Update state singleton (D6: guidance-only) ---

export interface UpdateState {
  status: "idle" | "running" | "success" | "error"
  error?: string
  targetVersion?: string
}

let updateState: UpdateState = { status: "idle" }

export function getUpdateStatus(): UpdateState {
  return { ...updateState }
}

/**
 * D6 behavior: no self-update. Upstream spawned `npm install -g` here; on OMP
 * the supported path is `omp plugin update @ezxomp/gsd-web`. The UI's POST
 * handler surfaces the guidance text and the state stays idle.
 */
export function triggerUpdate(_targetVersion?: string): false {
  return false
}

export function updateGuidance(targetVersion?: string): string {
  const to = targetVersion ? ` (version ${targetVersion})` : ""
  return `Updates are managed by OMP. Run \`omp plugin update @ezxomp/gsd-web\`${to} to install the latest version.`
}

export { NPM_PACKAGE_NAME }
