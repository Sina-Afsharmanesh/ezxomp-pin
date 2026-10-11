---
id: TASK-53
title: Assess one-tool EVAL gateway for EVO mode
status: Done
assignee:
  - '@eag1'
created_date: '2026-08-29 08:33'
updated_date: '2026-08-29 08:43'
labels:
  - research
  - architecture
dependencies: []
documentation:
  - doc-12
priority: high
type: spike
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Evaluate whether EVO mode can expose a single model-facing EVAL tool that can invoke OMP native tools and every installed plugin tool without losing host behavior, safety controls, cancellation, progress updates, or dynamic discovery. Produce an evidence-grounded architecture recommendation; do not implement the gateway in this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current EVO mode tool filtering and eval-kernel capabilities are mapped from source
- [x] #2 OMP host APIs needed to discover and invoke native and plugin tools are identified from source or official documentation
- [x] #3 Feasibility, security boundaries, recursion risks, cancellation, progress propagation, and schema ergonomics are assessed
- [x] #4 A concrete recommendation chooses whether to build the unified EVAL gateway and defines the smallest safe architecture
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Research evidence is recorded in a Backlog report
- [x] #2 Recommendation distinguishes supported facts from inferred host behavior
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect EVO extension entrypoints, tool filtering, and eval bridge implementation. 2. Inspect OMP ExtensionAPI/tool registry contracts and current tool execution path. 3. Evaluate unified invocation designs against safety, recursion, cancellation, progress, schema, and dynamic plugin discovery. 4. Record a decision-ready report and recommendation with an implementation boundary if viable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research recorded in doc-12. Live verification: native OMP eval successfully dispatched `tool.read` and plugin `tool.backlog_task_view` from one eval kernel, with TASK-53 returned as structured plugin output. Source review confirmed enabled-tool gating, ACP wrapping, hook preservation, abort/progress forwarding, dynamic schema declarations, and Code Mode presentation. Three independent research subagents were dispatched but all failed before work due provider usage_limit_reached; no claims rely on them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Confirmed OMP already supplies the unified eval-to-tool gateway and Code Mode direct-surface collapse. Recommended no new EVO dispatcher: use native Code Mode with EVO selecting policy-approved enabled tools, and pursue a provider-neutral enabled-versus-direct host API for portability. Evidence and risk analysis are in doc-12; live eval dispatch covered one native and one plugin tool.
<!-- SECTION:FINAL_SUMMARY:END -->
