---
id: TASK-50
title: Demo cook workflow end-to-end
status: In Progress
assignee: []
created_date: '2026-08-29 01:05'
updated_date: '2026-08-29 01:06'
labels:
  - refactoring
dependencies: []
priority: low
type: task
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run the full cook multi-agent loop on a small, self-contained change to prove the pipeline: create, plan, decompose, implement, validate, judge, done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cook chain started with a named workflow on the demo parent task
- [ ] #2 At least one atomic sub-ticket implemented and validated by cook specialists
- [ ] #3 Judge review recorded with no unresolved blocking findings
- [ ] #4 Parent closed with final summary and all children Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cook kickoff: full chain (capture→plan→implement→verify→review) started; demo operator order. Kickoff message: cook full-chain mode engaged.

Chain proposal presented: full (capture→plan→implement→verify→review). Operator order = demo approval. cook_start equivalent executed: state.taskId=TASK-50.
<!-- SECTION:NOTES:END -->
