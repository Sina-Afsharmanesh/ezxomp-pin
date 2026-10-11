---
id: TASK-52.3
title: Fire pushDagr on every store-mutating commit site (E1)
status: To Do
assignee: []
created_date: '2026-08-29 02:20'
updated_date: '2026-08-29 04:42'
labels: []
dependencies:
  - TASK-52.2
  - TASK-52.4
  - TASK-52.7
parent_task_id: TASK-52
priority: high
type: task
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pushDagr is currently invoked ONLY at cook_claim (cook-tools.ts:1457) and cook_release (:1487) — verified via AST search of all pushDagr(ctx) call sites; all other store-mutating commits never re-publish (G1). Enumerated mutation sites needing `void pushDagr(ctx)` after their commit: cook_next/claimNext (setStore at cook-tools.ts:986; also its runBacklogCli 'task edit -s In Progress' status mutation), cook_decompose (setStore at :864), cook_dispatch_validator (appendIntent at :735 region), cook_dispatch_refute (journalAppend refute at :1589), cook_claim/journal AppendReceipts — plus cook_journal tool record path (:1557), cook_rewind/stop/reset (optional, cheap), keep-scope: do NOT add pushDagr to cook_config watchlist/widget paths. Insert AFTER the setStore/journalAppend call so the projection observes post-commit state (same pattern as :1457). Fire-and-forget void pushDagr(ctx) in every execute that receives ctx; dispatch tools currently take _ctx (unnamed) at :617/:667/:699 — rename to ctx. Keep the tmp→check→rename producer loop (publishRunDoc) and silent-disable contract untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pushDagr is invoked (fire-and-forget, void) after the commit in cook_next claim path, cook_decompose, cook_dispatch_planner/scout/researcher/worker/validator/judge/refute/audit payload builds, and cook_journal — matching the existing cook_claim/cook_release pattern (fire after commit, never awaited into the result path)
- [ ] #2 no pushDagr call added before the store/state mutation it reflects; failures remain silent (existing try/catch contract in pushDagr at cook-tools.ts:117)
- [ ] #3 no new calls to pushDagr inside dispatch-failure paths (payload.ok false → no commit → no projection)
- [ ] #4 cook suite (bunx vitest run in plugins/cook) passes with the widened triggers; no new lint/type errors in touched files
- [ ] #5 agents.ts and plugins/cook/agents/* templates untouched (Worker51c lane protection; verified by not importing or editing those paths)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dependency order revised: run after both locator and kind/project projections to avoid reworking the shared producer path.

Dependency order revised again for user-priority sync repair: reuse the TASK-52.7 turn-boundary refresh seam before widening mutation triggers.
<!-- SECTION:NOTES:END -->
