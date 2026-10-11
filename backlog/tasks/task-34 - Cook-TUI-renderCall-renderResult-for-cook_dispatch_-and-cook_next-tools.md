---
id: TASK-34
title: 'Cook TUI: renderCall/renderResult for cook_dispatch_* and cook_next tools'
status: Done
assignee: []
created_date: '2026-08-27 14:57'
updated_date: '2026-08-28 04:42'
labels:
  - feature
  - design
milestone: m-1
dependencies: []
priority: medium
type: feature
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve transcript readability for cook orchestration tools by supplying OMP tool call/result renderers. Add compact renderCall output for every cook_dispatch_planner/scout/researcher/worker/validator/judge tool and cook_next, identifying the role/stage and task. Add renderResult output that shows a concise status/count summary when collapsed and the useful structured envelope when expanded. Renderers must follow @oh-my-pi/pi-tui width/sanitization contracts and remain safe for partial/in-progress results.

Primary files: plugins/cook/extensions/cook-tools.ts and a shared renderer helper if it removes duplication; focused tests under plugins/cook/tests/. Do not alter tool execution semantics, approval behavior, or result payloads.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every cook_dispatch_* tool and cook_next exposes renderCall output identifying the operation, role/stage, and task when available.
- [x] #2 Collapsed renderResult output is a compact status line with meaningful counts/next action; expanded output retains the useful result details without changing the tool payload.
- [x] #3 Partial/running/error results render stable activity/error states and do not throw on missing optional details.
- [x] #4 All renderer rows sanitize tabs and truncate/wrap ANSI-aware text to the supplied width; narrow widths never throw or intentionally overflow.
- [x] #5 Unchanged render state can reuse the same row-array reference, and changed state returns new rows consistent with the Component contract.
- [x] #6 Focused tests cover every dispatch role, cook_next, collapsed/expanded/partial/error states, narrow widths, and missing details.
- [x] #7 Tool execution, persistence, approval, and orchestration behavior remain unchanged.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Renderer tests assert observable rows at representative and narrow widths.
- [ ] #2 Implementation notes document the shared formatter and field fallback order.
- [ ] #3 No renderer uses raw string length for terminal width decisions.
- [ ] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory all cook_dispatch_* and cook_next registerTool definitions in plugins/cook/extensions/cook-tools.ts and inspect ToolDefinition renderCall/renderResult signatures plus existing renderer patterns. Risk: adding renderers must not alter execute, approval, persistence, or orchestration behavior.
2. Extract a small shared formatter that normalizes role/stage/task/status/count fields and handles missing, partial, and error details without throwing.
3. Add renderCall and renderResult to every required dispatch role and cook_next; use options.expanded/isPartial/spinnerFrame for collapsed activity versus expanded detail while preserving the original result payload.
4. Ensure returned Component rows sanitize tabs and use visible-width-aware truncate/wrap helpers; preserve stable row-array references only when content is unchanged.
5. Add focused tests for each role, cook_next, collapsed/expanded/partial/error states, missing details, representative widths, and narrow widths; run them before recording AC evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: exact tool inventory, renderer lifecycle states, width/sanitization contract, stable-row requirement, and execution-semantics non-goals are explicit.

WT provenance: implementation assigned to branch `task-38-renderer` at `../ezxomp.task-38-renderer`, created via `wt switch --create task-38-renderer --no-cd --no-hooks -y` from main commit 7194001. Changes remain owned by TASK-34 and will be merged locally only after independent validation and conflict review.

Finalization (coordinator): implemented in WT branch task-38-renderer (commit b29de4ba), merged to main merge dd7c6e70. renderCall/renderResult for all 6 cook_dispatch_* + cook_next via cookToolRenderers; StableCookRows stable row refs; sanitizeCookText + fitCookRows ANSI-aware tab-safe narrow-safe; partial/expanded/error states defensive; tool execute/approval/persistence unchanged (extracted claimNext only reuses transition).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Renderers + DAG overlay implemented in WT task-38-renderer (b29de4ba), merged to main dd7c6e70. Files: plugins/cook/extensions/renderers.ts (new), cook-tools.ts, tests/renderers-dag.test.ts (19 runner-agnostic tests), tests/__mocks__/pi-tui.ts + vitest alias, CHANGELOG. Verified: plugin tsc exit 0; vitest 18 files 140/140; bun test plugins/cook 116/116; repo just verify 378 pass / 0 fail.
<!-- SECTION:FINAL_SUMMARY:END -->
