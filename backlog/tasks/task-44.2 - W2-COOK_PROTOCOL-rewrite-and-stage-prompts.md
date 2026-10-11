---
id: TASK-44.2
title: 'W2: COOK_PROTOCOL rewrite and stage prompts'
status: Done
assignee: []
created_date: '2026-08-28 18:50'
updated_date: '2026-08-28 20:07'
labels: []
dependencies: []
parent_task_id: TASK-44
priority: high
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite COOK_PROTOCOL in plugins/cook/extensions/constants.ts and stage prompts in extensions/prompts.ts per plan Part 2 (Protocol text section). New/rewritten sections: The loop (journal intent before EVERY specialist dispatch + two resume rules verbatim from upstream Item 3), Parallel judgments (review + verify concurrent), Parallel refutes (one fresh source-bound refute per finding, blind, any recording order), Dual review (complexity: complex fans two decorrelated cook-judge briefs, pass requires both, blocking set union dedupe stricter class), Context packets (facts-only, ownership, exact caveat: 'a map, not an authority: use it to skip discovery; verify only entries you rely on; correct stale facts if writable, otherwise report them'), Kickbacks (typed findings contract, scoped-repair rule, INV-12 anchor: gate always re-runs), Escalation (bonus cycle then unconditional council), Follow-up ledger (Backlog doc convention 'Cook Follow-ups', one-line format), Drain (upstream Item 7 steps 1-8 adapted to jj workspaces + Backlog + maxParallelTasks), Red gate (no judgment on red gate), AC integrity (pass rejected when AC ok=false), Pane (herdr-dagr detection, one-time mention, view never gate). Tests: tests/protocol-prose.test.ts payload-hygiene style: caveat string exact-match, resume rules present, drain steps present, packet facts-only contract, extend tests/smoke.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 COOK_PROTOCOL contains all 12 new sections with exact caveat string
- [x] #2 Resume rules state: dangling specialist intent -> fresh dispatch never counted; dangling external intent -> query external system first
- [x] #3 Prose tests pin every new rule string; smoke test passes
- [x] #4 No conclusions-allowed language in packet contract
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented via worker W2 artifact relay (evo-mode tool blocking) + coordinator application. COOK_PROTOCOL rewritten: 15 sections (12 new + 3 preserved), exact caveat contiguous (unwrapped from line-wrap for exact-match), all resume/drain/refute/kickback/red-gate/AC-integrity strings verified. prompts.ts: planner 11-15 (packet ownership, complexity, plan-split, fake-edge), worker 9-10, validator 7-9, judge 3+7-9. protocol-prose.test.ts 5/5, smoke 7/7.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
COOK_PROTOCOL rewritten with all 12 new sections + 3 preserved; exact caveat pinned contiguous; prompts.ts updated for planner/worker/validator/judge. Verified by protocol-prose.test.ts 5/5 and smoke.test.ts 7/7 (prose tests pin caveat exact-match, both resume rules, all 8 drain steps, refute/dual-review/kickback/red-gate/AC-integrity strings).
<!-- SECTION:FINAL_SUMMARY:END -->
