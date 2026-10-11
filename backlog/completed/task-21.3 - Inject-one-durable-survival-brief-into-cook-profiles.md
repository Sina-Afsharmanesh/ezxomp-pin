---
id: TASK-21.3
title: Inject one durable survival brief into cook profiles
status: Done
assignee: []
created_date: '2026-08-22 13:07'
updated_date: '2026-08-22 14:03'
labels:
  - feature
  - refactor
dependencies:
  - TASK-21.2
parent_task_id: TASK-21
priority: high
type: feature
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the six cook profile bodies carry the mandatory Main-reporting and proven survival instructions while evo-sub is active. Snapshot originals before mutation so user-authored profile bodies return exactly after off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /evo-sub on changes only cook-judge.md, cook-planner.md, cook-researcher.md, cook-scout.md, cook-validator.md, and cook-worker.md; unrelated agent profiles remain byte-identical
- [x] #2 Each selected profile has tools: eval, hub and exactly one stable marked body block after activation
- [x] #3 The block requires hub reports to Main for findings, status, and blockers at milestones and on completion
- [x] #4 The block states all three survival patterns: supplied evidence means no exploration homework, a file change lands within about three tool calls, and one agent owns one file
- [x] #5 Reapplying the profile transformation does not duplicate or corrupt the marked block, and /evo-sub off restores every selected original byte-for-byte
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-21.3 implemented (worker EvoW23). Changed files: extensions/evo/frontmatter.ts (+injectEvoSubInstructions export, +EVO_SUB_BRIEF_START/END constants), extensions/evo/evoSub.ts (COOK_SUB_PROFILES six-name allowlist filter in activate(); injection step `const next = injectEvoSubInstructions(fmNext)` after rewriteToolsFrontmatter; import updated; header doc refreshed).

Brief block content: hub reporting to Main for findings/status/blockers at milestones and on completion; pre-digested evidence / no exploration homework; file change lands within about 3 tool calls; single-file ownership. Idempotence via start-marker guard.

Verification: bun run test -- tests/extension.test.ts => 19 passed / 1 failed (20). Tests 7, 15, 16 now GREEN. Only failure is test 18 'ReferenceError: seedProfiles is not defined' at tests/extension.test.ts:525 — broken helper owned by TASK-21.4, intentionally not touched per ticket boundary. Seams untouched: tools.ts, index.ts, substate.ts, paths.ts, and no profile .md edited on disk.

Backup before edit: /home/egsox/.omp/agent/evo-mode/worker-backups/TASK-21.3/2026-08-22T13-51-14-570Z/ (evoSub.ts + frontmatter.ts copies, manifest.sha256 with sha256sums).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-22 14:00
---
[judge][FOLLOW-UP] frontmatter.ts:88 idempotence guard uses includes(EVO_SUB_BRIEF_START): a user-authored profile body that already contained the literal marker would silently skip brief injection while still getting tools rewritten (non-corrupting, probability ~0 given namespaced HTML comment). Optional hardening: also require EVO_SUB_BRIEF_END presence, else strip-and-reinject.
---

created: 2026-08-22 14:00
---
[judge] VERDICT REVIEW_PASSED for TASK-21.3: six-name COOK_SUB_PROFILES filter (unrelated .md byte-identical, missing profile tolerated, dir-read failure refused); snapshots captured pre-injection (orig read before rewrite+inject) so /evo-sub off restores exact bytes incl. trailing newlines; triple idempotence (active flag, state-file refusal, start-marker guard); brief text matches operator wording (findings/status/blockers to Main via hub at milestones and completion) plus all three survival patterns; tests 7/15/16 green.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Survival-brief injection delivered: extensions/evo/frontmatter.ts exports EVO_SUB_BRIEF_START/END markers + injectEvoSubInstructions (idempotent via start-marker guard; brief carries hub-to-Main duty for findings/status/blockers at milestones+completion plus all three survival patterns); extensions/evo/evoSub.ts restricts activation to exactly the six cook profiles (COOK_SUB_PROFILES; unrelated .md byte-identical, missing profile tolerated, dir-read failure refused) and composes injection after the tools rewrite; off restores byte-exact originals from pre-injection snapshots. Tests 7/15/16 green -> suite 20 tests / 19 pass / 1 fail (test 18 = TASK-21.4 seam). Batched judge round (with TASK-21.2): REVIEW_PASSED, 0 blocking; 2 follow-ups recorded (boundary-witness sha256 baselines for index/evoMain/config -> fold into TASK-21.5 verification manifest; marker-collision skip semantics -> optional hardening, non-corrupting). Backups: worker-backups/TASK-21.3/2026-08-22T13-51-14-570Z/.
<!-- SECTION:FINAL_SUMMARY:END -->
