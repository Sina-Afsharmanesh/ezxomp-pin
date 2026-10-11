---
id: TASK-113.2
title: Detect OmniRoute gateway and prefer real /v1/models catalog
status: Done
assignee: []
created_date: '2026-09-10 16:16'
updated_date: '2026-09-10 18:09'
labels: []
dependencies:
  - TASK-113.1
parent_task_id: TASK-113
ordinal: 235000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend plugins/better-custom/src/probe/ollama.ts + request flow: detect OmniRoute via GET /api/health returning {status:'ok', timestamp} (absent on genuine Ollama) and prefer the OpenAI-style /v1/models catalog over the static placeholder /api/tags, mirroring the shipped 9router /api/version bypass. Also detect OmniRoute in the openai-completions probe path via the capabilities shape. Spec: doc-24 map item 4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 OmniRoute /api/health marker triggers real-catalog preference
- [x] #2 Genuine Ollama (no such shape) never triggers the path
- [x] #3 Focused tests in test/better-custom-probe.test.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
isOmniRouteHealth strict predicate (status==='ok' + non-empty timestamp string) checked BEFORE /api/tags on ollama-chat probe, no API key attached; match → shared OpenAI model-list path (empty real catalog stays empty, never placeholder tags); genuine Ollama continues tags/show; 9router version branch retained. No brand detection on OpenAI-style paths.

2. Tests: marker-before-tags ordering observable in fetch call list; genuine-Ollama negative; marker+empty-catalog stays empty. Prefer small predicate; if fallow breaches, update existing ollama.ts override reason in this ticket only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
probeOllama rewritten (f4d3a17): isOmniRouteHealth strict predicate (status==='ok' + non-empty timestamp) checked BEFORE /api/version and /api/tags; public health request carries NO API key; confirmed marker → shared OpenAI model-list acceptance (empty real catalog stays empty, no placeholder-tags fallback); genuine-Ollama negative controls pass for every marker path (404, wrong shape). No brand detection on OpenAI-style paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OmniRoute health-first detection shipped with strict ordering (health → version → tags), no-credential marker request, and genuine-Ollama negative coverage. Tests updated to health-first call-order contract.
<!-- SECTION:FINAL_SUMMARY:END -->
