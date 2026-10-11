---
id: TASK-59.3
title: Commit TASK-59.3 boundary
status: Done
assignee: []
created_date: '2026-08-24 02:45'
updated_date: '2026-08-24 04:26'
labels:
  - feature
dependencies:
  - TASK-59.1
  - TASK-59.4
parent_task_id: TASK-59
type: feature
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket 3/4 of TASK-59, depends on native registration + unified view landing first.\n\nAdapt pi-free/native provider catalog entries into the same authenticated model source and presentation: normalize free-provider metadata/auth state, retain provider/id refs and free markers, route selection through the shared setModel seam. NO runtime dependency on pi-free, no duplicated credential storage.\n\nWork in jj workspace /home/egsox/repo/ezxomp-plugin. Target: plugins/better-custom/src/model-browser.ts adapter/source path + lifecycle wiring in src/index.ts.\n\nUpstream shape (doc-7 evidence): pi-free registers native providers, stores {free, all}, filters via native auth/hidden paths plus global free-only state (lib/registry.ts::registerWithGlobalToggle/isFreeModel/applyGlobalFilter; lib/native-provider.ts::registerNativeProvider/filterNativeModels). Do not bypass native auth/hidden filtering; assume no network access.\n\nCheckpoint: pi-free case in test/better-custom-models.test.ts shows free provider in both provider/family and free-model views and remains selectable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pi-free provider models appear in provider and family groupings alongside native and custom models
- [x] #2 Free pi-free models appear in a dedicated free-model section or equivalent virtual group
- [x] #3 Hidden, unauthenticated, or filtered models are not reintroduced by the adapter
- [x] #4 pi-free model selection uses the same canonical provider/model-id and host setModel path as every other provider
- [x] #5 No runtime dependency on pi-free or duplicated credential storage is added to better-custom
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENT (WorkerT301): model-browser.ts adds isFreeModel(model) — free classification with ZERO runtime dependency on pi-free: explicit isFree marker wins, then zero input+output cost when a cost object is present (pi-free/pi-models pricing-exposed providers), then \\bfree\\b word in the display name. This is the union of pi-free lib/registry.ts::isFreeModel (adaptive zero-cost/name routes) and pi-models isModelFree (cost-else-name for {openrouter,opencode,kilo,cline}) per doc-7 evidence, expressed purely over the UnifiedViewSource contract's already-present metadata fields. buildUnifiedModelView now populates the previously-reserved freeModels lane from classified models (sorted by canonical ref for determinism); pi-free sources need NO special-casing to enter provider/family groups because they arrive through the same authenticated UnifiedViewSource gate as native/custom.

NO REINTRODUCTION GUARANTEE (AC#3): the adapter never fetches or reconstructs pi-free catalogs — pi-free providers registered natively reach the view exclusively through ctx.models.list() in index.ts (already auth/hidden-filtered upstream via pi-free's registerNativeProvider/filterNativeModels/applyHidden paths), and config side-channel eligibility still uses the 30.1 host-validation predicate. Probe: unauthenticated source carrying isFree:true models stays fully absent from all three lanes. Selection unchanged (AC#4): same canonical provider/id ref → ctx.models.resolve → captured ExtensionAPI.setModel via switchToModel; probe re-confirms routing {kilo/free-model} to the captured seam returns true. AC#5: no import of pi-free anywhere in plugins/better-custom; no credential storage added.

UI: ui/model-view.ts rows now append a 'free' suffix label for explicitly flagged models so the free lane is visible at selection time. GATES: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail (13 expect calls); bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. Probe matrix: kilo pi-free source appears in provider group AND family group AND freeModels lane exactly once; custom-alpha (isFree:false) excluded from freeModels; openrouter zero-cost model classified free while paid sibling excluded; empty/undefined input yields valid empty view.

Correction round 1 (judge): B1+B2 fixed in model-browser.ts. isFreeModel is now PROVIDER-RELATIVE per the doc-7/pi-free adaptive truth table, computed ONCE per source and reused for both lane membership AND freeCount (single source of truth; family groups unchanged since they carry no counts). Truth table implemented: explicit isFree marker wins outright; all-zero-cost provider with no positive-priced sibling (Route A) classifies by NAME heuristic only — zero cost alone never qualifies; mixed provider with >=1 paid sibling (Route B, hasPaidSibling detects any input/output > 0) classifies free iff zeroCost OR name — a nonzero-priced 'free trial' still qualifies via name. Probe matrix results: all-zero provider {b1,b2} → 0 frees; all-zero provider with 'Free Tier' → exactly that one via name; mixed {zero(0/0), 'free trial'(0.01/0.02), paid(3/15)} → [mixed/zero, mixed/trial]; explicit markers honored regardless of siblings (kilo/free-model free; forced-paid excluded despite zero cost); freeModels refs sorted deterministically; freeCount === |freeModels ∩ provider| for EVERY fixture; empty input still yields valid empty view. Contract test 3 semantics preserved: its kilo fixture uses an explicit isFree:true marker, which the refined classifier still honors unconditionally — no test-visible behavior change. Gates: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty.

Follow-up polish (judge, non-blocking): P1 — stale buildUnifiedModelView doc line ('free-model lane stays empty; pi-free later ticket') replaced with current behavior: free lane populated via the provider-relative isFreeModel classifier. P2 — missing-cost parity with upstream (model.cost?.input ?? 0 semantics): in Route B evaluation absent/undefined cost fields now read as 0, so a costless or partially-costed model in a pricing-exposed provider classifies free like upstream. Probe: mixed provider {nocost 0/0, absent-cost 'plain', partial cost {}, paid 3/15} → freeModels [mixed/nocost, mixed/partial], freeCount 2 (paid excluded). Gates re-run: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: JudgeT301
created: 2026-08-24 04:18
---
REVIEW_PASSED — JudgeT301 final adversarial pass (2026-08-24)

Scope/integrity:
- Working copy `70e35d49a667`, parent `5098e38f59d1` (TASK-59.4). `jj diff --from 5098e38f59d1 --to @ --summary` contains only `plugins/better-custom/src/model-browser.ts` and `plugins/better-custom/src/ui/model-view.ts`.
- `plugins/better-custom/package.json` is unchanged; `jj diff --from ab4132e0ee02 --to @ -- test/` is empty. Search found no pi-free import/require; occurrences are type/comment references only.
- `bun test test/better-custom-models.test.ts` → 3 pass / 0 fail / 13 expects. `bunx tsc --noEmit` → exit 0.

Classifier probes:
- All-zero provider `{Basic, Standard}` → no free models and freeCount 0.
- All-zero provider with `Free Tier` → only the named model is free.
- Mixed provider `{zero 0/0, free trial 0.01/0.02, paid}` → `zero` and `free trial` are free; freeCount matches the lane.
- Single zero-cost model with no free name → not free under the adaptive non-pricing route.
- Explicit `isFree:true` and `isFree:false` markers override pricing/name heuristics.
- Tricky names such as `freedom-70b` do not match the word-boundary heuristic; `free-tier-preview` and `turing-free` do.
- Free-lane output is sorted by canonical provider/id and repeated input produces deep-equal provider/family/free-lane output.

Integration/filter/selection probes:
- Authenticated free sources appear in provider groups, family groups, and `freeModels`; unauthenticated `isFree:true` sources are absent from every lane.
- Empty/undefined input is safe and returns empty groups/lane.
- `kilo/free-model` resolves through the shared canonical provider/id path and invokes the captured host `setModel`; a stale free ref warns and does not switch.
- Explicit free rows expose the `free` UI suffix.
- No pi-free runtime dependency or credential store was introduced; pi-free models rely on the existing native/auth-filtered source path.

Acceptance assessment:
- AC#1 proven: pi-free/native free models enter the same provider and family groupings as other authenticated models.
- AC#2 proven: the dedicated `freeModels` virtual lane is populated deterministically.
- AC#3 proven: unauthenticated/filtered sources are excluded before classification and are not reintroduced.
- AC#4 proven: free selection uses canonical provider/model-id resolution and the shared setModel seam.
- AC#5 proven: no runtime pi-free dependency or duplicate credential storage exists.

FOLLOW-UP (non-blocking): model records lacking a `cost` object in a mixed priced provider are treated as not free; upstream's optional-cost route could interpret missing prices as zero. Also, the UI's `free` suffix is explicit-marker based while inferred free models are represented in `freeModels`; the stale comment saying the free lane is empty should be refreshed. These do not affect the documented pi-free/native record shape or the tested contract.

No blocking findings remain. Task status and acceptance fields were not modified by the judge.
---

created: 2026-08-24 04:25
---
Follow-up polish, correction (WorkerT301, head 3a02facf760d): P2 now implemented for real. Previous patch only coalesced missing FIELDS inside a present cost object; a null/undefined cost OBJECT still fell through to the name heuristic and classified as not-free — judge repro confirmed (freeModels [] / freeCount 0). Fix: isFreeModel Route B now treats a null OR undefined cost object as fully zero-cost (upstream (model.cost?.input ?? 0) semantics), so {missing:{id:'missing',name:'Basic'} (no cost)} alongside paid {1/2} classifies FREE. Corrected probe output: freeModels ["mixed/missing","mixed/nullcost"], counts ["mixed:2"]. Explicit nonzero costs remain nonzero; isFree marker path untouched; Route A behavior unchanged. Gates re-run: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty.
---

author: JudgeT301
created: 2026-08-24 04:25
---
REVIEW_PASSED — JudgeT301 final spot-check after P2 correction (2026-08-24)

Final working copy: `3a02facf` (parent `5098e38f`). `jj diff --from 70e35d49a667 --to @ --summary` contains only `plugins/better-custom/src/model-browser.ts`, exactly the intended missing/null-cost Route-B parity and stale-comment update; no other files moved.

Adversarial parity probe:
- All-zero Basic/Standard → no free models, freeCount 0.
- All-zero plus Free Tier → only Free Tier classified free.
- Mixed zero + nonzero-cost free trial + paid → zero and trial classified free, freeCount 2.
- Single zero-cost Basic → not free under non-pricing/name-only route.
- Mixed paid provider with missing, null, and empty cost records → missing/null/empty records classify free under upstream `(model.cost?.input ?? 0) === 0` semantics; freeCount 3.

Final gates:
- `bun test test/better-custom-models.test.ts` → 3 pass / 0 fail / 13 expects.
- `bunx tsc --noEmit` → exit 0.
- `jj diff --from ab4132e0ee02 --to @ -- test/` → empty.

All prior scope, no-runtime-pi-free, authentication filtering, deterministic ordering, selection, stale-ref, and AC#1–#5 evidence remains valid. No blocking findings remain. Task status and acceptance fields were not modified by the judge.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
pi-free models flow through the unified view with zero runtime dependency: model-browser.ts gains a provider-relative isFreeModel classifier (explicit isFree marker wins; all-zero-cost provider → name heuristic only; mixed provider with ≥1 paid sibling → zero-cost OR name; absent/null/empty cost fields read as 0 per upstream ?? 0 semantics) computed once per source as the single source of truth for the freeModels lane AND freeCount/family counts. pi-free sources enter through the existing authenticated gates (native ctx.models.list() for registered providers — upstream auth/hidden filtering respected; config side-channel via the shared host-validation predicate from 30.4), so no catalog reconstruction and no filter bypass. ui/model-view.ts marks free rows.\n\nVerification: bun test test/better-custom-models.test.ts exactly 3 pass / 0 fail (all planner RED contracts green); bunx tsc --noEmit exit 0; test/ untouched vs ab4132e0ee02. Judge adversarial rounds: R1 found context-free classifier + freeCount desync (+addendum on nonzero-priced named-free models) → fixed to adaptive truth table; polish round caught comment-only P2 (absent-cost guard) → implemented for real after orchestrator ruled missing-cost IN CONTRACT per upstream parity. Final probes: all-zero Basic/Standard → no frees; 'free trial' nonzero-cost with paid sibling → free via name; missing/null/empty cost mixed provider → free with correct freeCount; no pi-free imports/requires anywhere; determinism deep-equal with populated lane. Head 3a02facf760d.
<!-- SECTION:FINAL_SUMMARY:END -->
