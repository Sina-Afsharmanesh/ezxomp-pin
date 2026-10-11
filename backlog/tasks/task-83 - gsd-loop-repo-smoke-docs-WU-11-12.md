---
id: TASK-83
title: 'gsd-loop: repo smoke + docs (WU-11/12)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/gsd-loop.test.ts repo smoke (registration, manifest); README with cut-lines table (every dropped behavior + reason); AGENTS.md child doc (state root, settings, guard catalog, review gates); temp-cwd E2E to terminal completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 guard-catalog completeness 1:1 with loop.ts:717-816; no writes outside .gsd-loop; schema version guard; smoke green
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/scripts/e2e.sh:2-10,59-67 — the required WU-12 proof calls only two units, asserts final status `stopped` (not required `complete`), and checks one global seq list rather than monotonic seq per flowId. The script therefore cannot prove the stated 3-unit complete-with-failed-unit contract; update the throwaway driver/assertions.
---

author: @JudgeLoopR2
created: 2026-09-06 14:25
---
[follow-up] plugins/gsd-loop/scripts/e2e.sh:73-80 — the script claims monotonic seq per flowId but compares one global seq array; add a per-flow grouping/assertion (and a restart/shutdown path) so the durable per-flow allocator contract is actually proved. The three passing units, retry failure at verifyAttempts=2, terminal stopped state, and lock release assertions are present at lines 64-82.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/index.ts:56-80,94-130 — EPERM is treated as dead during crash recovery, no crash note is emitted, shutdown uses iterations+1 instead of durable journal allocation, and no-progress stop only pauses without persisting a wedge. Also plugins/AGENTS.md:39-40 omits gsd-loop from the required child DOX index.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Repo smoke + docs complete: e2e.sh PASS on 785f29dc (3 units complete, retry unit failed after 1 retry, monotonic journal, lock released); README updated (interval text, wedge-aware resume hint index.ts:153). Integrated on gsd-integration 9cd9092b.
<!-- SECTION:FINAL_SUMMARY:END -->
