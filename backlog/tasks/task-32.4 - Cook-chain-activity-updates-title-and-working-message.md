---
id: TASK-32.4
title: Cook chain activity updates title and working message
status: Done
assignee: []
created_date: '2026-08-27 15:17'
updated_date: '2026-08-27 21:33'
labels:
  - feature
  - design
milestone: m-1
dependencies: []
parent_task_id: TASK-32
priority: medium
type: feature
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the active cook stage in the terminal title and working message so long-running orchestration remains understandable even when the widget is not in view. On each active stage transition, identify the chain role/stage and current task. On completion, cancellation, session switch, shutdown, or no-chain state, restore/clear the host surfaces without leaving stale cook text. Use only the supported ctx.ui methods and keep behavior safe for contexts without UI.

Primary files: plugins/cook/extensions/state.ts and the state transition callers in extensions/index.ts/cook-tools.ts; focused tests should use the UI mock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each active stage transition updates both setWorkingMessage and setTitle with the current stage/role and task identifier when available.
- [x] #2 Stage updates do not display a prior task or cwd after a newer state mutation wins.
- [x] #3 Idle, completed, cancelled, switched, and shutdown states restore or clear cook-owned title/working text without throwing.
- [x] #4 Headless/RPC contexts never call unsupported title or working-message methods.
- [x] #5 Focused tests cover active transitions, missing task IDs, reset paths, and no-UI behavior.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Activity tests prove both title and working-message calls and their reset semantics.
- [x] #2 Implementation notes name the lifecycle points that own cleanup and stale-state prevention.
- [x] #3 No global terminal title or host working-message behavior is permanently changed after cook becomes idle.
- [x] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace every CookState stage mutation and session lifecycle path in state.ts, index.ts, cook-tools.ts, and watch.ts; identify the single transition points for active, completed, cancelled, switched, and shutdown states. Risk: updating only the command path leaves tool-driven transitions stale.
2. Add a state-owned activity refresh that formats the current role/stage and task for ctx.ui.setWorkingMessage and setTitle, guarded by current UI availability and generation/cwd identity.
3. Define explicit idle cleanup that restores or clears cook-owned activity and cannot overwrite newer host state after a race or session switch.
4. Add focused UI-mock tests for active transitions, missing task IDs, reset paths, stale-state prevention, and headless behavior.
5. Run the focused activity tests and record evidence before checking AC.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: all transition owners, race/lifecycle cleanup, task-aware formatting, and UI-mock verification are explicit.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.3
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.3 via backlog_task_edit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Fix judge follow-ups in autocomplete.ts: add optional AbortSignal to getSuggestions and getForceFileSuggestions and forward it unchanged to the host provider. Document intentional process-wide WeakSet deduplication or provide a safe test reset without weakening lifecycle behavior. Preserve all completion semantics. Run focused autocomplete and full tui-batch1 tests, append notes, and check verified AC/DoD.

Record all results on task TASK-32.3 via backlog_task_edit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Retry the previously blocked correction now that completed agents are released. Add optional AbortSignal forwarding in autocomplete.ts getSuggestions and getForceFileSuggestions, and document intentional process-wide WeakSet deduplication or provide safe test isolation. Preserve completion behavior. Run focused autocomplete plus full tui-batch1 tests, append notes, check verified AC/DoD.

Record all results on task TASK-32.3 via backlog_task_edit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Apply the judge follow-ups now that completed worker sessions were cancelled: forward optional AbortSignal through getSuggestions/getForceFileSuggestions, document intentional process-wide WeakSet deduplication, preserve existing behavior, run focused autocomplete/full tui-batch1 tests, append notes and update evidence.

Record all results on task TASK-32.3 via backlog_task_edit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.4
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Implement enriched TASK-32.4 only. Trace all CookState stage transitions and lifecycle paths, add task-aware setWorkingMessage/setTitle updates with stale generation/cwd safety and explicit idle/completion/switch/shutdown cleanup, guard no-UI usage, add focused UI-mock tests, and update changelog. Preserve orchestration. Run focused activity tests; append notes and check verified AC/DoD.

Record all results on task TASK-32.4 via backlog_task_edit.

Implementation is paused before repository access because four cook-worker dispatch attempts failed at lean-ctx agent-bus registration: project reports 15/15 live workers. Completed prior agents were cancelled and current roster is empty, but capacity remains saturated by workers not visible to this session. No TASK-32.4 files were read or changed and no tests ran. Resume the same implement stage when a worker slot is available.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.4
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Resume the enriched TASK-32.4 implementation now that the prior infrastructure blocker may have cleared. Trace stage/lifecycle mutation paths, implement guarded task-aware setWorkingMessage/setTitle updates with stale-state cleanup, add focused UI-mock tests, update changelog, run targeted activity tests, and record evidence.

Record all results on task TASK-32.4 via backlog_task_edit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.4
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Resume implementation after waiting for stale worker registrations to expire. Implement enriched TASK-32.4 title/working-message activity with guarded lifecycle-safe updates, focused tests, changelog, and targeted verification only.

Record all results on task TASK-32.4 via backlog_task_edit.

Retried worker dispatch after cancelling all visible completed agents and waiting five minutes; three additional cook-worker attempts still failed before repository access with lean-ctx agent-bus capacity 15/15. Current visible roster is empty; no TASK-32.4 files or tests were changed. Preserve the task in In Progress at the implement stage for resume when the project worker cap is released.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

Review-stage attempt was dispatched as requested, but the independent judge exited before repository inspection because its provider returned 429 FreeUsageLimitError with retry-after-ms=21537000. No review verdict or code evidence exists. TASK-32.4 remains incomplete and must not be marked Done; resume implementation first, then re-run independent review when a reviewer is available.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

Retried independent judge with updated openai/gpt-5.6-luna profile. Judge returned REVIEW_CHANGES_REQUESTED but could not inspect repository or append through its own CLI because every lean-ctx call failed during agent-bus registration. Confirmed root cause: global/project worker registry remains saturated at 15/15 live workers, matching [agents] max_concurrent_workers=15; visible roster is empty, indicating stale/leaked registrations outside this session. This persisted through the profile update and ~190 spaced retries. TASK-32.4 implementation remains unverifiable and incomplete; required prerequisite is lean-ctx/agent-bus maintenance to reap stale registrations or flush/raise the registry.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

Independent cook-judge review completed after worker-capacity recovery. Verdict: REVIEW_CHANGES_REQUESTED. No TASK-32.4 implementation or objective verification exists; current source only covers TASK-32.1/.2/.3. Judge confirmed the existing plan does not match the repository. Task remains In Progress and must not advance until implementation and focused tests land.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.4
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Implement only the enriched TASK-32.4 contract. Read the current task and applicable AGENTS files first. Trace all CookState stage mutations and lifecycle paths in plugins/cook/extensions/state.ts, extensions/index.ts, cook-tools.ts, and existing UI tests. Add task-aware setWorkingMessage/setTitle updates with stale-generation/cwd safety, explicit idle/completion/cancel/switch/shutdown cleanup, no-UI guards, focused UI-mock tests, and a CHANGELOG Unreleased entry. Preserve existing widget and orchestration semantics. Run only focused activity tests and record exact evidence in TASK-32.4; do not run formatters, linters, or full project suites.

Record all results on task TASK-32.4 via backlog_task_edit.

Cook-worker WorkerTask324 was cancelled after ~46 minutes without yielding a result; live transcript showed repeated exploratory ctx calls and no implementation evidence. Main session is taking over the bounded implementation after the judge's blocking review.

Main implementation after judge review: state.ts now owns task-aware Cook activity formatting and guarded title/working-message refresh/reset; activity state tracks ownership and restores wrapped UI setters, preserving host replacements. StoreContext now carries hasUI plus refreshActivity/resetActivity. All tool context binders update cwd/UI state, and session_stop/session_shutdown plus cwd/UI changes release activity. Active state mutations route through setStoreFor, which refreshes widget and activity with generation/cwd checks. Added plugins/cook/tests/cook-activity.test.ts with active stage/role/task, missing task, completion reset, cwd stale-update rejection, host ownership preservation, headless behavior, shutdown cleanup, and cook_advance transition coverage. Extended the Cook UI mock with setTitle/setWorkingMessage/getFlag. Updated Cook AGENTS activity contract and CHANGELOG TASK-32.4 entry. Verification: `cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-activity.test.ts tests/tui-batch1.test.ts` => 2 files, 19 passed; full Cook plugin Vitest suite => 13 files, 74 passed; `bun run check` => TypeScript check passed. Direct `bunx tsc --noEmit -p plugins/cook/tsconfig.json` remains blocked by the pre-existing absolute /root/.bun Node typeRoot in plugins/cook/tsconfig.json; root check is green.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

Post-implementation independent judge returned REVIEW_CHANGES_REQUESTED. Blocking findings: (1) state.ts cleanup can call and then overwrite host setter replacements assigned after Cook activation; fix by tracking Cook wrapper identity and only clearing/restoring while it remains installed, with assignment-replacement test. (2) syncFromBacklog exits early on final-stage chains, so a completed task pointer left by cook_advance can keep activity visible; reconcile terminal status on final stage, clear pointer in completeChain, and test final-stage completion. (3) AC/DoD/final summary remain pending until fixes and verification.

Addressed judge blockers: activity observer now records wrapper and original setter identities, cleanup clears/restores only while Cook's wrapper remains installed, preserving post-activation host setter assignments; syncFromBacklog now inspects terminal status even when currentStage is final, and completeChain clears a non-null pointer already parked on the final stage. Added regression coverage for setter assignment replacement and final-stage completion; aligned the existing final-stage idempotence fixture to the cleared-pointer invariant. Re-verified focused Cook activity/sync/widget tests: 3 files, 26 passed; full Cook plugin suite: 13 files, 75 passed; repository `bun run check` passed.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.4
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.4 via backlog_task_edit.

Re-review judge confirmed both prior runtime blockers are resolved: wrapper identity tracking preserves host setter replacements during cleanup, and final-stage terminal reconciliation clears completed task pointers. Runtime AC1–AC5 satisfy the contract. Final objective evidence: focused `cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-activity.test.ts tests/sync-from-backlog.test.ts tests/tui-batch1.test.ts` passed 3 files/27 tests; full Cook plugin suite passed 13 files/76 tests; `bun run check` passed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @Main
created: 2026-08-27 17:25
---
Blocked by lean-ctx agent-bus capacity (15/15 live workers), not by code or task ambiguity. No implementation changes made.
---

author: @Main
created: 2026-08-27 18:26
---
Judge retry confirmed infrastructure saturation, not a model-profile issue. No source/test changes or objective TASK-32.4 review evidence were available.
---

author: @JudgeTask324
created: 2026-08-27 20:07
---
[blocking] plugins/cook/extensions/state.ts:302-346 — createStoreContext/setStoreFor only refreshes setWidget; no setWorkingMessage or setTitle activity owner, no stale generation/cwd guard for those surfaces, and no idle/reset cleanup. Fix: add a guarded state-owned activity refresh/reset that is invoked by setStoreFor and validates current UI, cwd, and mutation generation before painting or clearing.
---

author: @JudgeTask324
created: 2026-08-27 20:07
---
[blocking] plugins/cook/extensions/cook-tools.ts:186-190,252-252,710-715 — cook_start, cook_advance, and cook_next are the active stage/task mutation points, but they only call sc.setStore and never update title/working message. This fails AC1 and leaves prior task/stage text visible. Fix: route every active transition through the activity refresh with current role/stage and optional task ID.
---

author: @JudgeTask324
created: 2026-08-27 20:07
---
[blocking] plugins/cook/extensions/index.ts:288-304 — session_stop has no cook-surface reset and there is no session_shutdown or session-switch cleanup hook; loading a new cwd/session can retain old cook-owned text. Fix: clear/restore cook-owned title and working message on idle/completion/cancellation/switch/shutdown, guarded for headless contexts.
---

author: @JudgeTask324
created: 2026-08-27 20:07
---
[blocking] plugins/cook/tests/tui-batch1.test.ts:1-242 — focused tests cover only the widget and autocomplete; there are no UI-mock assertions for setTitle/setWorkingMessage, missing task IDs, stale prevention, reset paths, or headless safety. Fix: add deterministic lifecycle tests exercising each required transition/reset and no-UI branch.
---

author: @JudgeTask324
created: 2026-08-27 20:07
---
[blocking] CHANGELOG.md:12-14 — Unreleased contains TASK-32.1, TASK-32.2, and TASK-32.3 entries but no TASK-32.4 entry, so DoD #4 is unmet. Fix: add a concise TASK-32.4 Unreleased entry naming implementation and focused verification evidence.
---

author: @Main
created: 2026-08-27 20:09
---
BLOCKING — plugins/cook/extensions/state.ts:302-346: setStoreFor refreshes only the widget; no setTitle/setWorkingMessage updater, stale-generation guard, or cleanup. Fix: add guarded state-owned activity refresh/reset.
BLOCKING — plugins/cook/extensions/cook-tools.ts:186-190,252,710-715: cook_start, cook_advance, and cook_next mutate stage/task state without updating activity surfaces. Fix: route every active transition through the activity updater.
BLOCKING — plugins/cook/extensions/index.ts:288-304: no idle/completion/cancellation/cwd-switch/session_shutdown cleanup. Fix: clear or restore cook-owned text at each lifecycle boundary and guard headless contexts.
BLOCKING — plugins/cook/tests/tui-batch1.test.ts:1-242: required activity, missing-task, stale-state, reset, and no-UI tests are absent. Fix: add focused UI-mock lifecycle coverage.
BLOCKING — CHANGELOG.md:12-14: no TASK-32.4 Unreleased entry. Fix: add implementation and focused-verification evidence after implementation.
---

author: @JudgeTask324Final
created: 2026-08-27 21:16
---
[blocking] plugins/cook/extensions/state.ts:388-395,428-445 — activity cleanup unconditionally restores the setters captured before Cook wrapped them, and resetActivityFor may call whichever setter currently occupies the property. If host code replaces ui.setTitle or ui.setWorkingMessage by assignment after activation, cleanup invokes that replacement with an empty value and then overwrites the replacement with the stale original setter, violating host ownership restoration. Fix: retain each wrapper identity; clear only while the current property is still Cooks wrapper, and restore the original only when the property still equals that wrapper; add an assignment-replacement regression test.
---

author: @JudgeTask324Final
created: 2026-08-27 21:16
---
[blocking] plugins/cook/extensions/state.ts:204-207,265-266 — syncFromBacklog returns early whenever currentStage is final, so a task completed while the chain is parked on its final stage is never queried or cleared. cook_advance leaves currentTaskId set on the final stage, making the completed title/working message persist indefinitely across turns. Fix: do not skip terminal-status reconciliation at the final stage; clear currentTaskId/chain through completeChain (or advance a ready sibling) once the task is Done/Archived, and cover final-stage completion in the focused test.
---

author: @JudgeTask324Final
created: 2026-08-27 21:17
---
[blocking] backlog/tasks/task-32.4 - Cook-chain-activity-updates-title-and-working-message.md:22-36, end of notes — the implementation notes report focused/full tests and root type-check, but all five AC and all four DoD items remain unchecked, the task is still In Progress, and no final summary records evidence. Fix: after correcting the blockers, run the objective focused activity tests, check only proven AC/DoD items, append exact validation notes, write the final summary, and move the task to the configured terminal status.
---

author: @Main
created: 2026-08-27 21:19
---
BLOCKING — plugins/cook/extensions/state.ts:388-395,428-445: cleanup restores stale captured setters even if host replaced them after activation, potentially overwriting host behavior. Fix: retain wrapper identity; clear/restore only if Cook wrapper remains installed; add assignment-replacement regression test.
BLOCKING — plugins/cook/extensions/state.ts:193-207: final-stage sync returns before checking Done/Archived, and completeChain does not clear currentTaskId when already final. Fix: reconcile terminal status on final stage and clear pointer; add final-stage completion test.
BLOCKING — backlog/tasks/task-32.4 - Cook-chain-activity-updates-title-and-working-message.md:22-36: AC/DoD and final summary are still pending. Fix after code corrections and objective verification.
---

author: @JudgeTask324Recheck
created: 2026-08-27 21:28
---
[blocking] backlog/tasks/task-32.4 - Cook-chain-activity-updates-title-and-working-message.md:22-36, 402 — implementation and focused tests now satisfy the reviewed runtime blockers, but all AC/DoD boxes remain unchecked, no final summary is recorded, and status is still In Progress. Fix: after objective verification, check only proven AC/DoD items, append exact validation notes, write a final summary, and move the task to the configured terminal status.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented Cook terminal activity in state.ts and StoreContext: active stage/role/task transitions now update setTitle and setWorkingMessage with UI/headless and generation/cwd guards; cleanup covers reset, completion, cancellation, cwd/session switch, session_stop, and session_shutdown; ownership-safe wrappers preserve host setter replacements. Added focused UI and final-stage sync regressions, updated the Cook UI mock, Cook AGENTS contract, and CHANGELOG. Verified with `cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-activity.test.ts tests/sync-from-backlog.test.ts tests/tui-batch1.test.ts` (3 files, 27 passed), the full Cook suite (13 files, 76 passed), and `bun run check` (pass).
<!-- SECTION:FINAL_SUMMARY:END -->
