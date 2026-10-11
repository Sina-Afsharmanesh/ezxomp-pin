---
id: TASK-104.6
title: Invalidate stale standalone output before launch
status: To Do
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-07 07:31'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: high
type: bug
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.5 outcome in TASK-104's delivery tree: the detached launcher cannot serve an obsolete Power Mode bundle after source changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A launch after the Power Mode change cannot load obsolete bridge-terminal code.
- [ ] #2 The launcher detects mismatched standalone output and rebuilds or refuses to serve it.
- [ ] #3 Power Mode renders the main-session transcript without terminal resize or bridge-terminal errors.
- [ ] #4 Focused verification covers both a fresh marketplace-style install and working-tree update path.
<!-- AC:END -->
