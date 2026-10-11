---
id: TASK-76
title: 'gsd-loop: settings resolver (WU-2)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/settings.ts resolveGsdLoopSettings per config map: loop.maxIterations 500, memoryCheckInterval 5, memoryHeapThresholdRatio 0.85, maxConsecutiveErrors 3, maxCooldownRetries 5, cooldownFallbackWaitMs 35000, maxFinalizeTimeouts 3, verify.maxRetries 3, verify.timeoutMs 120000; constants module (backoff 2s-30s jitter 10pct, STUB_RECOVERY_THRESHOLD 2). tests/settings.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 defaults on empty; persisted override wins; invalid types out-of-range clamped to defaults; manifest settings validation green
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settings resolver shipped in 785f29dc: loop.memoryCheckInterval (default 5, iterations % interval === 0) gating memory checks; README:76 interval-gated text. JudgeLoopR3 REVIEW_PASSED round 3. vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
