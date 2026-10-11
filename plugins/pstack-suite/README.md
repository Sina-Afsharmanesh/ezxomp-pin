# pstack-suite

Unified agent workflows for coding agents: code quality, PR review, docs, CI, team ops.

## Testing

### Deterministic unit tests (gate)

```bash
# From repo root
bun run test:pstack

# From plugin directory
bunx vitest run
```

32 test files · 550 tests · runs in ~1s. Included in `just verify` via the `pstack-test` recipe.

### Live process-spawning tests (opt-in)

`src/runner.test.ts` exercises real process spawning and is excluded from the default suite.

```bash
# From plugin directory
RUN_LIVE=1 bunx vitest run --config vitest.live.config.ts

# Or via script (from plugin directory)
bun run test:live
```

## Gate Integration

The pstack test suite is part of the repository verification gate:

```bash
just verify    # runs: check → test → pstack-test
```

`bun test ./test/` (root) covers OMP core — it does **not** include plugin tests.
The pstack suite runs exactly once per `just verify` via the `pstack-test` recipe.


## Smoke tests (opt-in)

Foundation smoke coverage (missing deps, auth/network failures, dirty state, cancellation, pending checks, git paths):

```bash
cd plugins/pstack-suite
bun run test:smoke        # or: RUN_SMOKE=1 bunx vitest run --config vitest.smoke.config.ts
```

Skipped by default; the deterministic gate excludes `test/**/*.smoke.test.ts`.
