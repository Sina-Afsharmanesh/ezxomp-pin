---
id: TASK-55.1
title: Persist one versioned atomic EVO generation
status: Done
assignee:
  - '@EvoStateWorker'
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 20:38'
labels: []
dependencies: []
parent_task_id: TASK-55
priority: high
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the durable generation foundation for main and sub policy state. Production boundary: plugins/evo/extensions/evo/atomic.ts, paths.ts, substate.ts, and any new generation-state module only. Exclude controllers, hooks, docs, and tests already supplied by the planner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A schema-versioned generation records generation ID, policy version, catalog hash, transition status, main originals, and per-profile original/effective hashes and phases
- [x] #2 Generation state is atomically durable before any main tool or profile mutation and interrupted writes preserve the previous committed generation
- [x] #3 Invalid, partial, foreign-path, or unsupported-version state fails closed without deleting recovery evidence
- [x] #4 Main and sub transitions use one serialization boundary so lifecycle hooks and commands cannot interleave
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Harden atomic.ts with unique same-directory temp writes and fail-closed cleanup.
2. Add generation-state module defining schema-v1 durable records, strict validation/path containment, content hashing, atomic read/write, and shared async serialization boundary.
3. Update paths.ts with generation-state location helpers and substate.ts to use atomic writes plus strict validation while preserving invalid evidence.
4. Run targeted EVO transactional tests and record objective results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented atomic generation foundation in atomic.ts, paths.ts, substate.ts, and new generation-state.ts. Added schema-v1 records, SHA-256 content hashes, strict field validation, profile containment checks, invalid-state preservation via null reads, atomic durable writes, and shared serializeTransition/withTransitionLock boundary. Smoke evidence: bun build plugins/evo/extensions/evo/generation-state.ts succeeded; OMP_HOME=/tmp/evo-state-smoke bun -e generation round-trip and serialization: ok. Targeted transactional EVO tests could not exercise contracts because repository Bun runner exposes vi without resetModules (all 9 tests fail at vi.resetModules before assertions); planner RED artifact records expected downstream TASK-55.2–55.5 controller failures.

Amended foundation per integration review: generation-state.json is separate from legacy sub-state.json; generation validation now requires caller-supplied allowed project CWDs, rejects foreign project paths, checks timestamps, optional fields, hashes/content consistency, and unique nonempty tool names. Scoped smoke passed (unscoped project path rejected; allowed CWD round-trip succeeded). Amended finished commit/bookmark: 79e173a7 / task-55-1.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Schema-v1 generation foundation shipped: generation-state.ts with SHA-256 content hashes, strict validation, profile containment, fail-closed invalid reads (evidence preserved), atomic durable writes, and the shared serializeTransition boundary consumed by both lanes. Verified: 46/46 evo vitest (incl. transactional generation/hash/serialization contracts), validator pass, live E2E. Merged to main b931bb7.
<!-- SECTION:FINAL_SUMMARY:END -->
