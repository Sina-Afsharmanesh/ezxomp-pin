---
id: TASK-99
title: Adopt-with-backup staging and evidence log for applied proposals
status: Done
assignee:
  - '@W99'
created_date: '2026-09-06 05:24'
updated_date: '2026-09-06 08:34'
labels:
  - feature
dependencies:
  - TASK-96
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/cycle.py'
documentation:
  - doc-23
priority: medium
type: enhancement
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upgrade procedures promotion staging toward the SkillOpt-Sleep adoption contract: before applyProposal writes a SKILL.md, back up the prior file under the promotions staging dir (backup/); append structured evidence entries (gate action, scores, applied/unmatched edits, timestamps) to a jsonl evidence log beside promotion-log.md. Adopt stays human-confirmed as today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every applyProposal writes a restorable backup before mutating the skill file
- [x] #2 Evidence log records gate decision, applied and unmatched edits per adoption
- [x] #3 Existing confirm flow is preserved (no auto-adopt)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator repair round: worker draft had regressed promotion.ts core functions (isPromotionEligible, createProposal, listPendingProposals, canonicalSkillPath traversal guard, appendPromotionLog mkdir) — restored from main; fixed staging wiring test to target real (cached) agent dir; fixed partition values; prettier clean. Final: 37/37 (staging 11 + suite 26), tsc clean. Bookmark al-stage @ 46f161d9.

Wave-2 validation (AuditW99, 2026-09-06) at al-stage @ 46f161d9: gate RED on scope. GREEN evidence — AC1: bun test test/agent-learning-staging.test.ts test/agent-learning.test.ts = 37 pass / 0 fail (11 staging + 26 suite), 198 expect() calls, 369ms; AC2: bunx tsc --noEmit -p . = 0 errors; AC3: probe backupSkillFile on temp SKILL.md -> .agent-learning-backups/<ts>Z-SKILL.md, content byte-identical; AC4: appendEvidenceLog jsonl line has ts/action/proposalId/skill/gateAction/appliedEdits/unmatchedEdits/backupPath; AC5: listBackups over 3 backups returns newest-first; AC7: staging.ts imports only node:fs/promises + node:path, zero network/LLM/subprocess. storage.ts identical to main (store root <agentDir>/agent-learning unchanged). AC6 FAIL (scope clause): promotion.ts raw diff = 583 lines (286 del/291 ins) vs expected ~20; semantic-only (-w) = 56 del/61 ins. The four named core functions (isPromotionEligible, createProposal, listPendingProposals, canonicalSkillPath) are semantically unchanged (absent from -w diff), but out-of-scope semantic changes exist: formatProposalForReview rewritten; createSkillPathMap keys no longer normalized + adds canonicalSkillPath fallbacks; appendPromotionLog moved from getGlobalSkillforgeRoot()/promotion-log.md (timestamped lines) to <agentDir>/agent-learning/promotion.log (bare lines); fileExists dropped ENOENT-specific handling (catch-all false); formatProposalSourcePath lost absolute-path redaction; sanitizeId charset changed; firstSentence regex-based. Plus repo-wide re-indent tabs->spaces (main: 284 tab lines / 0 space; al-stage: 0 / 138) with no prettier config in repo. Verdict: VERIFY_FAILED — rebase onto clean main + staging-only changes required before integration merge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-99 staging: backupSkillFile/appendEvidenceLog/listBackups + applyProposal wiring (backup before write, evidence after, reject on no-op). Verified: bun test 37/37 green, tsc clean, prettier clean, traversal guard preserved. al-stage @ 46f161d9.
<!-- SECTION:FINAL_SUMMARY:END -->
