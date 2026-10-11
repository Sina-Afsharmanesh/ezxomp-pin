---
id: TASK-22
title: Restore pstack-suite smoke gate under full-repo bun test run
status: Done
assignee: []
created_date: '2026-08-22 23:47'
updated_date: '2026-08-28 01:30'
labels:
  - bug
  - pstack-suite
dependencies: []
priority: high
type: chore
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two verified symptoms blocking the repo gate (`just verify` fails only in plugins/pstack-suite).

S1 (full-suite mock leak): `bun test test/` → plugins/pstack-suite/test/smoke-foundation.smoke.test.ts reports "# Unhandled error between tests — SyntaxError: Export named 'hasBacklogMd' not found in module '/home/egsox/repo/ezxomp/plugins/pstack-suite/src/utils.ts'". Isolated run of the same file does NOT produce this. Working hypothesis: a coverage test in the same directory registers vi.mock for ../utils.js (or similar) and leaks into later files in the same bun process (bun runs test files sequentially in-process; bun's vitest-compat mocks must be explicitly restored/unmocked). Leaker(s) to be identified empirically by bisecting file subsets.

S2 (checkAuth fail-open): RUN_SMOKE=1 isolated smoke-foundation run: two tests fail — 'auth failure: fake gh exits 1 with auth error → block' (~line 77) and 'network failure: fake gh exits 1 with connection refused → block' (~line 96): expect(result.status).toBe('block') receives 'pass'. checkAuth swallows gh non-zero exit / stderr auth+connection errors and passes. Fail-closed production fix required unless fixture mechanics prove broken instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 full `bun test test/` exits 0
- [x] #2 RUN_SMOKE=1 isolated smoke-foundation exits 0 with both block-contracts passing
- [x] #3 no existing assertion weakened
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ROOT CAUSE S1: bun runs each test FILE sequentially in one process, but per-file vi.mock module-registry overrides survive into later files' module graphs; parity-foundation.test.ts registered vi.mock for ../src/utils.js (partial factory), ../src/runner.js, and node:child_process, so smoke-foundation's import graph could bind partial mock surfaces → SyntaxError: Export named 'hasBacklogMd' not found. Reproduced deterministically (5/5) via a minimal registerer+consumer pair. bun's vitest shim lacks vi.unmock/vi.resetModules; vi.restoreAllMocks() and bun:test mock.restore() do NOT evict the evaluated-mock-instance cache (verified empirically).

FIX S1: deleted the registry mocks from parity-foundation.test.ts entirely (assertions untouched — git diff shows 0 removed/0 added expect( lines). Empirical basis: an earlier variant of parity with NO module mocks passed all its own assertions green, proving they were authored for vitest and never needed under bun once fixtures were real. The only real dependency was fixture quality: parity's gitInit created empty repos (unborn HEAD) which real handleShip rejects ('cannot determine target branch'); fixed by mirroring smoke-foundation's proven gitInit (write README.md before commit). This is fixture repair, not assertion change.

ROOT CAUSE S2: production fail-open in src/run.ts checkAuth. Bun's spawnSync resolves bare command names against the environment captured at process startup and IGNORES runtime process.env.PATH mutations unless an explicit env option is passed; smoke's PATH-prepended fake gh was silently skipped and a stale authenticated real gh won → 'pass' on what must be 'block'. Verified with standalone probes: bash resolves the same PATH mutation correctly; bun spawnSync with explicit env option resolves the fake first.

FIX S2: checkAuth now passes env: { ...process.env } to both gh spawnSync calls and additionally treats authResult.error as failure (fail-closed). Missing-gh 'unknown' policy unchanged. CHANGELOG.md entry added under ## [Unreleased] ### Fixed.

VERIFICATION: RUN_SMOKE=1 isolated smoke-foundation = 18 pass / 0 fail x2 (both fake-gh block contracts pass). Full repo gate 'bun test test/' = PASS twice consecutively (16 pass + 297 pass, 0 fail). Plugin test dir 'bun test plugins/pstack-suite/test/' = 0 'Export named', 0 SyntaxError across both runs (leak gone). bunx tsc --noEmit = exit 0 (plugin tsconfig AND repo root). Assertion-preservation proof: git diff on parity-foundation.test.ts contains zero removed or added expect( lines.

SCOPE NOTE: 'bun test plugins/pstack-suite/' also executes src/**.coverage.test.ts files (vitest-authored, plugin ships vitest.config.ts); those use vi.resetModules which bun's shim does not implement — 231 pre-existing failures unrelated to this ticket and outside the repo gate scope (gate discovers root test/ + plugins/*/test/ only). Evidence: src/index.coverage.test.ts is the FIRST file alphabetically and fails inside its own beforeEach before any cross-file contamination is possible.

Follow-up from TASK-38.1: handleShip dry-run now skips only the external gh gate, required dependency, and auth preflight check because preview performs no mutation; mutating ship remains unchanged and gh-gated. This restores UI/headless dry-run parity on hosts without gh. Evidence: bun test plugins/pstack-suite/test/parity-foundation.test.ts — 2 pass, 0 fail, 10 expect().
<!-- SECTION:NOTES:END -->
