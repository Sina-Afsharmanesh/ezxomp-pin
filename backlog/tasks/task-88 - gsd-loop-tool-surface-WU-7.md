---
id: TASK-88
title: 'gsd-loop: tool surface (WU-7)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/tools.ts 10 tools gsd_loop_{start,stop,pause,resume,status,advance,record_result,next,enqueue,list} Pattern A typebox, approval read for status/list else exec, NEXT/STOPPED/PAUSED envelopes, subagent dispatch instructions via native task. tests/tools.test.ts fake pi.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 all 10 register with exact names; envelope shapes asserted; approvals correct
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/tools.ts:169-171 — execute awaits the facade without a try/catch, so malformed persisted state, render/lock failures, or other facade exceptions reject the tool promise instead of returning the required {content:[text], isError, details} envelope on every error path. Wrap execution and normalize thrown errors.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tool surface shipped in 785f29dc: gsd_loop_* tools with lifecycle EPERM/crash recovery/durable journal tail/no-progress wedge (index.ts:57-158) verified by JudgeLoopR3 round 3. Integrated 9cd9092b; vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
