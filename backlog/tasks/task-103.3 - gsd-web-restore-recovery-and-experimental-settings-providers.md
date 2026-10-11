---
id: TASK-103.3
title: 'gsd-web: restore recovery and experimental settings providers'
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
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovery summary, Settings > Recovery, and Settings > Experimental remain in loading/error states because the ported services probe `packageRoot/src/resources/extensions/gsd` and cannot find doctor, session-forensics, or settings providers in the marketplace plugin layout. The failure repeats in the visible UI and leaves diagnostics unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET `/api/recovery` returns diagnostics or an explicit healthy-empty result for a valid project
- [ ] #2 Recovery summary and Settings > Recovery leave loading state and show actionable diagnostics
- [ ] #3 Settings > Experimental loads its provider data without a missing-resolve-ts error
- [ ] #4 Provider resolution uses the actual vendored/staged OMP service layout and works from a fresh install
- [ ] #5 Repeated refreshes do not append duplicate provider-error messages to the activity/toast surface
<!-- AC:END -->
