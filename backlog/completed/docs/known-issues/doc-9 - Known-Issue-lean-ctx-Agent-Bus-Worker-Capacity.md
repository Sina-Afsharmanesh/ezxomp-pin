---
id: doc-9
title: 'Known Issue: lean-ctx Agent-Bus Worker Capacity'
type: other
created_date: '2026-08-27 19:42'
updated_date: '2026-08-27 19:45'
tags:
  - known-issue
  - bug
  - lean-ctx
  - agent-bus
  - worker-capacity
  - TASK-37
---
# Known Issue: lean-ctx Agent-Bus Worker Capacity

**Status:** Known upstream limitation; repository mitigation is partial.
**Observed:** 2026-08-27
**Owner:** lean-ctx upstream daemon/binary, not the OMP plugin.

## Symptoms

Cook or another multi-agent workflow can fail with `agent capacity reached` even when OMP fan-out is within its configured limit. The shared lean-ctx presence registry can report a project at `15/15` active workers. Completed or disconnected gateway processes may remain registered until their processes exit or the daemon reaper proves them stale.

## Root cause

The installed `lean-ctx 3.9.20` is a compiled Rust binary. Its upstream source defines:

```rust
const HARD_MAX_CONCURRENT_WORKERS: usize = 15;
```

The loaded `[agents].max_concurrent_workers` value is clamped to `1..=15`, so setting a higher value in `~/.config/lean-ctx/config.toml` cannot increase effective capacity. The current `lean-ctx config` schema does not expose `[agents].max_concurrent_workers`; `lean-ctx config set agents.max_concurrent_workers 32` therefore fails as an unknown key.

The upstream daemon includes a periodic reaper for dead-process presence and expired sessions, but the CLI has no force-reap command for live stale gateway registrations. A live process with an old heartbeat is not safe for an agent to terminate automatically.

## Repository mitigation

`plugins/lean-ctx/extensions/index.ts` disposes session-owned gateway children on `session_shutdown`, preventing normal OMP session completion from leaking gateway processes. OMP fan-out is set locally to `task.maxConcurrency: 12` in `~/.omp/agent/config.yml`, leaving headroom below the external 15-slot limit.

These mitigations do not change the upstream 15-worker hard cap or repair already-live stale processes.

## Safe diagnosis and recovery

Agent-operable, read-only diagnostic:

```bash
lean-ctx call ctx_agent --project-root "$PWD" --json '{"action":"list"}'
```

Do not edit `~/.local/share/lean-ctx/agents/registry.json` and do not blindly retry dispatch. If capacity is exhausted, first close/restart the owning OMP session. An administrator may terminate a confirmed stale process only after verifying both the registry process identity and the current `/proc/<pid>` executable/start marker, then send `SIGTERM`; never blanket-kill the daemon or all lean-ctx processes.

## Proper upstream fix

The upstream Rust source must raise and validate the hard cap, expose the `[agents]` keys in the config schema/setter, and add deterministic capacity/reaper tests. Build and install the resulting binary, then restart the lean-ctx daemon. Hex-editing the installed binary is unsupported and will be overwritten by package updates.

## References

- [Upstream worker admission and hard cap](https://github.com/yvgude/lean-ctx/blob/main/rust/src/core/agents/registry.rs)
- [Upstream `[agents]` configuration](https://github.com/yvgude/lean-ctx/blob/main/rust/src/core/config/sections.rs)
- [Upstream periodic reaper](https://github.com/yvgude/lean-ctx/blob/main/rust/src/core/agents/reaper.rs)
- [Local lean-ctx plugin contract](../../../../plugins/lean-ctx/AGENTS.md)
- [Tracking task TASK-37](../../../tasks/task-37%20-%20Prevent-lean-ctx-agent-bus-worker-saturation.md)
