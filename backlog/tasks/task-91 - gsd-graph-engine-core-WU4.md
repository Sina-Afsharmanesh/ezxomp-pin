---
id: TASK-91
title: 'gsd-graph: engine core (WU4)'
status: Done
assignee: []
created_date: '2026-09-06 02:16'
updated_date: '2026-09-06 20:25'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/engine/{graph,definition-loader,params,validate-runid}.ts ports of gsd-pi graph.ts machine: snake_case YAML round-trip via vendored js-yaml, getNextPendingStep, expandIteration instance ids + dep rewrite, definition V1 collect-all validation with produces-dotdot rejection + forward-compat, params merge + dotdot guard, runId validator. Tests per plan.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 6 acceptance cases incl expansion semantics, unknown-id throws, round-trip fidelity, validation collect-all, params guards, runId validation
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraph
created: 2026-09-06 07:18
---
[blocking] plugins/gsd-graph/src/engine/graph.ts:99-112 — readGraph maps any scalar step (for example `steps: [nope]`) into a GraphStep with undefined id/title/status/prompt and silently defaults metadata, so malformed GRAPH.yaml is accepted despite the documented throw-on-malformed contract. Validate each step and metadata shape (or reject the document) before mapping; add a structural-malformation regression case.
---

author: @JudgeGraphR2
created: 2026-09-06 14:22
---
[blocking] plugins/gsd-graph/src/engine/graph.ts:96-112 — readGraph validates only that steps is an array, then maps scalar/partial entries (for example steps: [nope] or [{id:1}]) into GraphStep values with undefined id/title/status/prompt and silently defaults metadata. This violates strict malformed GRAPH.yaml rejection and lets later transitions operate on corrupt state. Validate every step object and required field/types (including status/depends_on) before mapping; add a regression case.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Engine core shipped in f9304a33: sequential engine pending-complete, typed handler-error wrapper at registration, budget non-negative integer, explicit no-match line in format.ts. JudgeGraphR4 REVIEW_PASSED round 4; vitest 64/64.
<!-- SECTION:FINAL_SUMMARY:END -->
