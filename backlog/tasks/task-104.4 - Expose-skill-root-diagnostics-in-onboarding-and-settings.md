---
id: TASK-104.4
title: Expose skill root diagnostics in onboarding and settings
status: To Do
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-07 07:31'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: medium
type: enhancement
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.8 outcome in TASK-104's delivery tree: onboarding/settings make the discovered OMP skill roots and empty-vs-unavailable outcome understandable to users.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Onboarding or settings reports the OMP skill roots searched.
- [ ] #2 A discovered skill identifies its source root and resolution method.
- [ ] #3 A healthy empty catalog is distinct from an unavailable provider.
- [ ] #4 The surface remains useful when a project has no `.gsd` directory or milestones.
<!-- AC:END -->
