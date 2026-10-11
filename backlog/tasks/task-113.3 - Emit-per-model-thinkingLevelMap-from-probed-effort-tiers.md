---
id: TASK-113.3
title: Emit per-model thinkingLevelMap from probed effort tiers
status: Done
assignee: []
created_date: '2026-09-10 16:16'
updated_date: '2026-09-10 18:09'
labels: []
dependencies:
  - TASK-113.1
parent_task_id: TASK-113
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In plugins/better-custom/src/model-entry.ts + flows: when probe metadata carries effortOptions (from OmniRoute effort_tiers), build the per-model thinkingLevelMap so the host emits reasoning_effort values exactly matching declared tiers (none|low|medium|high|xhigh|max canonical vocabulary; effortMap preserves gateway spellings). Wire through buildProviderConfig modelOptionsWithInfo → buildModelEntry. Spec: doc-24 map item 6 + acceptance 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 buildModelEntry emits thinking.efforts equal to probed effortOptions
- [x] #2 effortMap values preserved verbatim from gateway
- [x] #3 Focused tests in test/better-custom-model-entry.test.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Ordered tier projection policy: remove none; recognized canonical/alias-only lists keep same-name selectors with raw values as effortMap values; any provider-native tier (ultra) maps full remaining ordered list monotonically onto [minimal,low,medium,high,xhigh,max] with verbatim values; >6 positive tiers → explicit unsupported result (no silent truncation); no positive tier → no thinking map. Wire via existing modelOptionsWithInfo + buildModelEntry seams.

2. Tests in test/better-custom-model-entry.test.ts: emitted efforts cover ordered non-none list, effortMap values equal raw advertised values in order (ultra/extra included), none excluded, suffix ids pass unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ordered monotonic tier projection in modelOptionsWithInfo (f4d3a17): none dropped as disable sentinel; recognized canonical/alias tiers keep same-name selectors with raw values (extra→selector xhigh, value 'extra'); any provider-native tier (ultra) projects the full remaining ordered list monotonically onto [minimal..max] with verbatim values; >6 positive tiers → map left unset (explicit unsupported, never truncated); 0 positive → no map. thinkingFromLevelMap unchanged; thinkingLevelMap mutation path retains mapFromEffortOptions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verbatim effort projection shipped: raw gateway spellings preserved as effortMap values and emitted as reasoning_effort; none excluded; ultra supported via monotonic projection. Covered by model-entry suite (11 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
