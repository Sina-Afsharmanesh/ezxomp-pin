---
id: TASK-103.5
title: 'gsd-web: invalidate stale standalone artifacts after Power Mode fixes'
status: To Do
assignee: []
created_date: '2026-09-07 07:10'
labels:
  - bug
  - architecture
dependencies: []
parent_task_id: TASK-103
priority: high
type: bug
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The source `dual-terminal.tsx` now uses the store-driven ChatPane and `COMMANDS.md` documents that OMP RPC has no `terminal_*` commands, but the live committed standalone server still rendered the obsolete terminal path and showed `terminal_resize not supported`. The launcher only checks whether `.next/standalone` exists, so a prior build can mask source fixes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A server launched after the Power Mode change cannot load obsolete bridge-terminal code
- [ ] #2 The launcher detects stale or mismatched standalone output and rebuilds or refuses to serve it
- [ ] #3 Power Mode renders the live main-session transcript without `terminal_resize` or bridge-terminal error text
- [ ] #4 Fresh marketplace install and working-tree update paths both exercise the current source/build pair
<!-- AC:END -->
