---
id: TASK-80
title: 'gsd-loop: state store (WU-3)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/state.ts per-cwd .gsd-loop/ persistence: state.json tmp+rename atomic, daily journal JSONL with flowId/seq, loop.lock wx-acquire with pid liveness + stale reclaim + heartbeat, STOP flag, wedge.json, crash notes, schema-version guard refusing version!=1. tests/state.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 round-trip preserves counters+queue; interrupted write never corrupts; lock same-pid OK foreign-live refused dead-pid reclaimed; journal one valid JSON line per call monotonic seq; two cwd roots isolated
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/core.ts:69-73 — journalSeq is process-local and resets to zero on restart; resume in a new process emits duplicate seq values for the same flowId. The required monotonic sequence must initialize from persisted journal/state and remain monotonic across restarts. [blocking] plugins/gsd-loop/src/state.ts:321-325 — writeActivityLog joins user-controlled unitId directly into the activity path; enqueueing id ../... then recording writes outside <cwd>/.gsd-loop, violating the isolation gate. Reject path separators or use a confined filename.
---

author: @JudgeLoop
created: 2026-09-06 07:43
---
[blocking] plugins/gsd-loop/src/kernel.ts:138-145,189-199 — wedge detection only mutates state.wedge; no core/state writeWedge call persists wedge.json when an advance wedges. A restart cannot see the active file and `/gsd-loop resume --wedge <id>` cannot acknowledge the generated wedge, violating the durable wedge/re-entry contract.
---

author: @JudgeLoopR2
created: 2026-09-06 14:24
---
[blocking] plugins/gsd-loop/src/index.ts:108-113 — session_shutdown appends `seq: s.counters.iterations + 1` directly instead of the durable journal tail allocator; after any run with more than one journal event this duplicates/rewinds sequence numbers, breaking monotonic flowId journal ordering across restart. Route shutdown journaling through the same allocator. [blocking] plugins/gsd-loop/src/state.ts:246-248 — releaseLock unlinks any existing lock without verifying owner, which is unsafe when a foreign mutating path reaches terminal cleanup; make release ownership-aware and keep foreign lock guards at the facade boundary. [follow-up] plugins/gsd-loop/src/state.ts:328-332 — sanitizer confines separators but maps distinct raw ids such as `a/b` and `a_b` to the same activity filename, merging per-unit logs; add a collision-resistant suffix or document/validate the id namespace.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
State store shipped in 785f29dc: wedge.json hydration in loadOrCreateState (disk authority when state lacks wedge), foreignLockProbe disk-first unlink (unlink BEFORE state.acknowledgeWedge, non-ENOENT refuses), ring trim to 3. JudgeLoopR3 REVIEW_PASSED; vitest 87/87 + e2e PASS.
<!-- SECTION:FINAL_SUMMARY:END -->
