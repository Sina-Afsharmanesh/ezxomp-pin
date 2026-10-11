---
id: TASK-49.2
title: Route new cook stages and dispatch
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
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose stage-to-profile mapping and native task dispatch for execute, refactor, audit, and refute while preserving existing planner/worker/validator/judge compatibility and active task-surface checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dispatch wrappers retain fail-fast behavior when task is inactive and block invalid stage/role transitions.
- [x] #2 The supported audit and refute stages map to cook-audit and cook-refute while existing local stages retain their profiles.
- [x] #3 cook_dispatch_audit and cook_dispatch_refute return structured native task payloads with those profile identities.
- [ ] #4 Dispatch wrappers retain fail-fast behavior when task is inactive.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read task and dispatch contracts. 2. Add explicit stage-to-profile mapping for audit/refute while preserving existing local stage mappings. 3. Add the cook_dispatch_audit wrapper and route cook_dispatch_refute to cook-refute; preserve active task-surface checks and existing role guards. 4. Add targeted dispatch/protocol/refute tests. 5. Run only targeted cook tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator implementation after dispatch worker write-surface failure: added STAGE_PROFILE_MAP/profileForStage, wired existing dispatch wrappers through the registry, routed cook_dispatch_refute to cook-refute, added cook_dispatch_audit with active task-surface probing, and added audit/refute prompts plus renderer metadata. Focused dispatch/protocol/refute tests pass.

Scope correction: no execute/refactor dispatch tools are added because no local operation/refactor chain exists; this child covers conditional audit/refute routing only.

Validation evidence: `bunx vitest run --config vitest.config.ts tests/cook-dispatch.test.ts tests/refute-parallel.test.ts tests/protocol-prose.test.ts` passed; Cook and Evo focused suites passed 63/63; `just verify` passed all 400 tests plus Fallow. Audit/refute payload identities and inactive task-surface failure are asserted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the explicit stage-to-profile registry, routed cook_dispatch_refute to cook-refute, added cook_dispatch_audit with scanner-aware brief and active native-task probing, and added audit/refute prompts and renderer metadata. Verified with focused dispatch/refute/protocol tests, plugin typechecks, and full `just verify`.
<!-- SECTION:FINAL_SUMMARY:END -->
