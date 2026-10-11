---
id: TASK-32.6
title: Verify cook TUI batch 1 contracts
status: Done
assignee:
  - '@CookWorker381'
created_date: '2026-08-27 15:17'
updated_date: '2026-08-28 01:12'
labels:
  - investigation
milestone: m-1
dependencies: []
parent_task_id: TASK-32
priority: medium
type: chore
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own final objective verification for cook TUI batch 1 after TASK-32.2, .3, .4, and .5 land. Run the focused contract tests, the cook plugin typecheck, and the full cook test suite; inspect the resulting widget/autocomplete/activity behavior for the explicit OMP constraints (≤10 widget lines, width-safe output, viewport-local updates, no interactive calls without UI). Record exact commands and outcomes, and report any failure without weakening tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focused Vitest coverage proves widget stage composition, Backlog counts, watch activity, autocomplete, title/working-message activity, and headless fallbacks.
- [x] #2 bunx tsc --noEmit -p plugins/cook/tsconfig.json passes with the repository dependency/type configuration.
- [x] #3 bun test plugins/cook passes without skipped or weakened contracts.
- [x] #4 The verification notes include exact command output, changed-file scope, and any residual risk.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All verification commands are run after every dependency is complete.
- [x] #2 Acceptance criteria are checked only from objective command or scenario evidence.
- [x] #3 Failures are recorded with file/test names and are not hidden by changing assertions.
- [x] #4 CHANGELOG.md entry is confirmed under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wait for TASK-32.2, TASK-32.3, TASK-32.4, and TASK-32.5 to be objectively complete; verify their notes identify changed files and focused evidence. Risk: testing before all contracts land gives a false green.
2. Run the focused tui-batch1/activity/watch/autocomplete tests, then bunx tsc --noEmit -p plugins/cook/tsconfig.json, then bun test plugins/cook.
3. Inspect output for skipped/weakened tests and explicitly check the OMP constraints: widget ≤10 lines, width-safe rows, viewport-local updates, no interactive calls without UI, and preserved orchestration/debounce behavior.
4. Record exact commands/results, changed-file scope, residual risks, and only then check acceptance criteria and DoD.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: dependency barrier, ordered verification commands, explicit OMP constraints, and anti-weakened-test requirement are explicit.

Worker verification after TASK-32.5: bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail, 72 expect() calls; covers widget composition/counts, autocomplete interactive/headless registration, activity transitions/reset, and no-UI activity guards. Headless smoke commands covered config picker no-op, stop confirmation no-op, state append/persistence, notification feedback, widget suppression, and autocomplete suppression; all returned deterministically with 0 unsupported interactive calls. Default bunx tsc --noEmit -p plugins/cook/tsconfig.json failed with TS2688 because its absolute /root/.bun/install/global Node typeRoots is unavailable in this environment; the same plugin typecheck passed with repository Node types override --typeRoots /home/eag1/repo/ezxomp/node_modules/.bun/@types+node@26.4.0/node_modules/@types (exit 0). Changed scope: config.ts, cook-tools.ts, autocomplete.ts, index.ts, CHANGELOG.md (existing TASK-32.1-.4 Cook files remain untouched by this worker). Full bun test plugins/cook and independent review are intentionally not run by worker; TASK-32.6/main owns those gates. Residual risk: default tsconfig typeRoot portability and full Cook suite require main follow-up.

Scope correction: TASK-32.5 necessarily updates existing integration points in cook-tools.ts and index.ts to guard their UI calls; these are additive boundary guards only and do not reopen or alter TASK-32.1-.4 widget/watch/autocomplete/activity contracts. autocomplete.ts received only an optional capability check; config.ts carries the model-picker guard.

Post-hardening rerun: bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail, 72 expect() calls. bunx tsc --noEmit -p plugins/cook/tsconfig.json --typeRoots /home/eag1/repo/ezxomp/node_modules/.bun/@types+node@26.4.0/node_modules/@types — exit 0. Headless smoke verified config role=all explicit no-change output and /cook config unchanged notification, with no select/model calls. Full bun test plugins/cook and default typecheck remain main/TASK-32.6 gates.

Additional targeted command: bun test plugins/cook/tests/cook-watch-cli.test.ts plugins/cook/tests/cook-durability.test.ts plugins/cook/tests/cook-dispatch.test.ts — 2 pass, 13 fail. Failures: cook-watch-cli.test.ts /cook start errors when no chain exists expected notify matching cook_start|no chain/workflow but received "watch started. file changes will trigger the cook workflow."; cook-durability.test.ts durability cases and cook-dispatch.test.ts task-tool availability cases fail before assertions because the Bun Vitest runtime mock lacks vi.resetModules (TypeError: vi.resetModules is not a function). These are recorded failures; no assertions were changed or weakened. The required focused TUI/activity command remains green (20 pass, 0 fail); main should rerun under the repository Vitest config before closing TASK-32.6.

Runner clarification: the earlier Bun test invocation of cook-watch-cli/durability/dispatch produced 2 pass/13 fail due the Bun runner lacking vi.resetModules and a persisted repository cook-state affecting the no-chain assertion. Re-running the same regression files under the required package Vitest config succeeded: bunx vitest run --config vitest.config.ts tests/cook-watch-cli.test.ts — 1 file, 3 passed, 0 failed; bunx vitest run --config vitest.config.ts tests/cook-durability.test.ts tests/cook-dispatch.test.ts — 2 files, 12 passed, 0 failed. No tests were modified.

Verification hygiene: failure output and runner/environment distinctions are recorded above with file names and exact observed messages; no tests/assertions were changed. CHANGELOG.md contains the TASK-32.5 entry under ## [Unreleased].

VALIDATOR GATE (CookValidator381, 2026-08-28): independent verification. AC#1 PROVEN: focused Vitest (tui-batch1 + cook-activity) 20 pass/0 fail/72 expect() covers widget composition, Backlog counts, watch activity, autocomplete, title/working-message activity, headless fallbacks; full Cook suite under package Vitest 15 files/96 passed/0 failed. AC#2 BLOCKED: bunx tsc --noEmit -p plugins/cook/tsconfig.json exits 1 with TS2688 'Cannot find type definition file for node' — plugins/cook/tsconfig.json hardcodes typeRoots /root/.bun/install/global/node_modules/@types which does not exist in this environment; with --typeRoots /home/eag1/repo/ezxomp/node_modules/.bun/@types+node@26.4.0/node_modules/@types the same command exits 0. Concrete next action: change plugins/cook/tsconfig.json typeRoots to a repository-relative path (e.g. ../../node_modules/.bun/@types+node@26.4.0/node_modules/@types or drop typeRoots and rely on repo @types/bun) — note plugins/lean-ctx/tsconfig.json already made this fix in the working tree. AC#3 BLOCKED: literal 'bun test plugins/cook' exits 1 — 62 pass, 24 fail, 4 errors; every failure is a Bun-runner artifact (vi.resetModules is not a function, importOriginal is not a function) or the persisted repo backlog/cook-state.json active chain (TASK-38.1) breaking the no-chain /cook start assertion; the same 15 files pass 96/96 under the package Vitest config (bunx vitest run --config vitest.config.ts). Concrete next action: run the full suite under the package Vitest config (as the package.json test script does) and record that as the canonical full-suite command, or fix the tests to be runner-agnostic. AC#4 PROVEN: exact command output, changed-file scope, and residual risks recorded (see notes). DoD#1 BLOCKED (AC#2/#3 not green). DoD#2/#3/#4 PROVEN. No tests were modified or weakened by this validator.

TASK-38.1 blocking-fix follow-up (2026-08-28): plugins/cook/tsconfig.json no longer uses stale absolute /root typeRoots; it uses repository-relative ./node_modules/@types plus ../../node_modules/.bun/@types+node@26.4.0/node_modules/@types. Cook test compatibility preserves all assertions and intent: vi.resetModules is optional under Bun, node:fs mock fallback uses process.getBuiltinModule, watcher state/mock history reset explicitly, debounce checks await real timers, and CLI/watch tests use isolated non-repository cwd so persisted state cannot affect the literal gate. No assertions were weakened or added. Exact verification: bunx tsc --noEmit -p plugins/cook/tsconfig.json — exit 0; bun test plugins/cook — 96 pass, 0 fail, 312 expect() calls across 15 files; bun test plugins/cook/tests/tui-batch1.test.ts plugins/cook/tests/cook-activity.test.ts — 20 pass, 0 fail, 72 expect() calls; cd plugins/cook && bunx vitest run --config vitest.config.ts — 15 files, 96 passed, 0 failed. Lifecycle error-path smoke is recorded on TASK-32.5. TASK-32.6 remains In Progress pending independent validator/judge re-review; DoD#1 remains unchecked because unrelated repository gate failures are external to Cook.

Configuration refinement after initial follow-up note: final plugins/cook/tsconfig.json follows repository root convention instead of version-specific typeRoots — moduleResolution=bundler, types=["bun"], and no absolute or hardcoded dependency path. Final reruns after this refinement: bunx tsc --noEmit -p plugins/cook/tsconfig.json — exit 0; bun test plugins/cook — 96 pass, 0 fail, 312 expect() calls; cd plugins/cook && bunx vitest run --config vitest.config.ts — 15 files, 96 passed, 0 failed.

VALIDATOR GATE (CookValidator381Fix, 2026-08-28): independent re-verification after judge-fix pass. AC#2 PROVEN: bunx tsc --noEmit -p plugins/cook/tsconfig.json — exit 0 (tsconfig portability fixed: moduleResolution bundler + types [bun], stale absolute /root typeRoots removed). AC#3 PROVEN: literal bun test plugins/cook — 96 pass, 0 fail, 312 expect() calls across 15 files; runner-compat updates (vi.resetModules?.(), process.getBuiltinModule fs fallback, explicit watcher resets, real debounce waits, isolated cwd) make Bun execution deterministic without assertion changes. Package Vitest also green: 15 files, 96 passed, 0 failed. Focused TUI/activity: 20 pass, 0 fail, 72 expect() calls. Lifecycle rejection smoke (temp, removed): syncFromBacklog + pollWatchedTasks rejections surfaced as warning notifications, turn_start non-fatal — 2 tests passed. DoD#1 remains unchecked: TASK-32.5/.6 not terminal (no final summaries; judge re-review pending). No tests weakened: cook-durability idempotency scenario updated to currentTaskId null (old TASK-A scenario provably fails against current syncFromBacklog which removed the final-phase early return); new sync-from-backlog test covers the pointer-clear contract.

Independent judge re-review accepted the verification evidence. DoD #1 is now proven: all required Cook verification commands ran after TASK-32.5 completion; Cook typecheck, literal Bun suite, package Vitest, focused tests, and lifecycle smoke passed. Repository-wide four unrelated failures remain recorded against TASK-32, not attributed to Cook.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @CookJudge381
created: 2026-08-28 00:36
---
[blocking] plugins/cook/tsconfig.json:4 — required `bunx tsc --noEmit -p plugins/cook/tsconfig.json` fails TS2688 because the absolute `/root/.bun/install/global/node_modules/@types` typeRoots is unavailable; only the ad-hoc repository `--typeRoots` override passes. This leaves TASK-32.6 AC#2 and DoD#1 unchecked. Fix the tsconfig to use repository-portable type resolution (relative typeRoots or no hardcoded typeRoots), then rerun the exact command.
---

author: @CookJudge381
created: 2026-08-28 00:36
---
[blocking] plugins/cook/tests/cook-dispatch.test.ts:48 and plugins/cook/tests/cook-watch-fs.test.ts:24 — the required literal `bun test plugins/cook` run fails (62 passed, 24 failed, 4 errors) because Bun lacks Vitest APIs (`vi.resetModules`/`importOriginal`), with an additional persisted-state no-chain assertion artifact; the same 15 files pass 96/96 only under package Vitest. This leaves TASK-32.6 AC#3 and DoD#1 unchecked. Establish one canonical runner that satisfies the stated gate (or make the suite runner-agnostic), rerun it, and record exact output.
---

author: @CookJudge381Re
created: 2026-08-28 01:08
---
[blocking] backlog/tasks/task-32.6 - Verify-cook-TUI-batch-1-contracts.md:4 — AC1-4 are supported by the reported exact Cook evidence (including literal Bun 96/96 and portable typecheck), but DoD1 remains unchecked and final summary is absent while status is In Progress. TASK-38.1 AC2/DoD1 require this child to be terminal with checked DoD, notes, and final summary. Fix: check only DoD1 after its evidence is accepted, write the final summary, and move the child to Done.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified Cook TUI batch 1 contracts after dependencies completed: focused coverage, portable plugin typecheck, and literal full Cook suite all pass (20/20 focused; 96/96 full Cook; tsc exit 0), with headless/interactive and lifecycle error-path behavior exercised. Independent validator and judge re-review completed; external repository-wide failures remain explicitly documented on TASK-32.
<!-- SECTION:FINAL_SUMMARY:END -->
