/**
 * Vendored surface for @gsd/pi-coding-agent used by gsd-web service layer.
 * Exports the symbols required by imports across the codebase.
 */

// Re-export needed types from extensions-types.ts
export type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ExtensionWidgetOptions } from "./core/extensions-types.ts";

// Theme type from pi-agent-core (relative to coding-agent/index.ts -> ../pi-agent-core/types.ts)
export type { Theme } from "../pi-agent-core/types.ts";

// Functions and values used by the vendored code
export {
	getShellConfig,
	sanitizeCommand,
	killProcessTree,
	formatSize,
	truncateHead,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	getSkillDirectories,
	getMarkdownTheme,
	AuthStorage,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
} from "./core/utils.js";

// UI types needed by shared components - import using the package alias
export { Key, matchesKey, truncateToWidth } from "@gsd/pi-tui";
export type { TUI } from "@gsd/pi-tui";
export { Text } from "@gsd/pi-tui";
