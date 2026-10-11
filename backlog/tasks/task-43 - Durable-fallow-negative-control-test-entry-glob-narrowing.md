---
id: TASK-43
title: Durable fallow negative-control test + entry-glob narrowing
status: Done
assignee: []
created_date: '2026-08-28 17:21'
updated_date: '2026-08-28 18:29'
labels:
  - chore
milestone: m-3
dependencies: []
priority: low
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Judge follow-ups from TASK-40 REVIEW_PASSED: (1) test/fallow-gate-contract.test.ts only checks recipe text; the unused-export negative control is a documented manual procedure (TASK-40.4 notes). Add a deterministic automated repro that introduces an unreferenced export in a reachable module and asserts fallow-audit exits 1, without mutating tracked files. (2) Broad runtime entry globs in .fallowrc.json (plugins/plannotator/server/*.ts, plugins/experiences/runtime/**/*.mjs, scripts/**/*.ts) make every future matching file a graph root, masking genuine dead files over time. Narrow to verified runtime entries or add a justification contract. Evidence: fallow negative control flagged an unused-FILE, not unused-EXPORT, because temp files are not reachable. Ref: TASK-40 review follow-ups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Automated negative control proves fallow-audit exits 1 on an unused export in a reachable module and restores the tree
- [x] #2 Entry globs narrowed or a justification contract documented for newly matched runtime entries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect contract-test conventions and current Fallow entry globs; enumerate each broad glob's matched files and runtime-loading evidence without touching tracked files. 2. Add a deterministic temporary reachable-module unused-export negative control that invokes pinned npx -y fallow@3.20.0 audit/dead-code, asserts exit 1 then restores the tree and asserts exit 0, with timeout and finally cleanup. 3. Narrow only entry globs with concrete runtime-loading evidence, preserving all genuine runtime entry files and the ≤2 baseline. 4. Run bun test test/fallow-gate-contract.test.ts and a fresh Fallow dead-code scan, then record verified notes/criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `test/fallow-negative-control.test.ts` with a temporary standalone fixture and pinned `npx -y fallow@3.20.0 dead-code --fail-on-issues`; it observed exit 1 plus an unused-export finding, restored the module, then observed exit 0. `bun test test/fallow-negative-control.test.ts` passed (1/1). `bun test test/fallow-gate-contract.test.ts` passed (13/13, 40 expect calls). Config narrowing changed generated/runtime entries conservatively and ignored runtime vendor files; fresh `npx -y fallow@3.20.0 dead-code --format compact --quiet` exited 1 only for 3 circular-dependency findings still owned by other workers, with 1 unused file (provenance-kept openai-compatible.ts) and no new unused files (≤2 criterion).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in 829260a0: durable negative-control test + entry-glob narrowing; verified via just verify (exit 0) and the synthetic-finding red check.
<!-- SECTION:FINAL_SUMMARY:END -->
