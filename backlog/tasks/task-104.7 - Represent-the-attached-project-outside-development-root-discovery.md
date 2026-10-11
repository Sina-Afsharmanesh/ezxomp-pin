---
id: TASK-104.7
title: Represent the attached project outside development-root discovery
status: To Do
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-07 07:31'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: medium
type: enhancement
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.6 outcome in TASK-104's delivery tree: an attached project and a one-level development root scanner are represented consistently without requiring Browse for direct use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Projects shows the attached project or explicitly explains that it is outside the development root.
- [ ] #2 A directly opened project is usable without an unrelated Browse action.
- [ ] #3 Changing a development root retains the current project attachment.
- [ ] #4 Monorepo roots and ordinary project directories are represented correctly.
<!-- AC:END -->
