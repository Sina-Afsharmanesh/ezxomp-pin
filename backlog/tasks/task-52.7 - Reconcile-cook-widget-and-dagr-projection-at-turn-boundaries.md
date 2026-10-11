---
id: TASK-52.7
title: Reconcile cook widget and dagr projection at turn boundaries
status: In Progress
assignee: []
created_date: '2026-08-29 04:40'
updated_date: '2026-08-29 04:59'
labels: []
dependencies:
  - TASK-52.1
parent_task_id: TASK-52
priority: high
type: task
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User-observed sync defect: in the active Herdr workspace the left cook widget reports TASK-52.2/implement while sibling TASK-52.4 is In Progress, and the right `dagr view` pane renders root `.dagr/run.json` generated at 2026-08-29T01:10 for TASK-50. Existing `turn_start` only syncs current task when terminal then calls `refreshWidget`; it never refreshes the dagr producer. Make active cook state and view projection converge at turn boundaries without making the pane a gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On each active-chain turn_start, after backlog/watch reconciliation, the cook projection is best-effort refreshed from current persisted state and Backlog data; projection failure does not block the turn or alter task success.
- [ ] #2 A tracked Backlog In Progress transition reconciles the state pointer/widget deterministically without overwriting a still-valid active pointer in ambiguous multi-lane state; widget title/working message matches reconciled CookState on the next turn.
- [ ] #3 A deterministic hook-level test starts from stale cook state/run data and proves the next turn refreshes the widget state and `.dagr/run.json` task/run identity without HERDR, network, or a real dagr binary.
- [ ] #4 The implementation preserves normal no-chain behavior and does not introduce gate coupling or UI focus changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add deterministic RED coverage for turn-start state/widget/projection reconciliation from stale persisted CookState and stale run data.
2. Reconcile active state on turn-start and relevant Backlog In Progress transitions without overriding a valid single active pointer in ambiguous lanes.
3. Refresh the dagr projection best-effort after reconciliation, with no gate coupling or UI focus change.
4. Verify the active Herdr widget/pane contract through the hook-level test and a real `dagr view` run-file refresh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User-priority execution: start before broad trigger work because current Herdr widget and dagr pane are visibly stale. The implementation may extract a reusable best-effort refresh seam for TASK-52.3 to call later.

Coordinator applied the worker-drafted sync patch and committed `task-52-7` → `9e1e2a48`. The deterministic turn-sync test now passes: stale TASK-1/capture reconciles to TASK-2/implement, widget lines repaint, and fake-validated `.dagr/run.json` refreshes to TASK-2.

Fresh validator passed TASK-52.7 at `9e1e2a48`: controlled turn-sync test 1/1 green; stale pointer → active task, widget repaint, and dagr run refresh all proved. Aggregate had four red tests explicitly owned by `.2/.3/.4/.6`; no TASK-52.7 blocker.
<!-- SECTION:NOTES:END -->
