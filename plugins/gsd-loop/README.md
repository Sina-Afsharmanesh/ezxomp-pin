# @ezxomp/gsd-loop

Autonomous GSD loop kernel for OMP — port of the gsd-pi auto-mode loop
(`src/resources/extensions/gsd/auto/loop.ts`): iteration contract
(`advance → guards → runUnit → finalize`), guard catalog, and
persistence/crash-safety model, driven OMP-natively (the model pumps the
loop via `gsd_loop_*` tools; the kernel is a pure, persisted state machine).

## Command surface

| Command | Semantics |
|---|---|
| `/gsd-loop` | Smart entry: wedge summary, running status, or queue summary + start hint |
| `/gsd-loop start [--verbose]` | Activate the auto loop driver |
| `/gsd-loop next [--dry-run]` | Step mode: one unit, then auto-pause |
| `/gsd-loop stop` | Graceful stop; foreign live lock → STOP flag file |
| `/gsd-loop pause` | Persist paused + reason + in-flight unit |
| `/gsd-loop resume [--wedge <id>]` | Resume; `--wedge` acknowledges the wedge record |
| `/gsd-loop status` | Rendered run/queue/counters/journal status |
| `/gsd-loop enqueue <id> <title> [...]` | Add a pending unit |
| `/gsd-loop list` | Tabular queue view |

## Tools

`gsd_loop_start`, `gsd_loop_stop`, `gsd_loop_pause`, `gsd_loop_resume`,
`gsd_loop_status`, `gsd_loop_advance`, `gsd_loop_record_result`,
`gsd_loop_next`, `gsd_loop_enqueue`, `gsd_loop_list`.

## State directory

Per-cwd `<cwd>/.gsd-loop/`: `state.json` (atomic tmp+rename),
`journal/YYYY-MM-DD.jsonl`, `activity/`, `loop.lock`, `STOP`, `wedge.json`,
crash notes. Schema version 1; mismatch refuses, never silently migrates.

## Settings (package.json#omp.settings)

| Key | Default | Min | Upstream constant |
|---|---|---|---|
| `loop.maxIterations` | 500 | 1 | MAX_LOOP_ITERATIONS |
| `loop.memoryCheckInterval` | 5 | 1 | MEMORY_CHECK_INTERVAL |
| `loop.memoryHeapThresholdRatio` | 0.85 | 0.1 | memory threshold |
| `loop.maxConsecutiveErrors` | 3 | 1 | error-ladder strikes |
| `loop.maxCooldownRetries` | 5 | 1 | MAX_COOLDOWN_RETRIES |
| `loop.cooldownFallbackWaitMs` | 35000 | 1000 | COOLDOWN_FALLBACK_WAIT_MS |
| `loop.maxFinalizeTimeouts` | 3 | 1 | MAX_FINALIZE_TIMEOUTS |
| `verify.maxRetries` | 3 | 0 | MAX_CUSTOM_ENGINE_VERIFY_RETRIES |
| `verify.timeoutMs` | 120000 | 1000 | verification_timeout_ms |

## Loop driver contract (auto mode)

`before_agent_start` injects the operating instruction while running+auto;
`session_stop` returns `{continue:true}` with a no-progress fingerprint guard
(two idle continues in a row pause the run — runaway backstop); `session_shutdown`
auto-pauses a running run with reason `session-shutdown`.

## Dropped behaviors (with upstream reasons)

- Custom-engine path + `GSD_ENGINE_BYPASS` — custom engine not ported.
- Budget/cost ceilings (`budget_ceiling`, `per_unit_cost_cap_usd`,
  `unit_cost_spike_multiplier`) — no OMP cost-telemetry surface for
  extensions; the iteration cap remains the runaway bound.
- `min_request_interval_ms`, `uat_dispatch`, `parallel`, `phases.*` —
  gsd-core pipeline/domain prefs, not kernel concerns (pipeline surface
  unassigned).
- `/gsd do` freeform keyword router — one strict subcommand parser instead.
- `--yolo` headless seed, `--model` pin, UAT phases — discuss-flow /
  host-concern features, not kernel.
- DB-backed `unit_dispatches` claim ledger, workers table, milestone
  leases/fencing, sidecar queue, session-lock — no SQLite substrate in
  ezxomp; replaced by per-cwd lock file (pid liveness-probed) +
  pointer-atomic single-process claims + JSONL journal audit events.
- Cross-instance stop via signals — replaced by the `STOP` flag file.
- Verify-retry exhaustion stops the whole run (`Stopped: verify retries exhausted`)
  instead of gsd-pi's per-unit skip-and-continue — the exhausted unit is marked
  `failed` and the run halts so the operator can triage before further spend.
- Memory-pressure checkpoint is interval-gated via `loop.memoryCheckInterval`
  (default 5) — probed only when `iterations % interval === 0`, matching the
  plan's checkpoint cadence.

Two hosts (OMP + hand-rolled script) editing state concurrently is
undefended — documented out-of-assumption.
