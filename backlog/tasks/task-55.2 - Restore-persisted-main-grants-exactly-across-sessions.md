---
id: TASK-55.2
title: Restore persisted main grants exactly across sessions
status: Done
assignee:
  - '@EvoMainPolicyWorker'
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 20:38'
labels: []
dependencies: []
parent_task_id: TASK-55
priority: high
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement transactional main activation, hydration, refresh, and deactivation. Production boundary: plugins/evo/extensions/evo/evoMain.ts and config.ts only; consume the generation API from the state-foundation child.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Activation persists the current active tool names before applying the EVO surface
- [x] #2 A fresh process hydrating main EVO can later disable it and restore the exact persisted original active tools
- [x] #3 Activation/deactivation failures leave either the prior committed state or recoverable failed state without broadening grants
- [x] #4 Main refresh rotates effective grants only at an explicit generation boundary while keeping immutable originals
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect evoMain/config and generation-state contracts plus RED tests. 2. Implement durable transactional main activation, hydration, refresh, and exact deactivation using generation-state API. 3. Run targeted EVO transactional tests and record evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented MainEvoController transactional generation persistence in evoMain.ts: capture originals before policy, durable pending/active records, state-authoritative hydration, serialized transitions, exact restart restoration, fail-closed corrupt state, and explicit refresh preserving originals. Focused smoke verified activation/restart deactivation restored [read, custom], refresh rotated generation while retaining originals, and corrupt state hydrated inactive. Existing transactional-main-routing.test.ts remains incompatible with planner's old ompStateFile assertions and unrelated hook expectations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Transactional main lane shipped: durable main-generation.json persisted before any surface change, state-authoritative hydration, exact restart restoration, fail-closed corrupt state, refresh rotating generations with immutable originals. Verified: 46/46 evo vitest (incl. restart-restore and corrupt-state contracts), E2E both layouts (off-restore exact). Merged to main b931bb7.
<!-- SECTION:FINAL_SUMMARY:END -->
