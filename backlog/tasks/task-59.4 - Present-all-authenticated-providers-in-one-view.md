---
id: TASK-59.4
title: Present all authenticated providers in one view
status: Done
assignee: []
created_date: '2026-08-24 02:45'
updated_date: '2026-08-24 04:02'
labels:
  - feature
  - design
dependencies:
  - TASK-59.1
parent_task_id: TASK-59
type: feature
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket 2/4 of TASK-59, depends on task for native registration landing first.\n\nBuild a deterministic pi-models-style presentation over native + better-custom available models: provider groups, model-family groupings, stable labels/counts/metadata, canonical provider/id selection refs routed through ExtensionAPI.setModel/session switch.\n\nWork in jj workspace /home/egsox/repo/ezxomp-plugin. Target: plugins/better-custom/src/model-browser.ts::buildUnifiedModelView + presentation/selection wiring under src/ui/ and src/index.ts.\n\nRisks: do NOT shadow reserved native /model — use a distinct command/view entry; tolerate empty/stale provider catalogs; exclude unauthenticated/unavailable providers.\n\nCheckpoint: unified-authenticated case in test/better-custom-models.test.ts passes (native + custom sources, unauthenticated excluded); focused UI selection smoke shows selected ref reaching host switch seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The view includes models from every authenticated native provider and better-custom provider
- [x] #2 Unauthenticated or unavailable providers are excluded
- [x] #3 Provider groups and model-family groups expose stable labels, counts, metadata, and provider/model-id references
- [x] #4 Selection resolves the canonical model and calls ExtensionAPI.setModel or the equivalent session switch seam
- [x] #5 The implementation does not shadow the reserved native /model command
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENT (WorkerT301): model-browser.ts adds buildUnifiedModelView(sources) + view types (UnifiedViewSource/UnifiedProviderGroup/UnifiedFamilyGroup/UnifiedModelView). Deterministic first-seen-order presentation: provider groups {id,label,models,freeCount}, family groups keyed by model.family falling back to provider id, canonical provider/id refs on every model; sources with authenticated===false are excluded; providers with zero usable models are dropped; empty/undefined input yields a valid empty view ({providers:[],families:[],freeModels:[]}), never throws. freeModels lane stays [] — pi-free handling is the later sub-ticket, which keeps contract test 3 RED assertion-level as required. Also added: betterCustomViewSources(config) reusing 30.1's eligibility (builtins skipped via live PROVIDER_REGISTRY ids + static fallback; keyless skipped per host runtime-register validation), and switchToModel/setHostModelSwitcher capturing ExtensionAPI.setModel as the session-switch seam.

WIRING: new src/ui/model-view.ts (unifiedModelItems rows with label/suffix metadata: provider label, family, context window; showUnifiedModelsBrowser over existing selectOne pattern; empty-catalog info notice, cancel-safe null). src/index.ts registers DISTINCT command "better-models" whose handler groups ctx.models.list() into native view sources, merges betterCustomViewSources(loadModelsConfig()), renders the browser, resolves the picked ref through ctx.models.resolve(provider/id), and switches via captured pi.setModel — success/failure surfaced through ui.notify. Reserved-name evidence: host bundle defines native commands name:"model" with aliases ["models"] and CLI entry "models"; grep for name:"better-models" in @oh-my-pi/pi-coding-agent/dist/cli.js returns 0 occurrences — no reserved native /model (or /models) shadowing.

GATES: bun test test/better-custom-models.test.ts → exactly 2 pass / 1 fail (remaining fail assertion-level expect toBeTypeOf on pi-free case path); bunx tsc --noEmit → exit 0. jj diff --from ab4132e0ee02 --to @ -- test/ empty (tests untouched). Probes: view over test-2 fixtures reproduces expected providers/refs/family ordering exactly; empty+undefined input safe; keyless custom source excluded while credentialed source passes with metadata preserved; switchToModel routes resolved model object to captured host setModel and returns true.

Correction round 1 (judge): B1 duplicate custom sources fixed in buildUnifiedModelView. Mechanism chosen: (a)+(b) combined — index.ts passes native registry sources FIRST and config-sourced customs after, and the view now (1) dedupes by canonical provider/id ref with first occurrence (registry) winning, so a config side-channel can never resurrect a registry-listed model twice; (2) merges same-id provider sources into ONE group, eliminating duplicated providerIds like ["custom","custom"]; (3) adds explicit deterministic ordering — providers and families sorted by id via localeCompare, independent of input/Map iteration. Config-fallback edge cases preserved deliberately: keyless configured providers stay excluded via betterCustomViewSources eligibility (probe: keyless → []), and a config-only model absent from the registry (e.g. registration failed but genuinely credentialed) still appears exactly once rather than silently vanishing — refs probe: registry {custom/alpha} + config {custom/alpha, custom/beta} → providerIds ["custom"], refs ["custom/alpha","custom/beta"], all unique. Gates re-run: bun test test/better-custom-models.test.ts → exactly 2 pass / 1 fail assertion-level; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. AC#1/#3 remain proven (unique canonical refs).

Correction round 2 (judge): B2 side-channel admitting unavailable providers fixed. registrationBlocker in model-browser.ts now mirrors the host validateProviderConfiguration runtime-register predicate exactly — models require baseUrl, and models require a usable credential reference or oauth — and is shared by BOTH doors: registerBetterCustomProviders registration AND betterCustomViewSources view eligibility. A provider enters the unified view only via (1) native ctx.models.list() or (2) identical host-validation predicate + credential reference; keyless skip/warn behavior unchanged. Dedupe/sort/determinism from round 1 untouched. Probe matrix: invalid-no-baseUrl → excluded from both registration and view (providerIds/refs omit it); valid-but-not-yet-listed credentialed → included exactly once via config door; keyless → excluded with surfaced warning; registered custom listed by registry → appears exactly once via registry door (config duplicate dropped by round-1 dedupe). Gates re-run: bun test test/better-custom-models.test.ts → exactly 2 pass / 1 fail assertion-level; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty.

Correction round 3 (judge): B3 oauth nullity mismatch fixed. hasOauth now mirrors host runtime validation semantics (Boolean(config.oauth)): accepts only non-null object values — null, 0, "" and other garbage no longer count as an oauth configuration. Probe: providers with oauth:null, oauth:0, and oauth:"" are EXCLUDED from both doors (registerBetterCustomProviders → registered ["validOauth"] only, each malformed provider surfaced via warning; betterCustomViewSources → view sources ["validOauth"] only); a valid oauth object ({name,login}) passes both doors. Rounds 1–2 dedupe/sort/shared-predicate behavior untouched. Gates re-run: bun test test/better-custom-models.test.ts → exactly 2 pass / 1 fail assertion-level; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: JudgeT301
created: 2026-08-24 04:01
---
REVIEW_PASSED — JudgeT301 final adversarial pass (2026-08-24)

Scope/gates at working copy `f0629dc756fb`:
- `jj diff --from 24d0f11c1bed --to @ --summary` contains only `plugins/better-custom/src/index.ts`, `plugins/better-custom/src/model-browser.ts`, and `plugins/better-custom/src/ui/model-view.ts`; package.json unchanged.
- `jj diff --from ab4132e0ee02 --to @ -- test/` is empty.
- `bun test test/better-custom-models.test.ts` → exactly 2 pass / 1 fail; the remaining failure is the expected assertion-level pi-free/freeModels case owned by the later ticket. `bunx tsc --noEmit` → exit 0 with no diagnostics.

Evidence:
- Shared `registrationBlocker` (`model-browser.ts:131-144`) gates both native registration and `betterCustomViewSources` (`model-browser.ts:202-215`). Invalid no-baseUrl providers are excluded from both doors. Final OAuth probe: null/0/empty OAuth values produced zero registrar calls and zero view sources; a valid OAuth object passed both doors.
- Native/custom duplicate probe produced one provider group and unique canonical refs after merging registry `custom/alpha` with config `custom/alpha` + `custom/beta`: refs were `custom/alpha`, `custom/beta`.
- Diff-sync unregister after config removal left the live registry and resulting view empty. Mixed-auth probes excluded unauthenticated and zero-model sources; undefined input returned an empty view. Repeated and permuted inputs were deep-equal with providers/families explicitly sorted by id.
- Metadata probe produced stable provider/family labels, model counts, freeCount, context metadata, and canonical picker rows such as `zeta-provider/model-a`.
- Valid selection resolved `native/live`, called the host `setModel({provider:"native",id:"live"})`, and emitted success. A stale `native/stale` ref emitted a warning and did not call setModel.
- Reserved-name audit found native slash `name: "model"` with alias `"models"`; CLI actions are `ls`, `list`, `find`, and `refresh`; no host `better-models` collision was found.

Acceptance assessment:
- AC#1 proven: every in-scope authenticated native and better-custom model is represented, with duplicate canonical refs removed.
- AC#2 proven: unauthenticated, unavailable, keyless, malformed OAuth, invalid no-baseUrl, zero-model, and stale sources are excluded or handled safely.
- AC#3 proven: sorted provider/family groups expose stable labels, counts, metadata, and provider/model-id refs.
- AC#4 proven: valid selection resolves and reaches the host setModel seam; stale refs fail safely without config mutation.
- AC#5 proven: `better-models` is distinct from native `/model` and `/models` and does not collide with `omp models` CLI actions.

No blocking findings remain. All task ACs were objectively observed; status and acceptance-checkbox fields remain orchestrator-owned and were not modified by the judge.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the unified authenticated-provider presentation: plugins/better-custom/src/model-browser.ts::buildUnifiedModelView merges native registry models with better-custom config sources into deterministic provider/family groups (stable labels, counts, metadata, canonical provider/id refs); new src/ui/model-view.ts renders the picker over the existing selectOne pattern and showUnifiedModelsBrowser routes picks to switchToModel → captured host setModel seam; index.ts registers a DISTINCT command "better-models" (reserved-name verified against host slash names+aliases and CLI actions — native 'model' alias 'models' avoided).\n\nCorrectness hardening through 3 judge rounds: (R1) duplicate-source blocker — dedupe by canonical ref with registry-first precedence plus same-id group merge and explicit id sort, so registered customs appear exactly once; (R2) side-channel now shares ONE eligibility predicate with registration mirroring host validateProviderConfiguration runtime-register semantics (models⇒baseUrl; models+baseUrl⇒credential ref or oauth), excluding invalid/unavailable configs from both doors; (R3) hasOauth aligned to host Boolean(oauth) — null/0/''/garbage rejected at both doors.\n\nVerification: bun test test/better-custom-models.test.ts exactly 2 pass / 1 fail (pi-free case intentionally RED for TASK-59.3); bunx tsc --noEmit exit 0; test/ untouched vs ab4132e0ee02. Judge probes green: repro matrix [unlisted,custom] unique refs; keyless excluded with warnings; stale-ref after unregister diff-sync leaves view empty; mixed-auth exclusion; double-run deep-equal determinism; selection consumes setModel and warns on stale refs without switching. Head f0629dc756fb.
<!-- SECTION:FINAL_SUMMARY:END -->
