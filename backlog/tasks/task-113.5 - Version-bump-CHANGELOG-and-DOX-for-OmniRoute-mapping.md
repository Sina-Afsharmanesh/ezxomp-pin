---
id: TASK-113.5
title: 'Version bump, CHANGELOG, and DOX for OmniRoute mapping'
status: Done
assignee: []
created_date: '2026-09-10 16:17'
updated_date: '2026-09-10 18:11'
labels: []
dependencies:
  - TASK-113.4
parent_task_id: TASK-113
ordinal: 238000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bump better-custom to 0.1.3-ezxomp.0 across package.json, .omp-plugin/marketplace.json, UPSTREAM.json localForkVersion, README table, test/manifest.test.ts EXPECTED_VERSIONS. Add CHANGELOG [Unreleased] entry describing the OmniRoute capability mapping. Update plugins/better-custom/AGENTS.md child DOX probe/flow notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 manifest gate passes with 0.1.2→0.1.3 expectations aligned
- [x] #2 CHANGELOG entry present
- [x] #3 AGENTS.md probe section mentions OmniRoute detection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Version 0.1.3-ezxomp.0 across package.json, marketplace.json, UPSTREAM.json, README, manifest test. CHANGELOG entry: host-supported OmniRoute capability mapping, pre-tags /api/health detection, exact raw effort mapping, none policy, OpenAI-only preset scope, re-probe precedence, x-omniroute headers as optional user-supplied (no secrets), URL-userinfo as separate follow-up.

2. Run only after all gates for 113.1-113.4 merged; single version/docs cutover; AGENTS.md DOX update in same commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Version 0.1.3-ezxomp.0 applied across package.json, UPSTREAM.json, marketplace.json, README table, test/manifest.test.ts (manifest gate green). CHANGELOG entry covers host-supported scope, health-first detection, verbatim effort mapping, none policy, OpenAI-only preset, re-probe precedence, x-omniroute headers as user-supplied only (no secrets), URL-userinfo noted as separate follow-up. better-custom AGENTS.md carries the durable gateway-detection + effort-vocabulary contract.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Release cutover shipped as d5352aa: 0.1.3-ezxomp.0 across all version surfaces, manifest gate + full just verify green (16/16, tsc clean, fallow new-only pass).
<!-- SECTION:FINAL_SUMMARY:END -->
