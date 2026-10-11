---
id: TASK-82
title: 'gsd-loop: kernel (WU-4)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:20'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/kernel.ts pure state machine: PhaseResult continue|break|retry|next; start/advance/recordResult/computeGuard; guard pipeline 1-8 in order (STOP flag, wedge, lock, maxIterations, memory, completion, no-advance wedge, dispatch); finalize ladders (error 3-strike, cooldown non-consuming 5, infrastructure immediate, finalize-timeout 3-pause, verify-retry, model-policy pause); step-mode pause; wedge signature unitId:attempts. tests/kernel.test.ts one test per guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 12 enumerated guard tests pass asserting exact stop.reason prefixes or actions
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/kernel.ts:231-260 — recordResult finds any queue id and increments pointer without requiring the current pointer's running unit (or even a running status). An out-of-order record for u2 while u1 is in flight advances pointer and leaves FIFO state corrupt; duplicate/late reports can advance it again. Enforce current-unit ownership/status and reject non-current results before finalize.
---

author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/kernel.ts:78-109 — computeGuard does not implement the required guard pipeline: a complete-status shortcut precedes STOP, wedge/lock checks are absent, and the memory check ignores memoryCheckInterval. A foreign live lock or persisted wedge can therefore be bypassed and memory can stop on every advance. Fix the ordered STOP → wedge → lock → cap → interval-gated memory → completion → no-advance → dispatch pipeline (with lock/wedge inputs supplied by the facade).
---

author: @JudgeLoop
created: 2026-09-06 07:42
---
[blocking] plugins/gsd-loop/src/kernel.ts:277-294 — verify timedOut outcomes never increment consecutiveFinalizeTimeouts or enter the configured 3-pause ladder; they are treated as ordinary verify retries until verify exhaustion. Also the cooldown branch at 320-328 returns immediately without the required non-consuming fallback wait. Wire timeout accounting and abortable cooldown sleep through the facade.
---

author: @JudgeLoop
created: 2026-09-06 07:43
---
[blocking] plugins/gsd-loop/src/kernel.ts:315-319 — model-policy failure sets state to paused but returns `{action:"retry"}`; the required ladder action is pause (not retry), so callers may continue pumping a paused run. Return the pause protocol explicitly. [blocking] plugins/gsd-loop/src/kernel.ts:336-343 — error-ladder exhaustion returns break without a payload/crash-note signal; core's crash-note condition consequently never writes the required crash note for the 3rd error.
---

author: @JudgeLoop
created: 2026-09-06 07:43
---
[blocking] plugins/gsd-loop/src/kernel.ts:52-69 — start accepts `_deps` but uses defaultNow and never calls deps.uuid, so injected clock behavior is ignored and repeated starts reuse the initial run id instead of creating the required per-start flow identity. Use injected deps for all timestamps and generate a new run id at each start.
---

author: @JudgeLoop
created: 2026-09-06 07:43
---
[blocking] plugins/gsd-loop/src/kernel.ts:252-259,336 — successful completion resets error/cooldown/finalize counters but never clears recentErrorMessages, while failUnit pushes without retaining the schema's maximum three entries. Persisted state can grow unbounded and violates the v1 counter contract.
---

author: @JudgeLoopR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-loop/src/kernel.ts:83 — computeGuard checks `run.status === complete` before the STOP probe and has no persisted-wedge or foreign-lock guard, so the required STOP→wedge→lock order is not present; fix guard order and refuse unacknowledged wedges/foreign owners before mutation. [blocking] plugins/gsd-loop/src/kernel.ts:52-69 — start ignores its injected deps (`uuid`, `now`) and preserves `run.id`/uses defaultNow, so a new start does not create the required new flowId; use deps.uuid/deps.now. [blocking] plugins/gsd-loop/src/kernel.ts:230-260 — recordResult accepts any queue id instead of the pointer's claimed unit; recording a later unit first breaks FIFO and can re-dispatch already-completed work; enforce current-unit ownership. [blocking] plugins/gsd-loop/src/kernel.ts:276-318 — cooldown failures return retry without the configured fallback wait, finalize-timeout counters are never advanced from a result, and model-policy sets paused state while returning action retry; these violate the WU-4 ladders and expose the wrong next-action to consumers.
---

author: @JudgeLoopR2
created: 2026-09-06 14:34
---
[blocking] plugins/gsd-loop/src/kernel.ts:345-349 and core.ts:319-326 — error-ladder/cooldown/infrastructure breaks return no phase payload, while the facade writes a crash note only when `phase.payload` is truthy; the required exhausted-error/crash-note artifact is therefore never emitted for the 3rd ordinary error or cooldown exhaustion.
---

author: @JudgeLoopR2
created: 2026-09-06 14:34
---
[blocking] plugins/gsd-loop/src/kernel.ts:96-99 — `deps.heapRatio()` is sampled on every advance and `loop.memoryCheckInterval` is never consulted, so configured checkpoint cadence is ignored; a consumer can be stopped by transient pressure on iteration 1 despite an interval of 5. Gate the probe on the iteration interval while preserving the hard cap.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/kernel.ts:42-69,78-152 — start ignores dependency now/uuid and computeGuard violates STOP→wedge→lock ordering while omitting persisted-wedge/foreign-lock guards; fix dependency threading and complete guard pipeline before accepting the loop.
---

author: @JudgeLoopR2
created: 2026-09-06 14:51
---
[blocking] plugins/gsd-loop/src/kernel.ts:249-257,277-293,320-328 — recordResult routes every failed verify (including timedOut=true) only through verifyRetry; no timeout counter is incremented/reset by timeout outcome, and rate-limit returns immediately without the configured cooldownFallbackWaitMs sleep. The documented finalize-timeout and non-consuming cooldown ladders therefore cannot occur.
---

author: @JudgeLoopR3
created: 2026-09-06 16:20
---
Final-round recheck after repairs: STOP-first/complete ordering, start deps, FIFO kernel gate, timeout/cooldown ladders, and verify retry reset are now present. Remaining [blocking] plugins/gsd-loop/src/kernel.ts:123-127 — computeGuard samples deps.heapRatio() on every advance and never consults settings['loop.memoryCheckInterval']; the declared checkpoint cadence is ignored and transient pressure can stop iteration 1 despite the default interval 5. Gate the probe on the configured interval. [blocking] plugins/gsd-loop/src/kernel.ts:367-368,415 — failUnit/crashUnit append recentErrorMessages without retaining the schema's <=3 bound; successful completion at 373-399 also never clears recentErrorMessages, so state.json grows without bound and stale errors survive a clean unit. Trim to three and clear on success.
---

author: @JudgeLoopR3
created: 2026-09-06 16:26
---
Re-read after orchestrator repair: kernel.ts:113-127 now gates heap probe by memoryCheckInterval; kernel.ts:324 clears recent errors on completion; kernel.ts:367-369 trims fail diagnostics to three. Those earlier blockers are resolved in the live tree. Remaining review blockers are recorded on TASK-79 for FIFO side effects and step-mode envelope; README line 76 is stale against the repaired interval behavior.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Kernel shipped at gsd-loop-wu7w12 785f29dc: STOP guard before complete shortcut (kernel.ts:92-98), foreign lock probe before wedge ack, wedge.json hydration with disk authority, dispatch counters (lastDispatchKey/noAdvanceRepeats), lexically strict numberFlag. REVIEW_PASSED JudgeLoopR3 round 3. Gates: vitest 87/87, e2e 3-units+retry-last monotonic journal + lock release. Integrated on gsd-integration 9cd9092.
<!-- SECTION:FINAL_SUMMARY:END -->
