---
id: TASK-52.5
title: RED producer-contract test suite for E1/E2/E3/E4/E5/E6 observable contracts
status: Done
assignee: []
created_date: '2026-08-29 02:20'
updated_date: '2026-08-29 03:35'
labels: []
dependencies: []
parent_task_id: TASK-52
priority: high
type: task
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Test-first guardrail ticket for the whole TASK-52 batch, covering the 6 ACs of TASK-52 that are observable in tests: (G1) projection fires on non-claim/release commits; (G2) agentLog gains writers; (G3) gate receipts in journal map to attempt_settled verified; (G4) locator+liveness; (G5) orchestrator env; (G6) kind/projects. Test files: extend plugins/cook/tests/dagr-projection.test.ts (BASE fixture, fake DAGR_BIN pattern dagr-projection.test.ts:65-96) with lifecycle cases using the pure buildRunDoc path, and add plugins/cook/tests/dagr-push-triggers.test.ts using the mock harness (makePi line 150, __getToolHandler line 66, makeCtx line 104, createStoreContext, registerCookTools) + bl('...') backlog CLI runner pattern from claims.test.ts:12-21 to drive cook_journal/claims/dispatch through tmpdir cwd with git-init'd backlog repo. Tests must be deterministic and pass pre-fix for already-correct invariants (E150 synthetic settled_unverified, tmp→check→rename, silent disable) and FAIL pre-fix for the new E1/E2/E3/E4/E5 behaviors specifically. Evidence tier mapping table asserted: gate receipt→verified, dispatch envelope→reported, nothing→asserted/settled_unverified.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 RED tests exist BEFORE implementation for every new behavior: (a) dagr-lifecycle unit tests on the pure input-builder + buildRunDoc: working-attempt-liveness, locator mapping, evidence tiers (verified/reported/settled_unverified fallback), attempt-per-dispatch-record dedupe, kind mapping — all fail on current code
- [x] #2 (b) tool-level test invoking cook_journal gate + dispatch tools via __getToolHandler with tmpdir backlog repo proves agentLog append + journal gate receipt written; fails before fix (agentLog never appended today)
- [x] #3 (c) projection freshness test: pushDagr observed after cook_next (currently absent — verified zero call sites) via spy on projectDagr or .dagr/run.json mtime/content with fake DAGR_BIN
- [x] #4 targeted vitest invocation command proven in notes: cd plugins/cook && bunx vitest run tests/<new-file> runs RED with named failures before implementation
- [x] #5 existing dagr-projection.test.ts suite unchanged and still passing (invariant guards, not expectation flips)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend `plugins/cook/tests/dagr-projection.test.ts` with future pure-builder contracts for journal-derived attempts, evidence receipts, locator/liveness, orchestrator, kind, and projects.
2. Add `plugins/cook/tests/dagr-push-triggers.test.ts` using the existing mock ExtensionAPI plus temporary Backlog repo and fake `DAGR_BIN` to assert dispatch/journal lifecycle records and freshness after non-claim mutations.
3. Add a deterministic negative recovery contract that requests a typed validator/judge kickback and asserts error recording, valid route, and view-only strict-clean projection.
4. Run the new targeted tests before production changes and record their named RED failures; retain existing transaction/invariant expectations unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RED proof before production edits: `cd plugins/cook && bunx vitest run tests/dagr-projection.test.ts tests/dagr-push-triggers.test.ts` exited 1 with 6 named contract failures and 6 retained baseline tests passing. Failures: missing `buildDagrProjectionInput`; kind remains `impl` instead of `docs`; no run file after `cook_next`; no worker dispatch `agentLog` entry; `cook_record_result` is unregistered; `cook_journal` writes `event:"external"` instead of a `gate` receipt. The existing six dagr transaction/invariant tests remained green.

Finalization evidence: targeted RED suite exited 1 as designed with 8 named unsatisfied production contracts and 6 pre-existing dagr invariant/transaction tests green. The new tests are deterministic: temporary Backlog repository, fake `DAGR_BIN`, no HERDR/network.

Post-review regression extension: planner added RED coverage for per-task journal sequence collisions, red gate outcome safety, malformed gate rejection, validator write-ahead failure, and live pushDagr consumption of lifecycle receipts. Baseline command remains red until the review findings are repaired; tests isolated in bookmark `task-52-1-tests`.

Added a second review-driven RED regression for a stale terminal record preceding its dispatch; it is isolated in bookmark `task-52-1-stale-test` and verifies unmatched dispatch settlement uses its dispatch timestamp rather than stale journal evidence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Authored the TASK-52 red producer and demo-recovery contracts. Verified with `cd plugins/cook && bunx vitest run tests/dagr-projection.test.ts tests/dagr-push-triggers.test.ts`: 8 expected red failures expose the missing lifecycle builder, kind/projects, freshness, dispatch logging, typed recovery, gate receipt, and HERDR/liveness behavior; 6 retained baseline tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
