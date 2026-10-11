---
id: TASK-55.7
title: Separate main and sub EVO recovery authority
status: Done
assignee:
  - '@eag1'
created_date: '2026-08-29 14:59'
updated_date: '2026-08-29 20:38'
labels:
  - architecture
  - refactor
dependencies:
  - TASK-55.1
parent_task_id: TASK-55
priority: high
type: task
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the shared generation-state record with independent main and sub recovery records so cross-project profile validation, failure status, restore, and deletion in one lane cannot corrupt or block the other. This is a blocking integration correction discovered while combining TASK-55.2 and TASK-55.4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main transitions read write and delete only a main generation record with no profile paths
- [x] #2 Sub transitions read write and delete only a sub generation record bound to its canonical project owner when project profiles exist
- [x] #3 A main failure cannot block sub restore and a sub conflict cannot block main hydration or restore
- [x] #4 Legacy shared generation state is migrated conservatively without deleting ambiguous evidence
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. paths.ts: add ompMainGenerationFile() (main-generation.json). Keep ompStateFile() (sub-state.json) as the sub lane record and ompGenerationStateFile() (generation-state.json) as the legacy shared file used only by migration.
2. generation-state.ts: split into lane records — MainGenerationRecord (main + hashes only, no profiles/paths) and SubGenerationRecord (profiles + ownerProjectCwd binding, no main field). Lane-specific read/write/delete helpers with atomic writes, hash validation, drift/foreign-path fail-closed semantics. Keep the shared process-local serializeTransition lock (no shared JSON). Add migrateLegacySharedRecord(): fan out only when every field validates and all project profiles belong to a single current authorized project cwd; otherwise retain legacy file and fail closed.
3. evoMain.ts: activate/hydrate/refreshFromConfig/refresh/deactivate operate only on the main record; deactivate deletes only the main file.
4. evoSub.ts: activate/hydrate/deactivate/refresh/regenerate operate only on the sub record (sub-state.json), binding ownerProjectCwd when project profiles exist; refusal when a sub file is present but unreadable or foreign (cannot restore from another project cwd); merged legacy fields (files/timestamp/toolListHash/projectCwds) so the substate reader and legacy snapshot hydration still work; drift refusal retains failed evidence.
5. Verification: run evo plugin vitest (baseline 25 pass / 21 pre-existing fail) to confirm no regression, then a focused smoke script covering all acceptance scenarios: main+sub coexist, main off leaves sub recoverable, sub drift failure leaves main recoverable, independent lane restart/hydrate, foreign cwd cannot restore sub, clear legacy migration, ambiguous legacy retained.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lane-separated recovery records (TASK-55.7):
- paths.ts: added ompMainGenerationFile() (main-generation.json); ompStateFile() (sub-state.json) remains the sub lane record; ompGenerationStateFile() (generation-state.json) retained as the legacy file consumed only by migration.
- generation-state.ts: MainGenerationRecord (main grants/hashes only, no profiles/paths) + SubGenerationRecord (profiles + ownerProjectCwd binding when project profiles exist, no main field; merges legacy timestamp/toolListHash/files surface). Lane-specific read/write/delete helpers keep atomic writes, hash validation, existing-evidence guards, and fail-closed semantics. Shared process-local serializeTransition lock retained (no shared JSON).
- evoMain.ts: activate/hydrate/refreshFromConfig/refresh/deactivate operate only on main-generation.json; deactivate deletes only the main record.
- evoSub.ts: activate/hydrate/deactivate/refresh/regenerate operate only on sub-state.json; binds ownerProjectCwd from canonical project cwd; refuses when a foreign or unreadable sub record is present (activate) or not owned by current cwd (deactivate); drift refusal retains failed evidence.
- migrateLegacySharedRecord(): conservative fan-out — migrates only when every legacy field validates AND every project profile belongs to a single current authorized project cwd; ambiguous/corrupt legacy files are retained byte-untouched and fail closed.

Verification: bunx tsc --noEmit clean; evo vitest 29 pass / 17 fail (baseline 25/21 — 4 F5 + transactional sub-hash tests fixed, zero regressions; remaining failures pre-existing, sibling-owned TASK-55.3/55.5 or index.ts command wiring). Focused smoke /tmp/evo55-7-smoke.ts: 29/29 checks pass covering coexist, per-lane hydration, main-off-leaves-sub, sub-drift-leaves-main, broken-main-keeps-sub-restore, foreign-cwd refusal, clear legacy migration, ambiguous/corrupt legacy retention.

Review round (Main's blocking source review) — all resolved and amended into bookmark task-55-7 @ okyvruyu 13b21f64:
1. migrateLegacySharedRecord() is now invoked by BOTH controllers before lane reads/transitions: main hydrates/activates/deactivates/refreshes call it with no roots (only main/global-only legacy provable); sub hydrate/activate/deactivate/refresh call it with current authorized project roots.
2. 'retained' always fails closed: main hydrate → inactive + no surface; main activate/refresh/deactivate → EVO_GENERATION_INVALID throw; sub hydrate → inactive; sub activate → refusal msg; sub deactivate → sacrificed refusal; sub refresh → refusal. No transition can run over ambiguous legacy evidence.
3. Status mapping: legacy active → lane record active (config.main stays recoverable — hydrate applies the surface, smoke E/E2 verify activation + exact off-restore); non-active → failed.
4. Never-overwrite targets: if main-generation.json or sub-state.json exists at all, migration returns 'retained' and leaves everything untouched (smoke G); the earlier read*===null conflation is eliminated.
5. Smoke now drives migration exclusively through controller entrypoints (sub hydrate/activate with roots, main hydrate/activate/deactivate): 52/52 checks pass, incl. E (dual-lane active legacy via sub entrypoint with persisted config main:true/sub:true, byte-exact restore), E2 (main-only legacy via main entrypoint, no sub record fanned out), F (foreign-profile + corrupt legacy retained byte-identical, both lanes fail closed, no lane records fanned out), G (existing lane target + legacy → retained, nothing overwritten).
Typecheck clean; vitest still 29 pass / 17 fail (same as baseline-minus-4-fixed, no regression).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Lane-separated recovery authority shipped: main-generation.json (grants/hashes, no profile paths) vs sub-state.json (profiles + ownerProjectCwd binding); conservative legacy migration (fan-out only on fully valid single-cwd legacy, ambiguous/corrupt retained byte-untouched, fail-closed); never-overwrite targets. Verified: 52/52 controller smoke checks, tsc clean, 46/46 evo vitest, and live E2E (both lanes OFF-persisted, exact off-restore under local-link and marketplace layouts). Merged to main b931bb7.
<!-- SECTION:FINAL_SUMMARY:END -->
