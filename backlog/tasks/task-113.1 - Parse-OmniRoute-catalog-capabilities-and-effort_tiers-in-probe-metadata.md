---
id: TASK-113.1
title: Parse OmniRoute catalog capabilities and effort_tiers in probe metadata
status: Done
assignee: []
created_date: '2026-09-10 16:16'
updated_date: '2026-09-10 18:09'
labels: []
dependencies: []
parent_task_id: TASK-113
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend plugins/better-custom/src/probe/metadata.ts: metadataFromModelListItem + metadataFromModelDetail to parse OmniRoute capabilities shape — tool_calling, attachment, structured_output, temperature, thinking, supportsThinking, effort_tiers (canonical none|low|medium|high|xhigh|max) → existing effortOptions field, plus input_modalities/output_modalities arrays as vision evidence. Keep OpenRouter/9router parsing intact. Spec: doc-24 map items 1+2+8.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 metadataFromModelListItem parses effort_tiers into effortOptions
- [x] #2 Modalities arrays parsed for vision detection (input_modalities includes image)
- [x] #3 Existing tests green + new focused tests in test/better-custom-probe.test.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Per council synthesis: parse flat capabilities.effort_tiers into ordered effortOptions WITHOUT canonical filtering (preserve ultra/extra verbatim); input_modalities/output_modalities as vision evidence; supportsThinking + top-level v1beta thinking:boolean as reasoning evidence only; no persistence for tool_calling/attachment/structured_output/temperature (no host sink); do not manufacture thinkingFormat.

2. Focused tests in test/better-custom-probe.test.ts: effort_tiers order+verbatim, ultra/extra pass-through, none handling at parse layer, modalities vision, v1beta thinking marker, existing OpenRouter/9router precedence intact.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented via direct main commits (3d53600, 2bb6070) + coordinator repair (f4d3a17): effort_tiers parsed ordered+verbatim incl. ultra/extra, supportsThinking + v1beta thinking → reasoning evidence, modalities → vision; sink-less booleans NOT persisted. Tests: test/better-custom-probe.test.ts 'better-custom OmniRoute catalog metadata' describe; full suite 552 tests green; tsc clean; fallow new-only gate green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OmniRoute catalog metadata parsing shipped: effort_tiers (open vocabulary, none filtered at projection layer), supportsThinking, v1beta thinking marker, input/output modalities as vision evidence. tool_calling/attachment/structured_output/temperature read as evidence only, never persisted (no host sink — council scope boundary).
<!-- SECTION:FINAL_SUMMARY:END -->
