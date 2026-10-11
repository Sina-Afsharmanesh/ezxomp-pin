import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
	RpcChunkReassembler,
	encodeRpcChunks,
	extractAssistantText,
	OmpRpcError,
	OmpRpcTransport,
	resolveOmpCliEntry,
} from "../../server/bridge/omp-transport.ts";

test("resolveOmpCliEntry prefers env over persisted over bun path over PATH", () => {
	const exists = (path: string) => path.endsWith(".bun/bin/omp");
	assert.deepEqual(
		resolveOmpCliEntry({
			cwd: "/p",
			envOmpBin: "/custom/omp",
			persistedOmpBin: "/persisted/omp",
			homeDir: "/h",
			existsSync: exists,
		}),
		{ command: "/custom/omp", args: ["--mode", "rpc"], cwd: "/p" },
	);
	assert.equal(
		resolveOmpCliEntry({
			cwd: "/p",
			persistedOmpBin: "/persisted/omp",
			homeDir: "/h",
			existsSync: exists,
		}).command,
		"/persisted/omp",
	);
	assert.equal(
		resolveOmpCliEntry({ cwd: "/p", homeDir: "/h", existsSync: exists }).command,
		"/h/.bun/bin/omp",
	);
	assert.deepEqual(
		resolveOmpCliEntry({ cwd: "/p", homeDir: "/h", existsSync: () => false }),
		{ command: "omp", args: ["--mode", "rpc"], cwd: "/p" },
	);
});
test("reassembler tolerates inline frames and reassembles chunk sequences with UTF-8 boundaries", () => {
	// Chunking is only defined for frames above the 1 MiB transport limit
	// (reassembler enforces count >= 2, byteLength >= MAX_RPC_FRAME_BYTES).
	const logical = {
		type: "response",
		id: "r1",
		command: "bash",
		data: { output: "héllo 🌍 ".repeat(200_000) },
	};
	const reassembler = new RpcChunkReassembler();
	assert.deepEqual(reassembler.push({ type: "ready" }), { type: "ready" });
	const chunks = encodeRpcChunks(logical, "c1");
	assert.ok(chunks.length >= 1);
	let result: object | undefined;
	for (const chunk of chunks) result = reassembler.push(chunk);
	assert.deepEqual(result, logical);
});

test("reassembler rejects bad metadata, out-of-order chunks, non-UTF-8 payloads", () => {
	const reassembler = new RpcChunkReassembler();
	assert.throws(() =>
		reassembler.push({ type: "rpc_chunk", chunkId: "x", index: 3, count: 4, byteLength: 2_000_000, data: "AAAA" }),
	);
	// index must start at 0
	assert.throws(() => {
		const chunks = encodeRpcChunks({ big: "y".repeat(1_500_000) }, "c2");
		reassembler.push({ ...chunks[1], chunkId: "c2" });
	});
	// invalid base64
	assert.throws(() =>
		reassembler.push({
			type: "rpc_chunk",
			chunkId: "c3",
			index: 0,
			count: 2,
			byteLength: 2_000_000,
			data: "not!!base64!!",
		}),
	);
	// invalid UTF-8 in the reassembled payload
	const bad = Buffer.from([0xff, 0xfe, 0xfd]);
	assert.throws(() => {
		reassembler.push({
			type: "rpc_chunk",
			chunkId: "c4",
			index: 0,
			count: 2,
			byteLength: bad.byteLength,
			data: bad.toString("base64").padEnd(700_000, "A").slice(0, 700_000),
		});
	});
});

test("unsupported GSD commands throw typed unsupported_command errors before spawning", async () => {
	const transport = new OmpRpcTransport({ entry: resolveOmpCliEntry({ cwd: "/p" }) });
	for (const command of ["fork", "terminal_input", "get_commands", "shutdown", "subscribe", "init"]) {
		await assert.rejects(
			() => transport.request(command),
			(error: unknown) => error instanceof OmpRpcError && error.code === "unsupported_command",
		);
	}
});

test("extractAssistantText pulls text blocks from turn_end messages", () => {
	assert.equal(
		extractAssistantText({
			type: "turn_end",
			message: { content: [{ type: "text", text: "a" }, { type: "other" }, { type: "text", text: "b" }] },
		}),
		"a\nb".replace("\n", ""),
	);
	assert.equal(extractAssistantText({ type: "turn_start" }), "");
});

test("live EOF shutdown: child driven through ready/negotiate exits 0 on stdin EOF", async () => {
	const ompBin = process.env.GSD_WEB_OMP_BIN ?? `${process.env.HOME}/.bun/bin/omp`;
	const transport = new OmpRpcTransport({
		entry: { command: ompBin, args: ["--mode", "rpc"], cwd: tmpdir() },
		env: {
			NODE_ENV: "test",
		PI_CODING_AGENT_DIR: mkdtempSync(join(tmpdir(), "omp-probe-")),
			ANTHROPIC_API_KEY: "sk-dummy",
		},
	});
	await transport.start(); // ready frame + negotiate_protocol v2
	const response = await transport.request("get_state");
	assert.equal(response.success, true);
	await transport.shutdown();
	const exit = await transport.waitForExit();
	assert.equal(exit.code, 0);
});
