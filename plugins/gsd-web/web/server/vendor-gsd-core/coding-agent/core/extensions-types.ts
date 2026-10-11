/**
 * Extension surface types for @gsd/pi-coding-agent.
 * Provides ExtensionWidgetOptions used by extension UI snapshot functionality.
 */

import type { Api, AgentTool, ThinkingLevel, ExtensionAPI } from "../../pi-agent-core/types.ts";
import type { Model } from "../../pi-ai/types.ts";

/** Subset of upstream ToolDefinition (upstream: pi-coding-agent core/extensions). */
export interface ToolDefinition<T = unknown> {
	name: string;
	description?: string;
	parameters?: unknown;
	execute?: (
		id: string,
		params: T,
		signal?: AbortSignal,
		onUpdate?: (partial: unknown) => void,
	) => Promise<unknown>;
	[key: string]: unknown;
}

export interface ExtensionErrorListener {
	(event: { error: Error; source?: string }): void;
}

export interface ShutdownHandler {
	(): void | Promise<void>;
}

export type InputSource = "interactive" | "rpc" | "extension" | (string & {});

export interface ExtensionUIContext {
	[key: string]: unknown;
}

export interface ExtensionCommandContextActions {
	[key: string]: unknown;
}

export interface ExtensionRunner {
	[key: string]: unknown;
}

export type ContextUsage = {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	tokens: number;
	/** 0..1 fraction of the model context window in use, when known */
	percent?: number;
	[key: string]: unknown;
};

export interface ModelRegistry {
	[key: string]: unknown;
}

export interface ResourceLoader {
	[key: string]: unknown;
}

export interface SessionManager {
	[key: string]: unknown;
}

export interface SettingsManager {
	[key: string]: unknown;
}

export interface SessionStartEvent {
	[key: string]: unknown;
}

export interface ExtensionCommandContext {
	[k: string]: unknown;
}

export interface ExtensionContext {
	[k: string]: unknown;
}

export type { AgentTool, ThinkingLevel, Model, ExtensionAPI };

/** Compaction result (upstream: @gsd/agent-core compaction/index). */
export interface CompactionResult {
	summary: string;
	details?: unknown;
	[key: string]: unknown;
}

// Additional types needed by extension-ui-snapshot.ts
export interface ExtensionWidgetOptions {
  placement?: string;
}
