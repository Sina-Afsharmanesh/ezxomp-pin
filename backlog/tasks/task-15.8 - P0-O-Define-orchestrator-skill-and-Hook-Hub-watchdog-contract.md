---
id: TASK-15.8
title: 'P0-O: Define orchestrator skill and Hook/Hub watchdog contract'
status: Done
assignee: []
created_date: '2026-08-21 03:51'
updated_date: '2026-08-23 02:42'
labels:
  - workflowz-v2
  - research
  - orchestrator
  - hooks
  - agent-hub
dependencies:
  - TASK-15.5
  - TASK-15.6
  - TASK-15.7
references:
  - 'omp://hooks.md'
  - 'omp://agent-hub.md'
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
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Freeze the end-to-end control plane for `/workflows` before runtime implementation. The slash command must bootstrap a workflow-scoped orchestrator skill/runbook that instructs discovery, route/chain selection, gate progression, Backlog/JJ governance, profile/spawn limits, child health monitoring, repair, continuation, escalation, and finalization. Define parent HookAPI lifecycle/tool handlers and a Hub-backed `omp_workflow_agent_control` surface for inspect/peek/steer/stop/retry, with health states, heartbeat/stall policy, typed handoffs, and explicit limits. This is a docs/design task only; do not implement runtime code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The slash command bootstrap defines a durable orchestrator skill with mission/inputs, Backlog/JJ/Just discovery checklist, route and chain rules, gate map, profile/spawn policy, monitor loop, continuation/escalation logic, and typed completion contract
- [x] #2 Hook mapping covers before_agent_start, agent_start, turn_start/turn_end, tool_call/tool_result, agent_end, session_start/session_tree, and session_shutdown with fail-closed policy behavior
- [x] #3 `omp_workflow_agent_control` defines inspect, peek, steer, stop, and retry operations using OMP Hub/history/agent surfaces, actor/reason logging, and permission checks
- [x] #4 Health states, heartbeat thresholds, blocked/tool-error/stalled handling, and retry/stop escalation are deterministic and visible
- [x] #5 OrchestratorRunResultV1 and WorkflowHandoffV1 carry Backlog/JJ/artifact/GateReport references
- [x] #6 The contract explicitly handles subagent sessions that do not load extension modules by keeping parent hooks/monitor authoritative and embedding child setup text
- [x] #7 The decision is linked from the parent Backlog task and docs/plugin_proposal/workflowz-v2.md; runtime implementation is not claimed complete
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
Section added: docs/plugin_proposal/workflowz-v2.md §7D (2026-08-22) — slash-command bootstrap durable orchestrator skill/runbook (mission/inputs, Backlog/JJ/Just discovery checklist, route+chain rules, gate map, profile/spawn policy, monitor loop, continuation/escalation, typed completion contract §7D.1); HookAPI mapping before_agent_start, agent_start, turn_start/turn_end, tool_call/tool_result, agent_end, session_start/session_tree, session_shutdown with fail-closed policy behavior (§7D.2); Hub-backed omp_workflow_agent_control surface inspect/peek/steer/stop/retry over Hub/history/agent APIs with actor/reason logging and permission checks (§7D.3, internal-urls/agent-protocol.ts, registry/agent-registry.ts, agent-hub.ts); deterministic health states (starting/running/progressing/idle/blocked/tool_error/stalled/completed/failed/stopped) + heartbeat 30s / idle 10s / stall 60s thresholds + blocked/tool_error/stalled retry/stop escalation (§7D.4-5); typed contracts OrchestratorRunResultV1 + WorkflowHandoffV1 carrying Backlog/JJ/artifact/GateReport refs (§7D.6, runtime.ts:651-686/721-730/749/1019); child sessions without extensions handling — parent hooks/monitor authoritative, workflowz contract embedded in child setup text (§7D.7, runtime.ts:424-425). Linked from TOC; runtime implementation not claimed complete.
<!-- SECTION:NOTES:END -->
