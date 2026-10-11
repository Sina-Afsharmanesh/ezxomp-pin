---
id: TASK-32.1
title: Cook widget renders chain and Backlog progress counts
status: Done
assignee: []
created_date: '2026-08-27 15:17'
updated_date: '2026-08-27 16:09'
labels:
  - feature
  - design
milestone: m-1
dependencies: []
parent_task_id: TASK-32
priority: high
type: feature
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the canonical cook status widget used above the editor. Replace the current one-line phase summary with a bounded multi-line presentation that can be repainted every frame without writing transcript history. It must derive the full stage sequence from the active chain pattern, resolve each stage owner/role, identify the current parent task, and calculate direct-child ready/done counts from @ezxomp/backlog task data. Keep a degraded watch/cookmode summary when task data is unavailable.

Primary files: plugins/cook/extensions/state.ts and its state/type helpers; focused coverage in plugins/cook/tests/tui-batch1.test.ts. Do not implement autocomplete, timestamps, title/working-message activity, or the separate DAG overlay here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 refreshWidget returns a plain string array with no more than 10 lines for active-chain, cookmode-only, empty-chain, and unavailable-task-data states.
- [x] #2 The active-chain output includes chain name, current parent task, active stage and role, plus one ✓/▶/○ marker for every stage in the configured chain pattern.
- [x] #3 Ready and done counts are derived from @ezxomp/backlog task data for the current parent; Done and Archived children count as done, and ready children have all non-parent dependencies terminal.
- [x] #4 Task-data reads are cached or generation-checked so a delayed result cannot repaint a different cwd or newer state; unavailable data leaves the widget usable.
- [x] #5 Every emitted line is terminal-width safe and the widget remains within the host setWidget string-array contract.
- [x] #6 setStoreFor invokes the widget refresh synchronously for every persisted state mutation that can affect displayed status.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused widget tests cover stage markers, role/name resolution, ready/done counts, empty states, fallback data, and the synchronous refresh contract.
- [x] #2 Implementation notes explain the Backlog filtering rules and stale-read protection.
- [x] #3 No orchestration or persistence semantics change outside the required widget refresh behavior.
- [x] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect plugins/cook/extensions/state.ts, types.ts, constants.ts, @ezxomp/backlog task helpers, and tests/tui-batch1.test.ts; confirm the stored stage representation and current UI lifecycle. Risk: chain state stores stage names rather than the pattern key.
2. Implement the smallest reusable widget/count helpers in state.ts: resolve the active chain pattern and role sequence, filter direct child TaskInfo records for the current parent, classify Done/Archived and ready dependencies, and retain a degraded fallback when task data is unavailable. Risk: asynchronous reads must not repaint a newer cwd/state.
3. Replace the one-line refreshWidget output with bounded plain string rows (≤10) containing identity, stage markers, watch status/activity, and ready/done counts; use ANSI-aware width utilities if styled content is introduced. Risk: widget is viewport-only and must never become transcript history.
4. Route every displayed-state mutation through synchronous setStoreFor refresh without changing persistence or orchestration semantics.
5. Run the focused widget contract tests at normal and narrow widths; record exact output and update notes/AC only from evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: explicit data source, filtering rules, stale-read risk, width/line contract, and focused verification are now recorded.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.1
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Use the newly enriched TASK-32.1 ticket as the source of truth. Implement only the widget/progress-count slice: inspect existing RED tests and current state/backlog APIs, implement bounded ≤10-line stage widget with ✓/▶/○ markers, canonical direct-child ready/done counts, stale-read protection, width safety, and synchronous setStoreFor refresh. Do not implement autocomplete, watch timestamps, title/working-message, headless guard, DAG overlay, or tool renderers. Do not author/weaken tests. Run the focused widget test only, append notes, and check only objectively verified AC.

Record all results on task TASK-32.1 via backlog_task_edit.

Implemented canonical widget rows in plugins/cook/extensions/state.ts. Counts now use direct children of the current task parent; Done/Archived are terminal, parent dependencies are ignored for readiness, and task IDs/statuses are normalized. Widget refresh paints cached/no-data state synchronously, then generation- and cwd-checks asynchronous getAllTasks results before caching/repainting. Focused verification: bun test plugins/cook/tests/tui-batch1.test.ts — 5 pass, 0 fail, 17 expect() calls.

Post-validation hardening: stale reads are invalidated on cwd/UI context changes, parent-task identity is used for rendered widget state, direct-child filtering is strict, and clipped rows sanitize control characters without splitting Unicode. Final focused run: bun test plugins/cook/tests/tui-batch1.test.ts — 5 pass, 0 fail, 17 expect() calls.

Worker implementation completed after ticket enrichment. Changed plugins/cook/extensions/state.ts and CHANGELOG.md. Added bounded multi-line chain widget with stage markers/roles/task identity, canonical Backlog direct-child ready/done counts with Done/Archived terminal handling, watch activity, synchronous repaint, cwd/generation stale-read guards, and Unicode/control-character-safe clipping. Focused verification: bun test plugins/cook/tests/tui-batch1.test.ts — 5 passed, 0 failed, 17 expect calls. Worker checked AC #2, #3, #6; remaining AC/DoD await independent review and broader evidence.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.1 via backlog_task_edit.

Independent judge verdict: REVIEW_PASSED with follow-ups, no blocking findings. Follow-ups: clip empty-chain widget path; make width handling adaptive/explicit for actual terminal width; distinguish unavailable task data from legitimate empty parent before watchList fallback; resolve parent identity consistently in composeWidgetLines; remove unused readyChildren import; add explicit empty/cookmode/unavailable/fallback/width-control/unicode tests; amend CHANGELOG entry with TASK-32.1, file/symbol, and focused test evidence. Do not mark task done until DoD test coverage is complete.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.1
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Address every non-blocking judge follow-up before completion. Fix state.ts empty-chain clipping, adaptive/explicit width safety, legitimate-empty versus unavailable task-data fallback, consistent parent resolution in composeWidgetLines, and unused import. Extend existing tests only (do not weaken them) for empty-chain, cookmode-only, unavailable/fallback counts, width/control/unicode clipping and parent resolution. Update CHANGELOG.md with TASK-32.1, state.ts references, and focused evidence. Run the focused widget test. Append notes and update AC/DoD only from objective evidence.

Record all results on task TASK-32.1 via backlog_task_edit.

Judge follow-up correction implemented: composeWidgetLines now clips/sanitizes empty-chain and active rows, accepts an explicit width bounded by exported WIDGET_MAX_WIDTH (160), and resolves the parent from the same task snapshot used for widgetCountsFor. Widget task reads now preserve unavailable (undefined) versus successful empty ([]), so watchList fallback is used only for unavailable data. renderWidget routes every state through the clipped plain-string array path; task snapshots retain generation/cwd guards. Focused verification: bun test plugins/cook/tests/tui-batch1.test.ts — 9 pass, 0 fail, 30 expect() calls. readyChildren remains a live syncFromBacklog dependency, so no used import was removed.

Worker corrected all judge follow-ups. Changed state.ts, tests/tui-batch1.test.ts, and CHANGELOG.md. Empty/cookmode paths now share clipping/sanitization; width handling is bounded by exported 160-column cap; unavailable task data is distinct from successful empty results; parent resolution is centralized; existing readyChildren import remains live for syncFromBacklog; focused tests cover all listed edge cases. Verification: bun test plugins/cook/tests/tui-batch1.test.ts — 9 passed, 0 failed, 30 expect calls.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.1 via backlog_task_edit.

Independent re-review passed with no blocking or follow-up findings. Evidence: bun test plugins/cook/tests/tui-batch1.test.ts — 9 passed, 0 failed, 30 expect calls. Judge verified all seven follow-ups, all six acceptance criteria, and all four DoD items, including bounded lines, width/control/unicode safety, unavailable-vs-empty distinction, centralized parent resolution, stale cwd/generation guards, synchronous refresh, tests, and changelog.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeCookWidget
created: 2026-08-27 15:49
---
[REVIEW] TASK-32.1 Cook widget — JudgeCookWidget 2026-08-27
Verdict: REVIEW_PASSED (0 BLOCKING, 7 FOLLOW-UP)

AC verification (evidence-grounded):
- AC#1 ≤10 lines: composeWidgetLines returns 5 active, 1 cookmode-only, 0 empty, 5 degraded; verified via bun -e manual check (Array.from length ≤160 each, ≤5 lines) and bun test 5 passed. renderWidget active uses composeWidgetLines (clipped); empty path uses direct string (short, safe) — see FOLLOW-UP. PASS.
- AC#2 chain/task/role/markers: chainNameAndDefinition resolves chain name (fallback custom), phase role via CHAIN_PATTERNS or agentLog, task via widgetParentTaskId transform; markers ✓/▶/○ per stage; test expects scout, TASK-32, RESEARCH [researcher], ✓ explore, ▶ research, ○ report — passed. PASS.
- AC#3 ready/done counts: widgetCountsFor filters direct children via taskKey case-insensitive, Done/Archived terminal (isTerminalTask), parent dep ignored, dependencies require terminal; manual edge tests passed (case-insensitive, archived dep, parent ignored, blocked). PASS.
- AC#4 stale/cached: refreshGeneration global + cwd key check in getAllTasks then/catch, taskSnapshots per-cwd, sync paint with cached ?? []; unavailable data falls back to cached or watchList; manual stale test showed 2 rapid setStoreFor -> 1 async repaint (discarded stale) and cwd switch discarded. PASS (AC box unchecked in ticket but evidence supports).
- AC#5 width/control + contract: clipWidgetLine replaces [\u0000-\u001f\u007f] with space, Array.from unicode-safe slice to 160 + …; composeWidgetLines clips all 5 active lines; empty path not clipped (FOLLOW-UP) but string short; setWidget called with string[] or undefined + {placement: aboveEditor} per OMP docs — viewport-only, no transcript history. PASS with FOLLOW-UP.
- AC#6 synchronous refresh: setStoreFor (state.ts:272-278) stores, saves, appendEntry, then if key==currentCwd refreshWidget() synchronously; refreshWidget paints cached synchronously before void getAllTasks; test 'refreshes the widget through every setStoreFor mutation' expects setWidget 1 sync call — passed (manual sync check showed immediate call). PASS.

DoD:
- DoD#1 tests: tui-batch1.test covers markers/role/name/counts/sync (17 expects) but missing explicit empty-state, fallback, width clipping tests — FOLLOW-UP.
- DoD#2 notes: implementationNotes do describe filtering (direct children, Done/Archived, parent ignored, normalized) and stale protection (generation/cwd, cached/no-data sync paint) — satisfied.
- DoD#3 no orchestration regression: setStoreFor retains saveCookState+appendEntry; other hooks still route through setStoreFor; no persistence change — satisfied (other modified files in working tree belong to later batch subtasks, not this ticket).
- DoD#4 CHANGELOG: entry exists at CHANGELOG.md:12 under [Unreleased] Added — satisfied but generic (FOLLOW-UP).

Scope per contract: widget is plain string array ≤10, chain/task/role, markers, canonical counts, stale safety, width sanitization, sync refresh — implemented. Excluded autocomplete/watch timestamps/title/working-message/headless/DAG/renderers not implemented (autocomplete provider import visible in diff is from TASK-32.3 batch, not judged here).

FOLLOW-UP findings (file:line — reason → fix):
- [FOLLOW-UP] plugins/cook/extensions/state.ts:39-44 — renderWidget empty-chain COOKMODE line bypasses clipWidgetLine (state.cookmode ? [`cook: ...`] ) → wrap with clipWidgetLine for width/control safety.
- [FOLLOW-UP] plugins/cook/extensions/state.ts:8 — WIDGET_MAX_WIDTH 160 fixed, not terminal-width adaptive; host width is dynamic per OMP TUI render(width) contract → document as viewport-max or derive from width param, or reduce to 80-120 safe default.
- [FOLLOW-UP] plugins/cook/extensions/state.ts:51-62 — widgetCountsFor fallback to watchList when children.length==0 conflates 'no children' vs 'unavailable data' (empty fetch) → only fallback when tasks empty/unavailable, otherwise return {ready:0,done,total:0} for legit empty parent.
- [FOLLOW-UP] plugins/cook/extensions/state.ts:48-52 & 66-105 — widgetParent transform lives only in renderWidget, not in composeWidgetLines; direct compose callers see child ID not parent → move parent resolution into compose or document contract.
- [FOLLOW-UP] plugins/cook/extensions/state.ts:6 — imports readyChildren unused in widget path (reimplemented) → remove unused import or reuse helper to keep minimal.
- [FOLLOW-UP] plugins/cook/tests/tui-batch1.test.ts:1-67 — missing explicit cases for empty-chain, cookmode-only, unavailable-data fallback, and width/control/unicode clipping (DoD#1) → add focused expects for [] / 1-line / watchList fallback / 160-char ellipsis / \u0000 sanitization.
- [FOLLOW-UP] CHANGELOG.md:12 — entry generic, lacks file/task reference (plugins/cook/extensions/state.ts, TASK-32.1) and verification evidence → amend to 'plugins/cook/extensions/state.ts bounded widget...' per changelog guidance.

Remaining for later subtasks (TASK-32.2-32.6, TASK-33/34): watch lastFired persistence, /cook autocomplete (TASK-32.3), title/working-message updates (32.4), hasUI/headless guards (32.5), DAG overlay (TASK-33), renderCall/renderResult (TASK-34).
---

author: @Main
created: 2026-08-27 15:51
---
Judge passed implementation but identified seven follow-ups, including a partial DoD test-coverage item; worker correction and re-review required before completion.
---

created: 2026-08-27 16:05
---
[REVIEW] TASK-32.1 Re-review — RejudgeCookWidget 2026-08-27
Verdict: REVIEW_PASSED (0 BLOCKING, 0 FOLLOW-UP; 7 prior follow-ups verified resolved)

Evidence:
- Focused verification: bun test plugins/cook/tests/tui-batch1.test.ts — 9 pass, 0 fail, 30 expect() calls (re-ran in review, matches worker report)
- Git diff state.ts: 208 lines added, widget helpers clipWidgetLine, widgetCountsFor, composeWidgetLines, readWidgetTasks, taskSnapshots, refreshGeneration, hasUI, WIDGET_MAX_WIDTH=160; setStoreFor now triggers synchronous refreshWidget; stale generation/cwd guards on cwd/lastUi/hasUI setters
- CHANGELOG.md Unreleased Added: documents TASK-32.1, plugins/cook/extensions/state.ts symbols, 160-col cap, unavailable vs empty distinction, synchronous generation-checked refresh, with focused test evidence 9 pass/30 expects

Prior 7 follow-ups — resolution verified (objective):
1. Empty-path clipping (state.ts:92-96): composeWidgetLines empty+cookmode now returns [clipWidgetLine(...)] with width param; renderWidget unified via composeWidgetLines — no bypass. Test 'keeps empty and cookmode-only widgets bounded' checks [] and 1-line clipped to width 20.
2. Width handling adaptive/explicit (state.ts:8-18,86-117): WIDGET_MAX_WIDTH=160 exported, clipWidgetLine(width)=Math.min(160, trunc(width)), composeWidgetLines(width) threads width to every clip; comment documents OMP has no width callback. Tests clip with width 12/24/20 and assert WIDGET_MAX_WIDTH==160.
3. Unavailable vs empty fallback (state.ts:53-70): widgetCountsFor(tasks===undefined) → watchList fallback; tasks=[] or parent with no children → {0,0,0} no fallback. Test 'distinguishes unavailable data from a known empty parent' asserts both branches.
4. Parent resolution consistency (state.ts:30-35,104): widgetParentTaskId extracted, composeWidgetLines now resolves parent from same task snapshot (widgetParentTaskId(state,tasks??[])); widgetCountsFor uses same helper. Test 'renders the resolved parent consistently' asserts composition with child TASK-32.2 returns task: TASK-32.
5. readyChildren import (state.ts:6): retained — live usage at syncFromBacklog:220 readyChildren(pi,parentId,cwd) — not dead code; judge claim inaccurate, keep.
6. Test edge coverage (tui-batch1.test.ts): 5→9 tests (30 expects) now cover empty, cookmode, unavailable/empty-parent, width/control/unicode, parent resolution, sync refresh — DoD#1 satisfied.
7. CHANGELOG (CHANGELOG.md): now explicit TASK-32.1, file/symbols, 160-col cap, unavailable vs empty, sync generation-checked, evidence 9 pass/30 expects — DoD#4 satisfied.

AC verification (code + test + manual):
- AC#1 ≤10 plain lines: composeWidgetLines returns 5 active /1 cookmode /0 empty /5 degraded (fallback); renderWidget uses plain string array via setWidget(MOD_ID, lines.length?lines:undefined,{placement:'aboveEditor'}) — viewport-only, no transcript. Verified via test length <=10 and manual Array.from checks.
- AC#2 chain/task/role/markers: chainNameAndDefinition fallback custom, role via CHAIN_PATTERNS or agentLog, task via widgetParentTaskId, markers ✓/▶/○ per stage; test expects scout, TASK-32, RESEARCH [researcher], ✓ explore, ▶ research, ○ report — pass.
- AC#3 ready/done canonical: widgetCountsFor direct-child filter via taskKey case-insensitive, isTerminalTask Done/Archived, parent dep ignored, dependencies terminal via terminalIds Set; normalized parent_task_id/dependencies/assignee in readWidgetTasks. Test ready1 done1/2 plus manual edge cases.
- AC#4 stale/cached: taskSnapshots per cwd, refreshGeneration global + cwd check in readWidgetTasks then/catch, setters increment generation; sync paint with cached before async read; unavailable leaves widget usable via watchList fallback or cached. Code at state.ts:314-346 verified.
- AC#5 width/control + contract: clipWidgetLine replaces [\u0000-\u001f\u007f] with space, Array.from unicode-safe slice to maxWidth-1+…; every compose path clips; setWidget string[] contract satisfied. Test clips \u0000 + 界 repeat to width 12.
- AC#6 sync refresh: setStoreFor (state.ts:302-308) stores, saves, appendEntry, then if key==currentCwd refreshWidget() synchronously; refreshWidget paints cached sync before async read; test 'refreshes the widget through every setStoreFor mutation' expects 1 sync setWidget call — pass.

DoD:
- DoD#1 tests: covered as above — satisfied.
- DoD#2 notes: Implementation Notes describe direct-child filtering, Done/Archived, parent ignored, normalization, and generation/cwd guards — satisfied.
- DoD#3 no orchestration/persistence change: state.ts only adds widget helpers + sync refresh; saveCookState/appendEntry retained; syncFromBacklog unchanged; other working-tree files (cook-tools.ts hasUI binding, watch.ts onFire, types.ts hasUI) belong to later batch TASK-32.2-32.6 and not counted against this ticket — for this ticket's diff, no persistence/orchestration regression.
- DoD#4 CHANGELOG: entry under ## [Unreleased] Added with evidence — satisfied.

Scope/TUI contract: plain string array ≤10, width/control/unicode safe, empty/cookmode/unavailable/legitimate-empty handled, full chain/task/role with ✓/▶/○, canonical counts, sync refresh + stale guards, hasUI guard, placement aboveEditor — within widget scope, no hidden regressions.

Blocking: none.
Follow-up: none (optional hygiene: AC#4 and DoD#3 checkboxes remain unchecked in ticket but evidence supports checking them; no code change needed).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the bounded cook chain status widget in plugins/cook/extensions/state.ts with canonical direct-child Backlog ready/done counts, stage markers and roles, watch activity, synchronous store refresh, stale cwd/generation protection, and Unicode/control-safe clipping. Added focused coverage in tests/tui-batch1.test.ts and documented the change in CHANGELOG.md. Verified by independent re-review and bun test plugins/cook/tests/tui-batch1.test.ts: 9 passed, 0 failed, 30 expect calls.
<!-- SECTION:FINAL_SUMMARY:END -->
