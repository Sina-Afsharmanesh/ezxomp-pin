# AGENTS.md: experiences

## Purpose

OMP Experiences — human-reviewed habits for OMP coding agents. A local-first behavioral learning layer alongside skills and memory: habits teach *how* the agent works with the user. Nothing becomes active without explicit human approval; direct instructions and configured law always override habits.

## Ownership

- Package: `@ezxomp/experiences` (workspace `plugins/experiences`), version `0.1.49-ezxomp.1`
- Upstream: `pi-experiences` (misunders2d/pi-experiences), pinned in `UPSTREAM.json`
- Extension entry: `extensions/agent-experience/index.ts`; skill: `skills/agent-experience/SKILL.md`; CLI: `bin/experience-consolidate.mjs` (built to `dist/`)

## Local Contracts

- **Fork rename contract**: full OMP branding — README, SVG, extension README, SKILL say "OMP Experiences"/"OMP coding agent"; CHANGELOG keeps historical Pi mentions. Enforced by `scripts/check-agent-experience-source.mjs` — keep the guard and the contract in sync.
- **High-impact storage files** (root AGENTS.md lists these; changes ripple across the extension): `src/storage/private-root.ts`, `src/storage/checksum.ts`, `src/storage/sqlite.ts`, `src/storage/redaction.ts`, plus `src/config.ts`, `src/paths.ts`, `src/review.ts`.
- **Config**: `src/config.ts` — `AgentExperienceConfig`, TOML parse/format, env overrides (`applyAgentExperienceEnvOverrides`).
- **Surfaces**: `/experience setup` is the complete control panel; natural conversation (draft → confirm exact wording → numbered review) is the complementary surface. Conversational tools in `src/conversational-tools.ts`.
- **Pipeline**: capture (`src/capture/`) → consolidate/Analyze (`src/consolidate/`) → review (`src/review.ts`) → selector (`src/selector*.ts`, `src/semantic/`) → steering (`src/steering-context.ts`, `src/steering-note.ts`). Optional local embedding (`src/semantic/local-adapter.ts`, runtime worker in `runtime/agent-experience/`).
- **Safety invariants**: no auto-approve/auto-merge/auto-activate; missing/corrupt/stale state fails closed; selector hot path never initializes storage; selector hit logs never persist raw prompts (`prompt_hash` omitted).
- **Env vars**: `AX_STATE_ROOT` (consolidate CLI), `AX_SELECTOR_MODE`, `AX_BUILD_OUTFILE` (build-cli).
- **Self-contained local-embedding runtime**: the optional local duplicate-check worker boots purely from git-tracked runtime assets and denies `fetch` before importing vendored runtime modules. `runtime/assets/local-embedding/<asset_version>/` ships the pinned model (`model_int8.onnx`), tokenizer (`tokenizer.json`, `tokenizer_config.json`), config (`config.json`), and the ORT WASM (`ort-wasm-simd-threaded.wasm`). `runtime/vendor/huggingface-tokenizers/dist/tokenizers.mjs`, `runtime/vendor/onnxruntime-web/{ort.node.min.mjs,ort-wasm-simd-threaded.mjs}`, and `runtime/vendor/onnxruntime-common/dist/esm/*.js` ship the JS glue. Bytes/SHA are locked in `runtime/assets/local-embedding.lock.json`. `ensureLocalEmbeddingAssets` is a deterministic local copy with size+SHA verification — it never reaches the network in normal operation.
- **Package rules**: no `install`/`postinstall`/`prepare` hooks; `files` must include `runtime/`, `docs/`, `CHANGELOG.md`; the package ships model bytes and the tokenizer inside the runtime tree rather than downloading them at runtime. Document vendored runtime patches beside the patched vendor directory (`PATCHES.md`) and keep `scripts/check-agent-experience-source.mjs` hashes/provenance checks current.

## Work Guidance

- The 23 phase test scripts (`scripts/test-agent-experience-phase*.mjs`) are the behavioral spec — a change to a phase's behavior must update or add its phase script.
- `scripts/check-agent-experience-source.mjs` asserts the OMP contract (README structure, keywords, no install hooks, changelog version, config shape). Run it after any README/package/contract change.
- `scripts/check-generated-cli.mjs` guards `dist/` drift — regenerate with `npm run build` (esbuild via `scripts/build-cli.mjs`).
- Keep the collapsed `<details>` technical contract in README intact; preserve the human-first product sections above it.

## Verification

- `npm run check` — full suite: 23 phase scripts + `check:source` guard.
- `npm run check:cli` — build + `dist/experience-consolidate.mjs --help`/`status` smoke.
- `npm run check:generated` — generated CLI drift check.
- TUI smokes: `scripts/test-*-tui-smoke.py` (steering, duplicate, scheduled-notice, installed).
- `scripts/verify-packed-install.mjs` — packed-install verification against an extracted `npm pack --ignore-scripts` tarball; checks packaged runtime assets, licenses, offline inference, worker unload, and managed footprint.
- See `extensions/agent-experience/VALIDATION.md` for the full validation contract.

## Child DOX Index

No child AGENTS.md files needed.
