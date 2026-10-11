---
id: TASK-103.4
title: 'gsd-web: coalesce unchanged status events in Activity Log'
status: To Do
assignee: []
created_date: '2026-09-07 07:10'
labels:
  - bug
  - frontend
dependencies: []
parent_task_id: TASK-103
priority: medium
type: bug
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live Activity view records one `[UI] setStatus` entry every second while the workspace is idle. This floods execution history and hides meaningful actions without any visible state change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unchanged status heartbeat does not create a new Activity Log row
- [ ] #2 A status row is recorded when its visible payload changes or when a meaningful lifecycle boundary occurs
- [ ] #3 Existing execution and git events remain ordered and visible
- [ ] #4 An idle project does not grow the activity log at one row per second
<!-- AC:END -->
