import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { TaskInfo } from "@ezxomp/backlog/extensions/index.ts";

export type { TaskInfo };

export interface ModelConfig {
	planner: string | null;
	scout: string | null;
	researcher: string | null;
	worker: string | null;
	validator: string | null;
	judge: string | null;
}

export interface AgentLogEntry {
	taskId: string;
	stage: string;
	role: string;
	model: string;
	timestamp: string;
}

export interface WatchConfig {
	enabled: boolean;
	debounceMs: number;
	trigger: "auto" | "manual";
	lastFiredAt: string | null;
	watchId: string | null;
}

export interface WatchedTask {
	taskId: string;
	since: string;
	lastStatus: string;
	lastChecked: string | null;
	/** When lastStatus first became "Done" — drives TTL-based pruning. */
	doneAt?: string | null;
}

export interface WorkerHeartbeat {
	taskId: string;
	startedAt: string;
	lastPingedAt: string | null;
	intervals: number[];
	nextIntervalIdx: number;
}

export interface TypedFinding {
	source: "judge" | "validator" | "audit" | "refute";
	file: string;
	line: number;
	what: string;
	kickTo: "plan" | "implement" | "verify";
}

export interface ConvergenceStage {
	cycles: number;
	bonusGranted?: boolean;
}

export interface CouncilEpisode {
	status: "pending" | "inquiries-dispatched" | "synthesis-dispatched" | "completed";
	finding: TypedFinding;
	votes?: string[];
	inquiryStages?: string[];
	synthesisStage?: string;
}

export interface AdhdIdea {
	frame: string;
	idea: string;
	novelty: number;
	viability: number;
	fit: number;
	traps: string[];
}

export interface GateCheck {
	item: string;
	ok: boolean;
	note: string;
}

export interface GateReport {
	checks: GateCheck[];
	passed: boolean;
}

export interface Phase {
	name: string;
	kind: "engineer" | "agent" | "code";
	owner: string;
	description: string;
	envelope_type?: string;
}

export interface CookState {
	chain: string[];
	currentStage: number;
	currentTaskId: string | null;
	taskIds: string[];
	milestoneId: string | null;
	specDocId: string | null;
	reviewCycles: Record<string, number>;
	maxReviewCycles: number;
	lastFindings: Record<string, TypedFinding[]>;
	agentLog: AgentLogEntry[];
	claims: Record<string, { by: string; at: string } | string>;
	convergence: Record<string, Record<string, ConvergenceStage>>;
	councilEpisodes: Record<string, CouncilEpisode>;
	complexity: Record<string, "simple" | "complex">;
	pipelineVersion?: string;
	maxParallelTasks: number;
	adhdFrames: string[];
	adhdIdeas: AdhdIdea[];
	adhdShortlist: AdhdIdea[];
	gateResults: Record<string, GateReport[]>;
	cookmode: boolean;
	watch: WatchConfig;
	watchList: Record<string, WatchedTask>;
	heartbeats: Record<string, WorkerHeartbeat>;
}

export interface ModelEntry {
	id: string;
	/** Canonical provider identifier the model came from. */
	provider: string;
	/** Display provider family (normalized; unknown providers stay visible). */
	family: string;
	/** Unambiguous `provider/id` form used when bare ids collide. */
	selection: string;
	label: string;
}

/**
 * Shared mutable context passed to tool registration functions.
 * Replaces closure variables (currentCwd, lastUi, stores) that the
 * monolithic index.ts used.
 */
export interface StoreContext {
	currentCwd: string;
	lastUi: ExtensionContext["ui"] | null;
	/** Whether the current context exposes interactive UI surfaces. */
	hasUI: boolean;
	stores: Map<string, CookState>;
	normalizeCwd(cwd: string): string;
	getStoreFor(cwd: string): CookState;
	getStore(): CookState;
	setStoreFor(cwd: string, next: CookState): void;
	setStore(next: CookState): void;
	refreshWidget(): void;
	/** Refresh Cook-owned terminal activity for the current cwd, if supported. */
	refreshActivity(): void;
	/** Release Cook-owned terminal activity without disturbing host replacements. */
	resetActivity(): void;
}
