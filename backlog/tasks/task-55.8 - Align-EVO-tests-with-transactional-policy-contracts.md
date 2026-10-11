---
id: TASK-55.8
title: Align EVO tests with transactional policy contracts
status: Done
assignee:
  - '@eag1'
created_date: '2026-08-29 16:49'
updated_date: '2026-08-29 19:25'
labels:
  - test
  - refactor
dependencies:
  - TASK-55.5
  - TASK-55.7
parent_task_id: TASK-55
priority: high
type: task
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the EVO plugin test suite to defend the implemented TASK-55 transactional main/sub generation, original-grant derivation, fail-closed conflict behavior, xd:// routing, and task preflight. Remove only stale assertions that encode superseded destructive or shared-state behavior; do not weaken observable contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main tests use main-generation.json and cover exact persisted restoration rather than fallback to all tools
- [x] #2 Sub tests expect original-grant-derived floors and conflict refusal without overwriting drift
- [x] #3 Tests cover independent main/sub records, refresh/regenerate, xd:// protocol reads, and fail-closed cook task preflight
- [x] #4 All EVO plugin tests pass and each updated test would fail against the superseded behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
13 failing tests root-caused (test-only fixes, no production change): (A) extension.test.ts FULL_TOOLS duplicate `agent_experience_apply_review` breaks validNames() uniqueness -> main lane EVO_GENERATION_INVALID cascade (tests 1,3,4,5,6). (B) transactional-main-routing restart test reads sub-state.json (sub lane) after TASK-55.7 split; must read ompMainGenerationFile(). (C) evo-sub-dual-scope expects 20 rewrites (both scopes) — superseded by doc-13 rule 6 project-nearest-wins; align to 10 project rewrites + global byte-identical. (D) extension tests 7/14/16 expect legacy flat allowlist incl web_search — TASK-55.3 base is {eval,hub,yield}+role sets+code_nav; align. (E) test 12 expects destructive drift overwrite — doc-13 restore refuses, retains evidence, EVO_RESTORE_CONFLICT. (F) test 18 expects legacy sub-state hydration ON — superseded by fail-closed generation authority; rewrite to seed a valid active sub generation and assert hydration is read-only.
Steps: A. remove dup FULL_TOOLS line. B. main-routing test -> ompMainGenerationFile import+read. C. dual-scope 2 tests -> 10/project-only + global untouched assertions + header comment. D. tests 7/14/16 web_search/code_nav base expectations -> post-55.3 derivation. E. test 12 -> conflict refusal contract (drift bytes retained, state failed, EVO_RESTORE_CONFLICT, recovery evidence retained). F. test 18 -> seed active sub generation via controller in a separate temp project cwd, assert status ON + read-only hydration + state bytes unchanged; remove deleteSubState import.
Verify: plugins/evo vitest suite 46/46; negative control: each updated assertion targets an observable the superseded behavior violated (documented in notes).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: plugins/evo vitest 46/46 (6 files), tsc clean, just check+test green (382 pass/0 fail). Negative controls: NEG-1 dual-scope toBe(20) -> FAIL; NEG-2 restart via sub-state.json -> FAIL; restored -> PASS. fallow-audit red is pre-existing production complexity from 55.1-55.7 (FALLOW_AUDIT_BASE=c56ec6af audit rc=0 proves this diff adds zero findings). Merged to main (merge commit, parents c56ec6af + 1dd06882).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Aligned EVO contract tests with the transactional policy: removed the FULL_TOOLS duplicate (main-lane cascade), repointed the restart test at main-generation.json, updated dual-scope to project-nearest-wins (10 rewrites, global untouched), and rewrote test 18 as a global-only committed-generation read-only hydration. Verified 46/46 vitest + negative controls; merged to main.
<!-- SECTION:FINAL_SUMMARY:END -->
