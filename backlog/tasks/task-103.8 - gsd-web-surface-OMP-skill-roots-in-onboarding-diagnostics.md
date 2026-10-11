---
id: TASK-103.8
title: 'gsd-web: surface OMP skill roots in onboarding diagnostics'
status: To Do
assignee: []
created_date: '2026-09-07 07:10'
labels:
  - frontend
  - architecture
dependencies: []
parent_task_id: TASK-103
priority: medium
type: enhancement
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings > General reduces Skills install to a non-interactive checklist item with no searched paths or result, while the web skill-health service is broken. Users cannot tell whether a skill came from `.omp/agent/skills`, `.agents/skills`, a project-local root, or nowhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The onboarding/settings view reports which OMP skill roots were searched
- [ ] #2 A discovered skill identifies its source root and resolution method
- [ ] #3 An empty or unavailable skill provider is distinguished from a healthy empty catalog
- [ ] #4 The UI remains useful for a project with no `.gsd` directory or milestones
<!-- AC:END -->
