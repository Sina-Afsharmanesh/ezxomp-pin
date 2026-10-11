---
id: TASK-32.2
title: Cook watch fire timestamps refresh widget state
status: Done
assignee: []
created_date: '2026-08-27 15:17'
updated_date: '2026-08-27 16:49'
labels:
  - feature
milestone: m-1
dependencies:
  - TASK-32.1
parent_task_id: TASK-32
priority: high
type: feature
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make watch activity visible in the cook status surface. When the existing debounced filesystem/task watch actually fires, persist a timestamp in watch.lastFiredAt through the established store mutation path so refreshWidget can show the most recent activity. Preserve the existing trigger, debounce, and pi.sendMessage behavior exactly; a UI update must not create duplicate workflow starts or alter watch matching.

Primary files: plugins/cook/extensions/watch.ts and extensions/index.ts/state.ts, with existing cook-watch tests extended only if coverage is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A debounced watch event records a non-empty watch.lastFiredAt value through the persisted CookState for the active cwd.
- [x] #2 The widget exposes the most recent watch activity without exceeding its line/width budget, and a never-fired watch has a clear empty-state representation.
- [x] #3 The existing file/task watch filters, debounce interval, enabled/disabled behavior, and single sendMessage trigger remain unchanged.
- [x] #4 Rapid events coalesce according to the configured debounce behavior and cannot race a later cwd/state mutation into the wrong widget.
- [x] #5 Existing cook-watch filesystem, task, ignore, CLI, and tool tests plus focused activity coverage pass.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Watch tests prove timestamp persistence and assert the original trigger fires once per debounced event.
- [x] #2 Implementation notes record the callback/store integration and any race-prevention mechanism.
- [x] #3 No new unmanaged timers or listeners remain after session shutdown.
- [x] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace watch event ownership in plugins/cook/extensions/watch.ts and extensions/index.ts, including debounce, enabled checks, file/task filters, and sendMessage invocation. Risk: timestamping must not add a second trigger.
2. Add one store mutation at the point the debounced event is actually accepted; persist watch.lastFiredAt for the active cwd and let the widget refresh through setStoreFor. Preserve the existing payload, trigger order, and debounce timer lifecycle.
3. Add focused assertions for timestamp persistence, no-event state, rapid-event coalescing, and exactly-once workflow delivery; reuse existing cook-watch fixtures.
4. Run focused watch/activity tests and inspect shutdown cleanup; record exact evidence before checking AC.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: timestamp write point, debounce/sendMessage invariants, race boundary, and shutdown verification are explicit.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.2
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Implement enriched TASK-32.2 only. Trace existing watch debounce/filter/sendMessage flow, persist watch.lastFiredAt at the accepted debounced event through setStoreFor, surface it in the widget, preserve exact trigger/debounce behavior and shutdown cleanup, and add focused coverage only where needed. Do not implement autocomplete, title/working-message, headless guard, overlay, or renderers. Run focused watch/activity tests, append notes, and check only verified AC.

Record all results on task TASK-32.2 via backlog_task_edit.

Implemented TASK-32.2 watch fire integration: watch.ts now rejects disabled events before debounce, passes the watcher cwd/watch ID into the fire callback, and permits the callback to reject stale state before sendMessage. index.ts reads the watcher-owned cwd through getStoreFor and persists lastFiredAt via setStoreFor before the unchanged sendMessage payload. This prevents a later state/watch replacement from repainting or triggering stale delivery while preserving timer/listener shutdown. Added the required Unreleased changelog entry. Verification: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 22 passed, 0 failed. Native Bun smoke was blocked by ENOSPC watcher limit; package-configured Vitest passed.

Final focused verification after source cleanup: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 test files passed, 22 tests passed, 0 failed; duration 293ms. The direct native Bun watcher smoke could not run because the environment returned ENOSPC while creating an fs.watch handle.

Compatibility refinement: retained the existing one-argument onFire callback API; index.ts captures watcher cwd/watch ID in its closure and applies identity checks before the cwd-bound setStoreFor mutation.

Final source shape keeps startWatcher onFire(firedAt) compatible with existing callers; watcher cwd/watch ID are captured by index.ts. Final focused run: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files passed, 22 tests passed, 0 failed; duration 311ms.

Worker implemented debounced watch activity persistence. Changed extensions/watch.ts, extensions/index.ts, and CHANGELOG.md. Accepted fires capture watcher cwd/watch ID, reject disabled/stale state, persist lastFiredAt via setStoreFor before unchanged sendMessage, and avoid cross-cwd widget painting. Focused Vitest: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 22 passed, 0 failed, 311ms. Native Bun watcher smoke reported ENOSPC; timestamp/race-specific tests were not added under worker role.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.2
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.2 via backlog_task_edit.

Independent judge requested changes: two blocking findings. Committed tests are missing for accepted debounced event persisting non-empty lastFiredAt via setStoreFor/saveCookState, exact-one sendMessage plus timestamp under bursts, disabled/stale watchId suppression, and cwd-switch write/repaint behavior. Stale closure handling is incomplete: enabled/watchId/debounceMs are captured at watcher creation and there is no explicit watcher-cwd versus current-cwd send guard. Follow-ups: test never-fired empty widget state, make debounceMs live or document limitation, and separate TASK-32.1/TASK-32.2 changelog bullets. Existing 4-file/22-test suite passes; native watcher ENOSPC remains environment-only.

## implement completed
Spawn the COOK-WORKER via OMP's native `task` tool:
  task({ agent: "cook-worker", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
WORKER → TASK-32.2
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Resolve every judge finding. Add committed focused tests for accepted debounced timestamp persistence through setStoreFor/saveCookState, exactly-once sendMessage+timestamp under bursts, disabled/stale watchId suppression, watcher-cwd versus current-cwd behavior, and never-fired widget state. Fix stale closure handling in watch.ts/index.ts: read live enabled/watchId/debounce state or explicitly guard watcher cwd before sendMessage; preserve original trigger/debounce semantics. Split changelog bullets for TASK-32.1 and TASK-32.2. Run focused watch/activity tests only; append notes and check verified AC/DoD.

Record all results on task TASK-32.2 via backlog_task_edit.

Applied JudgeCookWatch fixes: watch.ts now samples live enabled/watchId/debounce state when scheduling and validates live identity at fire time; index.ts persists the watcher-owned timestamp before delivery and explicitly rejects normalized watcher/current-cwd mismatches. Added deterministic fs-watch proofs for ISO persistence/order, burst one appendEntry timestamp plus one sendMessage, disabled/stale replacement suppression, and cwd-switch persistence without current-cwd repaint; added null lastFiredAt widget empty-state coverage. Split TASK-32.1/TASK-32.2 Unreleased bullets with focused evidence. Verification: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 26 passed, 0 failed. No ENOSPC occurred in this targeted run; prior native fs.watch smoke ENOSPC remains an environment limitation.

Final targeted rerun from absolute package path: cd /home/eag1/repo/ezxomp/plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 26 tests passed, 0 failed (331ms). The relative cd plugins/cook form failed only because the shell had already resolved its project root to plugins/cook; no test/code failure.

Determinism refinement: stale enabled/ID race tests now rewrite temporary state files and reload through turn_start, avoiding random UUID dependence. Final absolute-path targeted run: cd /home/eag1/repo/ezxomp/plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 26 passed, 0 failed (328ms).

Worker resolved judge blockers. Changed watch.ts/index.ts, committed tests in cook-watch-fs.test.ts and tui-batch1.test.ts, CHANGELOG.md, and task metadata via backlog CLI. Added deterministic timestamp persistence, burst exactly-once, suppression, cwd-switch, and never-fired widget coverage; fixed stale state/cwd race. Focused Vitest: 4 files, 26 tests passed, 0 failed. No ENOSPC in targeted run; prior native fs.watch smoke limitation remains environment-only.

## review completed
Spawn the COOK-JUDGE via OMP's native `task` tool:
  task({ agent: "cook-judge", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
JUDGE → TASK-32.2
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-32.2 via backlog_task_edit.

Independent re-review passed with no blocking findings. Evidence: targeted Vitest reproduced 4 files/26 tests passed, 0 failed. Judge verified ISO timestamp persistence/order before sendMessage, burst coalescing, disabled/watchId suppression, watcher-cwd isolation, live debounce sampling, filter/debounce/cleanup preservation, never-fired widget contract, and separate changelog evidence. Two optional follow-ups remain non-required: document per-event debounce sampling and optionally render explicit never-fired wording.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-27 16:24
---
[JUDGE] REVIEW_CHANGES_REQUESTED — Independent judge 2026-08-27\n\nEvidence inspected:\n- plugins/cook/extensions/watch.ts (167L), extensions/index.ts (330L), extensions/state.ts (WIDGET_MAX_WIDTH, composeWidgetLines, clipWidgetLine), types.ts WatchConfig, CHANGELOG.md Unreleased entry, git diff HEAD for watch.ts/index.ts, and existing tests: cook-watch-fs.test.ts (5), cook-watch-ignore.test.ts (4), watch-state.test.ts (4), tui-batch1.test.ts (9).\n- Targeted run: cd plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 22 passed, 0 failed (reproduced 301ms).\n- Manual smoke: ad-hoc vitest check-timestamp.test.ts proved debounced fire persists lastFiredAt ISO via setStoreFor before sendMessage and verifies single trigger (persisted 2026-08-27T16:22:57.038Z, sendMessage customType cook-watch/<watchId> once). Smoke removed after verification.\n- ENOSPC caveat recorded in notes as environment limit, not code failure.\n\nAC evaluation:\n- AC1 (debounced timestamp via persisted CookState for active cwd): CODE SATISFIES contract but NOT COMMITTED TEST PROOF → BLOCKING (see findings). Runtime: watch.ts:38-44 creates firedAt and calls onFire before pi.sendMessage; index.ts:313-318 captures watchCwd/watchId, checks enabled/watchId via getStoreFor(watchCwd), then setStoreFor(watchCwd, {...current, watch:{...lastFiredAt:firedAt}}) before returning to allow sendMessage. Order verified, persisted via saveCookState, cwdbound, single timer path preserved.\n- AC2 (widget exposes recent activity, width/line budget, never-fired empty): CODE SATISFIES — state.ts:111-128 composeWidgetLines builds watch: ON/OFF + count + " | last fired: TS" only when non-null, clipped via clipWidgetLine to WIDGET_MAX_WIDTH=160, at most 5 lines (<6 budget). Empty state is omission of fired segment; tui-batch1.test.ts proves clipping and chain rendering but empty-fired case has no dedicated assertion (FOLLOW-UP).\n- AC3 (filters/debounce/enabled/single trigger unchanged): PASS — filters (cook-state.json, .json, dotfiles, undefined filename) preserved watch.ts:30-32, debounce still state.watch.debounceMs, single sendMessage preserved (timer coalescence, onFire returning false suppresses). Existing tests for fs/ignore/ debounce collapse still green.\n- AC4 (rapid coalesce + no stale cwd/watch race into wrong widget): CODE PARTIALLY satisfies but UNPROVEN — debounce collapse verified by existing test (3 bursts →1). Stale identity guarded by watchId equality + cwd-bound setStoreFor (index.ts:317, setStoreFor key check state.ts:312). RefreshWidget generation check prevents stale async paint. However repo has no committed test that mutates cwd/watchId between event and debounce, nor that proves lastFiredAt written to correct cwd and not repainting wrong widget. See BLOCKING.\n- AC5 (existing + focused coverage pass): EXISTING pass green, FOCUSED missing timestamp/race coverage → conditional fail.\n\nDoD:\n- DoD1 (watch tests prove timestamp + exactly-once): FAIL — BLOCKING (same root).\n- DoD2 (notes record callback/store + race mechanism): PASS — notes do record.\n- DoD3 (no leaked timers/listeners after shutdown): PASS — stopWatcher clears timer+close, session_stop calls it, test proves close once.\n- DoD4 (CHANGELOG Unreleased): PASS — entry mentions watch.ts/index.ts + setStoreFor + stale rejection, alongside TASK-32.1 widget.\n\nFindings:\n[BLOCKING] plugins/cook/tests/*:0 — DoD1/AC1/AC4 missing timestamp/race tests: no committed test asserts that a debounced accepted event writes non-empty watch.lastFiredAt via saveCookState/setStoreFor for the firing cwd, that rapid events coalesce to exactly-one sendMessage AND exactly-one timestamp write, that disabled/stale-watchId suppresses both timestamp and sendMessage, and that a cwd switch between event and fire writes to watcher cwd without repainting current widget → fix: add focused tests reusing cook-watch-fs mock (vi.useFakeTimers, simulate, advance, assert persisted JSON watch.lastFiredAt matches ISO, assert pi.sendMessage called once with same watchId, assert after watchId mutation or enabled=false no write/no send, assert after currentCwd switch setStoreFor targets watchCwd). Worker admitted "timestamp/race-specific tests were not added".\n[BLOCKING] plugins/cook/extensions/watch.ts:30 / extensions/index.ts:314-317 — stale-cwd race incomplete: watch.ts outer enabled check uses stale closure state.watch.enabled (captured at startWatcher) — later enabled toggles not reflected; timer payload uses stale state.watch.watchId for pi.sendMessage customType, relying only on index.ts watchId check to suppress; no explicit watchCwd === currentCwd guard. While watchId mismatch usually catches cwd switch (randomUUID per enable), same-id or null→null could leak cross-cwd sendMessage. → fix: either remove stale outer enabled check and read live state via callback, or capture debounceMs/watchId via closure at timer time from fresh getStoreFor, and add explicit if (normalizeCwd(watchCwd) !== normalizeCwd(sc.currentCwd)) consider suppressing sendMessage or document that setStoreFor already avoids paint but sendMessage still allowed (decide spec). At minimum add comment + test proving cwd-bound behavior.\n[FOLLOW-UP] plugins/cook/extensions/state.ts:122 — never-fired empty state is implicit omission ("watch: ON") not an explicit "never" string; AC says clear empty-state representation → fix: keep current but add test asserting composeWidgetLines with lastFiredAt=null does NOT contain "last fired" and still clips.\n[FOLLOW-UP] plugins/cook/extensions/watch.ts:38-44 — debounceMs and watchId read from stale closure snapshot; if debounceMs edited mid-session new interval not applied until next session_start — not introduced by this task but worth documenting as known limitation or refactoring to read current state at timer schedule time.\n[FOLLOW-UP] CHANGELOG.md:12-13 — Unreleased entry lumps TASK-32.1 widget and TASK-32.2 watch in one block; acceptable but would be clearer to separate bullets per task or note that watch entry belongs to TASK-32.2 only. No code impact.\n\nVerdict: REVIEW_CHANGES_REQUESTED due to 2 BLOCKING (missing committed proof + incomplete stale-cwd guard). Code functionally meets timestamp-before-sendMessage, preserves debounce/filter/cleanup, and respects ENOSPC as env caveat, but cannot mark AC1/AC4/DoD1 complete without committed tests and explicit stale-cwd test.
---

created: 2026-08-27 16:25
---
[JUDGE-FINAL] REVIEW_CHANGES_REQUESTED — 2 BLOCKING 3 FOLLOW-UP — verification complete, no source changes, 22 tests green, manual timestamp verified
---

author: @Main
created: 2026-08-27 16:27
---
Changes requested: committed timestamp/race proof and explicit live-state/cwd guard are required before AC/DoD sign-off.
---

created: 2026-08-27 16:43
---
[JUDGE-RE-REVIEW] REVIEW_PASSED — Independent re-review 2026-08-27

Evidence inspected:
- plugins/cook/extensions/watch.ts (182L) startWatcher live getState/getCurrentCwd, normalizeCwd, debounceMs/watchId sampled at schedule, fireState enabled/watchId equality, firedAt ISO before onFire, cwd mismatch guards (L24-68)
- plugins/cook/extensions/index.ts (330L) session_start captures watchCwd, onFire validates live store, persists via setStoreFor(watchCwd, {...lastFiredAt:firedAt}) before return, returns cwd equality to gate sendMessage (L310-327), createStoreContext refreshWidget generation/cwd guard
- plugins/cook/extensions/state.ts (WIDGET_MAX_WIDTH=160, composeWidgetLines watch: ON/OFF + fired, clipWidgetLine, 5 lines)
- plugins/cook/tests/cook-watch-fs.test.ts (8 tests): ISO timestamp before exactly one sendMessage (persistedAtSend mock reads JSON at send time, ISO regex, pi.appendEntry 1), burst 3→1 timestamp+sendMessage, disabled suppression, watchId replacement suppression, cwd-switch persist to watcher wd without repaint/trigger, stopWatcher close, disabled no-emit
- plugins/cook/tests/cook-watch-ignore.test.ts (4), watch-state.test.ts (4), tui-batch1.test.ts (10): never-fired widget explicit watch: ON no last fired, bounded width, chain+widget rendering
- CHANGELOG.md Unreleased: separated bullets TASK-32.1 widget + TASK-32.2 watch persistence, focused evidence command listed
- Targeted run: cd /home/eag1/repo/ezxomp/plugins/cook && bunx vitest run --config vitest.config.ts tests/cook-watch-fs.test.ts tests/cook-watch-ignore.test.ts tests/watch-state.test.ts tests/tui-batch1.test.ts — 4 files, 26 passed, 0 failed (334ms, reproduced)

AC evaluation:
- AC1 PASS: debounced accepted fire writes non-empty ISO watch.lastFiredAt via setStoreFor/saveCookState for active watcher cwd before exactly one sendMessage; order proved by persistedAtSend inside mockImplementation and readPersistedWatch JSON + appendEntry.
- AC2 PASS: widget shows last fired: TS when non-null, clips to WIDGET_MAX_WIDTH=160, never-fired renders watch: ON without last fired: (tui-batch1 empty activity test), within line/width budget.
- AC3 PASS: filters (cook-state.json, cook-config.json, dotfiles, undefined filename) preserved, debounce 50ms via live debounceMs per-event, enabled/disabled, single sendMessage trigger preserved. Existing ignore/burst tests green.
- AC4 PASS: burst coalesces 3→1, disabled/stale watchId suppress both write+trigger, cwd switch persists to watcher cwd without repainting current widget or triggering foreign workflow. Live enabled/watchId/debounce sampling and dual cwd guards (watch.ts L56 + index.ts return) prevent stale closure/cross-cwd leak; tests use deterministic file rewrite + turn_start reload, no random UUID dependency.
- AC5 PASS: 4 files 26 tests green; existing + focused coverage present.

DoD:
- DoD1 PASS: timestamp persistence + exactly-once burst + suppression proofs committed in cook-watch-fs.test.ts
- DoD2 PASS: notes record callback/store integration + race mechanism (watch.ts live getState, index.ts setStoreFor ordering, cwd guards)
- DoD3 PASS: stopWatcher clears timer+close, session_stop closes exactly once, no leaked timers
- DoD4 PASS: CHANGELOG.md Unreleased has distinct TASK-32.2 bullet with file list and 26-pass evidence

Scope: changes limited to watch.ts/index.ts + focused fs/ignore/watch-state/tui tests + changelog; no unrelated behavior changes beyond hasUI/autocomplete already tracked by sibling tasks; debounce/filter/sendMessage semantics preserved.

Previous BLOCKING resolved:
- Missing timestamp/race tests: FIXED — 5 deterministic fs-watch tests added prove ISO order, burst 1+1, disabled/ID suppression, cwd isolation
- Stale closure/cwd guard: FIXED — watch.ts live scheduledState/fireState + index.ts store check + normalizeCwd mismatch gate before sendMessage

FOLLOW-UP (non-blocking):
- plugins/cook/extensions/watch.ts:42-56 — debounceMs applied per-event not mid-flight; documented as intentional live-sample behavior; no bug.
- plugins/cook/extensions/state.ts:122 — never-fired empty state is implicit omission (watch: ON) not explicit never string; now tested as contract and acceptable; if stronger UX desired, change to watch: ON — never fired but not required for AC.

Verdict: REVIEW_PASSED — all AC/DoD satisfied, blocking fixes real and verified, no regressions.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Persisted debounced watch activity through the watcher-cwd store before the unchanged sendMessage trigger, with live enabled/watchId/debounce validation and explicit cwd isolation. Added deterministic timestamp, burst, suppression, cwd-switch, and never-fired widget tests; separated the changelog entry. Verified with the targeted Vitest set: 4 files, 26 passed, 0 failed.
<!-- SECTION:FINAL_SUMMARY:END -->
