---
id: TASK-113
title: 'OmniRoute gateway 1:1 capability mapping for better-custom'
status: Done
assignee: []
created_date: '2026-09-10 16:16'
updated_date: '2026-09-10 18:13'
labels: []
dependencies: []
references:
  - >-
    backlog/docs/doc-24 -
    OmniRoute-gateway-1-1-capability-mapping-for-better-custom.md
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Map OmniRoute gateway (github.com/diegosouzapw/OmniRoute v3.8.51) host-supported capabilities into the better-custom provider wizard per council-corrected spec doc-24: ordered open-vocabulary effort_tiers parsing (verbatim wire spellings, none as disable sentinel), modalities as vision evidence, supportsThinking + v1beta thinking as reasoning evidence, pre-tags /api/health detection, per-model thinkingLevelMap emission preserving exact raw tier values. tool_calling/attachment/structured_output/temperature have no host sink and are NOT persisted (council-resolved scope boundary). Spec: doc-24 (corrected).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Probing an OmniRoute catalog yields per-model contextWindow, maxTokens, vision, reasoning, ordered effortOptions when present; v1beta thinking is reasoning evidence
- [x] #2 Stored per-model mapping preserves exact raw gateway tier spellings as reasoning_effort (never silently nulled); none excluded from positive efforts/map
- [x] #3 Strict /api/health marker checked BEFORE /api/tags on ollama-chat selects real /v1/models; genuine Ollama does not take that branch
- [x] #4 Focused tests cover unknown-tier pass-through, none omission, v1beta thinking, marker-before-tags, genuine-Ollama negative, preset scope, suffix ids, Fallow gate; just verify passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Council-corrected per doc-24: (1) TASK-113.1 parsers (effort_tiers ordered verbatim, supportsThinking, v1beta thinking, modalities vision; no persistence of sink-less booleans); (2) TASK-113.2 strict /api/health marker BEFORE /api/tags, no API key on marker, real-catalog preference; (3) TASK-113.3 ordered monotonic tier projection with verbatim effortMap values, none omitted, >6 tiers = explicit unsupported; (4) TASK-113.4 omniroute preset (OpenAI-style flows only); (5) TASK-113.5 version 0.1.3 + CHANGELOG + DOX after all gates. Merge order: 113.1 → 113.2 → 113.3 → 113.4 → 113.5, rebase each against test-file collisions (probe test describe shared).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All five subtasks Done. Commits: 3d53600 (effort projection), 2bb6070 (metadata parsing + preset + detection tests), f4d3a17 (coordinator repair: health-first detection, ordered projection, preset dedupe, fallow fixes), d5352aa (version/docs cutover). just verify green after every commit.

HITL smoke validation (isolated install, /tmp/omni-smoke): omniroute preset returns documented profile; modelOptionsFromProbe projects [none,low,ultra] → effortMap {minimal:ultra, low:low} with verbatim wire values; live fake-OmniRoute probe: ids discovered from real /models catalog, /api/tags NEVER fetched, /api/health request carries zero headers (no API key leakage), effortOptions [low,ultra] parsed ordered. All behavioral evidence captured post-install from the 0.1.3-ezxomp.0 layout.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-113 shipped end-to-end: OmniRoute host-supported capability mapping in better-custom 0.1.3-ezxomp.0. Full test suite 552 tests green, tsc clean, fallow new-only gate green. Worktrees torn down; work merged to local main. Ship (push origin/main) awaits explicit user approval.
<!-- SECTION:FINAL_SUMMARY:END -->
