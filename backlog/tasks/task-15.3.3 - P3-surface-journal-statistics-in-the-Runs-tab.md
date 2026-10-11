---
id: TASK-15.3.3
title: 'P3: surface journal statistics in the Runs tab'
status: Done
assignee: []
created_date: '2026-08-21 15:25'
updated_date: '2026-08-23 01:53'
labels:
  - workflowz-v2
  - observability
  - tui
  - p3
dependencies:
  - TASK-15.4
parent_task_id: TASK-15.3
priority: low
type: enhancement
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-15.4 establishes WorkflowLibraryOverlay v2 tabs, wire the existing journal-authoritative `aggregateRunStatistics` result into its Runs tab. Display total runs, route plans, chain completions, gate failures, missing-tool failures, and approved/rejected checkpoint outcomes. Do not create a second statistics store, alter journal classification, or reimplement P2 tab mechanics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Runs tab renders all aggregate journal statistic categories from the existing runtime aggregator
- [x] #2 Runs tab data is journal-derived and does not treat snapshots or UI state as execution truth
- [x] #3 Recipes Templates Gates tab behavior supplied by TASK-15.4 remains unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WORKER 2026-08-22 — Runs-tab statistics landed on top of the TASK-15.4 tab model. openWorkflowLibrary builds runsTabData(cwd) = listRunSummaries + aggregateRunStatistics (the EXISTING runtime aggregator — no second stats store, no classification changes); the interactive Runs tab renders Total runs / Route plans / Chain completions / Gate failures / Missing-tool failures / Approved checkpoints / Rejected checkpoints above the run rows, all journal-derived via readRunEvents (snapshots/UI state never treated as truth). Headless path appends the same aggregate block to the notify output. Recipes/Templates/Gates behavior from 15.4 unchanged.

Verification TASK-15.3.3: previously-RED contract test now green — bun test test/workflowz-p3-polish.test.ts → 'renders journal-authoritative aggregate statistics in the Runs tab' PASS (asserts total runs=5, route plans=2, chain completions=1, gate failures=1, missing-tool failures=1, approved=1, rejected=1 against real temp-cwd journals); full file 11 pass 0 fail incl. all pre-existing guards. bun test test/workflowz-command.test.ts test/workflowz-observability.test.ts → 6 pass 0 fail; bun test test/smoke-plugins.test.ts → 8 pass 0 fail; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json → exit 0 with zero new diagnostics (5 pre-existing baseline errors documented under TASK-15.4 notes). Status left In Progress; terminal closure to orchestrator. No commits made.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: cook-judge
created: 2026-08-23 00:01
---
JUDGE VERDICT (JudgeW1): REVIEW_PASSED — 0 blocking.

AC#1 PASS: Runs tab renders all seven aggregate categories (Total runs / Route plans / Chain completions / Gate failures / Missing-tool failures / Approved checkpoints / Rejected checkpoints) at workflow-overlay.ts:437-448, sourced from openWorkflowLibrary's runsTabData (index.ts:114-118) → the EXISTING runtime aggregator aggregateRunStatistics. Verified in runtime.ts:1443-1467 that the aggregator reads journals via readRunEvents per run — no second statistics store created, no classification logic changed. AC#2 PASS: every surfaced number is journal-derived; snapshots and UI state are never consulted for stats (runsTabData takes only cwd; summaries themselves are buildRunSummary over readRunEvents). Headless path appends the same block (index.ts:139-149). AC#3 PASS: Recipes/Templates/Gates behavior unchanged — tab-transition test covers right/left clamp, per-tab cursors, gate detail open/back; contract test asserts exact expected counts (5/2/1/1/1/1/1) against real temp-cwd journals and passes. Test file diff vs c93419c contains no weakened assertions (single widened CommandSpec type only).

FOLLOW-UP (non-blocking): index.ts:139 vs :156 — runsTabData(cwd) is computed on both branches of the hasUI split; harmless duplicate of a cheap read, could hoist above the branch for symmetry.
---

author: cook-judge
created: 2026-08-23 00:01
---
Evidence: full end-state read of workflow-overlay.ts + index.ts library region + runtime.ts aggregator; bun test test/workflowz-p3-polish.test.ts → 'renders journal-authoritative aggregate statistics in the Runs tab' PASS with exact-count assertions; combined run p3-polish+command+observability = 17 pass 0 fail; tsc -p plugins/extensible-workflows exit 0.
---
<!-- COMMENTS:END -->
