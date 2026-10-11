---
id: TASK-103.2
title: 'gsd-web: align skill discovery with OMP service roots'
status: To Do
assignee: []
created_date: '2026-09-07 07:09'
labels:
  - bug
  - architecture
dependencies: []
parent_task_id: TASK-103
priority: high
type: bug
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live skill-health endpoint returns 500 because `skill-health-service.ts` still probes the legacy `packageRoot/src/resources/extensions/gsd` layout. The vendored `getSkillDirectories` implementation is an empty stub, while the OMP environment exposes user skills under `~/.omp/agent/skills` and `~/.agents/skills`; project skills must also be considered. The web layer needs one OMP-aware discovery/provider contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET `/api/skill-health` returns a report for a valid project instead of a provider-not-found error
- [ ] #2 Skill resolution covers OMP user skills (`~/.omp/agent/skills`), global agent skills (`~/.agents/skills`), project-local `.agents/skills`, project-local `.gsd/skills`, and any documented compatibility roots
- [ ] #3 The empty vendored skill-directory stub is not the runtime authority for OMP skill lookup
- [ ] #4 Diagnostics expose the resolved root/method without leaking unrelated absolute paths
- [ ] #5 A project with no skills returns an explicit empty report rather than an error
<!-- AC:END -->
