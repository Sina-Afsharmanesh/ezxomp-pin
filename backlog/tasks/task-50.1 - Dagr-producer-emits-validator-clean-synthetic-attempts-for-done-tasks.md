---
id: TASK-50.1
title: Dagr producer emits validator-clean synthetic attempts for done tasks
status: To Do
assignee: []
created_date: '2026-08-29 01:10'
labels:
  - bug
  - refactoring
dependencies: []
parent_task_id: TASK-50
priority: high
type: bug
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
"buildRunDoc (plugins/cook/extensions/dagr.ts) emits synthetic settled_unverified attempts for done tasks lacking attempt records, but dagr check E150 rejects done tasks whose latest attempt is settled_unverified. On this repo (90 tasks, most done) the shipped producer fails its own strict check — projection silently disabled. Emit validator-accepted done attempts (state done, evidence asserted) so the producer passes strict check."
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildRunDoc output for a done task with no attempt records passes dagr check --strict --json with exit 0
- [ ] #2 No regression in existing tests: bun test plugins/cook tests related to dagr pass
<!-- AC:END -->
