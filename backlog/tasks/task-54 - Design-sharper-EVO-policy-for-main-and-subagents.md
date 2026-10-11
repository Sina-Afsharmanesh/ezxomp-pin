---
id: TASK-54
title: Design sharper EVO policy for main and subagents
status: Done
assignee:
  - '@eag1'
created_date: '2026-08-29 10:08'
updated_date: '2026-08-29 10:17'
labels:
  - architecture
  - research
dependencies: []
documentation:
  - doc-13
priority: high
type: spike
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define how EVO mode should apply an efficient tool policy and routing mindset to the main agent and spawned subagents while preserving each subagent profile's original tool grants for deterministic restoration. Cover hook enforcement, replacement guidance, lifecycle behavior, persisted state, profile regeneration, and safe fallback semantics. Produce a concrete implementation design; do not modify production code in this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current main-agent and subagent EVO activation, filtering, and profile generation paths are mapped from source
- [x] #2 Original subagent tool grants can be restored exactly after EVO is disabled or regeneration is requested
- [x] #3 Hook behavior distinguishes allow, block, redirect, and replacement without creating retry loops
- [x] #4 Recommendation defines tool tiers, routing guidance, state ownership, failure fallbacks, and verification scenarios
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map `plugins/evo/extensions/evoMain.ts`, `tools.ts`, hook registration, persisted mode state, subagent profile discovery, and profile rewrite/restore code. 2. Use parallel cook specialists to independently assess current-state integrity, routing/tool-efficiency policy, and profile restoration/failure semantics. 3. Synthesize a single state model covering main mode, subagent mode, immutable original grants, derived EVO grants, hook decisions, and regeneration. 4. Define observable verification scenarios for fresh sessions, toggles, spawned subagents, profile changes, partial writes, and stale snapshots. 5. Record the decision as a Backlog research report and finalize TASK-54; do not edit production code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only design completed with three parallel cook specialists: EvoIntegrityScout mapped exact transitions and integrity gaps; EvoRoutingResearch defined the model-agnostic capability/routing policy; EvoRestorationJudge independently failed the current restore design and supplied invariants. Coordinator verified OMP `ToolCallEventResult` supports block and same-tool input replacement, not cross-tool redirect. Evidence and implementation order are recorded in doc-13. No production code or profiles changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Defined a model-agnostic EVO architecture for main and cook subagents: persisted original grants, policy-derived effective grants, concise routing guidance, deterministic hook outcomes, transactional generation state, scope-aware profile handling, task-spawn preflight, and explicit restore/refresh/regenerate semantics. Verified against current EVO source and three parallel cook reviews; full report is doc-13.
<!-- SECTION:FINAL_SUMMARY:END -->
