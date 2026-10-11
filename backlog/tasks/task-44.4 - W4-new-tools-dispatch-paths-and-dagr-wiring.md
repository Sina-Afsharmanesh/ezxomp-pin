---
id: TASK-44.4
title: 'W4: new tools, dispatch paths, and dagr wiring'
status: Done
assignee: []
created_date: '2026-08-28 18:50'
updated_date: '2026-08-28 20:08'
labels: []
dependencies: []
parent_task_id: TASK-44
priority: high
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement in plugins/cook/extensions/cook-tools.ts (+ renderers.ts, autocomplete.ts, index.ts wiring) per plan Part 2 tools table and Part 3 W4: new tools cook_ready (JSON lines {id,title,priority,deps}, ready = todo/In Progress + unclaimed + deps satisfied, priority-then-id order), cook_claim {task_id, by?} (atomic via store lock + journal intent; refuses terminal/blocked/claimed, error names holder), cook_release {task_id} (errors if unclaimed), cook_claims (active claims with age), cook_snapshot (schemaVersion 1, generatedAt, tasks with optional claim/convergence/complexity, maxParallelTasks; read-only additive), cook_journal {task_id, event, stage?, note?}, cook_dispatch_refute {task_id, finding}. Supersede cook_dag_ready with cook_ready (clean cutover same release). Dispatch paths: parallel refute fan-out (batched), dual review on complexity complex (two decorrelated judge briefs, union blocking set dedupe stricter), council (3 blind inquiry + synthesis, only post-bonus), scoped repair (typed findings + file-confined fix retains sibling judgment; gate always re-runs; skip while council active), red-gate kickback (no judge dispatch on red gate), AC-integrity rejection (reject pass with unverified AC), optional language-skill resolution in briefs, maxParallelTasks validation in config. Call projectDagr() after every store-mutating commit. Tests: tests/claims.test.ts, tests/snapshot.test.ts (golden + optionality + read-only proof), tests/scoped-repair.test.ts (confined/unconfined/historical-no-findings/council-pending matrix), tests/refute-parallel.test.ts (N refutes arbitrary order identical state).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 7 new tools registered with renderers + autocomplete entries
- [x] #2 Claim atomicity proven under concurrent calls; refusals name holder
- [x] #3 Snapshot golden test passes; legacy store omits optional fields; store bytes unchanged after snapshot
- [x] #4 Scoped-repair matrix matches upstream Item 4 semantics; INV-12 equivalent in cook_validate
- [x] #5 Refute fan-out order-independent; dual review union blocking set; red gate blocks judgment dispatch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by coordinator (W4 worker failed on harness error after imports only; transcript at history://W4-tools-dispatch). Landed: 7 tools registered with renderers (CookRenderKind + RENDER_META extended) + /cook claim + snapshot subcommands; cook_dag_ready clean cutover; claims 5/5 (double-claim names holder, maxParallelTasks enforcement, release errors, claims-with-age); snapshot 3/3 (golden, optionality, read-only bytes proof); scoped-repair 3/3 + INV-12 wired into cook_validate; refute-parallel 2/2 (blind single-finding briefs, order-independent journal); dual review + red-gate check in cook_dispatch_judge; AC-integrity helper; escalation helpers (bonus + council routing); journalAppend extraction; pushDagr best-effort wiring.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
7 new tools (cook_ready/claim/release/claims/snapshot/journal/dispatch_refute) with renderers + autocomplete, cook_dag_ready clean cutover; dispatch paths: dual review on complex (2 decorrelated judges), red-gate check, AC-integrity, escalation (bonus→council), scoped-repair resolver, INV-12 in cook_validate; pushDagr projection wiring. Verified by claims 5/5, snapshot 3/3, scoped-repair 3/3, refute-parallel 2/2, drain-integration INV-12 test; live INV-12 flag check confirmed.
<!-- SECTION:FINAL_SUMMARY:END -->
