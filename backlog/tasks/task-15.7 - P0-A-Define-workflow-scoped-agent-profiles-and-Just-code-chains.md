---
id: TASK-15.7
title: 'P0-A: Define workflow-scoped agent profiles and Just code chains'
status: Done
assignee: []
created_date: '2026-08-21 01:07'
updated_date: '2026-08-23 02:42'
labels:
  - workflowz-v2
  - research
  - orchestration
  - profiles
dependencies:
  - TASK-15.5
  - TASK-15.6
references:
  - /home/egsox/repo/ezxomp/justfile
  - 'omp://task-agent-discovery.md'
  - >-
    https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/
  - 'https://github.github.com/gh-aw/'
  - >-
    https://deepwiki.com/agnusdei1207/opencode-orchestrator/5.5-agent-spawning-and-depth-hierarchy
documentation:
  - docs/plugin_proposal/workflowz-v2.md
parent_task_id: TASK-15
priority: high
type: spike
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Freeze the workflow-owned orchestration roster and deterministic tool surface before runtime implementation. Define nine prefixed `workflowz-*` agent profiles, their responsibilities, model/tool/skill policy, Backlog/JJ governance setup, allowed child profiles, normal/background/parallel spawn modes, Orchestrator fan-out 8, Planner/Judge fan-out 4, and depth-one terminal specialists. Define Just-backed code-only chains and typed host tools; eval is optional for deterministic code steps. This is a docs/design task only; do not implement runtime code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nine workflow-scoped prefixed profiles are defined with responsibility, allowed tools/skills, model policy, Backlog/JJ setup, and terminal/spawn status
- [x] #2 Only Orchestrator, Planner, and Judge may spawn; Orchestrator fan-out is capped at 8; Planner/Judge fan-out is capped at 4; workflow depth is capped at 1; specialists are terminal
- [x] #3 Normal, background, and parallel spawn modes have typed handoff/result contracts and bounded join/failure behavior
- [x] #4 Just-backed code-only chains cover artifact readiness, repo readiness, local/pre-merge verification, research readiness, review loop, and release readiness
- [x] #5 Typed host tools discover allowlisted Just recipes, reject arbitrary shell strings, capture GateReport evidence, and work without an eval cell
- [x] #6 The decision references OMP task-agent discovery/spawn policy and the online deterministic-orchestration precedents
- [x] #7 The design is linked from the parent Backlog task and does not claim runtime implementation is complete
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
Section added: docs/plugin_proposal/workflowz-v2.md §7C (2026-08-22) — nine workflowz-* profiles with responsibility / allowed tools-skills / model policy / Backlog-JJ governance setup / allowed child profiles / terminal-spawn status (§7C.1); spawn policy caps Orchestrator 8 / Planner,Judge 4 / depth 1 / specialists terminal with omp_workflow_spawn_guard enforcement (§7C.2); normal/background/parallel modes with WorkflowHandoffV1/AgentResultV1/ParallelResultV1 typed handoff-result contracts and bounded join-failure (§7C.3); Just-backed code-only chains (artifact-ready, repo-ready, verify-local, verify-premerge, review-loop, research-ready, release-ready) mapped to real justfile recipes check/test/verify/smoke (§7C.4, justfile:5-23) with to-create markers for missing wrappers; typed host tools discover allowlisted recipes, reject shell strings via directiveBlockReason/classify, capture GateReport, work without eval cell (§7C.5, runtime.ts:676-686/35-39/591-627, p0-tools.ts:44-46); references omp://task-agent-discovery.md plus Conductor/gh-aw/opencode-orchestrator precedents (§7C.6). Existing frozen content §§3A-5/6/8 untouched; TOC link added.
<!-- SECTION:NOTES:END -->
