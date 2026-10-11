import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, checksumJson } from "../storage/checksum.ts";
import { withOwnedLock } from "../storage/locks.ts";
import { chmodSensitiveFile, ensurePrivateRoot, openSensitiveFileForWrite, resolvePrivatePath, PRIVATE_DIR_MODE } from "../storage/private-root.ts";
import {
	LOCAL_EMBEDDING_ASSETS,
	LOCAL_EMBEDDING_ASSET_VERSION,
	LOCAL_EMBEDDING_DOWNLOAD_BYTES,
	LOCAL_EMBEDDING_MODEL,
	LOCAL_EMBEDDING_PROVIDER,
	LOCAL_EMBEDDING_REVISION,
	type LocalEmbeddingAssetDefinition,
} from "./local-model-manifest.ts";

const MODEL_LOCK = "embedding-model-download";
const MANIFEST_FILE = "manifest.json";

export type LocalEmbeddingPhase = "checking" | "copying" | "verifying" | "ready" | "removing";

export interface LocalEmbeddingProgress {
	phase: LocalEmbeddingPhase;
	asset?: string;
	asset_index?: number;
	asset_count?: number;
	downloaded_bytes: number;
	total_bytes: number;
}

export interface AssetManifestFile {
	name: LocalEmbeddingAssetDefinition["name"];
	bytes: number;
	sha256: string;
}

export interface AssetManifestBase {
	schema_version: 1;
	asset_version: typeof LOCAL_EMBEDDING_ASSET_VERSION;
	provider: typeof LOCAL_EMBEDDING_PROVIDER;
	model: typeof LOCAL_EMBEDDING_MODEL;
	revision: typeof LOCAL_EMBEDDING_REVISION;
	created_at: string;
	total_bytes: number;
	license: "Apache-2.0 + MIT runtime";
	files: AssetManifestFile[];
}

export interface AssetManifest extends AssetManifestBase {
	manifest_checksum: string;
}

export interface LocalEmbeddingAssetPaths {
	models: string;
	local: string;
	version: string;
	manifest: string;
}

function manifestChecksum(base: AssetManifestBase): string {
	return checksumJson({ kind: "agent_experience_local_embedding_assets_v1", ...base });
}

function assetPaths(root: string): LocalEmbeddingAssetPaths {
	return {
		models: resolvePrivatePath(root, "models"),
		local: resolvePrivatePath(root, "models", "local-embedding"),
		version: resolvePrivatePath(root, "models", "local-embedding", LOCAL_EMBEDDING_ASSET_VERSION),
		manifest: resolvePrivatePath(root, "models", "local-embedding", LOCAL_EMBEDDING_ASSET_VERSION, MANIFEST_FILE),
	};
}

function runtimeAssetsDir(moduleUrl: string): string {
	// extensions/agent-experience/src/semantic/local-model.ts
	// file → semantic → src → agent-experience → extensions → plugin root
	const hereDir = pathDirname(fileURLToPath(moduleUrl));
	return pathResolve(hereDir, "..", "..", "..", "..", "runtime", "assets", "local-embedding", LOCAL_EMBEDDING_ASSET_VERSION);
}

function isEnoent(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as Record<string, unknown>).code === "ENOENT";
}

async function pathType(path: string): Promise<"file" | "directory" | null> {
	try {
		const info = await lstat(path);
		if (info.isSymbolicLink()) throw new Error(`Refusing symlinked local embedding path: ${path}`);
		if (info.isFile()) return "file";
		if (info.isDirectory()) return "directory";
		throw new Error(`Unsupported local embedding path: ${path}`);
	} catch (error) {
		if (isEnoent(error)) return null;
		throw error;
	}
}

async function ensureDirectory(root: string, path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: PRIVATE_DIR_MODE });
	if (await pathType(path) !== "directory") throw new Error("Local embedding cache path is not a private directory");
}

function isTransientInstallName(name: string): boolean {
	return name.startsWith(".staging-") || name.startsWith(".invalid-");
}

function isCleanupCandidate(name: string): boolean {
	return name !== LOCAL_EMBEDDING_ASSET_VERSION && (isTransientInstallName(name) || /^multilingual-minilm-l12-int8-v\d+$/.test(name));
}

async function listManagedInstallArtifacts(localDir: string): Promise<string[]> {
	return readdir(localDir).catch((error: unknown) => isEnoent(error) ? [] : Promise.reject(error));
}

async function cleanupManagedInstallArtifacts(root: string, localDir: string, keep?: string): Promise<void> {
	for (const entry of await listManagedInstallArtifacts(localDir)) {
		if (entry !== keep && isCleanupCandidate(entry)) await rm(resolvePrivatePath(root, "models", "local-embedding", entry), { recursive: true, force: true });
	}
}

async function recoverInterruptedInstall(root: string, paths: LocalEmbeddingAssetPaths) {
	if (await pathType(paths.version) !== null) return undefined;
	const entries = await listManagedInstallArtifacts(paths.local);
	const candidates = [
		...entries.filter((entry) => entry.startsWith(".invalid-")).sort(),
		...entries.filter((entry) => entry.startsWith(".staging-")).sort(),
	];
	for (const entry of candidates) {
		const candidate = resolvePrivatePath(root, "models", "local-embedding", entry);
		let kind: "file" | "directory" | null;
		try { kind = await pathType(candidate); } catch {
			await rm(candidate, { recursive: true, force: true });
			continue;
		}
		if (kind !== "directory") {
			await rm(candidate, { recursive: true, force: true });
			continue;
		}
		await rename(candidate, paths.version);
		const recovered = await getLocalEmbeddingAssetStatus(root, { deep: true });
		if (recovered.ready) {
			await cleanupManagedInstallArtifacts(root, paths.local);
			return recovered;
		}
		await rm(paths.version, { recursive: true, force: true });
	}
	return undefined;
}

async function hashFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
	return hash.digest("hex");
}

function parseManifest(text: string): AssetManifest {
	let manifest: unknown;
	try { manifest = JSON.parse(text); } catch { throw new Error("Invalid local embedding asset manifest JSON"); }
	if (!manifest || typeof manifest !== "object") throw new Error("Invalid local embedding asset manifest");
	const m = manifest as Record<string, unknown>;
	if (m.schema_version !== 1 || m.asset_version !== LOCAL_EMBEDDING_ASSET_VERSION || m.provider !== LOCAL_EMBEDDING_PROVIDER || m.model !== LOCAL_EMBEDDING_MODEL || m.revision !== LOCAL_EMBEDDING_REVISION) throw new Error("Local embedding asset manifest version mismatch");
	const { manifest_checksum, ...base } = m;
	if (typeof manifest_checksum !== "string" || manifest_checksum !== manifestChecksum(base as unknown as AssetManifestBase)) throw new Error("Local embedding asset manifest checksum mismatch");
	if (!Array.isArray(base.files) || base.total_bytes !== LOCAL_EMBEDDING_DOWNLOAD_BYTES) throw new Error("Local embedding asset manifest contents mismatch");
	return manifest as unknown as AssetManifest;
}

export interface LocalEmbeddingAssetStatusReady {
	ready: true;
	reason: "ready";
	assetDir: string;
	totalBytes: number;
	manifest: AssetManifest;
}

export interface LocalEmbeddingAssetStatusNotReady {
	ready: false;
	reason: string;
	assetDir: string;
	totalBytes: number;
}

export type LocalEmbeddingAssetStatus = LocalEmbeddingAssetStatusReady | LocalEmbeddingAssetStatusNotReady;

export async function getLocalEmbeddingAssetStatus(root: string, options: { deep?: boolean } = {}): Promise<LocalEmbeddingAssetStatus> {
	const privateRoot = await ensurePrivateRoot(root);
	const paths = assetPaths(privateRoot);
	try {
		for (const parent of [paths.models, paths.local]) {
			const kind = await pathType(parent);
			if (kind !== null && kind !== "directory") throw new Error("Local embedding cache parent is not a private directory");
		}
		if (await pathType(paths.version) !== "directory" || await pathType(paths.manifest) !== "file") {
			return { ready: false, reason: "missing", assetDir: paths.version, totalBytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES };
		}
		const expectedNames = [...LOCAL_EMBEDDING_ASSETS.map((asset) => asset.name), MANIFEST_FILE].sort();
		const actualNames = (await readdir(paths.version)).sort();
		if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) throw new Error("Local embedding cache contains unexpected artifacts");
		const manifest = parseManifest(await readFile(paths.manifest, "utf8"));
		const expected = new Map<LocalEmbeddingAssetDefinition["name"], LocalEmbeddingAssetDefinition>(LOCAL_EMBEDDING_ASSETS.map((asset) => [asset.name, asset]));
		if (manifest.files.length !== expected.size) throw new Error("Local embedding asset file count mismatch");
		for (const file of manifest.files) {
			const definition = expected.get(file.name);
			if (!definition || file.bytes !== definition.bytes || file.sha256 !== definition.sha256) throw new Error(`Local embedding asset metadata mismatch: ${file.name}`);
			const path = resolvePrivatePath(privateRoot, "models", "local-embedding", LOCAL_EMBEDDING_ASSET_VERSION, file.name);
			if (await pathType(path) !== "file") throw new Error(`Local embedding asset missing: ${file.name}`);
			if ((await stat(path)).size !== file.bytes) throw new Error(`Local embedding asset size mismatch: ${file.name}`);
			if (options.deep !== false && await hashFile(path) !== file.sha256) throw new Error(`Local embedding asset checksum mismatch: ${file.name}`);
		}
		return { ready: true, reason: "ready", assetDir: paths.version, totalBytes: manifest.total_bytes, manifest };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return { ready: false, reason: message, assetDir: paths.version, totalBytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES };
	}
}

async function copyAssetFromRuntime(root: string, stagingDir: string, asset: LocalEmbeddingAssetDefinition, sourceDir: string, input: { signal?: AbortSignal; onProgress?: (progress: LocalEmbeddingProgress) => void; copiedBefore: number; index: number }) {
	if (input.signal?.aborted) throw input.signal.reason || new Error("local_embedding_copy_aborted");
	const sourcePath = `${sourceDir}/${asset.name}`;
	if (await pathType(sourcePath) !== "file") throw new Error(`Bundled local embedding asset missing: ${asset.name}`);
	const sourceSize = (await stat(sourcePath)).size;
	if (sourceSize !== asset.bytes) throw new Error(`Bundled local embedding asset size mismatch: ${asset.name} (got ${sourceSize}, expected ${asset.bytes})`);
	const sourceHash = await hashFile(sourcePath);
	if (sourceHash !== asset.sha256) throw new Error(`Bundled local embedding asset checksum mismatch: ${asset.name}`);
	const stagingBasename = stagingDir.split(/[\\/]/).at(-1) || stagingDir;
	if (!/^[A-Za-z0-9._-]+$/.test(stagingBasename)) throw new Error("Invalid local embedding staging path");
	const target = resolvePrivatePath(root, "models", "local-embedding", stagingBasename, asset.name);
	const handle = await openSensitiveFileForWrite(root, target);
	const hash = createHash("sha256");
	let bytes = 0;
	try {
		for await (const raw of createReadStream(sourcePath)) {
			if (input.signal?.aborted) throw input.signal.reason || new Error("local_embedding_copy_aborted");
			const chunk = Buffer.from(raw as Buffer);
			bytes += chunk.length;
			if (bytes > asset.bytes) throw new Error(`Local embedding asset exceeds byte cap: ${asset.name}`);
			hash.update(chunk);
			await handle.write(chunk);
			input.onProgress?.({ phase: "copying", asset: asset.name, asset_index: input.index + 1, asset_count: LOCAL_EMBEDDING_ASSETS.length, downloaded_bytes: input.copiedBefore + bytes, total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES });
		}
		await handle.sync();
	} finally {
		await handle.close();
	}
	if (bytes !== asset.bytes) throw new Error(`Local embedding asset size mismatch: ${asset.name}`);
	if (hash.digest("hex") !== asset.sha256) throw new Error(`Local embedding asset checksum mismatch: ${asset.name}`);
	await chmodSensitiveFile(target);
}

async function writeManifest(root: string, stagingName: string, createdAt: string): Promise<AssetManifest> {
	const base: AssetManifestBase = {
		schema_version: 1,
		asset_version: LOCAL_EMBEDDING_ASSET_VERSION,
		provider: LOCAL_EMBEDDING_PROVIDER,
		model: LOCAL_EMBEDDING_MODEL,
		revision: LOCAL_EMBEDDING_REVISION,
		created_at: createdAt,
		total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES,
		license: "Apache-2.0 + MIT runtime",
		files: LOCAL_EMBEDDING_ASSETS.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
	};
	const manifest: AssetManifest = { ...base, manifest_checksum: manifestChecksum(base) };
	const path = resolvePrivatePath(root, "models", "local-embedding", stagingName, MANIFEST_FILE);
	const handle = await openSensitiveFileForWrite(root, path);
	try { await handle.writeFile(canonicalJson(manifest), "utf8"); await handle.sync(); } finally { await handle.close(); }
	return manifest;
}

export interface EnsureLocalEmbeddingInput {
	signal?: AbortSignal;
	onProgress?: (progress: LocalEmbeddingProgress) => void;
	createdAt?: string;
	runtimeAssetsDir?: string;
}

export async function ensureLocalEmbeddingAssets(root: string, input: EnsureLocalEmbeddingInput = {}): Promise<LocalEmbeddingAssetStatus> {
	const privateRoot = await ensurePrivateRoot(root);
	input.onProgress?.({ phase: "checking", downloaded_bytes: 0, total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES });
	const existing = await getLocalEmbeddingAssetStatus(privateRoot, { deep: true });
	const pathsBeforeLock = assetPaths(privateRoot);
	const cleanupNeeded = (await listManagedInstallArtifacts(pathsBeforeLock.local)).some(isCleanupCandidate);
	if (existing.ready && !cleanupNeeded) return existing;
	return withOwnedLock(privateRoot, MODEL_LOCK, async () => {
		const paths = assetPaths(privateRoot);
		await ensureDirectory(privateRoot, paths.models);
		await ensureDirectory(privateRoot, paths.local);
		const recovered = await recoverInterruptedInstall(privateRoot, paths);
		if (recovered?.ready) return recovered;
		const afterLock = await getLocalEmbeddingAssetStatus(privateRoot, { deep: true });
		await cleanupManagedInstallArtifacts(privateRoot, paths.local);
		if (afterLock.ready) return afterLock;
		const sourceDir = input.runtimeAssetsDir || runtimeAssetsDir(import.meta.url);
		if (await pathType(sourceDir) !== "directory") throw new Error(`Bundled local embedding assets missing at ${sourceDir}; run scripts/fetch-local-embedding-assets.ts`);
		const stagingName = `.staging-${randomUUID()}`;
		const stagingDir = resolvePrivatePath(privateRoot, "models", "local-embedding", stagingName);
		await mkdir(stagingDir, { mode: PRIVATE_DIR_MODE });
		let invalidDir: string | undefined;
		try {
			let copied = 0;
			for (let index = 0; index < LOCAL_EMBEDDING_ASSETS.length; index += 1) {
				const asset = LOCAL_EMBEDDING_ASSETS[index];
				await copyAssetFromRuntime(privateRoot, stagingDir, asset, sourceDir, { signal: input.signal, onProgress: input.onProgress, copiedBefore: copied, index });
				copied += asset.bytes;
			}
			input.onProgress?.({ phase: "verifying", downloaded_bytes: copied, total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES });
			await writeManifest(privateRoot, stagingName, input.createdAt || new Date().toISOString());
			if (await pathType(paths.version)) {
				invalidDir = resolvePrivatePath(privateRoot, "models", "local-embedding", `.invalid-${randomUUID()}`);
				await rename(paths.version, invalidDir);
			}
			await rename(stagingDir, paths.version);
			const ready = await getLocalEmbeddingAssetStatus(privateRoot, { deep: true });
			if (!ready.ready) throw new Error(ready.reason);
			if (invalidDir) await rm(invalidDir, { recursive: true, force: true });
			await cleanupManagedInstallArtifacts(privateRoot, paths.local);
			input.onProgress?.({ phase: "ready", downloaded_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES, total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES });
			return ready;
		} catch (error) {
			await rm(stagingDir, { recursive: true, force: true });
			if (invalidDir && !(await pathType(paths.version))) await rename(invalidDir, paths.version).catch(() => undefined);
			throw error;
		}
	}, { waitMs: 120_000 });
}

export async function removeLocalEmbeddingAssets(root: string, input: { onProgress?: (progress: LocalEmbeddingProgress) => void } = {}): Promise<{ removed: true; assetDir: string }> {
	const privateRoot = await ensurePrivateRoot(root);
	return withOwnedLock(privateRoot, MODEL_LOCK, async () => {
		input.onProgress?.({ phase: "removing", downloaded_bytes: 0, total_bytes: LOCAL_EMBEDDING_DOWNLOAD_BYTES });
		const paths = assetPaths(privateRoot);
		const localKind = await pathType(paths.local);
		if (localKind !== null && localKind !== "directory") throw new Error("Local embedding cache parent is not a private directory");
		if (localKind === "directory") {
			for (const entry of await readdir(paths.local)) {
				if (entry.startsWith(".staging-") || entry.startsWith(".invalid-") || /^multilingual-minilm-l12-int8-v\d+$/.test(entry)) await rm(resolvePrivatePath(privateRoot, "models", "local-embedding", entry), { recursive: true, force: true });
			}
		}
		return { removed: true, assetDir: paths.version };
	}, { waitMs: 10_000 });
}
