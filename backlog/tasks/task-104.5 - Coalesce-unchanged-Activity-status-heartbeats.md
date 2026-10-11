---
id: TASK-104.5
title: Coalesce unchanged Activity status heartbeats
status: To Do
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-07 07:31'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: medium
type: bug
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.4 outcome in TASK-104's delivery tree: unchanged status events do not flood the Activity Log while meaningful status and lifecycle changes remain observable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unchanged status heartbeat produces no new Activity Log row.
- [ ] #2 A changed visible status or meaningful lifecycle boundary produces a row.
- [ ] #3 Execution and git activity remains ordered and visible.
- [ ] #4 An idle attached project does not grow Activity Log at one row per second.
<!-- AC:END -->
