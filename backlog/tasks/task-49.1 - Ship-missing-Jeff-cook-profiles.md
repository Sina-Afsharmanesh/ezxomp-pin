---
id: TASK-49.1
title: Ship missing Jeff cook profiles
status: Done
assignee:
  - '@Main'
created_date: '2026-08-28 23:34'
updated_date: '2026-08-29 00:04'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/johanthoren/jeff/tree/main/agents'
parent_task_id: TASK-49
priority: high
type: task
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add OMP-adapted cook-execute, cook-refactor, cook-audit, and cook-refute profiles; extend the cook roster/marker/project sync; correct evo-sub ownership interaction at the cook sync boundary without changing evo internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 installCookAgents writes every roster file and exact marker entries at project scope.
- [x] #2 syncCookAgents skips both scopes while evo-sub owns rewritten profiles and still awaits project sync before personal sync.
- [x] #3 Complete 10-profile COOK_PROFILE_FILE_MAP includes cook-audit and cook-refute plus the existing local equivalents.
- [ ] #4 installCookAgents writes every roster file and exact marker entries at project scope.
- [ ] #5 syncCookAgents skips both scopes while evo-sub owns rewritten profiles and still awaits project sync before personal sync.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read task and local cook contracts. 2. Add OMP-adapted cook-audit and cook-refute profiles only; existing planner/worker/validator/judge are the OMP equivalents of upstream plan/implement/verify/review. 3. Extend the ten-profile roster/marker and project sync guard; keep profile writes atomic and project sync awaited. 4. Update tests and package/docs/changelog metadata as needed. 5. Run targeted cook tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator implementation after worker write-surface failure: added OMP-adapted cook-audit.md and cook-refute.md, extended COOK_PROFILE_FILE_MAP to ten, aligned marker/package metadata to 0.1.7-ezxomp.6, corrected project+personal evo-sub sync skip, updated cook docs/changelog. Focused cook roster tests pass.

Scope correction: upstream execute/refactor are intentionally not included because no corresponding local workflow stages exist; this child delivers the two distinct stations only.

Validation evidence: `bunx vitest run --config vitest.config.ts tests/cook-agents.test.ts tests/cook-dispatch.test.ts tests/refute-parallel.test.ts tests/protocol-prose.test.ts` passed 38/38; `bunx tsc --noEmit -p plugins/cook/tsconfig.json` passed; `just verify` passed all gates. Project install, ten-profile marker/hash, and evo-owned project skip are covered by cook-agents tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added cook-audit and cook-refute as OMP-adapted upstream Jeff stations, expanded the install roster to ten profiles, aligned package/provenance/marketplace versions to 0.1.7-ezxomp.6, and made project/personal sync fail-safe while evo-sub owns rewrites. Verified by focused Cook tests, Cook typecheck, and full `just verify`.
<!-- SECTION:FINAL_SUMMARY:END -->
