/**
 * OMP rpc transport — the web bridge's connection to an `omp --mode rpc` child.
 *
 * Replaces GSD's `resolveGsdCliEntry`-driven child with OMP's native NDJSON RPC
 * protocol (protocol v1/v2). Responsibilities:
 *   - CLI entry resolution (env GSD_WEB_OMP_BIN → persisted ompBinary → PATH → ~/.bun/bin/omp)
 *   - ready-frame handshake + negotiate_protocol v2
 *   - rpc_chunk reassembly (protocol v2, validated, strict UTF-8)
 *   - no-models abort detection → typed `no_models` bridge phase
 *   - typed `unsupported_command` errors for GSD union members OMP lacks
 *   - event tolerance: unknown/no-contract host events are ignored
 *   - graceful shutdown via stdin EOF (never SIGTERM — loses trailing JSONL)
 *
 * Protocol source of truth: oh-my-pi `src/modes/rpc/rpc-frame.ts` +
 * `rpc-types.ts` (verified against omp/18.0.x live probes 2026-09-06).
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Constants (mirror oh-my-pi rpc-frame.ts)
// ============================================================================

export const MAX_RPC_FRAME_BYTES = 1024 * 1024;
export const MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024;
const RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024;

// ============================================================================
// CLI entry resolution
// ============================================================================

export interface OmpCliEntry {
	command: string;
	args: string[];
	cwd: string;
}

export interface ResolveOmpCliEntryOptions {
	cwd: string;
	/** resolved plugin package root passed through by pty-manager */
	packageRoot?: string;
	/** explicit node/executable override */
	execPath?: string;
	/** host integration kind hint */
	hostKind?: string;
	/** launch mode */
	mode?: "interactive" | "rpc";
	/** rpc session dir */
	sessionDir?: string;
	/** rpc seed messages */
	messages?: string[];
	/** env GSD_WEB_OMP_BIN value */
	envOmpBin?: string | undefined;
	/** PluginManager-persisted `ompBinary` setting */
	persistedOmpBin?: string | undefined;
	homeDir?: string;
	existsSync?: (path: string) => boolean;
}

/**
 * Resolution chain: env GSD_WEB_OMP_BIN → persisted ompBinary → `omp` on PATH
 * (implicit via spawn) → ~/.bun/bin/omp. mode:"rpc" (default) launches the
 * NDJSON RPC child; mode:"interactive" launches the plain interactive CLI.
 */
export function resolveOmpCliEntry(
	options: ResolveOmpCliEntryOptions,
): OmpCliEntry {
	const checkExists = options.existsSync ?? existsSync;
	const home = options.homeDir ?? homedir();
	const args = options.mode === "interactive" ? [] : ["--mode", "rpc"];

	const explicit = options.envOmpBin?.trim() || options.persistedOmpBin?.trim();
	if (explicit) {
		return { command: explicit, args, cwd: options.cwd };
	}

	const bunInstallPath = join(home, ".bun", "bin", "omp");
	if (checkExists(bunInstallPath)) {
		return { command: bunInstallPath, args, cwd: options.cwd };
	}

	// Fall back to PATH lookup; spawn surfaces ENOENT as a typed failure.
	return { command: "omp", args, cwd: options.cwd };
}

// ============================================================================
// rpc_chunk reassembly (pure, unit-testable)
// ============================================================================

export interface RpcChunkFrame {
	type: "rpc_chunk";
	chunkId: string;
	index: number;
	count: number;
	byteLength: number;
	data: string;
}

interface PendingChunks {
	chunkId: string;
	count: number;
	byteLength: number;
	nextIndex: number;
	chunks: Buffer[];
	receivedBytes: number;
}

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64(data: unknown): Buffer {
	if (
		typeof data !== "string" ||
		data.length === 0 ||
		!BASE64_RE.test(data)
	) {
		throw new Error("invalid rpc chunk data");
	}
	const bytes = Buffer.from(data, "base64");
	if (bytes.toString("base64") !== data) throw new Error("invalid rpc chunk data");
	return bytes;
}

/**
 * Incremental protocol-v2 reassembler. Feed every parsed JSONL frame;
 * returns the reassembled logical frame when a chunk sequence completes,
 * `undefined` while incomplete, and the frame itself for non-chunk frames.
 * Throws on any metadata/sequence/base64/UTF-8 violation.
 */
export class RpcChunkReassembler {
	#pending?: PendingChunks;

	push(value: unknown): object | undefined {
		const frame = value as { type?: unknown } | null;
		if (!frame || frame.type !== "rpc_chunk") {
			if (this.#pending) throw new Error("rpc chunk sequence interrupted");
			if (typeof value !== "object" || value === null) {
				throw new Error("rpc frame must be an object");
			}
			return value as object;
		}
		const chunk = value as RpcChunkFrame;
		const { chunkId, index, count, byteLength } = chunk;
		if (
			typeof chunkId !== "string" ||
			chunkId.length === 0 ||
			chunkId.length > 128 ||
			!Number.isSafeInteger(index) ||
			!Number.isSafeInteger(count) ||
			!Number.isSafeInteger(byteLength) ||
			index < 0 ||
			count < 2 ||
			count > Math.ceil(MAX_RPC_REASSEMBLED_BYTES / RPC_CHUNK_PAYLOAD_BYTES) ||
			index >= count ||
			byteLength < MAX_RPC_FRAME_BYTES ||
			byteLength > MAX_RPC_REASSEMBLED_BYTES
		) {
			throw new Error("invalid rpc chunk metadata");
		}
		const bytes = decodeBase64(chunk.data);
		if (bytes.byteLength > RPC_CHUNK_PAYLOAD_BYTES) {
			throw new Error("rpc chunk payload exceeds the transport limit");
		}

		if (!this.#pending) {
			if (index !== 0) throw new Error("rpc chunk sequence must start at index 0");
			this.#pending = {
				chunkId,
				count,
				byteLength,
				nextIndex: 0,
				chunks: [],
				receivedBytes: 0,
			};
		}
		const pending = this.#pending;
		if (
			pending.chunkId !== chunkId ||
			pending.count !== count ||
			pending.byteLength !== byteLength ||
			pending.nextIndex !== index
		) {
			throw new Error("rpc chunk sequence mismatch");
		}
		pending.chunks.push(bytes);
		pending.receivedBytes += bytes.byteLength;
		pending.nextIndex++;
		if (pending.receivedBytes > pending.byteLength) {
			throw new Error("rpc chunk sequence exceeds declared length");
		}
		if (pending.nextIndex < pending.count) return undefined;
		if (pending.receivedBytes !== pending.byteLength) {
			throw new Error("rpc chunk sequence length mismatch");
		}

		this.#pending = undefined;
		// Strict UTF-8: fatal decoder throws on invalid sequences.
		const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
			Buffer.concat(pending.chunks),
		);
		const logical: unknown = JSON.parse(decoded);
		if (typeof logical !== "object" || logical === null) {
			throw new Error("rpc frame must be an object");
		}
		return logical as object;
	}
}

/** Split an oversized logical frame into protocol-v2 rpc_chunk frames. */
export function encodeRpcChunks(frame: object, chunkId: string): RpcChunkFrame[] {
	const json = JSON.stringify(frame);
	const byteLength = Buffer.byteLength(json, "utf8");
	if (byteLength > MAX_RPC_REASSEMBLED_BYTES) {
		throw new Error("RPC frame exceeded the reassembly limit");
	}
	const bytes = Buffer.from(json, "utf8");
	const count = Math.ceil(byteLength / RPC_CHUNK_PAYLOAD_BYTES);
	const chunks: RpcChunkFrame[] = [];
	for (let index = 0; index < count; index++) {
		chunks.push({
			type: "rpc_chunk",
			chunkId,
			index,
			count,
			byteLength,
			data: bytes
				.subarray(index * RPC_CHUNK_PAYLOAD_BYTES, (index + 1) * RPC_CHUNK_PAYLOAD_BYTES)
				.toString("base64"),
		});
	}
	return chunks;
}

// ============================================================================
// Transport
// ============================================================================

export interface OmpTransportOptions {
	entry: OmpCliEntry;
	/** GSD_WEB_BRIDGE_TUI gate (D7): OMP rpc has no terminal_* commands (probed). */
	bridgeTui?: boolean;
	env?: NodeJS.ProcessEnv;
}

export interface NoModelsAbort {
	kind: "no_models";
	stderrTail: string;
}

export interface OmpEvent {
	type: string;
	[key: string]: unknown;
}

export interface OmpResponse {
	id?: string;
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
	code?: string;
}

/** Events with no runtime contract in OMP rpc — tolerated and ignored. */
const TOLERATED_EVENTS = new Set([
	"available_commands_update",
	"thinking_level_changed",
	"message_start",
	"message_end",
	"tool_execution_update",
	"auto_compaction_start",
	"auto_compaction_end",
]);

export class OmpRpcError extends Error {
	readonly code: string;
	readonly command: string;

	constructor(code: string, command: string, message: string) {
		super(message);
		this.name = "OmpRpcError";
		this.code = code;
		this.command = command;
	}
}

const UNSUPPORTED_COMMANDS: ReadonlySet<string> = new Set([
	"get_project_progress",
	"fork",
	"get_fork_messages",
	"get_commands",
	"terminal_input",
	"terminal_resize",
	"terminal_redraw",
	"init",
	"shutdown",
	"subscribe",
]);

function isUnsupported(commandType: string): boolean {
	return UNSUPPORTED_COMMANDS.has(commandType);
}

/** True when the active OMP rpc bridge cannot serve this command type. */
export function isUnsupportedCommand(commandType: string): boolean {
	return isUnsupported(commandType);
}

/**
 * One bridged agent child. Correlation is by `id`, never emission order
 * (`bash` runs concurrently). Not exposed until the ready frame lands.
 */
export class OmpRpcTransport {
	readonly entry: OmpCliEntry;
	private child?: ChildProcessWithoutNullStreams;
	private reassembler = new RpcChunkReassembler();
	private readonly pending = new Map<
		string,
		{ resolve: (response: OmpResponse) => void; reject: (error: Error) => void }
	>();
	private nextId = 0;
	private exitInfo?: { code: number | null; stderrTail: string };
	private exitWaiters: Array<(info: { code: number | null; stderrTail: string }) => void> = [];
	private stderrTail = "";
	private closed = false;
	private onEvent?: (event: OmpEvent) => void;
	private onNoModels?: (abort: NoModelsAbort) => void;

	constructor(options: OmpTransportOptions) {
		this.entry = options.entry;
		this.bridgeTui = options.bridgeTui ?? false;
		this.baseEnv = options.env;
	}

	private readonly bridgeTui: boolean;
	private readonly baseEnv: NodeJS.ProcessEnv | undefined;

	private readyWaiters: Array<() => void> = [];

	/** Spawn the child, wait for the ready frame, negotiate protocol v2. */
	async start(): Promise<void> {
		if (this.child) throw new Error("transport already started");
		const env = { ...process.env, ...this.baseEnv };
		// D7: OMP rpc has no terminal_input/terminal_output commands (probed),
		// so the embedded-TUI env is never set for the bridge child.
		void this.bridgeTui;

		const child = spawn(this.entry.command, this.entry.args, {
			cwd: this.entry.cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		}) as ChildProcessWithoutNullStreams;
		this.child = child;

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			this.stderrTail = (this.stderrTail + chunk).slice(-4000);
		});

		child.on("exit", (code) => {
			this.exitInfo = { code, stderrTail: this.stderrTail };
			for (const waiter of this.exitWaiters.splice(0)) waiter(this.exitInfo);
			// No-models abort: process exits before the ready frame.
			if (!this.readyReceived && /no models available/i.test(this.stderrTail)) {
				this.onNoModels?.({ kind: "no_models", stderrTail: this.stderrTail });
			}
			const error = new Error(
				`omp rpc child exited (code=${code})${this.stderrTail ? `: ${this.stderrTail.slice(-200)}` : ""}`,
			);
			for (const pending of this.pending.values()) pending.reject(error);
			this.pending.clear();
		});


		const readline = createInterface({ input: child.stdout });
		readline.on("line", (line) => this.handleLine(line));

		// Ready frame + negotiate v2 handshake; readiness is latched in
		// handleLine (the only "line" source is the readline interface).
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("omp rpc child did not emit a ready frame"));
			}, 30_000);
			child.on("exit", () => {
				if (!this.readyReceived) {
					clearTimeout(timeout);
					reject(
						new Error(
							`omp rpc child exited before ready: ${this.stderrTail.slice(-300) || "(no stderr)"}`,
						),
					);
				}
			});
			this.readyWaiters.push(() => {
				clearTimeout(timeout);
				resolve();
			});
		});
		await this.request("negotiate_protocol", { protocolVersion: 2 });
	}
	private readyReceived = false;

	private handleLine(line: string): void {
		if (!line.trim()) return;
		if (!this.readyReceived) {
			try {
				const early = JSON.parse(line) as { type?: unknown };
				if (early?.type === "ready") {
					this.readyReceived = true;
					for (const waiter of this.readyWaiters.splice(0)) waiter();
					return;
				}
			} catch {
				return;
			}
		}


		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return; // tolerate malformed lines; protocol frames are NDJSON
		}
		let frame: object | undefined;
		try {
			frame = this.reassembler.push(parsed);
		} catch (error) {
			this.onEvent?.({
				type: "rpc_frame_error",
				error: error instanceof Error ? error.message : String(error),
			});
			return;
		}
		if (!frame) return; // chunk sequence still incomplete
		const record = frame as { type?: string; id?: unknown };

		if (record.type === "response") {
			const response = frame as unknown as OmpResponse;
			const key = typeof response.id === "string" ? response.id : undefined;
			if (key) {
				const pending = this.pending.get(key);
				if (pending) {
					this.pending.delete(key);
					pending.resolve(response);
				}
			}
			return;
		}
		if (record.type === "rpc_frame_error" || TOLERATED_EVENTS.has(record.type ?? "")) {
			return;
		}
		// All other host events (agent_start, turn_start/end, message_end,
		// extension_ui_request, notice, …) fan out to the bridge service.
		this.onEvent?.(frame as OmpEvent);
	}

	setEventListener(listener: (event: OmpEvent) => void): void {
		this.onEvent = listener;
	}

	setNoModelsListener(listener: (abort: NoModelsAbort) => void): void {
		this.onNoModels = listener;
	}

	/** Send one command and await its correlated response. */
	async request(command: string, payload?: Record<string, unknown>): Promise<OmpResponse> {
		if (isUnsupported(command)) {
			throw new OmpRpcError(
				"unsupported_command",
				command,
				`Command "${command}" is not supported by the omp rpc bridge (see web/server/bridge/COMMANDS.md)`,
			);
		}
		const child = this.child;
		if (!child || !this.readyReceived || this.closed) {
			throw new OmpRpcError("transport_closed", command, "omp rpc transport is not running");
		}
		const id = `gwb-${++this.nextId}`;
		const frame = JSON.stringify({ id, type: command, ...payload });
		if (Buffer.byteLength(frame, "utf8") + 1 <= MAX_RPC_FRAME_BYTES) {
			child.stdin.write(`${frame}\n`);
		} else {
			for (const chunk of encodeRpcChunks(JSON.parse(frame), `req-${id}`)) {
				child.stdin.write(`${JSON.stringify(chunk)}\n`);
			}
		}
		return new Promise<OmpResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
	}

	/** Wait for child exit (used by EOF-shutdown assertions). */
	waitForExit(): Promise<{ code: number | null; stderrTail: string }> {
		if (this.exitInfo) return Promise.resolve(this.exitInfo);
		return new Promise((resolve) => this.exitWaiters.push(resolve));
	}

	/**
	 * Graceful shutdown: close stdin (EOF). OMP drains pending commands and
	 * exits 0. Never SIGTERM — it loses trailing JSONL (verified probe).
	 */
	async shutdown(): Promise<void> {
		this.closed = true;
		const child = this.child;
		if (!child) return;
		child.stdin.end();
		await this.waitForExit();
	}

	/** Hard kill — only for abnormal teardown (registry stale sweep). */
	kill(): void {
		this.child?.kill("SIGKILL");
	}
}

/** Extract assistant text from a turn_end event's message content. */
export function extractAssistantText(event: OmpEvent): string {
	if (event.type !== "turn_end") return "";
	const message = event.message as { content?: unknown } | undefined;
	if (!Array.isArray(message?.content)) return "";
	const parts: string[] = [];
	for (const block of message.content) {
		if (
			block &&
			typeof block === "object" &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string"
		) {
			parts.push((block as { text: string }).text);
		}
	}
	return parts.join("");
}
