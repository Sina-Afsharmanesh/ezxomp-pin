---
id: TASK-104.8
title: Close unrelated overlays on main-surface navigation
status: To Do
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-07 07:31'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: medium
type: enhancement
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.7 outcome in TASK-104's delivery tree: Projects, settings, recovery, and main navigation have an explicit focus and lifecycle rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Switching main navigation does not leave unrelated modal or sheet surfaces unexpectedly stacked.
- [ ] #2 Any supported multi-surface workflow has explicit focus and close affordances.
- [ ] #3 Provider errors remain scoped to their owning surface.
- [ ] #4 Projects, Git, Settings, Recovery, and main navigation remain keyboard and pointer reachable.
<!-- AC:END -->
