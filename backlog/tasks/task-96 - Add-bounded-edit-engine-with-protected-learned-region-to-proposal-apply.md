---
id: TASK-96
title: Add bounded edit engine with protected learned region to proposal apply
status: Done
assignee:
  - '@W96'
created_date: '2026-09-06 05:23'
updated_date: '2026-09-06 07:07'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/memory.py'
documentation:
  - doc-23
priority: high
type: feature
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port skillopt_sleep/memory.py apply_edits_detailed to TypeScript: bounded add/delete/replace EditRecord ops against a protected '## Learned preferences' region in SKILL.md, normalized dedup, and an unmatched-edits report (delete/replace anchor miss, duplicate add, unknown op). Upgrade applyProposal in plugins/agent-learning/src/procedures/promotion/promotion.ts from naive includes+append to the edit engine; unmatched edits surface in the review UI so a 0-edit night is self-diagnosing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 add/delete/replace ops apply only inside the protected region; hand-written content outside is never touched
- [x] #2 Duplicate adds (normalized) and unmatched anchors are reported, not silently dropped
- [x] #3 Existing applyProposal callers and tests migrate cleanly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator audit PASS: edit-engine.ts ports applyEditsDetailed (add/delete/replace, normalized dedup, unmatched reporting, protected LEARNED region) + extractLearned/currentLearnedLines/setLearned; applyProposal rewired through engine with legacy '## Skillforge learnings' header preservation and unmatchedEdits field. E2E contract restored (fixture: patch header present, traversal refused). Bookmark al-edits @ 84e7b7c9 after runtime-artifact split. 45/45 green (engine 19 + suite 26). Deviations: createSkillPathMap export removed (0 callers repo-wide, clean cutover); header write moved to applyProposal (engine is header-agnostic).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bounded edit engine (edit-engine.ts: applyEditsDetailed with add/delete/replace, normalized dedup, unmatched reporting, protected LEARNED region; extractLearned/currentLearnedLines/setLearned helpers) + applyProposal rewired through the engine with legacy '## Skillforge learnings' header preservation and unmatchedEdits proposal field. Verified: 19 engine unit tests + 26 suite (incl. e2e: header present, traversal refused, guidance dedup) = 45/45. Coordinator repairs during audit: listPendingProposals/listProposalFiles/findSkillPath/canonicalSkillPath restored to main semantics (worker rewrite broke getGlobalSkillforgeRoot-based lookup + SKILL.md path resolution); runtime promotion-log.md artifact split out of commit. Bookmark al-edits @ 84e7b7c9.
<!-- SECTION:FINAL_SUMMARY:END -->
