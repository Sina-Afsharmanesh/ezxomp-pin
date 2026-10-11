#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inputRoot = process.argv[2];
if (!inputRoot) throw new Error('Usage: verify-packed-install.mjs /absolute/installed/@ezxomp/experiences');
const packageRoot = resolve(inputRoot);

const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.name, '@ezxomp/experiences');

const expectedPeers = {
  '@oh-my-pi/pi-ai': '17.2.1',
  '@oh-my-pi/pi-coding-agent': '17.2.1',
  '@oh-my-pi/pi-tui': '17.2.1',
};
assert.deepEqual(packageJson.peerDependencies ?? {}, expectedPeers, `peerDependencies must be ${JSON.stringify(expectedPeers)}`);
assert.deepEqual(packageJson.dependencies ?? {}, {}, 'runtime dependencies must be vendored in the package');

for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
  assert.equal(packageJson.scripts?.[hook], undefined, `unexpected package lifecycle hook: ${hook}`);
}

const manifestModule = await import(pathToFileURL(join(packageRoot, 'extensions/agent-experience/src/semantic/local-model-manifest.ts')).href);
const {
  LOCAL_EMBEDDING_ASSET_VERSION,
  LOCAL_EMBEDDING_ASSETS,
  LOCAL_EMBEDDING_MAX_MANAGED_BYTES,
} = manifestModule;

const required = [
  'CHANGELOG.md',
  'dist/experience-consolidate.mjs',
  'extensions/agent-experience/index.ts',
  'runtime/agent-experience/local-embedding-worker.mjs',
  'runtime/vendor/huggingface-tokenizers/dist/tokenizers.mjs',
  'runtime/vendor/onnxruntime-common/dist/esm/index.js',
  'runtime/vendor/onnxruntime-web/ort.node.min.mjs',
  'runtime/vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  'runtime/vendor/onnxruntime-web/LICENSE',
  'runtime/vendor/onnxruntime-common/LICENSE',
  'runtime/assets/local-embedding.lock.json',
  `runtime/assets/local-embedding/${LOCAL_EMBEDDING_ASSET_VERSION}/manifest.json`,
  `runtime/assets/local-embedding/${LOCAL_EMBEDDING_ASSET_VERSION}/LICENSE.Apache-2.0`,
  ...LOCAL_EMBEDDING_ASSETS.map((asset) => `runtime/assets/local-embedding/${LOCAL_EMBEDDING_ASSET_VERSION}/${asset.name}`),
];
for (const relative of required) await access(join(packageRoot, relative));
const modelLicenseText = await readFile(join(packageRoot, `runtime/assets/local-embedding/${LOCAL_EMBEDDING_ASSET_VERSION}/LICENSE.Apache-2.0`), 'utf8');
assert.match(modelLicenseText, /Base model metadata declares license: apache-2\.0[\s\S]*Apache License[\s\S]*Version 2\.0[\s\S]*END OF TERMS AND CONDITIONS/, 'packed model license must include Apache-2.0 text and provenance');

async function files(directory, { skipNodeModules = false } = {}) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipNodeModules && entry.isDirectory() && entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await files(path, { skipNodeModules }));
    else out.push(path);
  }
  return out;
}

async function bytes(directory, { skipNodeModules = false } = {}) {
  let total = 0;
  for (const path of await files(directory, { skipNodeModules })) total += (await stat(path)).size;
  return total;
}

const packedFiles = await files(packageRoot, { skipNodeModules: true });
assert.ok(
  !packedFiles.some((path) => /observations\.jsonl|ledger\.sqlite|__pycache__|\.py[co]$|\.map$/.test(path)),
  'tarball must not contain private state, Python caches, or source maps',
);
assert.ok(
  packedFiles.some((path) => path.endsWith(`runtime/assets/local-embedding/${LOCAL_EMBEDDING_ASSET_VERSION}/model_int8.onnx`)),
  'tarball must contain the pinned model asset under runtime/assets/local-embedding/',
);

const modelModule = await import(pathToFileURL(join(packageRoot, 'extensions/agent-experience/src/semantic/local-model.ts')).href);
const adapterModule = await import(pathToFileURL(join(packageRoot, 'extensions/agent-experience/src/semantic/local-adapter.ts')).href);
const { ensureLocalEmbeddingAssets, removeLocalEmbeddingAssets } = modelModule;
const { createLocalEmbeddingAdapter } = adapterModule;

let managedBytes = await bytes(packageRoot, { skipNodeModules: true });
const packagedAssetsRoot = join(packageRoot, 'runtime/assets/local-embedding', LOCAL_EMBEDDING_ASSET_VERSION);
const stateRoot = await mkdtemp(join(tmpdir(), 'ax-packed-verifier-state-'));
let localInference;
let mainFetchCalls = 0;
const realFetch = globalThis.fetch;

try {
  globalThis.fetch = () => {
    mainFetchCalls += 1;
    throw new Error('packed install inference must not fetch (main)');
  };

  const ready = await ensureLocalEmbeddingAssets(stateRoot, { runtimeAssetsDir: packagedAssetsRoot });
  assert.equal(ready.ready, true);
  assert.equal(mainFetchCalls, 0, 'ensureLocalEmbeddingAssets must not fetch from main process');

  const adapter = createLocalEmbeddingAdapter(stateRoot, { idleMs: 100 });
  try {
    const vectors = await adapter.embed([
      'condition: when reviewing code',
      'behavior: identify concrete risks and recommend fixes',
      'condition: при проверке кода',
      'behavior: находить конкретные риски и предлагать исправления',
    ]);
    assert.equal(vectors.length, 4);
    assert.ok(vectors.every((vector) => vector.length === 384));
    const digest = createHash('sha256').update(Buffer.from(vectors[0].buffer)).digest('hex');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(adapter.isWorkerActive(), false);
    localInference = {
      dimensions: vectors[0].length,
      vector_sha256: digest,
      asset_bytes: ready.totalBytes,
      offline: true,
      worker_unloaded: true,
    };
    assert.equal(mainFetchCalls, 0, 'inference path must not fetch from main process');
  } finally {
    await adapter.close();
    await removeLocalEmbeddingAssets(stateRoot);
  }

  managedBytes += ready.totalBytes;
  assert.ok(managedBytes <= LOCAL_EMBEDDING_MAX_MANAGED_BYTES, `managed footprint exceeds cap: ${managedBytes}`);
  assert.equal(mainFetchCalls, 0, 'no main-process fetch should happen');
} finally {
  globalThis.fetch = realFetch;
  await rm(stateRoot, { recursive: true, force: true });
}


console.log(
  JSON.stringify({ packageRoot, version: packageJson.version, packed_file_count: packedFiles.length, managed_bytes: managedBytes, local_inference: localInference }, null, 2),
);
