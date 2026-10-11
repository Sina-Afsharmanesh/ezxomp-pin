import { existsSync as defaultExistsSync } from "node:fs"
import { join } from "node:path"

/**
 * Returns the correct Node.js type-stripping flag for subprocess spawning.
 *
 * Node v24 enforces ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING for files
 * resolved under `node_modules/`. When GSD is installed globally via npm,
 * all source files live under `node_modules/@opengsd/gsd-pi/src/...`, so
 * `--experimental-strip-types` fails deterministically.
 *
 * `--experimental-transform-types` applies a full TypeScript transform that
 * works regardless of whether the file is under `node_modules/`. On older
 * Node versions (< 22.7) that lack both flags, this falls back to
 * `--experimental-strip-types` (the caller's loader handles the rest).
 */
export function resolveTypeStrippingFlag(packageRoot: string): string {
  // Check if running under node_modules
  if (/node_modules/.test(packageRoot)) {
    // Node v24: use transform-types flag
    return "--experimental-transform-types"
  }
  // Fallback for older Node versions
  return "--experimental-strip-types"
}

/**
 * Returns true when the given path sits inside a `node_modules/` directory.
 * Handles both Unix and Windows path separators.
 */
export function isUnderNodeModules(filePath: string): boolean {
  return /node_modules[/\\]/.test(filePath)
}

/** Resolution result for subprocess module paths. */
export interface SubprocessModuleResolution {
  /** Prefer compiled dist/*.js when available */
  useCompiledJs: boolean
  /** The module path to use */
  modulePath: string
  /** Whether the module exists at the resolved path */
  exists: boolean
}

/**
 * Resolves a subprocess module path, preferring compiled `dist/*.js` when the
 * compiled version exists.
 */
export function resolveSubprocessModule(
  packageRoot: string,
  relPath: string,
  checkExists: (path: string) => boolean = defaultExistsSync,
): SubprocessModuleResolution {
  const compiledPath = join(packageRoot, "dist", relPath.replace(".ts", ".js"))
  const sourcePath = join(packageRoot, "src", relPath)

  let useCompiledJs = false
  let modulePath = sourcePath
  let exists = checkExists(sourcePath)

  if (!exists) {
    useCompiledJs = checkExists(compiledPath)
    modulePath = useCompiledJs ? compiledPath : sourcePath
    exists = checkExists(modulePath)
  }

  return { useCompiledJs, modulePath, exists }
}

/**
 * Builds the Node.js subprocess prefix args for running a GSD extension module.
 */
export function buildSubprocessPrefixArgs(
  packageRoot: string,
  resolution: SubprocessModuleResolution,
  tsLoaderHref: string,
): string[] {
  const args: string[] = ["--import", tsLoaderHref]

  if (resolution.useCompiledJs) {
    args.push("--mode", "rpc")
  } else {
    args.push("--mode", "rpc", "--experimental-strip-types")
  }

  return args
}

/** Node version support check. */
export function supportsTransformTypes(): boolean {
  // In browser/build environment, assume true
  return true
}
