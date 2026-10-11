---
id: TASK-87
title: 'gsd-graph: KG read side (WU2)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:25'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/knowledge/{paths,types,normalize,status,query,diff,format}.ts: status 24h stale window malformed-safe, query seed BFS budget trim AMBIGUOUS-then-INFERRED then hard seed-trim, diff from-to-type keys, tolerant edge normalization (source/target, label/relation, links), formatGraphContextBlock byte-faithful markdown. test/gsd-graph.test.ts cases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 6 enumerated acceptance cases incl budget 0, non-finite, malformed tolerance, cross-spelling diff stability, formatter stale-line contract
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraph
created: 2026-09-06 07:18
---
[blocking] plugins/gsd-graph/src/knowledge/normalize.ts:64 — valid-but-structurally-malformed graph JSON such as {} is normalized to an empty graph instead of absent; status.ts:21-24 therefore reports exists:true and zero counts, contrary to malformed-safe status. Fix parseGraph to reject missing/non-array nodes (and malformed required shape) so status returns exists:false; add a regression case for {}.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
KG read side shipped in f9304a33: query empty term returns EMPTY RESULT (plan-authoritative), status details {phase, progress Step N/M, blockedReason?, completed, total, steps[]}, diff exact edge keys with no_graph/no_snapshot typed states, commands query formatGraphContextBlock + strict budget. JudgeGraphR4 REVIEW_PASSED round 4. vitest 64/64, registration 7/7.
<!-- SECTION:FINAL_SUMMARY:END -->
