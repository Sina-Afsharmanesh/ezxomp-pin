#!/usr/bin/env bun
/**
 * fetch-local-embedding-assets.ts — maintainer-only deterministic fetcher.
 *
 * Reads `runtime/assets/local-embedding.lock.json` and streams every locked
 * file from the recorded upstream URL into the git-tracked runtime asset pack
 * at `runtime/assets/local-embedding/<asset_version>/<name>`. Verifies
 * `bytes` and `sha256` exactly once on disk before declaring success.
 *
 * This script is the ONLY workflow that may reach the upstream host for these
 * assets. The marketplace user / installed runtime never invokes it.
 *
 * Usage:
 *   bun ./scripts/fetch-local-embedding-assets.ts           # write if missing
 *   bun ./scripts/fetch-local-embedding-assets.ts --force   # overwrite
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface LockEntry {
	name: string;
	url: string;
	bytes: number;
	sha256: string;
}

interface LockFile {
	asset_version: string;
	model_revision: string;
	files: LockEntry[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = join(ROOT, "runtime", "assets", "local-embedding.lock.json");
const ASSET_DIR = join(ROOT, "runtime", "assets", "local-embedding");
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

async function loadLock(): Promise<LockFile> {
	const lock = (await Bun.file(LOCK_PATH).json()) as LockFile;
	if (!lock || typeof lock !== "object") throw new Error("Local-embedding lock JSON malformed");
	if (!Array.isArray(lock.files) || lock.files.length === 0) throw new Error("Local-embedding lock has no files");
	return lock;
}

async function hashFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
	return hash.digest("hex");
}

async function fetchAndVerify(entry: LockEntry, target: string, force: boolean): Promise<void> {
	if (!force) {
		const existing = await stat(target).catch(() => null);
		if (existing && existing.size === entry.bytes) {
			const got = await hashFile(target);
			if (got === entry.sha256) {
				console.log(`  ✓ ${entry.name} (already verified)`);
				return;
			}
		}
	}
	console.log(`  ↓ ${entry.name}  ${entry.bytes.toLocaleString()} B  ${entry.url}`);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error("local_embedding_fetch_timeout")), FETCH_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(entry.url, { signal: controller.signal, redirect: "follow" });
	} catch (err) {
		clearTimeout(timer);
		throw new Error(`fetch failed for ${entry.name}: ${(err as Error).message}`);
	}
	if (!response.ok || !response.body) {
		clearTimeout(timer);
		throw new Error(`fetch failed for ${entry.name}: HTTP ${response.status}`);
	}
	await mkdir(dirname(target), { recursive: true });
	const tmp = `${target}.partial`;
	const write = createWriteStream(tmp);
	const hash = createHash("sha256");
	let bytes = 0;
	try {
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > entry.bytes) throw new Error(`${entry.name} exceeds declared byte cap ${entry.bytes}`);
			hash.update(value);
			if (!write.write(Buffer.from(value))) await new Promise<void>((r) => write.once("drain", r));
		}
	} finally {
		clearTimeout(timer);
	}
	await new Promise<void>((r, j) => write.end((err?: Error | null) => (err ? j(err) : r())));
	if (bytes !== entry.bytes) {
		await rm(tmp, { force: true });
		throw new Error(`${entry.name} size mismatch: expected ${entry.bytes}, got ${bytes}`);
	}
	const gotHash = await hashFile(tmp);
	if (gotHash !== entry.sha256) {
		await rm(tmp, { force: true });
		throw new Error(`${entry.name} sha256 mismatch: expected ${entry.sha256}, got ${gotHash}`);
	}
	await rename(tmp, target);
}

async function writeManifest(lock: LockFile): Promise<void> {
	const totalBytes = lock.files.reduce((sum, f) => sum + f.bytes, 0);
	const manifest = {
		schema_version: 1,
		asset_version: lock.asset_version,
		provider: "local-experience-onnx",
		model: `Xenova/paraphrase-multilingual-MiniLM-L12-v2@${lock.model_revision}`,
		revision: lock.model_revision,
		fetched_at: new Date().toISOString(),
		license: "Apache-2.0 + MIT runtime",
		total_bytes: totalBytes,
		files: lock.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
	};
	const target = join(ASSET_DIR, lock.asset_version, "manifest.json");
	await Bun.write(target, JSON.stringify(manifest, null, 2) + "\n");
}

const force = process.argv.includes("--force");
console.log(`[local-embedding-assets] reading ${LOCK_PATH}`);
const lock = await loadLock();
const versionDir = join(ASSET_DIR, lock.asset_version);
await mkdir(versionDir, { recursive: true });
console.log(`[local-embedding-assets] writing into ${versionDir}`);
for (const entry of lock.files) {
	await fetchAndVerify(entry, join(versionDir, entry.name), force);
}
await writeManifest(lock);
console.log(`[local-embedding-assets] all ${lock.files.length} files verified`);
