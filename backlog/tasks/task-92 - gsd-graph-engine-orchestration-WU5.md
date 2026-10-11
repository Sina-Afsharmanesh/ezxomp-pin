---
id: TASK-92
title: 'gsd-graph: engine orchestration (WU5)'
status: Done
assignee: []
created_date: '2026-09-06 02:16'
updated_date: '2026-09-06 20:25'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/engine/{context-injector,run-manager,engine}.ts ports of custom-workflow-engine.ts: lock-wrapped resolveDispatch with active-resume first, iterate expansion with runDir containment hardening + 5s ReDoS bail, reconcile disk re-read under lock, context injection 10k truncate, run-manager createRun/listRuns precedence chain. Tests incl concurrent-edit simulation. Integration owner for lock boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 6 acceptance cases incl lifecycle to milestone-complete, active-resume, concurrent-edit preservation, blocked reasons, zero-match stop
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraph
created: 2026-09-06 07:18
---
[blocking] plugins/gsd-graph/src/engine/run-manager.ts:59-65,78-84,137-140 — defName is interpolated into definition and run-directory joins without containment validation. A createRun(base, '../evil') probe created /tmp/.../.gsd/evil/<timestamp>, outside .gsd/workflow-runs, and definition lookup can escape its intended tiers. Reject unsafe workflow names and assert both resolved definition candidates and run dirs stay under their roots before reading/writing.
---

author: @JudgeGraph
created: 2026-09-06 07:19
---
[follow-up] plugins/gsd-graph/src/engine/run-manager.ts:127-137 — createRunFromDefinition exposes an optional `timestamp` parameter but ignores it and calls makeTimestamp() again at line 137. A direct probe with `timestamp='FIXED'` produced a current-time directory instead. Use the supplied timestamp when selecting the run directory (retaining collision suffixing) or remove the unused parameter/API.
---

author: @JudgeGraphR2
created: 2026-09-06 14:22
---
[blocking] plugins/gsd-graph/src/engine/run-manager.ts:55-63,171-180 — WORKFLOW_NAME_PATTERN permits '..' and freshRunDir/listRuns join it directly, so a workflow named '..' resolves to .gsd/workflow-runs/.. and list can walk outside the intended workflow directory. Reject dot-dot segments and enforce resolved containment for create/list paths, sharing the run-name guard used by the tool surface. [blocking] plugins/gsd-graph/src/engine/engine.ts:267-276 — reconcile extracts a step id and calls markStepComplete without requiring that the target is active; callers can complete a pending or wrong step and bypass dependencies/single-active state. Validate the active step under the lock and throw a named error before writing.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Engine orchestration shipped in f9304a33: run create returns first dispatch descriptor, flat dispatch details, stop descriptors use reason (create-stop {kind,reason,level}), complete composes {outcome:continue, next:<descriptor>} / milestone-complete, listRuns WORKFLOW_NAME_PATTERN + .. confinement, list rows carry flat completed/total. JudgeGraphR4 REVIEW_PASSED round 4; vitest 64/64, registration 7/7.
<!-- SECTION:FINAL_SUMMARY:END -->
