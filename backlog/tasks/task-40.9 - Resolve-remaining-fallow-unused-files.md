---
id: TASK-40.9
title: Resolve remaining fallow unused files
status: Done
assignee: []
created_date: '2026-08-28 17:06'
updated_date: '2026-08-28 17:52'
labels:
  - chore
  - investigation
milestone: m-3
dependencies: []
references:
  - TASK-40.3
parent_task_id: TASK-40
priority: low
type: chore
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate the two remaining unused-file findings and make an evidence-backed disposition. Fallow evidence: plugins/ultra-compact/extensions/utils.ts:1-125 has 125 lines and zero importers, appearing to be a pre-refactor leftover; plugins/experiences/extensions/agent-experience/src/semantic/openai-compatible.ts:1 is a one-line stub, but is referenced by scripts/check-agent-experience-source.mjs and UPSTREAM.json provenance and therefore requires an upstream/ownership decision before deletion. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The ultra-compact utils.ts:1-125 disposition is confirmed by importer and plugin-owner evidence, then the file is removed or retained with a documented reason.
- [ ] #2 The agent-experience semantic/openai-compatible.ts:1 provenance references are checked and an upstream-compatible disposition is recorded; it is not deleted solely from the zero-importer result.
- [ ] #3 The resulting fallow dead-code report no longer has an unexplained unused-file finding, or the intentional baseline/exception rationale is documented.
- [ ] #4 Relevant plugin checks pass after the chosen dispositions.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow unused-file findings; provenance-kept semantic stub explicitly requires owner/upstream decision; milestone m-3.

Confirmed plugins/ultra-compact/extensions/utils.ts has no downstream imports via CodeSight blast radius and no references from its four exports outside itself via code-nav; AST scans across plugins/ and test/ found no direct or string-based consumers. Coordinator removed the dead file. Kept plugins/experiences/extensions/agent-experience/src/semantic/openai-compatible.ts as the intentional one-line `export {}` upstream-managed provenance stub because scripts/check-agent-experience-source.mjs and UPSTREAM.json reference it; no deletion attempted.

Verification: AST confirmed the provenance file still contains exactly `export {};`; focused backlog registration tests passed. The requested backlog-doc-contract test path is absent from this checkout, while the broader backlog smoke run only hits the pre-existing TASK-39 overlay-hook failure.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ultra-compact/extensions/utils.ts deleted (triple-verified zero consumers: codesight blast radius, AST scan, string-reference scan). semantic/openai-compatible.ts retained (1-line upstream provenance stub, referenced by check script + UPSTREAM.json) — intentional keep recorded. Verified: fallow unused files 74→1 (provenance-keep only).
<!-- SECTION:FINAL_SUMMARY:END -->
