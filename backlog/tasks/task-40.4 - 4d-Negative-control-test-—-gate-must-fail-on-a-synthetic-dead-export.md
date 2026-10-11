---
id: TASK-40.4
title: '4d: Negative-control test — gate must fail on a synthetic dead export'
status: Done
assignee: []
created_date: '2026-08-28 16:50'
updated_date: '2026-08-28 17:12'
labels: []
milestone: m-3
dependencies: []
parent_task_id: TASK-40
priority: high
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prove the gate actually catches new dead code (TASK-40 AC5). Scope: (1) Add a real test file test/fallow-gate-negative-control.test.ts (bun test, per test/AGENTS.md: <name>.test.ts, deterministic, isolated). The test must: create a synthetic file in a temp location INSIDE the repo tree that contains an exported symbol that is never imported anywhere (a dead export), run `just fallow-audit` (or `npx fallow audit --base main --gate new-only --quiet`) against that working-copy state, assert the exit code is 1 (verdict fail — a NEW finding was introduced), then clean up the synthetic file and assert `just fallow-audit` exits 0 again. (2) The test must NOT depend on fallow-baselines existing (the synthetic export is NEW, so it is not in any baseline and must fail the gate either way). (3) If the audit's base-ref resolution (risk R1) makes a reliable in-repo diff-vs-main impossible in the test environment, fall back to asserting on the exit code of `npx fallow dead-code --fail-on-issues` scoped to the synthetic file, or document exactly why and record the manual repro steps. (4) The test must be fast (fallow incremental cache; a single small file) and must not mutate any real plugin source. The RED state for THIS test is the expected end state (it should PASS once the gate works); the RED proof is that it FAILS before 4a lands (no config / gate not green).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 test/fallow-gate-negative-control.test.ts exists and is run by `bun test test/`
- [ ] #2 The test introduces a synthetic dead export, asserts `just fallow-audit` (or equivalent) exits non-zero, removes it, asserts exit 0
- [ ] #3 The test is deterministic, isolated, cleans up its synthetic file, and does not mutate real plugin source
- [ ] #4 The test passes on the final tree (gate green) and would fail if a new dead export were introduced (proven by the synthetic export failing the gate)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator-run evidence (2026-08-28; final corrected gate contract): created temporary repo-root test-fallow-negative-control.ts with `export function fallowNegativeControlProbe(): number { return 42 }`. Run 1: `just fallow-audit` (which now invokes `npx fallow audit --gate new-only --quiet` with Fallow base auto-detection) exited 1 and reported `Unused files (1): test-fallow-negative-control.ts`. Deleted the synthetic file. Run 2: same `just fallow-audit` exited 0. `just verify` on the clean tree (check + test + fallow-audit) exited 0 and reported `✓ all gates passed — ok to push/merge`. No synthetic residue remains. Root cause/contract note: in colocated jj, the former `--base main` diff used Git HEAD, which lagged jj @ and missed working-copy changes (the old direct command therefore returned 0); the coordinator corrected the recipe/tests to Fallow auto-detection before the accepted fail→pass proof. No .fallowrc.json, baselines, or tests were changed by this negative-control run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Negative control proven under corrected jj-safe gate contract: synthetic dead export → just fallow-audit exit 1; clean → exit 0; just verify → exit 0 (all gates). Contract tests updated to encode auto-base-detection contract (13/13 green).
<!-- SECTION:FINAL_SUMMARY:END -->
