/**
 * OMP CLI entry for the web bridge — OMP counterpart of GSD's `cli-entry.ts`.
 *
 * W4 unit: the transport lives in `omp-transport.ts` (resolveOmpCliEntry is
 * defined there and re-exported here so the pty-manager's PTY whitelist and
 * the bridge service share one resolution chain). The `extensions/omp-entry.ts`
 * re-export for the plugin entry is provided by the plugin extensions layer.
 *
 * `--session-dir` is dropped (D2): OMP sessions are cwd-keyed under its own
 * profile dir. `--continue` is pending the W4 probe verdict; not passed.
 */

export { resolveOmpCliEntry } from "./omp-transport.ts";
export type { OmpCliEntry, ResolveOmpCliEntryOptions } from "./omp-transport.ts";

import { resolveOmpCliEntry } from "./omp-transport.ts";

/**
 * Convenience wrapper with the GSD call-site shape so ported call sites
 * (pty-manager.ts) keep their structure: env read happens at the caller.
 */
export function resolveOmpEntryFromEnv(cwd: string): ReturnType<typeof resolveOmpCliEntry> {
	return resolveOmpCliEntry({
		cwd,
		envOmpBin: process.env.GSD_WEB_OMP_BIN,
	});
}
