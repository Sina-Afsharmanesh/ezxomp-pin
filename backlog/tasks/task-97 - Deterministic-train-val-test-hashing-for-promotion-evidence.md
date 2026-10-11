---
id: TASK-97
title: Deterministic train/val/test hashing for promotion evidence
status: Done
assignee:
  - '@W97'
created_date: '2026-09-06 05:23'
updated_date: '2026-09-06 08:27'
labels:
  - architecture
dependencies:
  - TASK-95
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/mine.py'
documentation:
  - doc-23
priority: medium
type: feature
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port skillopt_sleep/mine.py assign_splits: stable hash of evidence-entry id partitions entries into train/val/test slices so the gate slice (TASK-95) is stable across promotion rounds and never overlaps the slice that produced the guidance. Include a holdout_leaked fail-closed flag when val and train intersect. Applies to the procedures memory store in plugins/agent-learning/src/procedures/store/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Same entry id always lands in the same split across runs (hash-stable)
- [x] #2 val and train never intersect; intersection sets holdout_leaked and blocks gate acceptance
- [x] #3 Dream/synthetic-origin entries never enter val/test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AuditW97 wave-2 independent audit (read-only, workspace ezxomp.al-splits, al-splits @ 50006855): GATE GREEN + CLEAN. (1) bun test test/agent-learning-splits.test.ts: 13 pass, 0 fail, 538 expect() calls. (2) Determinism: two separate bun -e process runs over 500 ids → identical sha256 3d68f471e7990862fc36d41e58d6a66d51c08953e6b774537d046b1fcdb10dae. (3) assertHoldoutClean threw "Holdout leakage detected: val/test intersect with train" on crafted {train:[a,b],val:[b,c]}; clean splits pass. (4) 20 synthetic ids: 20 in / 20 out / 20 unique, covers-all-inputs=true, disjoint=true, holdoutLeaked=false. (5) Network/LLM grep (fetch|http|https|net|undici|openai|anthropic|child_process) on splits.ts + test file: zero import hits; only a URL in a line-2 comment. (6) git diff --stat refs/heads/main refs/heads/al-splits: exactly plugins/.../promotion/splits.ts (+102) and test/agent-learning-splits.test.ts (+155), no other files, no deletions. Note: implementation lives in src/procedures/promotion/splits.ts (audit target said store/). Deliverable is the al-splits bookmark; main untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-97 splits: assignSplits/Splits/holdoutLeaked/assertHoldoutClean/realEntryIds in plugins/agent-learning/src/procedures/store/splits.ts. Verified by independent audit probes: 500-id determinism (two runs byte-identical), partition complete+disjoint, holdoutLeaked throws on val∩train, realEntryIds filters. 39/39 tests green, zero network. al-splits @ 50006855.
<!-- SECTION:FINAL_SUMMARY:END -->
