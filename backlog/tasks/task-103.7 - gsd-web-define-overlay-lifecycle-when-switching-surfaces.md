---
id: TASK-103.7
title: 'gsd-web: define overlay lifecycle when switching surfaces'
status: To Do
assignee: []
created_date: '2026-09-07 07:10'
labels:
  - frontend
  - design
dependencies: []
parent_task_id: TASK-103
priority: medium
type: enhancement
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During the live feature walk, Projects and Settings side surfaces remained mounted while the main surface changed to Visualize or Git, leaving stacked dimmed panels and stale errors visible together. Decide and implement a consistent navigation rule so users can tell which surface owns focus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Switching main navigation does not leave unrelated modal/sheet surfaces unexpectedly stacked
- [ ] #2 A deliberate multi-surface workflow, if supported, has explicit focus and close affordances
- [ ] #3 Stale provider errors are scoped to their owning surface and do not obscure unrelated views
- [ ] #4 Projects, Git, Settings, Recovery, and main navigation remain keyboard/pointer reachable
<!-- AC:END -->
