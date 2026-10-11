#!/usr/bin/env node
/**
 * Phase 23 — self-contained install.
 *
 * Strategy: build the CLI, create the same npm tarball a release would ship,
 * extract it, and dynamic-import the local embedding modules from that extracted
 * package. This exercises package `files` rather than the source checkout.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function hashOf(path) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

async function relativeFiles(root, directory = root, prefix = '') {
	const out = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) out.push(...await relativeFiles(root, fullPath, relative));
		else out.push(relative);
	}
	return out.sort();
}

async function packAndExtract(workDir) {
	const packDir = join(workDir, 'pack');
	const extractDir = join(workDir, 'extract');
	await mkdir(packDir, { recursive: true });
	await mkdir(extractDir, { recursive: true });
	await execFileAsync('npm', ['run', 'build'], { cwd: PLUGIN_ROOT, maxBuffer: 10 * 1024 * 1024 });
	const packOutput = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir], { cwd: PLUGIN_ROOT, maxBuffer: 20 * 1024 * 1024 });
	const packData = JSON.parse(packOutput.stdout);
	const [pack] = Array.isArray(packData) ? packData : Object.values(packData);
	const tarball = isAbsolute(pack.filename) ? pack.filename : join(packDir, pack.filename);
	await execFileAsync('tar', ['-xzf', tarball, '-C', extractDir], { maxBuffer: 10 * 1024 * 1024 });
	const packageRoot = join(extractDir, 'package');
	assert.deepEqual(await relativeFiles(packageRoot), pack.files.map((file) => file.path).sort(), 'extracted tarball files must match npm pack manifest exactly');
	return { packageRoot, pack };
}

const isolated = await mkdtemp(join(tmpdir(), 'ax-phase23-packed-'));
try {
	const { packageRoot: pkg, pack } = await packAndExtract(isolated);

	assert.equal(pack.name, '@ezxomp/experiences');
	assert.equal(pack.version, '0.1.49-ezxomp.1');
	assert.ok(!pack.files.some((file) => file.path.includes('/node_modules/')), 'packed runtime must not depend on nested node_modules');

	// Dynamic-import the runtime modules from the extracted package so the test
	// exercises exactly what a downstream user would boot.
	const manifestMod = await import(pathToFileURL(join(pkg, 'extensions/agent-experience/src/semantic/local-model-manifest.ts')).href);
	const modelMod = await import(pathToFileURL(join(pkg, 'extensions/agent-experience/src/semantic/local-model.ts')).href);
	const adapterMod = await import(pathToFileURL(join(pkg, 'extensions/agent-experience/src/semantic/local-adapter.ts')).href);

	const { LOCAL_EMBEDDING_ASSETS, LOCAL_EMBEDDING_ASSET_VERSION, LOCAL_EMBEDDING_DOWNLOAD_BYTES } = manifestMod;
	const { ensureLocalEmbeddingAssets, removeLocalEmbeddingAssets } = modelMod;
	const { createLocalEmbeddingAdapter } = adapterMod;

	const assetDir = join(pkg, 'runtime', 'assets', 'local-embedding', LOCAL_EMBEDDING_ASSET_VERSION);
	const tokenizerPath = join(pkg, 'runtime', 'vendor', 'huggingface-tokenizers', 'dist', 'tokenizers.mjs');
	const commonPath = join(pkg, 'runtime', 'vendor', 'onnxruntime-common', 'dist', 'esm', 'index.js');
	const onnxWebLicensePath = join(pkg, 'runtime', 'vendor', 'onnxruntime-web', 'LICENSE');
	const onnxCommonLicensePath = join(pkg, 'runtime', 'vendor', 'onnxruntime-common', 'LICENSE');
	const modelLicensePath = join(assetDir, 'LICENSE.Apache-2.0');

	assert.equal(LOCAL_EMBEDDING_DOWNLOAD_BYTES, 148_618_669, 'shipped pinned asset manifest byte sum must remain 148,618,669');
	assert.equal(LOCAL_EMBEDDING_ASSETS.length, 5, 'pinned asset manifest must enumerate exactly 5 files');
	assert.ok((await stat(tokenizerPath)).size > 0, 'packed tokenizer missing under runtime/vendor/huggingface-tokenizers/dist/tokenizers.mjs');
	assert.ok((await stat(commonPath)).size > 0, 'packed ONNX Runtime common module missing under runtime/vendor/onnxruntime-common/dist/esm/index.js');
	assert.match(await readFile(onnxWebLicensePath, 'utf8'), /MIT License[\s\S]*Microsoft Corporation/, 'packed ONNX Runtime Web license must include MIT text');
	assert.match(await readFile(onnxCommonLicensePath, 'utf8'), /MIT License[\s\S]*Microsoft Corporation/, 'packed ONNX Runtime Common license must include MIT text');
	assert.match(await readFile(modelLicensePath, 'utf8'), /Base model metadata declares license: apache-2\.0[\s\S]*Apache License[\s\S]*Version 2\.0/, 'packed model license must include Apache-2.0 text and provenance');

	// ── No network from this process OR from the worker child. ──
	let mainFetchCalls = 0;
	const realFetch = globalThis.fetch;
	globalThis.fetch = () => {
		mainFetchCalls += 1;
		throw new Error(`packed install must not fetch (main call #${mainFetchCalls})`);
	};

	const stateRoot = await mkdtemp(join(tmpdir(), 'ax-phase23-state-'));
	try {
		const phases = [];
		const installed = await ensureLocalEmbeddingAssets(stateRoot, {
			createdAt: '2026-07-10T00:00:00.000Z',
			onProgress: (progress) => phases.push(progress.phase),
		});
		assert.equal(installed.ready, true);
		assert.equal(phases.at(-1), 'ready');
		assert.equal((await stat(installed.assetDir)).mode & 0o777, 0o700);
		for (const asset of LOCAL_EMBEDDING_ASSETS) {
			assert.equal((await stat(join(installed.assetDir, asset.name))).mode & 0o777, 0o600);
			assert.equal(await hashOf(join(installed.assetDir, asset.name)), asset.sha256, `installed ${asset.name} must match pinned sha`);
		}
		assert.equal(mainFetchCalls, 0, 'ensureLocalEmbeddingAssets must not invoke globalThis.fetch from main');

		// ── Inference: adapter boots the extracted worker with default-on fetch
		// denial and loads tokenizer + ONNX WASM/Common from pkg/runtime/...
		const adapter = createLocalEmbeddingAdapter(stateRoot, { idleMs: 100 });
		try {
			const fixtures = [
				{ condition: 'When reviewing code', behavior: 'Identify concrete risks and recommend fixes.' },
				{ condition: 'При проверке коде', behavior: 'Находить конкретные риски и предлагать исправления.' },
				{ condition: 'Al revisar código', behavior: 'Identificar riesgos concretos y recomendar correcciones.' },
				{ condition: 'Bei der Codeprüfung', behavior: 'Konkrete Risiken erkennen und Korrekturen empfehlen.' },
			];
			const texts = fixtures.flatMap((f) => [`${f.condition} || ${f.behavior}`]);
			const vectors = await adapter.embed(texts);
			assert.equal(vectors.length, texts.length);
			assert.ok(vectors.every((v) => v.length === 384));
			assert.equal(mainFetchCalls, 0, 'inference path must not invoke globalThis.fetch from main');
		} finally {
			await adapter.close();
		}

		// ── Interruption recovery + cleanup still offline. ──
		const localDir = dirname(installed.assetDir);
		const interrupted = join(localDir, '.invalid-interrupted-install');
		await rename(installed.assetDir, interrupted);
		const recovered = await ensureLocalEmbeddingAssets(stateRoot);
		assert.equal(recovered.ready, true, 'crash-recovery must not require a fresh copy');
		assert.equal(mainFetchCalls, 0, 'crash recovery must remain offline');

		// ── Removal + reinstall from extracted package. ──
		await removeLocalEmbeddingAssets(stateRoot);
		await ensureLocalEmbeddingAssets(stateRoot);
		assert.equal(mainFetchCalls, 0, 'reinstall after remove must remain offline');
	} finally {
		globalThis.fetch = realFetch;
		await rm(stateRoot, { recursive: true, force: true });
	}
} finally {
	await rm(isolated, { recursive: true, force: true });
}

console.log('agent-experience phase23 packed self-contained install checks passed');
