---
id: TASK-103.6
title: 'gsd-web: reconcile attached project with development-root discovery'
status: To Do
assignee: []
created_date: '2026-09-07 07:10'
labels:
  - architecture
  - frontend
dependencies: []
parent_task_id: TASK-103
priority: medium
type: enhancement
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live workspace is attached to `/home/egsox/repo/ezxomp`, but Projects shows only `Set your development root` and no current project. Settings > Workspace likewise requires a separate Browse action. For portable use across arbitrary projects, the current project context and the one-level development-root scanner need an explicit relationship.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Projects clearly shows the attached project or explains why it is outside the configured development root
- [ ] #2 A project opened directly remains usable without an unrelated Browse step
- [ ] #3 Setting a development root does not lose the current project attachment
- [ ] #4 Monorepo roots and ordinary project directories are both represented correctly
<!-- AC:END -->
