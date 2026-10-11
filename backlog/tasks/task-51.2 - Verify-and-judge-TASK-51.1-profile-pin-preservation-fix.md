---
id: TASK-51.2
title: Verify and judge TASK-51.1 profile-pin preservation fix
status: To Do
assignee: []
created_date: '2026-08-29 01:44'
updated_date: '2026-08-29 01:44'
labels: []
dependencies:
  - TASK-51.1
parent_task_id: TASK-51
priority: high
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scoped verification and review stage for TASK-51.1's F1 merge-on-write implementation in plugins/cook/extensions/agents.ts. Run the targeted suites, then the full cook vitest suite; dispatch cook-judge against the implementation; append verified results to the TASK-51 defect ledger. Prove the DAG ordering machinery works: cook_next must offer 51.2 only after 51.1 is Done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Targeted evidence recorded: tests/cook-agents-pin-preservation.test.ts AND tests/cook-agents.test.ts both pass via bunx vitest run (exact command quoted in evidence)
- [ ] #2 Full cook suite `cd plugins/cook && bunx vitest run` passes; any unrelated pre-existing failure is isolated and reported (not fixed here)
- [ ] #3 cook-judge has reviewed TASK-51.1 changes against acceptance criteria and no BLOCKING finding remains unaddressed
- [ ] #4 DAG order proof: cook_next returns TASK-51.2 as next-ready only after 51.1 is Done (cook_ready/cook_next output captured as evidence on TASK-51 notes)
- [ ] #5 TASK-51 defect ledger appended with verified stage results and any new workflow facts observed during dispatch (e.g. model-pin/routing facts)
<!-- AC:END -->
