---
id: TASK-59
title: >-
  Wire custom-provider models into native /model picker with unified
  authenticated-provider presentation
status: Done
assignee:
  - cook-orchestrator
created_date: '2026-08-24 02:27'
updated_date: '2026-08-24 15:13'
labels:
  - feature
dependencies: []
references:
  - 'https://github.com/apmantza/pi-models'
  - 'https://github.com/apmantza/pi-free'
type: feature
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
better-custom registers custom OpenAI-compatible providers/models via its interactive wizard, but those models never surface in OMP's native `/model` command — users add them yet cannot switch to them like built-in models.\n\nDeliverables:\n1. Wire every better-custom model into the native `/model` picker as first-class selectable entries (select → session switches).\n2. Add an alternative presentation listing models from ALL authenticated providers (native + better-custom), modeled on https://github.com/apmantza/pi-models.\n3. Integrate https://github.com/apmantza/pi-free so its free-provider models flow through the same unified view.\n\nImplementation happens in jj workspace `../ezxomp-plugin` (head commit `wsvnvtoo a36db451` already gitignores/untracks the 118MB `model_int8.onnx` that blocks fresh checkouts — keep that change intact).\nPlugin root: `plugins/better-custom`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Models registered through better-custom appear in the native /model command list and selecting one switches the session model
- [x] #2 An alternative presentation enumerates models from all authenticated providers (native + better-custom) in the style of apmantza/pi-models
- [x] #3 pi-free provider models from apmantza/pi-free are discoverable and selectable through the same presentation
- [x] #4 just verify passes in the ezxomp-plugin workspace (bunx tsc --noEmit + bun test)
- [x] #5 CHANGELOG.md has an Unreleased entry and plugins/better-custom docs describe both behaviors
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **Register better-custom providers in the native model registry** — add the host adapter behind `plugins/better-custom/src/model-browser.ts::registerBetterCustomProviders` and wire `plugins/better-custom/src/index.ts::customProviderWizard`/provider-config persistence so each configured custom provider is passed to `ExtensionAPI.registerProvider` with its `baseUrl`, API/auth fields, and every model entry. Preserve built-in provider ownership, unknown model fields, and credential modes; refresh/re-register after add/edit/delete writes so existing sessions do not require restart. Risk: `ModelRegistry.getAvailable()` filters unauthenticated providers and native registration is session-scoped; keep credentials lazy and avoid network in extension load. Checkpoint: `bun test test/better-custom-models.test.ts` native-registration case must turn green, and a focused registry/setModel smoke must show `provider/model-id` is selectable.
2. **Build the unified authenticated-provider presentation** — implement `plugins/better-custom/src/model-browser.ts::buildUnifiedModelView` plus the interactive view/selection wiring in `plugins/better-custom/src/ui/` and `src/index.ts`. Consume the native model query/registry snapshot (including better-custom registrations), keep only authenticated/available providers, and expose deterministic provider groups and pi-models-style family metadata/virtual sections while retaining canonical `provider/id` refs. Selection must resolve the canonical model and call `ExtensionAPI.setModel`/session switch rather than mutating config. Risk: do not shadow the reserved native `/model` command; use a distinct command/view entry and tolerate empty/stale provider catalogs. Checkpoint: the unified-authenticated test in `test/better-custom-models.test.ts` passes with native + custom sources and excludes unauthenticated entries; focused UI selection smoke proves the selected ref reaches the host switch seam.
3. **Feed pi-free models through the same view** — add a host-neutral pi-free adapter/source path in `plugins/better-custom/src/model-browser.ts` (and lifecycle wiring in `plugins/better-custom/src/index.ts`) that accepts the pi-free/native provider catalog or registry snapshot without adding a runtime dependency. Normalize free-provider model metadata/auth state into the unified source contract, retain `provider/id`, free/cost markers, and route selection through the same `setModel` seam. Risk: pi-free uses native registration plus its own free/all filter (`lib/registry.ts::registerWithGlobalToggle`, `lib/native-provider.ts::filterNativeModels`); do not bypass native auth/hidden-model filtering or assume network access. Checkpoint: the pi-free case in `test/better-custom-models.test.ts` shows a free provider in both provider/family and free-model views and remains selectable.
4. **Document the two model surfaces and release note** — update `plugins/better-custom/README.md` with native `/model` registration/switch behavior, unified authenticated-provider browsing, and pi-free/free-model integration; add a truthful `## [Unreleased]` entry to root `CHANGELOG.md`. Risk: document only shipped contracts and the no-network/auth boundaries. Checkpoint: focused docs assertions/manual diff review plus the final `just verify` gate in the workspace.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: PlannerT30
created: 2026-08-24 02:39
---
Research notes (PlannerT30): better-custom currently writes only `~/.omp/models.yml`/`models.yaml`/`models.json`: `plugins/better-custom/src/index.ts:customProviderWizard` registers only `/custom-provider`; `src/flows/add.ts:addProviderFlow` calls `buildProviderConfig` then `src/flows/shared.ts:persistProvider` → `src/config.ts:saveModelsConfig`. Native `/model` is reserved in `@oh-my-pi/pi-coding-agent/src/slash-commands/builtin-modes.ts` (`name: "model"`, args resolve `runtime.session.getAvailableModels()` and `setModel`; TUI calls `runtime.ctx.showModelSelector()`); TUI model hub/picker uses `selector-controller.ts:showModelSelector` and `ModelRegistry.getAvailable()`. The registry exposes the extension seam `src/extensibility/extensions/types.ts:ExtensionAPI.registerProvider` and `src/config/model-registry.ts:ModelRegistry.registerProvider`; current disk writes do not refresh/register the live session, explaining absence until reload/restart. pi-models (`https://github.com/apmantza/pi-models`, `master/pi-models.ts`) builds `ModelInfo`, `getProviders`, `getModelFamilies`, `getLabs`, a three-level provider/lab/family browser, and a virtual `__free` section; selection resolves `provider/id` through the registry then calls `pi.setModel`. pi-free (`https://github.com/apmantza/pi-free`, `master/index.ts`, `lib/registry.ts`, `lib/native-provider.ts`) registers native providers, stores `{free, all}`, filters via native auth/hidden-model paths plus global free-only state, and exposes `getProviderRegistry`; integration should adapt that native catalog into the same authenticated source rather than add a dependency or duplicate credentials.
---

author: cook-orchestrator
created: 2026-08-24 04:47
---
Follow-up recorded from TASK-59.2 judge audit: credential references ($ENV/!command/literal) pass through better-custom unresolved (verified by adversarial probes), BUT the host ModelRegistry itself resolves them synchronously during registerProvider (model-registry.ts #installProviderApiKey → resolveConfigValue; constructor fallback :257). End-to-end, !command refs therefore EXECUTE at provider-registration/load time under HOST semantics — identical to natively configured providers, not introduced by this plugin. Docs corrected to state host-side resolution truthfully. Potential future hardening (out of scope here): defer provider installation until first model request to avoid load-time command execution.
---

author: cook-orchestrator
created: 2026-08-24 15:13
---
GATE EVIDENCE (ValidatorT30 agent exited without yielding; orchestrator completed its checklist directly): pre-heal runs showed just verify red ONLY on plannotator self-contained marketplace tests (git exit 128 / shared-index pollution) — reproduced identically on untouched main checkout, proving pre-existing environmental failure, not TASK-59 scope. Root causes: (1) jj-only workspace had no .git anchor for bare-git discovery; (2) shared index of main checkout polluted with 96 phantom entries. FIX (operator-approved heal, zero shared-config edits): materialized missing stub dir core.worktree points at (/home/egsox/repo/worktrees/ezxomp/sheer-plover), registered proper git worktree .git/worktrees/ezxomp-plugin {gitdir, commondir, HEAD}, added workspace .git anchor file (jj ignores it — status clean), seeded per-worktree index from workspace head 1ff363ab via read-tree. POST-HEAL GATE: bunx tsc --noEmit clean; bun test full suite 369 pass / 18 skip / 0 fail incl. contract suite test/better-custom-models.test.ts exactly 3 pass / 0 fail and both formerly-failing marketplace tests; '✓ all gates passed — ok to push/merge' EXIT:0. Note: AC4a receipt-determinism test timed out once under parallel-agent load in an intermediate run (passed in validator's own run and final run) — load-sensitive flake outside feature scope.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the full TASK-59 chain in jj workspace ezxomp-plugin as five commits on main lineage: wsvnvtoo/24d0f11c1bed feat(better-custom): register custom providers in native /model seam (TASK-59.1); znwrytul/5098e38f59d1 feat(better-custom): unified authenticated-provider model browser (TASK-59.4); zsszruvw/15df7abcd7a3 feat(better-custom): pi-free models in unified view via provider-relative free classifier (TASK-59.3); qzqstvxv/1ff363ab587d docs(better-custom): document native /model registration, /better-models browser, free lane (TASK-59.2); plus baseline chore gitignore+untrack model_int8.onnx (ab4132e0ee02-lineage).\n\nAC evidence: #1 custom models register into native ModelRegistry at extension load, re-sync after add/edit/delete without restart, selection switches session via host setModel (judge native smoke: /model custom-live/alpha consumed). #2 /better-models presents ALL authenticated providers in pi-models-style provider/family groups with canonical refs, deduped registry-first, deterministic sort; reserved-name collision ruled out vs slash names/aliases/CLI actions. #3 pi-free models flow through the same view with free lane classification (explicit marker; adaptive zero-cost/name routes per upstream semantics; absent cost = zero) with ZERO runtime dependency on pi-free and no filter bypass. #4 just verify green post-environment-heal: tsc clean, 369 pass / 0 fail full suite, contract suite 3 pass / 0 fail (see gate-evidence comment for pre-existing-failure analysis and additive fix). #5 CHANGELOG ## [Unreleased] truthful entry + README sections + AGENTS.md DOX pass; docs truthfully separate plugin pass-through from host registration-time credential resolution."
<!-- SECTION:FINAL_SUMMARY:END -->
