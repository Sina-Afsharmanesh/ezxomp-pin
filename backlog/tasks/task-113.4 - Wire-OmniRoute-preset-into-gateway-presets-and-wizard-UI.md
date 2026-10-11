---
id: TASK-113.4
title: Wire OmniRoute preset into gateway presets and wizard UI
status: Done
assignee: []
created_date: '2026-09-10 16:17'
updated_date: '2026-09-10 18:10'
labels: []
dependencies: []
parent_task_id: TASK-113
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an omniroute GatewayPresetId to plugins/better-custom/src/types.ts + presets.ts (profile: modelInfo false, modelGroupInfo false, publicCatalog false, perModelDetails true, modelsDev false; ensureV1 false) and register it in GATEWAY_OPTIONS in src/ui/prompts.ts with description. The preset exists so users can pin the OmniRoute shape explicitly instead of relying on auto-detect. Spec: doc-24.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 gatewayPreset('omniroute') returns the documented profile
- [x] #2 Gateway preset picker lists OmniRoute
- [x] #3 Focused tests updated in test/better-custom-probe.test.ts and test/better-custom-ui.test.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Closed omniroute GatewayPresetId in types.ts + presets.ts profile {modelInfo:false, modelGroupInfo:false, publicCatalog:false, perModelDetails:true, modelsDev:false} (modelsDev:false reason: OmniRoute catalog authoritative, models.dev flag unwired at presets.ts:11-12), ensureV1:false; picker row in ui/prompts.ts. Preset offered ONLY for OpenAI-style flows; ollama-chat relies on 113.2 auto-detection. No x-omniroute-* header defaults.

2. Tests: gatewayPreset('omniroute') profile + picker listing + preset does not change ollama-chat routing; probe preset enumeration updated without touching 113.2 detection tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
omniroute GatewayProfileId + preset row (profile: modelInfo/groupInfo/publicCatalog false, perModelDetails true, modelsDev false with unwired-reason comment, ensureV1 false) + picker row in GATEWAY_OPTIONS; duplicate row from worker merge deduped (f4d3a17). Preset offered only for OpenAI-style flows — ollama-chat skips preset prompting (styleUsesGatewayPreset unchanged) and relies on 113.2 auto-detection. No x-omniroute-* header defaults.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OmniRoute preset shipped: gatewayPreset('omniroute') returns documented profile; picker lists OmniRoute; preset enumeration test extended; ollama-chat routing unaffected.
<!-- SECTION:FINAL_SUMMARY:END -->
