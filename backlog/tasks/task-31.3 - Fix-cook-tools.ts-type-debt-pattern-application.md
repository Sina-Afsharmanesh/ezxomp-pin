---
id: TASK-31.3
title: Fix cook-tools.ts type-debt (pattern application)
status: Done
assignee: []
created_date: '2026-08-27 07:13'
updated_date: '2026-08-27 08:43'
labels: []
dependencies: []
parent_task_id: TASK-31
type: bug
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply established pattern to plugins/cook/extensions/cook-tools.ts: 77 errors (22 TS2322 + 55 TS18046). Same pattern as backlog ticket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/cook contributes 0 tsc errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied TASK-31.1/31.2 pattern to plugins/cook/extensions/cook-tools.ts: added `import type { TSchema } from "@oh-my-pi/pi-ai"`; all 22 `pi.registerTool({` sites now `pi.registerTool<TSchema>({`; every `parameters: Type.Object({...})` closed with `as unknown as TSchema`; 17 handlers with params usage annotated with shapes derived 1:1 from their TypeBox schemas (cook_config, cook_propose, cook_start, cook_adhd_diverge, cook_adhd_focus, cook_dispatch_planner/scout/researcher/worker/validator/judge, cook_decompose, cook_install, cook_validate, cook_reset, cook_rewind, cook_watch). No schema reshaping, no new deps, no other plugin touched. Evidence: before = 77 errors in cook-tools.ts (TS2322/TS18046); after = `bunx tsc --noEmit --pretty false` exits 0, output 0 lines, `error TS` count 0 repo-wide.

JUDGE REVIEW: PASS, no blocking findings. 6/17 annotations sampled incl nested cook_decompose/cook_adhd_focus — all 1:1 vs TypeBox schemas; runtime-change audit via diff: only type-level lines (import/generic/cast/params annotations), zero body edits; cross-package @ezxomp/backlog import type-healthy with no suppressions. FOLLOW-UP noted: cook_install scope fallback dead-code alignment (cosmetic).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-27 08:24
---
JUDGE REVIEW_PASSED (2026-08-27): Verified TASK-31.1/31.2 pattern applied correctly to plugins/cook/extensions/cook-tools.ts — 22x registerTool<TSchema> + 22x as unknown as TSchema + 17 typed handlers (5 no-param _params untouched). Sampled 6/17 param shapes vs TypeBox: cook_decompose (nested arrays/optionals exact), cook_dispatch_worker (task_id+plan?), cook_config (7-literal union), cook_propose, cook_adhd_focus (traps[]), cook_watch (6 literals) — all 1:1. Runtime audit: git diff -U0 shows only type erasures (import type TSchema, generic, cast, param types) + verbatim helpers re-export via @ezxomp/backlog (workspace:* dep, helpers identical to HEAD), no logic changes. No ts-ignore/as any (grep 0). Repo-wide bunx tsc --noEmit EXIT:0 error TS 0, cook-tools.ts 0. Follow-up non-blocking: cook_install fallback ??"personal" dead code vs required scope.
---

created: 2026-08-27 08:34
---
[REVIEW_PASSED] TASK-31.3 verified: 22x registerTool<TSchema> + 22x as unknown as TSchema + 17 handlers (5 no-param untouched), 6/6 sampled shapes fidelity exact (cook_decompose nested arrays/optionals, cook_dispatch_worker, cook_config, cook_propose, cook_adhd_focus, cook_watch), runtime audit diff shows only type erasures, import @ezxomp/backlog verbatim re-export, tsc EXIT:0, error TS 0, no suppression (grep 0), follow-up cook_install dead fallback
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
cook-tools.ts now contributes 0 tsc errors (was 77). Repo-wide tsc is ZERO for the first time this session. Pattern application identical to 31.1/31.2; independently judged PASS.
<!-- SECTION:FINAL_SUMMARY:END -->
