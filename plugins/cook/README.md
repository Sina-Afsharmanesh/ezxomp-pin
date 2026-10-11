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

## Watch mode

Watch mode installs a file watcher on your `backlog/` directory. When backlog task files change (e.g. an agent marks a task as Done), the watcher triggers a cook re-evaluation automatically — no manual `/cook next` needed.

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

- **session_start**: If `watch.enabled === true` in `backlog/cook-state.json`, the watcher is automatically re-installed on `backlog/`. No manual restart needed across OMP sessions.
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
