---
id: TASK-44.1
title: 'W1: state, journal, and dagr projection modules'
status: Done
assignee: []
created_date: '2026-08-28 18:50'
updated_date: '2026-08-28 20:07'
labels: []
dependencies: []
parent_task_id: TASK-44
priority: high
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Part 2 contracts + Part 2.5 of plans/cook-jeff-sync.md in plugins/cook: extensions/types.ts gains TypedFinding {source,file,line,what,kickTo}, ConvergenceStage {cycles, bonusGranted?}, CookState additive fields (claims repurposed to {by,at} with tolerate-both read, convergence, complexity, pipelineVersion?, maxParallelTasks=1). New extensions/journal.ts: append-only backlog/.cook-journal/<TASKID>.jsonl, closed 4-event vocab {intent,record,gate,external}, monotonic seq under existing store lock, writes fail-closed, reads fail-open; API appendIntent/appendRecord/appendGate/appendExternal/readTail/findDanglingIntent. New extensions/dagr.ts: dagr contract v3 projection (mapping table in plan Part 2.5) writing .dagr/run.json via run.json.tmp -> dagr check --strict --json -> atomic mv; validator resolution $DAGR_BIN -> PATH -> plugin build path; best-effort disable when no validator. Tests: tests/journal.test.ts (seq monotonicity under lock, malformed-line fail-open, dangling-intent detection), tests/state-legacy.test.ts (absent new fields = legacy behavior byte-identical, tolerate legacy string claims), tests/dagr-projection.test.ts (golden run.json, attempt/cause/evidence mapping, check-clean guarantee, disable-on-no-validator).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CookState loads legacy files without new fields with unchanged behavior; legacy string claims tolerated on read
- [x] #2 Journal seq is monotonic under concurrent appends; malformed journal lines skipped with warning on read
- [x] #3 findDanglingIntent returns intent events with no later matching record for same stage
- [x] #4 dagr projection output passes dagr check --strict --json with exit 0 and empty findings
- [x] #5 No validator on PATH -> projection disabled silently, cook continues
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by coordinator (worker W1 parked after evo-mode tool blocking; its types.ts interface additions resolved and coordinator completed the rest). Landed: TypedFinding + ConvergenceStage interfaces; CookState extended (claims {by,at}|string tolerance, convergence, complexity, pipelineVersion?, maxParallelTasks=1); defaultCookState new defaults; loadCookState legacy tolerance + maxParallelTasks defaulting. New extensions/journal.ts: append-only backlog/.cook-journal/<TASKID>.jsonl, 4-event closed vocab, monotonic seq from tail, fail-closed writes, fail-open reads (malformed line skip + warn), findDanglingIntents. New extensions/dagr.ts: contract v3 projection (buildRunDoc pure projection, publishRunDoc tmp->check --strict->atomic-rename, validator resolution DAGR_BIN->PATH->plugin path, silent disable on any failure). Tests: journal.test.ts (9 pass), state-legacy.test.ts (3 pass), dagr-projection.test.ts (6 pass) — 18/18 green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
W1 complete (coordinator-completed after worker parked on evo-mode tool blocking). Landed: TypedFinding + ConvergenceStage interfaces; CookState extended (claims {by,at}|string tolerance, convergence, complexity, pipelineVersion?, maxParallelTasks=1 default) with legacy-tolerant loadCookState; extensions/journal.ts (append-only backlog/.cook-journal/<TASKID>.jsonl, 4-event closed vocab, monotonic seq, fail-closed writes, fail-open reads, findDanglingIntents); extensions/dagr.ts (contract v3 projection, tmp→check→atomic-rename publish, validator resolution chain, silent disable). Tests: journal 9/9, state-legacy 3/3, dagr-projection 6/6; live dagr --strict publish verified in TASK-44 gate 3.
<!-- SECTION:FINAL_SUMMARY:END -->
