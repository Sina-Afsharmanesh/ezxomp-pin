---
id: TASK-51.3
title: Close parent TASK-51 with AC evidence and final summary
status: To Do
assignee: []
created_date: '2026-08-29 01:44'
updated_date: '2026-08-29 01:44'
labels: []
dependencies:
  - TASK-51.2
parent_task_id: TASK-51
priority: high
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Closure exercise for the TASK-51 cook end-to-end loop: after 51.2 passes, verify cook_next reports null-state (ALL_SUBTICKETS_DONE) on TASK-51, check parent acceptance criteria 1-5 with objective evidence, write the final summary, and set the parent task status to Done. This ticket itself exercises the finalize stage of the cook machinery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cook_next returns null-state (ALL_SUBTICKETS_DONE) with 51.1-51.3 all Done — output captured on TASK-51
- [ ] #2 All 5 parent acceptance criteria checked with objective evidence (each names the specific test/command/journal output proving it)
- [ ] #3 Final summary on TASK-51 names what changed, the evidence trail, and the dispatch-fault ledger (codex quota route faults, dispatch brief-generator semantics)
- [ ] #4 Parent task status set to Done and, if adopted, closed via backlog_task_complete
<!-- AC:END -->
