/**
 * Settings loading for @ezxomp/gsd-graph.
 *
 * WU1 stub. Final implementation (WU6):
 *   new PluginManager(ctx.cwd).getPluginSettings("@ezxomp/gsd-graph").catch(() => ({}))
 *   → resolveGsdGraphSettings(raw) with typed defaults.
 */

export interface GsdGraphSettings {
	/** Rebuild .gsd/graphs/graph.json at session start when it exists and is stale (>24h). Default false. */
	autoRebuild: boolean;
}

export const DEFAULT_GSD_GRAPH_SETTINGS: GsdGraphSettings = {
	autoRebuild: false,
};

export function resolveGsdGraphSettings(raw: Record<string, unknown>): GsdGraphSettings {
	return {
		autoRebuild: raw.autoRebuild === true,
	};
}
