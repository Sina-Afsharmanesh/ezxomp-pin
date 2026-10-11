---
id: TASK-31.2
title: Fix backlog tools.ts type-debt (pattern application)
status: Done
assignee: []
created_date: '2026-08-27 07:13'
updated_date: '2026-08-27 08:14'
labels: []
dependencies: []
parent_task_id: TASK-31
type: bug
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply established pattern to plugins/backlog/extensions/tools.ts: 217 errors (36 TS2322 + 181 TS18046 params unknown). Follows lean-ctx pattern ticket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/backlog contributes 0 tsc errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied TASK-31.1 pattern to plugins/backlog/extensions/tools.ts: 36x pi.registerTool<TSchema>({ ... }) with parameters: Type.Object({...}) as unknown as TSchema; added import type { TSchema } from "@oh-my-pi/pi-ai". Generic alone fixed all 36 TS2322 but Static<TSchema> resolves to unknown (TSchema is a union), so 181 TS18046 remained; added minimal per-handler params type annotations (30 handlers, shapes derived 1:1 from each TypeBox schema, e.g. { title: string; description?: string; ... }). Before: 294 total errors (217 backlog tools.ts + 77 cook). After: 77 total (0 backlog, 0 lean-ctx, 77 cook untouched). Verified: bunx tsc --noEmit --pretty false; grep -c plugins/backlog/ = 0; no new errors elsewhere.

JUDGE REVIEW: PASS. 36/36 registerTool sites cast-boundary verified; systematic per-field shape audit 36 OK / 0 FAIL (sampled task_create 18 fields, task_edit 23 fields incl number[], optional unions) — hand-derived params faithful to TypeBox schemas, no drift. Compile-time-only confirmed; consistent with 31.1 pattern; no scope creep. FOLLOW-UP recorded: consider Static<typeof schema> or codegen for single-source-of-truth on future schema edits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog plugin tools.ts now contributes 0 tsc errors (was 217: 36 TS2322 + 181 TS18046). Pattern: registerTool<TSchema>+boundary casts (36x), plus faithful per-handler params annotations where Static<TSchema>=unknown (30 handlers). Repo total 294->77, only cook remains. Independently judged PASS.
<!-- SECTION:FINAL_SUMMARY:END -->
