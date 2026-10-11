# gsd-loop

## Purpose

Autonomous unit-execution loop kernel for OMP: a per-cwd work queue of units
(brief + optional verify command) driven turn-by-turn by the model through
`gsd_loop_*` tools, with the gsd-pi loop.ts guard catalog (runaway cap, error
ladder, cooldown budget, finalize-timeout ladder, memory-pressure stop,
wedge/liveness backstop) enforced in a pure `src/kernel.ts` state machine.

## Local Contracts

- Kernel purity: `src/kernel.ts` has no `pi` and no fs — all dependencies
  (time, heap ratio, uuid) injected via `KernelDeps`.
- All state lives under `<cwd>/.gsd-loop/` — never cook-state.json, never
  any other plugin's namespace. Schema version 1; version mismatch refuses.
- Tools and commands share the `src/core.ts` facade; no surface bypasses it.
- Guard pipeline order is load-bearing (STOP flag → wedge → lock → iteration
  cap → memory → completion → no-advance wedge → dispatch) — preserve order.

## Review gates

- No writes outside `<cwd>/.gsd-loop/` (state root); briefFile reads are
  path-confined to the project root.
- State schema version 1: `loadState` refuses mismatched versions, never
  silently migrates.
- Settings round-trip through `package.json#omp.settings` shape — 9 declared
  keys, clamped/normalized by `resolveGsdLoopSettings`.
- Wedge re-entry only via `/gsd-loop resume --wedge <id>` (id must match the
  active record).

## Work Guidance

- Pattern A typebox for tool params (standalone `typebox` import).
- All UI calls guarded on `ctx.hasUI`; every output also returned as text +
  `details` so headless/RPC consumers see full state.
- Tests live in `tests/` (vitest); repo smoke test is `test/gsd-loop.test.ts`.

## Child DOX Index

(none — single-domain plugin; module contracts are documented in-file)
