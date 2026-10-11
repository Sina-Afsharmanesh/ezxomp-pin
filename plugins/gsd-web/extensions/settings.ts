/**
 * @ezxomp/gsd-web — settings resolver.
 *
 * Merges the plugin manifest's typed settings (omp.settings in package.json)
 * with the PluginManager-persisted store (which also carries the freeform
 * keys: allowedOrigins, nodeBinary, ompBinary, devRoot).
 */

import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import type { ResolvedSettings } from "./host-launcher.ts";

export const PLUGIN_NAME = "@ezxomp/gsd-web";

interface RawSettings {
 host?: unknown;
 port?: unknown;
 noAuth?: unknown;
 allowUnauthenticatedLAN?: unknown;
 daemonMode?: unknown;
 openBrowser?: unknown;
 allowedOrigins?: unknown;
 nodeBinary?: unknown;
 ompBinary?: unknown;
 devRoot?: unknown;
 [key: string]: unknown;
}

const TYPED_DEFAULTS: Partial<RawSettings> = {
	host: "auto",
	port: 0,
	noAuth: false,
	allowUnauthenticatedLAN: false,
	daemonMode: false,
	openBrowser: false,
};

export function mergeSettings(manifest: Partial<RawSettings>, persisted: Partial<RawSettings>): ResolvedSettings {
 const merged: RawSettings = { ...TYPED_DEFAULTS, ...manifest, ...persisted } as RawSettings;
 const port = typeof merged.port === "number" && Number.isFinite(merged.port) ? merged.port : 0;
 const host = typeof merged.host === "string" && merged.host.trim() ? merged.host.trim() : "auto";
 return {
  host,
  port: Math.min(Math.max(Math.trunc(port), 0), 65535),
  noAuth: merged.noAuth === true,
  allowUnauthenticatedLAN: merged.allowUnauthenticatedLAN === true,
  daemonMode: merged.daemonMode === true,
  openBrowser: merged.openBrowser === true,
  freeform: {
   allowedOrigins: typeof merged.allowedOrigins === "string" ? merged.allowedOrigins : "",
   nodeBinary: typeof merged.nodeBinary === "string" ? merged.nodeBinary : "",
   ompBinary: typeof merged.ompBinary === "string" ? merged.ompBinary : "",
   devRoot: typeof merged.devRoot === "string" ? merged.devRoot : "",
  },
 };
}

/** Load this plugin's merged settings for the given working directory. */
export async function loadSettings(cwd: string): Promise<ResolvedSettings> {
 const manager = new PluginManager(cwd);
 const persisted = (await manager.getPluginSettings(PLUGIN_NAME).catch(() => ({}))) as Partial<RawSettings>;
 return mergeSettings({}, persisted);
}

/** Parse a settings key/value pair for `set`/`unset` subcommands. */
export function parseSettingValue(raw: string): string | number | boolean {
 const trimmed = raw.trim();
 if (trimmed === "true") return true;
 if (trimmed === "false") return false;
 if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
 return trimmed;
}
