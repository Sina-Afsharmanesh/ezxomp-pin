---
id: TASK-28.5
title: 'TASK-28.E: Final mixed-version and regression gate for procedures migration'
status: Done
assignee: []
created_date: '2026-08-23 09:09'
updated_date: '2026-08-23 11:14'
labels:
  - verification
milestone: m-0
dependencies:
  - TASK-28.3
  - TASK-28.4
parent_task_id: TASK-28
priority: medium
type: task
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket E of TASK-28 (planner packet §3.E). Final mixed-version and regression gate. Verify test/agent-learning-procedures-sqlite.test.ts + test/fixtures/agent-learning-procedures-v7-e2e.ts fully green, existing storage-hardening/overlay/promotion suites green, and mixed-version capability fallback covered (unknown/<7 owner keeps atomic store; >=7 uses SQLite). Tests must use isolated temp dirs only; no TASK-29 managed-skills state, user config, or doc-5 modified. Full just verify is run once by the orchestrator at closeout — workers do NOT run project-wide suites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All authored RED scenarios become green
- [x] #2 Existing overlay/promotion suites remain green
- [x] #3 Mixed-version capability fallback is covered
- [x] #4 Tests use isolated temporary directories only
- [x] #5 No TASK-29 managed-skills state, user config, or doc-5 is modified
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
E-gate satisfied by executed evidence, now independently attested. AC1: test/agent-learning-procedures-sqlite.test.ts 5 pass / 0 fail (closeout gate + re-run inside GateM0Final-R2's just verify). AC2: full just verify EXIT=0 — tsc clean, 366 pass / 18 skip / 0 fail across 384 tests / 36 files, 2957 expect(); overlay/promotion suites included and green. AC3: mixed-version capability fallback covered — unknown/<7 owner keeps atomic store, >=7 uses SQLite v7 partition; both modes proven by fallback demo plus the capability-gated adapter (procedures/store/experience.ts) exercised by the sqlite suite and v7 e2e fixture. AC4: tests isolated to temp dirs — v7 e2e spawns child with sandboxed PI_CODING_AGENT_DIR (fresh module graph), zero user-state risk. AC5: no TASK-29 managed-skills state, user config, or doc-5 modified — confirmed by jj st showing exactly the 10 expected working-copy entries (independent validator V7) and empty diff-vs-parent for excluded paths (V6). Ship context: all landed in consolidation commit 195713df24e8 on origin/main; independent post-ship gate GateM0Final-R2 returned PASS 10/10 (recorded on TASK-27 comment #2).
<!-- SECTION:FINAL_SUMMARY:END -->
