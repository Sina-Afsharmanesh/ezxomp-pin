---
id: TASK-79
title: 'gsd-loop: core facade + entry wiring (WU-9)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:20'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/core.ts facade shared by commands+tools (parse to kernel ops to text); src/index.ts final wiring: tools, command, hooks session_start crash-recovery, turn_start refresh, before_agent_start auto instruction injection, session_stop continue:true with progress guard, session_shutdown paused persist. tests for hook behaviors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 before_agent_start injects only when running+auto; session_stop returns continue with progress guard; shutdown persists paused
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/index.ts:57-64 — crash recovery catches every process.kill error as dead, including EPERM, violating pid-liveness EPERM tolerance and potentially marking a live foreign run crashed. [blocking] plugins/gsd-loop/src/index.ts:106-113 — shutdown appends seq=counters.iterations+1 instead of the journal sequence allocator, causing duplicate/out-of-order events; it also omits crash-note persistence for the recovery path. Use the shared monotonic journal writer and persist the required crash note.
---

author: @JudgeLoop
created: 2026-09-06 07:43
---
[blocking] plugins/gsd-loop/src/core.ts:226-241 — doAdvance loads state and calls kernel.advance without checking foreignLock; a second live session can mutate the queue while another owns loop.lock. It then heartbeats whichever lock exists at :260. [blocking] plugins/gsd-loop/src/core.ts:347-355 — doNext ignores acquireLock's boolean result and proceeds in step mode under a foreign live lock. Enforce ownership before every mutating advance/next operation.
---

author: @JudgeLoopR2
created: 2026-09-06 14:24
---
[blocking] plugins/gsd-loop/src/core.ts:55-57 — facade deps() does not thread ctx.cwd into KernelDeps, so kernel.nextUnit's briefFile render receives undefined and every file-backed advance fails; pass cwd through makeDeps. [blocking] plugins/gsd-loop/src/core.ts:255-267 — doAdvance never checks foreign-lock ownership, then heartbeatLock/releaseLock can mutate or remove another session's lock; guard every mutating facade path before kernel work. [blocking] plugins/gsd-loop/src/core.ts:364-371 — doNext ignores acquireLock's false result and proceeds to doAdvance, allowing a live foreign session to be mutated; return lockRefusal on failed acquisition. [blocking] plugins/gsd-loop/src/core.ts:251-255 — execution envelope is built from result.unit before/without the rendered brief returned by renderBrief, so briefFile units send the placeholder `(loaded from briefFile...)` to the model rather than file contents. [blocking] plugins/gsd-loop/src/core.ts:174-194 — resume --wedge acknowledges and journals/removes wedge state before checking foreign lock/status, so a refused resume mutates durable recovery state; validate guards before acknowledgement.
---

author: @JudgeLoopR2
created: 2026-09-06 14:25
---
[blocking] plugins/gsd-loop/src/index.ts:124-130 — the no-progress session_stop branch only pauses/persists state and never writes an active wedge record, so `/gsd-loop resume --wedge <id>` cannot perform the required sanctioned re-entry. [blocking] plugins/gsd-loop/src/index.ts:60-62 — crash recovery treats every process.kill failure as a dead owner; EPERM means the pid is alive but inaccessible, so this can reclaim a live foreign lock. Preserve EPERM as alive (as state.pidAlive does) and only recover on ESRCH.
---

author: @JudgeLoopR2
created: 2026-09-06 14:26
---
[blocking] plugins/gsd-loop/src/core.ts:263-275 — kernel can create `s.wedge`, but the terminal branch never calls state.writeWedge; the only writeWedge call is state.ts:287 from acknowledgeWedge. A detected wedge is therefore absent from wedge.json and cannot be resumed through the documented --wedge path after the facade returns.
---

author: @JudgeLoopR2
created: 2026-09-06 14:36
---
[blocking] plugins/gsd-loop/tests/hooks.test.ts:106-113 and src/index.ts:124-130 — the no-progress hook test only checks `paused` and the implementation only pauses; WU-9 AC3 requires the second no-progress stop to withhold continuation *and write an active wedge* for sanctioned `resume --wedge`. Update behavior and test to assert wedge.json/id, not merely paused status.
---

author: @JudgeLoopR2
created: 2026-09-06 14:37
---
[follow-up] plugins/gsd-loop/src/core.ts:75-82 — `journal()` reparses the entire on-disk journal on every event to find the tail, making the hot path O(total history); preserve the durable allocator but add a compact tail/index or bounded tail scan when performance work is scheduled. This is not a correctness block by itself.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/core.ts:55-57,126-134,144-211,246-267,319-365 — cwd is dropped before kernel rendering; advance/record/pause/resume/next do not enforce foreign lock ownership, next ignores acquireLock result, terminal paths can unlink a foreign lock, and wedge results are never written to wedge.json. Fix lock fencing, cwd threading, and durable wedge persistence.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/core.ts:282-291 and kernel.ts:231-250 — record_result locates any queue id and kernel marks it without requiring the pointer's currently running unit. A model can complete a future/pending unit out of FIFO, violating the single-process pointer-atomic queue contract; reject non-current/non-running ids.
---

author: @JudgeLoopR3
created: 2026-09-06 16:14
---
[blocking] plugins/gsd-loop/src/core.ts:212-215, kernel.ts:188-199 — doResume resets run state after a normal pause but only clears noAdvanceRepeats/lastDispatchKey in the --wedge branch (core.ts:194-195). Pausing with a unit in flight, then resuming, leaves the same dispatch key and the first resumed advance trips the no-advance wedge instead of redispatching. Reset dispatch bookkeeping on every legitimate resume.

[blocking] plugins/gsd-loop/src/core.ts:187-205, commands.ts:122-137, state.ts:53-57 — wedge.json is written before state.json, but loadOrCreateState never hydrates an on-disk wedge. A crash in that window leaves an active wedge visible to status yet bypassable by smart entry/start/bare resume because those paths inspect only s.wedge. Also doResume acknowledges a supplied wedge before the foreign-lock check (core.ts:192-205), allowing a foreign session to mutate the wedge/journal before lock refusal. Load/fence the persisted record before any acknowledgement or start mutation.
---

author: @JudgeLoopR3
created: 2026-09-06 16:20
---
[blocking] plugins/gsd-loop/src/core.ts:338-390 — kernel.recordResult correctly rejects an out-of-order future unit at kernel.ts:270-279, but doRecordResult treats every phase.action==='break' as terminal. A future unit result therefore still writes activity/unit-end + crash-note artifacts, releases the lock, journals terminal, and reports STOPPED while the pointed unit remains running. Return a non-terminal isError rejection for FIFO failure before side effects; only terminal ladder breaks should release the run.
---

author: @JudgeLoopR3
created: 2026-09-06 16:22
---
Additional [blocking] final-round findings: plugins/gsd-loop/src/core.ts:434-451 — doEnqueue performs a state mutation/persist without checking foreignLockProbe or acquiring the per-cwd lock. A second live OMP session can enqueue from stale state and overwrite the owner session's state.json/queue, defeating the lock safety contract. Fence enqueue before mutation. plugins/gsd-loop/src/core.ts:373-390 — after a successful step-mode recordResult, kernel returns action retry while s.run.status is paused; facade falls through to `Recorded ... NEXT: call gsd_loop_advance`, but doAdvance rejects paused runs. Return a PAUSED/next-step envelope (or otherwise instruct gsd_loop_next/resume) for this path. plugins/gsd-loop/src/core.ts:363-368 — all terminal breaks are persisted as crash notes with errorType 'error-ladder', misclassifying infrastructure, cooldown-exhausted, verify-exhausted, and crashed-unit stops against the documented crash-note enum and misleading recovery consumers.
---

author: @JudgeLoopR3
created: 2026-09-06 16:23
---
[blocking] plugins/gsd-loop/src/core.ts:195-214 — doResume processes `--wedge` (unlinks wedge.json, resets dispatch counters, journals acknowledgement) before validating that run.status is paused/stopped/wedged at :216-218. Calling resume --wedge while a run is still running/complete mutates and clears the active wedge, then returns an error; an invalid resume request can bypass the wedge gate on the next advance. Validate allowed run status before any wedge acknowledgement side effects.
---

author: @JudgeLoopR3
created: 2026-09-06 16:27
---
[blocking] Final live re-read: plugins/gsd-loop/src/core.ts:300-317 handles every doAdvance terminal stop by releasing lock/journaling/persisting, but never calls state.writeCrashNote. Thus iteration-cap and memory-pressure hard stops (and foreign/wedge stops if reached here) produce no crash-note artifact, while the persistence contract requires crash notes for hard stops (errorType iteration-exhausted/infrastructure/etc.). Add the artifact before returning the terminal result, with a classified reason.
---

author: @JudgeLoopR3
created: 2026-09-06 16:29
---
[blocking] New regression after crash-note patch: plugins/gsd-loop/src/core.ts:311 filters `result.reason.startsWith("STOPPED: stopped by user")`, but kernel.ts:187-192 emits `Stopped: stop requested`. A normal cross-session STOP therefore writes an erroneous error-ladder crash note despite the comment/contract excluding user STOP pauses. Match the actual STOP reason (and coordination stops as appropriate) before writing a crash note.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Core facade shipped at gsd-loop-wu7w12 785f29dc: resume ordering (status validation → foreignLockProbe → wedge ack disk-first unlink), counters reset on every resume, crash-note coordinationStop exclusion (STOP flag/foreign live lock/unacknowledged wedge excluded, classifier for hard stops). REVIEW_PASSED JudgeLoopR3 round 3 (all ten round-2 fixes + crash-note repair verified at core.ts:307-321). Gates: tsc 0, vitest 87/87, e2e PASS. Integrated on gsd-integration 9cd9092.
<!-- SECTION:FINAL_SUMMARY:END -->
