/**
 * Shared subprocess runner for web service bundles (@ezxomp/gsd-web).
 *
 * W3 adaptation of upstream src/web/subprocess-runner.ts: the env-injection
 * contract (GSD_*_MODULE names, verbatim per plan/digest §3d) is kept, but the
 * values now point at prebuilt single-file ES module bundles in
 * `web/server/services-dist/<name>.mjs` (built by scripts/build-services.mjs).
 * The child is plain `node <bundle>` — no TS loader, no type-stripping flag,
 * no resolve-ts.mjs, because the bundles are already compiled.
 */

import { execFile } from "node:child_process"
import { existsSync as defaultExistsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

/** Directory containing the built service bundles, relative to the plugin web/server root. */
export const SERVICES_DIST_DIR = "services-dist"

// ---------------------------------------------------------------------------
// Module path resolution
// ---------------------------------------------------------------------------

export interface ModuleSpec {
	/** Environment variable name the child process reads to find this module. */
	envKey: string
	/** Bundle stem under services-dist/ (e.g. "workspace-index" → services-dist/workspace-index.mjs). */
	bundle: string
}

export interface ResolveModulePathsOptions {
	modules: ModuleSpec[]
	/** Override for testing — defaults to fs.existsSync. */
	existsSync?: (path: string) => boolean
	/** Label used in error messages (e.g. "doctor-service"). */
	label?: string
}

export interface ResolvedPaths {
	/** Absolute path of the services-dist directory. */
	distDir: string
	/** Environment variable entries mapping each module's envKey to its absolute bundle path. */
	env: Record<string, string>
}

function servicesDistDir(packageRoot: string): string {
	return join(packageRoot, "web", "server", SERVICES_DIST_DIR)
}

/**
 * Resolves every module's bundle path under `<packageRoot>/web/server/services-dist/`,
 * validating that each bundle exists on disk. Throws a descriptive error if any
 * path is missing.
 */
export function resolveModulePaths(packageRoot: string, options: ResolveModulePathsOptions): ResolvedPaths {
	const checkExists = options.existsSync ?? defaultExistsSync
	const label = options.label ?? "subprocess"
	const distDir = servicesDistDir(packageRoot)

	const modulePaths: Record<string, string> = {}
	const allPaths: string[] = []

	for (const mod of options.modules) {
		const fullPath = join(distDir, `${mod.bundle}.mjs`)
		modulePaths[mod.envKey] = fullPath
		allPaths.push(fullPath)
	}

	for (const p of allPaths) {
		if (!checkExists(p)) {
			throw new Error(`${label} data bundle not found; missing=${p} (build with scripts/build-services.mjs)`)
		}
	}

	return { distDir, env: modulePaths }
}

// ---------------------------------------------------------------------------
// Subprocess runner
// ---------------------------------------------------------------------------

export interface RunSubprocessOptions {
	/** Absolute path to the plugin package root (used to locate services-dist and as default cwd). */
	packageRoot: string
	/** The --eval script to run in the child process. */
	script: string
	/** Extra environment variables merged onto process.env for the child (GSD_*_MODULE values are absolute .mjs paths). */
	env: Record<string, string>
	/** Label for error messages (e.g. "doctor", "forensics"). */
	label: string
	/** Override cwd (defaults to packageRoot). */
	cwd?: string
	/** Max stdout buffer in bytes. Defaults to 2 MB. */
	maxBuffer?: number
	/** Subprocess timeout in milliseconds. Defaults to 30 s. */
	timeoutMs?: number
	/** Override process.execPath for testing. */
	execPath?: string
}

/**
 * Spawns a Node child process that evaluates `script`, parses stdout as JSON,
 * and returns the result. The GSD_*_MODULE env values must point at built
 * `services-dist/*.mjs` bundles (see resolveModulePaths).
 */
export async function runSubprocess<T>(options: RunSubprocessOptions): Promise<T> {
	const { packageRoot, script, env: extraEnv, label, cwd = packageRoot, maxBuffer = DEFAULT_MAX_BUFFER, timeoutMs = DEFAULT_TIMEOUT_MS, execPath = process.execPath } = options

	return await new Promise<T>((resolveResult, reject) => {
		execFile(
			execPath,
			["--input-type=module", "--eval", script],
			{
				cwd,
				env: { ...process.env, ...extraEnv },
				maxBuffer,
				timeout: timeoutMs,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(`${label} subprocess failed: ${stderr || error.message}`))
					return
				}

				try {
					resolveResult(JSON.parse(stdout) as T)
				} catch (parseError) {
					reject(
						new Error(
							`${label} subprocess returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
						),
					)
				}
			},
		)
	})
}

/** Absolute file URL for a services-dist bundle (used by child scripts that import via pathToFileURL). */
export function bundleHref(packageRoot: string, bundle: string): string {
	return pathToFileURL(join(servicesDistDir(packageRoot), `${bundle}.mjs`)).href
}
