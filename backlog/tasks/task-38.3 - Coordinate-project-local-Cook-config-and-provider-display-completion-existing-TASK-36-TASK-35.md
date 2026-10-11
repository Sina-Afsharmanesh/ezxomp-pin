---
id: TASK-38.3
title: >-
  Coordinate project-local Cook config and provider display completion (existing
  TASK-36/TASK-35)
status: Done
assignee:
  - '@Task383Config'
created_date: '2026-08-28 00:00'
updated_date: '2026-08-28 04:43'
labels:
  - architecture
  - investigation
dependencies: []
parent_task_id: TASK-38
priority: high
type: chore
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Closure gate for the existing configuration tickets. TASK-36 owns one authoritative active-project scope resolver for the /cook config command and cook_config tool; TASK-35 consumes that resolved provider catalog for dynamic family display. Keep project, personal, and global scopes explicit and do not duplicate configuration persistence logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TASK-36 is terminal with slash/tool round-trip, cross-project isolation, project provider validation, fallback precedence, and backward-compatible profile evidence.
- [x] #2 TASK-35 is terminal with dynamic known/unknown provider families, duplicate-ID disambiguation, inherited-role display, and unchanged resolved values/persistence evidenced.
- [x] #3 TASK-35 is processed after TASK-36 so its display reads the authoritative project-local catalog; changes remain on the existing tickets.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Close only after TASK-36 then TASK-35 each carry checked AC, independent evidence, notes, and final summaries.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In WT branch `task-38-config` at `../ezxomp.task-38-config`, implement TASK-36's authoritative project-local config resolver.
2. Run isolated config scope tests and typecheck while preserving profile inheritance and persistence.
3. Implement TASK-35 provider-family display after TASK-36 using the shared resolver and catalog metadata.
4. Commit the branch, record exact evidence, and leave integration for serialized merge plus conflict review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WT assignment: branch `task-38-config`, path `../ezxomp.task-38-config`, created with `wt switch --create task-38-config --no-cd --no-hooks -y` from main commit 7194001. This worktree owns TASK-36 then TASK-35 changes. No agent dispatched yet; integration with renderer worktree remains serialized because both may touch plugins/cook/extensions/cook-tools.ts.

Agent assignment: @Task383Config will work only in WT branch `task-38-config` at `../ezxomp.task-38-config` (created from main commit 7194001 via WT CLI). Shared `cook-tools.ts` changes must be integrated serially with task-38-renderer.

Worker attempt on WT branch `task-38-config` at `../ezxomp.task-38-config` could not begin: every lean-ctx operation was rejected before execution because agent-bus capacity remained 15/15 for `/home/eag1/repo/ezxomp`. No files, tests, commit, or Backlog updates were produced. Safe next action: retry this same WT assignment after capacity is released; TASK-35 remains ordered after TASK-36.

Final coordination evidence (2026-08-28): TASK-36 then TASK-35 terminal (Done) with checked ACs, focused tests (config-scope.test.ts 24 tests), and final summaries; production changes owned by those tickets (WT task-38-config 8e106011, merged dd7c6e70); TASK-35 consumed the TASK-36 resolver. No duplicated persistence logic.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Coordination gate complete: TASK-36 then TASK-35 are Done with checked ACs, focused tests, final summaries (WT task-38-config 8e106011, merged to main dd7c6e70). No duplicated persistence logic under this gate.
<!-- SECTION:FINAL_SUMMARY:END -->
