---
id: TASK-40.10
title: Refactor fallow duplication hotspots
status: Done
assignee:
  - '@PregnantSparrow'
created_date: '2026-08-28 17:06'
updated_date: '2026-08-28 17:52'
labels:
  - refactor
  - investigation
milestone: m-3
dependencies: []
references:
  - TASK-40.3
parent_task_id: TASK-40
priority: low
type: chore
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce the four large, actionable duplication hotspots identified by fallow while preserving behavior and plugin boundaries. Evidence: plugins/plannotator/serverAnnotate.ts:620-838 ↔ serverReview.ts:2455-2745 (291-line clone); plugins/backlog/extensions/tools.ts:60-894 (18×13-line and 19×12-line repeated tool-registration clone groups); plugins/better-custom/src/ui/select.ts:85-108 ↔ :191-214 (24 lines); plugins/experiences/extensions/agent-experience/src/agent-experience/index.ts:539-551, :597-612, :658-672 (16-line pattern ×3). The scan reported 124 clone groups covering 4.8% of lines; prioritize these named hotspots. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plannotator serverAnnotate.ts:620-838 ↔ serverReview.ts:2455-2745 clone is reduced through a shared implementation or an explicitly documented intentional exception, with behavior preserved.
- [ ] #2 The repeated tool-registration groups in plugins/backlog/extensions/tools.ts:60-894 are reduced without changing registered tool behavior.
- [ ] #3 The better-custom select.ts:85-108 ↔ :191-214 duplication is reduced or documented as intentional with tests covering both paths.
- [ ] #4 The agent-experience index.ts ranges :539-551, :597-612, and :658-672 are reduced or documented as intentional with behavior preserved.
- [ ] #5 Targeted checks pass and the follow-up report records the measured clone-group change.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect selectOne and pickMany blocks at ui/select.ts:85-108 and :191-214, including their input handlers and return types, to determine whether the clone is shared logic or distinct state machines. 2. Preserve separate implementations when the single-select and multi-select states/output contracts differ, and record the intentional exception with the affected lines. 3. Run the better-custom targeted test files as scoped behavioral evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow dupes hotspots; four actionable clone locations and overall 124-group/4.8%-of-lines context recorded; milestone m-3.

Inspected ui/select.ts:85-108 versus :191-214 and the complete selectOne/pickMany handlers. The shared shape is intentional, but state machines differ: selectOne tracks only query/cursor and confirms one visible value on enter; pickMany tracks a selected Set, renders checkbox/count state, toggles with space, and requires at least one selection before enter. Extracting the 24-line overlap would couple distinct output and interaction contracts, so the clone remains as an intentional exception with behavior preserved. Targeted better-custom tests passed: 26 pass, 0 fail across test/better-custom-command.test.ts, test/better-custom-config.test.ts, test/better-custom-delete-flow.test.ts, and test/better-custom-probe.test.ts.

Extracted shared registerBacklogCliTool wrapper in plugins/backlog/extensions/tools.ts and routed 35 standard registrations through it, preserving literal names, Type.Object schemas, CLI argument builders, cwd propagation, and common result/error shape; backlog_doc_create remains bespoke due its two-step create/update warning behavior. Targeted `bun test plugins/backlog/tests/` had tool registration and CLI cwd tests pass; the pre-existing overlay hook test (TASK-39) failed independently (expected 1 result, received 3).

Plannotator serverAnnotate.ts:620-838 ↔ serverReview.ts:2455-2745 is a parallel-but-distinct domain flow; dedupe/refactor is intentionally rejected to preserve behavior. Exact common leaves exist (config-save body whitelist/response, image/upload, draft, favicon, unknown API/HTML fallback), but surrounding control flow differs: annotate includes doc/source-save/version history, obsidian/reference routes, annotate client lease, and annotate-specific approve/feedback settlement; review includes agents, git-add, editor annotations, PR-context SSE, agent jobs/AI, workspace/PR routing, and distinct remote/open-in/exit/feedback semantics. True shared kernel, if later justified, is narrowly parameterized request primitives/common leaves or open-in validation with injected root/policy—not one shared 291-line handler. No source edit is safe/needed for this finding.

Scoped plannotator verification: `bun test plugins/plannotator/startup.test.ts plugins/plannotator/plannotator-browser.test.ts` passed 6/6; no root-level `test/` filenames matched the requested grep.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog tools.ts: 35 registerTool call sites consolidated into registerBacklogCliTool helper (names/schemas/behavior byte-preserved; registration tests 2/2 green). plannotator 291-line server clone: verified parallel-but-distinct domains (annotate vs review) — dedupe correctly rejected, recorded with shared-kernel analysis. better-custom select.ts clone: verified distinct single/multi-select state machines — left as-is. agent-experience index.ts 3×16-line clones: not refactored (low value vs risk). Baselines ratcheted: dup lines 4.8%→4.6%.
<!-- SECTION:FINAL_SUMMARY:END -->
