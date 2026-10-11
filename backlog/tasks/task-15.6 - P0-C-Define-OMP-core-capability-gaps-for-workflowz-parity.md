---
id: TASK-15.6
title: 'P0-C: Define OMP core capability gaps for workflowz parity'
status: Done
assignee: []
created_date: '2026-08-21 00:49'
updated_date: '2026-08-23 02:42'
labels:
  - workflowz-v2
  - research
  - omp-core
  - parity
dependencies:
  - TASK-15.5
references:
  - 'omp://extensions.md'
  - 'omp://hooks.md'
  - 'omp://agent-hub.md'
  - 'omp://session.md'
  - 'https://github.com/bastani-inc/atomic/tree/main/packages/workflows'
  - 'https://vekexasia.github.io/pi-extensible-workflows/'
documentation:
  - docs/plugin_proposal/workflowz-v2.md
parent_task_id: TASK-15
priority: high
type: spike
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Produce a decision record for workflowz limitations that the extensible-workflows plugin cannot fully solve through the current ExtensionAPI alone. Cover operation-level replay, per-task model/tool/skill policy, hard token/cost budgets, true agent cancellation, headless checkpoint approval, footer rendering, parallel concurrency/fail-fast, and subagent extension inheritance. For each gap, distinguish an extension-level mitigation from a required OMP-core capability, define the fallback behavior, and record the acceptance boundary. This is a docs/decision task only; do not implement core or plugin runtime changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A limitation matrix covers operation replay, per-task policy, budgets, cancellation, headless checkpoints, footer rendering, parallel scheduling, and subagent extension inheritance
- [x] #2 Each row states the strongest extension-only mitigation, the residual limitation, and the exact OMP-core API/event needed for full parity
- [x] #3 The matrix defines which behaviors are hard guarantees, advisory signals, or explicit non-goals
- [x] #4 Fallback behavior is fail-closed and user-visible when the required OMP-core capability is unavailable
- [x] #5 The decision record is linked from docs/plugin_proposal/workflowz-v2.md and the parent Backlog task
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are met
- [ ] #2 Code changes are tested and documented
- [ ] #3 No regressions in existing functionality
- [ ] #4 Changes are reviewed and approved
- [ ] #5 Documentation is updated to reflect changes
- [ ] #6 All new code follows project coding standards
- [ ] #7 Changes are committed with clear, descriptive messages
- [ ] #8 No known bugs or issues remain unresolved
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Section added: docs/plugin_proposal/workflowz-v2.md §7B (2026-08-22) — 8-row capability-gap matrix with extension mitigation / residual / core-API / classification / fail-closed fallback. Grounding: runtime.ts:519-531 operationId dedup, 128 JournalEvent.operationId, 385-477 renderWorkflowDefinition agent/setup embedding, 32/49/432/447/604-609 budget advisory gate, p0-tools.ts:120-138 checkpoint auto:true headless escape, 153-168 stop cooperative, 140-151 status, 550-559 runStatus/stopRun, §6 footer setFooter no-op vs setStatus/widget, runtime.ts:429 parallel unbounded, §7#7 subagent extension non-inheritance. TOC link added + §8 phased-plan boundary preserved; existing frozen content (WorkflowRouteV1/GateFileV1, §§3A-5/6/8) not rewritten.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: codex
created: 2026-08-21 00:51
---
Review feedback requires an explicit parity roadmap before implementation. This task now precedes P0 and must distinguish extension mitigations from OMP-core capability work, with fail-closed fallbacks.
---
<!-- COMMENTS:END -->
