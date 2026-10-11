---
id: TASK-89
title: 'gsd-graph: KG write side + lock (WU3)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:25'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/lock.ts withFileLock (wx, pid liveness, stale 10s, 5x50ms, ELOCKED); five parsers port of readers/graph.ts:125-514 with upstream id conventions; buildGraph fan-out crash isolation AMBIGUOUS error nodes; atomic write; writeSnapshot snapshotAt. Tests incl concurrent-build serialization + stale-lock takeover.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 5 acceptance cases incl sabotaged parser yields exactly one error node; final graph.json valid canonical JSON under concurrency
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
KG write side + lock shipped in f9304a33: writeGraph + acquireBuildLock with parent mkdir, projectDir validated via resolveProjectDir, snapshot written AFTER graph persist (diff-after-build clean), projectDir unvalidated and TOCTOU blockers from JudgeGraphR4 fixed. REVIEW_PASSED round 4; vitest 64/64.
<!-- SECTION:FINAL_SUMMARY:END -->
