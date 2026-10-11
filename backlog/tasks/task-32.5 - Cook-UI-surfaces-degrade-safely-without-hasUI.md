---
id: TASK-32.5
title: Cook UI surfaces degrade safely without hasUI
status: Done
assignee:
  - '@CookWorker381'
created_date: '2026-08-27 15:17'
updated_date: '2026-08-28 01:12'
labels:
  - feature
  - architecture
milestone: m-1
dependencies: []
parent_task_id: TASK-32
priority: medium
type: feature
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit and harden every batch-1 UI integration for non-interactive execution. Cook tools and lifecycle handlers can run in print, RPC, ACP, or subagent contexts where interactive custom UI, autocomplete, title, working-message, and widget surfaces are unavailable or inert. Gate those calls with hasUI/available UI state, while preserving state persistence, workflow control, and notify-based command feedback.

Primary files: extensions/index.ts, state.ts, cook-tools.ts, autocomplete registration, and the existing pi-coding-agent mock/tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With hasUI false, state mutations continue to persist and append CookState while setWidget, autocomplete registration, setTitle, and setWorkingMessage are never invoked.
- [x] #2 Headless/RPC command paths return deterministic notify or no-op fallbacks instead of calling ctx.ui.custom or throwing.
- [x] #3 Interactive sessions retain the intended widget and activity behavior after the guards are added.
- [x] #4 UI references are replaced on session/UI changes so a prior session cannot receive updates from a later cwd/state.
- [x] #5 Focused tests cover false/undefined UI availability, command notifications, and interactive regression behavior.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Headless and interactive tests prove absence/presence of calls at the boundary.
- [x] #2 Implementation notes list each guarded surface and its fallback.
- [x] #3 No blanket catch or silent suppression hides real orchestration errors.
- [x] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep state/widget/activity/autocomplete hasUI guards as the existing boundary contract; no state or orchestration path is gated.
2. Guard model selection and stop confirmation in extensions/config.ts and extensions/cook-tools.ts with deterministic headless fallbacks.
3. Route lifecycle and command notifications through optional-method-safe helpers while preserving headless notify feedback.
4. Verify focused interactive/headless behavior and plugin typecheck; leave full Cook suite to TASK-32.6/main validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: UI boundary inventory, persistence-preserving fallback, lifecycle reference hygiene, and negative-call verification are explicit.

Implementation: guarded runModelConfigWizard and single-role model selection so headless/RPC contexts preserve persisted config and return deterministic output without ctx.ui.select; guarded cook_stop confirmation with a no-change fallback; routed lifecycle and /cook command notifications through optional-method-safe helpers; autocomplete registration additionally tolerates missing addAutocompleteProvider. Existing state widget/activity hasUI guards and persistence/orchestration paths were preserved. Changed production files: plugins/cook/extensions/config.ts, plugins/cook/extensions/cook-tools.ts, plugins/cook/extensions/autocomplete.ts, plugins/cook/extensions/index.ts, CHANGELOG.md.

Verification: bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail. bunx tsc --noEmit -p plugins/cook/tsconfig.json — failed because tsconfig points at unavailable /root/.bun/install/global Node types; rerun with --typeRoots /home/eag1/repo/ezxomp/node_modules/.bun/@types+node@26.4.0/node_modules/@types — passed (exit 0). Headless config smoke — persisted default config returned, model list/select calls 0. Headless stop smoke — deterministic no-change response, select calls 0, active chain preserved. Headless widget/autocomplete smoke — widget calls 0, state persisted, registration call 0. Focused suite contains interactive regression coverage; no full Cook/project-wide suite run per TASK-38.1 worker constraint.

Final focused verification: bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail, 72 expect() calls. bunx tsc --noEmit -p plugins/cook/tsconfig.json --typeRoots /home/eag1/repo/ezxomp/node_modules/.bun/@types+node@26.4.0/node_modules/@types — exit 0. Headless persistence/notification smoke — stop confirmation and config wizard made 0 select calls; active chain remained; config returned Saved; /cook emitted 1 notification; appendEntry called 2 times; cookmode mutation persisted. Headless widget/autocomplete smoke — setWidget and addAutocompleteProvider calls 0; current task persisted. Residual gate: independent review and full Cook suite remain assigned to TASK-32.6/main.

Final hardening: /cook config and cook_config role=all now report an explicit unchanged/no-interactive-UI result instead of labeling a headless no-op as Saved/Updated. Re-ran bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail; typecheck with repository Node typeRoots override — exit 0. Direct smoke confirmed config role=all returns "No changes (interactive UI unavailable):", /cook config emits a deterministic unchanged notification, and select/models are never called.

Package regression evidence: from plugins/cook, bunx vitest run --config vitest.config.ts tests/cook-watch-cli.test.ts — 1 file, 3 passed, 0 failed; bunx vitest run --config vitest.config.ts tests/cook-durability.test.ts tests/cook-dispatch.test.ts — 2 files, 12 passed, 0 failed. This confirms command notifications and existing persistence/dispatch contracts under the repository Vitest setup.

VALIDATOR GATE (CookValidator381, 2026-08-28): independent verification. AC#1 PROVEN: headless smoke (hasUI=false) — cook_start then cook_stop: setWidget 0, setTitle 0, setWorkingMessage 0 calls, appendEntry 1 (state persisted), select 0; autocomplete registration 0 (tui-batch1 test 'does not register autocomplete in a non-interactive context' + session_start hasUI=false emits 0 providers). AC#2 PROVEN: cook_config role=all returns 'No changes (interactive UI unavailable):' (0 select calls); single-role returns isError 'No interactive UI available to choose a model...' (0 select calls); cook_stop returns 'Stop requires an interactive UI confirmation; no changes made.' (0 select calls, chain preserved via cook_status). AC#3 PROVEN: interactive smoke (hasUI=true) — setWidget 2, setTitle 2, setWorkingMessage 2 calls after cook_start; cook_stop confirm select 1, chain cleared; focused suite 20 pass/0 fail includes interactive regression tests. AC#4 PROVEN: cook-activity tests 'resets only the current UI and rejects stale cwd updates' and 'restores host setters and preserves host replacements during cleanup' cover cwd/session UI reference hygiene; index.ts session_stop/session_shutdown call resetActivity. AC#5 PROVEN: tui-batch1 + cook-activity cover false/undefined UI availability, command notifications, interactive regression. DoD#1 PROVEN (boundary call absence/presence asserted). DoD#2 PROVEN (notes list guarded surfaces + fallbacks). DoD#3 PROVEN by catch-block audit: no blanket catch hides orchestration errors (all catches are UI-optional, best-effort persistence, or error-surfacing). DoD#4 PROVEN: CHANGELOG.md ## [Unreleased] Added contains TASK-32.5 entry. Residual: full Cook suite and default typecheck portability are TASK-32.6/main gates (see TASK-38.1 validator notes).

Validator checked DoD#3 after independent catch-block audit: every catch in changed files is (a) UI-optional surface (activity observer wrappers, callActivity, renderWidget — UI must never break orchestration), (b) best-effort persistence (loadCookState/saveCookState/loadModelConfig/saveModelConfig), or (c) error-surfacing (syncScope collects per-scope failures and notifies; dispatch probe degrades to documented payload only when the tool surface is unreadable). No blanket catch silently hides orchestration errors.

TASK-38.1 blocking-fix follow-up (2026-08-28): plugins/cook/extensions/index.ts now keeps turn_start non-fatal while notifying warning-level errors from syncFromBacklog ("Cook: backlog sync failed — …") and pollWatchedTasks ("Cook: watched-task poll failed — …"). Temporary configured-Vitest error-path smoke injected one rejected sync and one rejected poll; command: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/lifecycle-errors.tmp.test.ts; result: 2 tests passed, 0 failed. Temporary smoke file was removed after verification. Existing TASK-32.5 scope remains open pending independent validator/judge re-review; no assertions or completed child tickets were changed.

VALIDATOR GATE (CookValidator381Fix, 2026-08-28): independent re-verification after judge-fix pass. DoD#3 RE-PROVEN with error-path evidence: plugins/cook/extensions/index.ts:78,85 turn_start catch blocks now surface syncFromBacklog/pollWatchedTasks failures via notify(ctx, message, "warning") instead of empty catches; temp rejection smoke (vi.spyOn mockRejectedValue) — 2 tests passed, 0 failed, warning notifications contained operation + error text, turn_start continued. Catch audit re-confirmed: remaining catches are UI-optional (activity observers, callActivity, renderWidget), best-effort persistence (load/save state/config), or error-surfacing (syncScope, dispatch probe). Focused TUI/activity: 20 pass, 0 fail, 72 expect() calls. Plugin typecheck: exit 0 (portable tsconfig). Full Cook suite: bun test plugins/cook 96 pass/0 fail; package Vitest 96 passed/0 failed. AC#1-5 and DoD#1/#2/#4 remain checked as before; DoD#3 now carries objective error-path evidence. Residual: independent judge re-review and child finalization pending.

Independent judge re-review accepted the implementation: Cook-scope blockers resolved; AC #1-5 and DoD #1-4 are supported by focused headless/interactive smoke, 20/20 focused tests, 96/96 Cook suite, portable typecheck, and lifecycle error-path evidence. Finalization completed after review; permanent lifecycle rejection coverage remains a non-blocking follow-up.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @CookJudge381
created: 2026-08-28 00:35
---
[review] REVIEWED: implementation matches TASK-32.5 plan and AC/DoD. Validator evidence independently proves headless persistence/no UI calls, interactive behavior, lifecycle reference hygiene, focused coverage, and catch audit; no blocking implementation defect found. The ticket remains In Progress at task record line 4, so it is not yet terminal for TASK-38.1 AC#1; finalize with a final summary and terminal status only after the coordination gates are satisfied.
---

author: @CookJudge381
created: 2026-08-28 00:37
---
[blocking] plugins/cook/extensions/index.ts:78,85 — `turn_start` wraps `syncFromBacklog` and `pollWatchedTasks` in empty `catch {}` blocks. These are orchestration/backlog state transitions, not optional UI or best-effort persistence, so failures are silently discarded and can leave stale Cook state while DoD#3 is claimed checked; the validator catch audit missed these paths. Preserve non-fatal lifecycle behavior but surface the failure (for example, collect/notify a warning with operation and error) instead of swallowing it, then add/record the error-path evidence.
---

author: @CookJudge381Re
created: 2026-08-28 01:08
---
[blocking] backlog/tasks/task-32.5 - Cook-UI-surfaces-degrade-safely-without-hasUI.md:4 — all checked AC/DoD and Cook evidence are supported, but the child remains In Progress and has no final summary. TASK-38.1 AC1/DoD1 require this ticket to be terminal with finalization records. Fix: write the final summary, verify finalization requirements, and move the child to Done; do not close TASK-38.1 before that.
---

author: @CookJudge381Re
created: 2026-08-28 01:09
---
[follow-up] plugins/cook/extensions/index.ts:78-97 — the warning-and-continue rejection path is objectively exercised by the recorded 2/2 temporary smoke, but that test was removed after the run. Add a permanent lifecycle error-path regression test so the DoD#3 contract stays protected; current implementation is accepted for this review and this is not a closure blocker.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented headless-safe Cook UI boundaries across config, command, autocomplete, and lifecycle integration while preserving persistence, orchestration, and interactive activity. Verified with focused TUI/activity tests (20 passed), full Cook suite (96 passed), portable Cook typecheck (exit 0), headless/interactive smoke, and independent judge re-review. Repository-wide unrelated failures remain recorded on TASK-32.
<!-- SECTION:FINAL_SUMMARY:END -->
