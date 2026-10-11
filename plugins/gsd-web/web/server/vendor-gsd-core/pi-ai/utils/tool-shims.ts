/**
 * Shared tool compatibility shims for Pi/GSD agent runtimes.
 *
 * Layers:
 * - {@link resolveAgentToolName} / pi-agent-core `resolveAgentTool` — tool name aliasing
 * - {@link normalizeToolArguments} — argument shape repair before schema validation
 * - {@link createToolSearchShimResult} — ToolSearch deferred-tool stub
 * - {@link isEmptyPathToolArguments} — phantom empty Read {} guard
 */

import { stripMcpToolPrefix } from "./mcp-tool-name.ts";

export {
	createAgentShimResult,
	extractNormalizedSubagentCall,
	isAgentToolName,
	mapSubagentTypeToGsdAgent,
	normalizeClaudeCodeAgentArguments,
	SUBAGENT_TYPE_ALIASES,
} from "./agent-shim.ts";
export { parseMcpToolName, stripMcpToolPrefix } from "./mcp-tool-name.ts";
export { isEmptyPathToolArguments, normalizeToolArguments } from "./normalize-tool-arguments.ts";
export {
	createToolSearchShimResult,
	extractToolSearchQuery,
	isToolSearchToolName,
	parseToolSearchSelectQuery,
	type ToolSearchShimOptions,
} from "./tool-search-shim.ts";

/** Claude Code built-in names mapped to Pi built-in tool names. */
export const CLAUDE_CODE_TOOL_ALIASES: Readonly<Record<string, string>> = {
	agent: "subagent",
	glob: "find",
	grep: "grep",
	webfetch: "fetch_page",
	websearch: "search-the-web",
};

/** Tool names that must survive GSD minimal/auto tool scoping. */
export const ALWAYS_PRESERVED_SHIM_TOOL_NAMES = ["ToolSearch"] as const;

/** Resolve a requested tool name to the registry name Pi extensions use. */
export function resolveAgentToolName(requestedName: string): string {
	const lower = requestedName.toLowerCase();
	const alias = CLAUDE_CODE_TOOL_ALIASES[lower];
	if (alias) {
		return alias;
	}
	return stripMcpToolPrefix(requestedName);
}
