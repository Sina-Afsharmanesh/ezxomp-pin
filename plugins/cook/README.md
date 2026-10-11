# omp-backlog-cook

Backlog.md cookbook workflow plugin for OMP. Decomposes work into atomic sub-tickets and drives scout/planner/worker/judge agents through OMP's native `task` tool, with ADHD divergent ideation, DAG iteration, and Definition-of-Done gate enforcement.

---

## Quick start

```bash
# Start a new workflow chain
/cook start TASK-5

# Advance to next sub-ticket
/cook next

# Check current chain state
/cook status
```

## Agent profiles

Cook ships ten project-installable profiles under `agents/`: the existing OMP-specific planner, scout, researcher, worker, validator, judge, council, and council-synthesis stations plus upstream-derived `cook-audit` and `cook-refute`. The local planner/worker/validator/judge profiles are the OMP equivalents of Jeff's `plan`/`implement`/`verify`/`review` stages; duplicate aliases are intentionally not installed.

On `session_start`, Cook refreshes the complete roster in the project `.omp/agents/` directory before the personal `$OMP_HOME/agents/` directory. Use `/cook install project` for an explicit refresh. A version-and-hash marker detects plugin updates and profile drift. When `/evo-sub` owns the profiles, Cook skips both scopes so the rewrite backup remains restorable.

## Result and convergence lifecycle

Record each fresh specialist envelope with `cook_record_result`; worker repair envelopes include the actual `modified_files`. Missing or out-of-scope file evidence forces a full judgment reset. At the post-bonus convergence cap, Cook persists a council episode: execute the exact three-lane batch from `cook_dispatch_council`, pass the three votes to `cook_dispatch_council_synthesis`, then record its executable `plan`, `implement`, or `verify` route with `cook_record_council`.

Each dispatch emits `dispatch_stage`; pass that exact identity to `cook_record_result` for parallel specialists. Recovery retains journal history but starts a fresh attempt, so prior failed receipts cannot block repaired work. If a validator or judge is proven orphaned, redispatch with `supersede:<its dispatch_stage>`; all specialists required by that attempt must run fresh.

Validator gates use `cook_journal({task_id,event:"gate",stage:"verify",dispatch_stage,hash,green,note})`. Standalone audit or other-stage gates never complete a validator dispatch. Copy the exact binding from the validator brief; stale or mismatched receipts are rejected.

Claims and state/journal commits share an interprocess lock at the canonical project root. Only a persisted claim authorizes a lane. Corrupt state/journal or persistence failure is explicit, not an empty-state fallback. Turn reconciliation leaves sibling activation to `cook_next`, which excludes claimed/blocked/terminal tasks and orders ready work high, medium, low, then unprioritized.


## Watch mode

Watch mode starts monitoring immediately, including existing and newly created nested task/doc directories under `backlog/` on Linux. Task/doc edits notify without restarting the session. Dotfiles, state/config churn, and directory symlinks are excluded.

### Enabling watch

**Via tool:**

```json
{
  "tool": "cook_watch",
  "action": "start",
  "debounceMs": 250,
  "trigger": "auto"
}
```

**Via CLI:**

```
/cook start
```

Watch state is persisted to `backlog/cook-state.json` and is automatically resumed at the next `session_start`.

### Disabling watch

```
/cook stop
```

Or via tool:

```json
{ "tool": "cook_watch", "action": "stop" }
```

### Querying watch status

```
/cook status
```

Outputs the current watch state: enabled/disabled, debounce, trigger mode, and last fire time.

### State fields

Watch state lives in `backlog/cook-state.json` under the `watch` key:

| Field | Type | Default | Description |
|---|---|---|---|
| `watch.enabled` | `boolean` | `false` | Whether the file watcher is active |
| `watch.debounceMs` | `number` | `250` | Milliseconds to collapse burst events |
| `watch.trigger` | `"auto" \| "manual"` | `"auto"` | Auto-triggers cook re-evaluation or waits for manual `/cook next` |
| `watch.lastFiredAt` | `string \| null` | `null` | ISO timestamp of last watch fire |
| `watch.watchId` | `string \| null` | `null` | UUID identifying the current watch session |

### Policy

When a backlog file event fires, the cook policy engine decides the next action:

| Condition | Action |
|---|---|
| Worker stage just completed (cook_dispatch_worker returned) | Advance chain to next stage (`verify` / `review` / `done`) |
| All sub-tickets under current parent are Done | Prompt to close parent task |
| Otherwise | Prompt for next sub-ticket via `cook_next` |

### Lifecycle

- **session_start**: Persisted enabled watch settings resume filesystem monitoring. `cook_watch start` and bare `/cook start` install monitoring immediately; stop closes all watchers and pending notifications. In manual mode, notifications do not request an agent turn.
- **session_stop**: The active watcher is closed and its resources released.

### Worked example

```
# 1. Start a workflow chain
/cook start TASK-10

# 2. Enable watch mode (250ms debounce)
/cook start

# 3. Let agents run — when a worker completes its task,
#    the watcher detects the backlog file change and
#    auto-triggers re-evaluation:
#
#    [cook-watch] Backlog file changed: task-10.1.md
#    → Policy: worker completed → advancing to verify

# 4. Check status at any time
/cook status
# → Watch: enabled — debounce: 250ms, trigger: auto

# 5. Disable when done
/cook stop
```
