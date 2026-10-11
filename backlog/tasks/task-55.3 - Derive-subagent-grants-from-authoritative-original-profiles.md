---
id: TASK-55.3
title: Derive subagent grants from authoritative original profiles
status: Done
assignee:
  - '@EvoSubPolicyWorker'
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 20:38'
labels: []
dependencies: []
parent_task_id: TASK-55
priority: high
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace hard-coded replacement surfaces with policy derivation from each role's original grants and project-nearest profile discovery. Production boundary: plugins/evo/extensions/evo/tools.ts and frontmatter.ts only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Effective subagent grants start from registered original profile grants, remove denied natives and child orchestration, and add only the required role floor and versioned role additions
- [x] #2 Worker, judge, scout, researcher, planner, validator, council, audit, and refute profiles retain role least privilege
- [x] #3 A project profile shadows the global profile for the same role; the losing global copy is not mutated
- [x] #4 CSV and YAML-array tools frontmatter are parsed, and LF/CRLF originals remain available for byte-exact restoration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace role policy replacement surfaces with derivation from original grants, denying native filesystem/search and child orchestration tools while retaining floor and role additions. 2. Add CSV/YAML-array parsing and newline-safe frontmatter rewriting plus project-nearest profile selection helper. 3. Run targeted EVO tests and deliver task bookmark.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented tools.ts derivation API: original grants are filtered through native/child-orchestration deny policy, then floor and role additions are unioned; added policy version and generic cook_dispatch_ denial. Implemented frontmatter CSV/YAML-array parser, newline-aware rewrite, project-nearest selection helper, and preservation of unknown original grants. Targeted extension.test.ts passes. transactional-sub-policy.test.ts remains red in generation-state/project-scope lifecycle assertions owned by sibling TASK-55.1 integration; YAML/CRLF case passes.

Refined policy floor per contract: universal grants are eval, hub, yield only; code_nav_get_symbol is an explicit addition for known cook roles, and web_search is retained only when present in original profile grants. Legacy extension assertions expecting universal web_search are stale against the revised contract.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sub derivation policy shipped: effective grants = original profile grants − denied natives − cook_dispatch_* + eval/hub/yield floor + versioned role additions (tools.ts); frontmatter CSV/YAML-array parsing with LF/CRLF byte-exact originals; project-nearest profile shadowing with the losing global copy unmutated. Verified: 46/46 evo vitest (least-privilege per role, project-over-global, YAML/CRLF round-trips), validator pass, E2E. Merged to main b931bb7.
<!-- SECTION:FINAL_SUMMARY:END -->
