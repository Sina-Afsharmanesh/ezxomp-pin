---
id: TASK-60
title: >-
  Umbrella: resolve remaining m-0 P1 backlog via multi-workspace parallel
  execution
status: Done
assignee: []
created_date: '2026-08-24 16:59'
updated_date: '2026-08-24 17:54'
labels:
  - orchestration
  - multi-workspace
  - m-0
milestone: m-0
dependencies: []
priority: high
type: task
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Orchestration ticket: pick up pending m-0 backlog left by the stalled session and drive it to merged-on-main + push-ready, exercising multi-workspace durability as validation.

Remaining tickets (To Do):
- TASK-23 [HIGH] Teaching skill for lean-ctx tool efficiency -> workspace quiet-wren
- TASK-24 [HIGH] Teaching skill for eval tool efficiency -> workspace bold-ibis
- TASK-25 [MED] Skillforge auto-capture of lean-ctx/eval usage patterns -> workspace swift-tern
- TASK-26 [MED] Experiences-backed .lean-ctx.toml tuning recommendations -> workspace calm-heron

Method: one jj workspace per task (recipe: ezxomp-jj-workspace), parallel cook-worker subagents, orchestrator merges each back into local main, single full gate after merges, push-readiness verdict recorded here. Baseline commits: 3c99b476 (docs(jj)), a1d9622 (planning artifacts sync).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-23, TASK-24, TASK-25, TASK-26 all implemented in separate jj workspaces and status moved past To Do only after objective verification
- [ ] #2 Each workspace change merged back into local main without losing unrelated changes; main bookmark fast-forwarded
- [ ] #3 Full pre-merge gate (just verify: tsc --noEmit + bun test test/) passes on merged main
- [ ] #4 Push-readiness assessed via prek run --all-files equivalent and documented on this ticket
- [ ] #5 Multi-workspace durability observations recorded (what worked, what needed manual intervention)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-24 17:54
---
RESOLVED. Verdict: **push-ready**. Final main tip chain: docs(jj) -> chore(backlog) sync -> feat T23 (04891f33-line rebuilt linear) -> T24 -> T25 (256c7dbb) -> T26 (c256692f) -> chore(bookkeeping) (9252c2b9) -> style(prek) idempotency sweep (6a7abec7) -> chore(prek) exempt cook-state (83cbd5c4-line). Gates: `just verify` = 374 pass / 0 fail; `prek run --all-files` (from anchored keen-merlin on main tip) = exit 0, all hooks Passed. AC#1-3 done; #4 this comment; #5 observations in docs/jj-git-integration.md 'Multi-workspace execution' section.
---

created: 2026-08-24 17:54
---
Durability findings (validated live): (1) snapshot a workspace before any squash-from-ws or its diff is invisible; (2) `update-stale` DELETES never-snapshotted files - back up first (one SKILL.md lost+recovered); (3) set JJ_EDITOR for scripted jj mutations; (4) keep watcher-churn files out of task commits or conflicts cascade; (5) plain-git tools (prek included) cannot run from primary root due to core.worktree stub - anchored workspaces are the plain-git surface and worked flawlessly throughout.
---
<!-- COMMENTS:END -->
