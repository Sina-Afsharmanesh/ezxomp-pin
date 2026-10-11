---
id: TASK-52.4
title: Kind mapping + projects hierarchy emission (E6)
status: To Do
assignee: []
created_date: '2026-08-29 02:20'
updated_date: '2026-08-29 04:45'
labels: []
dependencies:
  - TASK-52.1
parent_task_id: TASK-52
priority: high
type: task
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
dagr.ts hardcodes kind:'impl' for every task (dagr.ts:119). Minimal truthful mapping per author's open kind set (impl/review/test/gate/question/docs/ship): task type or labels bug/feature/refactor → impl; investigate/research labels → 'docs' is WRONG (question/docs are for human-answer/publish work) — keep 'impl' for research; reviewer/judge role tasks or review label → 'review' (only if trivially derivable from a label or assignee role string, else impl); docs label → 'docs'; spike/investigation label → 'question'. projects array (E6 second half): emit a projects array built from distinct task parents (top-level) when any task has a parent, id = parent id, so visual hierarchy shows; single-parent flat map (current t.parent→project home) unchanged. Keep TOTAL mapping under ~20 lines; when in doubt emit 'impl'. All kind mapping lives in dagr.ts buildRunDoc input path (DagrTaskInput gains optional type?/labels? fields), no new state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildRunDoc tasks[].kind derived from task type/labels per the minimal mapping, non-matching tasks keep 'impl' (no behavior change for existing tests)
- [ ] #2 kind derivation is a pure function with its own unit tests (type/label in → kind out table)
- [ ] #3 cook suite passes; dagr check --strict on a live projection file returns exit 0 and zero findings when a validator binary is available (DAGR_BIN or plugin bin path) — validator resolution per skill steps 1-3 (dagr.ts resolveDagrBin)
- [ ] #4 worker did NOT need to modify agents.ts or plugins/cook/agents/* to land any sub-ticket (Worker51c lane untouched)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend pure task input only as needed for truthful kind derivation and parent-project hierarchy emission.
2. Keep uncertain tasks as `impl`; do not alter lifecycle, trigger, locator, or recovery paths.
3. Verify the shared dagr projection suite's kind/project contract turns green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dependency order revised: this slice now follows lifecycle core so its passing suite can prove TASK-52.2 additive compatibility.

Coordinator dispatched TASK-52.4 into `/home/eag1/repo/ezxomp.task-52-4` from locator bookmark `task-52-2`; this slice unblocks TASK-52.2 shared-suite AC6.

Paused before implementation while user-priority widget/dagr synchronization defect is diagnosed and tracked in TASK-52.7; no source change or worker bookmark was produced.
<!-- SECTION:NOTES:END -->
