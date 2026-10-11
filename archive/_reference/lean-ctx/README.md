# @ezxomp/lean-ctx

OMP-native integration for the lean-ctx context engine. The extension routes filesystem reads, searches, globs, shell output, session memory, and generic `ctx_*` capabilities through lean-ctx while preserving OMP lifecycle ownership.

## Agent capacity and stale sessions

Cook fan-out is controlled by OMP's `task.maxConcurrency` in `~/.omp/agent/config.yml`. Use `12` as the recommended local ceiling: it increases the prior `8`-worker OMP setting while leaving headroom for the lean-ctx context engine and other sessions.

The current lean-ctx binary does not expose its per-project registry ceiling through `lean-ctx config set` (`agents.max_concurrent_workers` is rejected as an unknown key). Do not add arbitrary `[agents]` keys to project config. The durable control available to OMP users is `task.maxConcurrency`; preventing leaked gateway children keeps that fan-out below the daemon-owned registry boundary.

Each OMP session may create a lean-ctx gateway child. The extension now handles `session_shutdown` and calls `disposeAllGateways()` so normal worker completion releases its child process. This is the primary prevention for stale registrations.

The registry is daemon-owned at `~/.local/share/lean-ctx/agents/registry.json`. Do not edit that JSON directly. Inspect the current project registrations with:

```bash
lean-ctx call ctx_agent --project-root "$PWD" --json '{"action":"list"}'
```

Agents can run this diagnostic through `ctx_call`:

```text
ctx_call({ tool: "ctx_agent", args: { action: "list" } })
```

If `ctx_*` reports `agent capacity reached`, do not retry blindly. Compare each active entry's `last_active`, PID, executable, and process start identity. A registration is stale only when its heartbeat is outside the bounded lease window and the recorded process identity no longer represents a live intended session. Fresh active workers must never be flushed.

The current lean-ctx binary exposes listing and status operations but no safe remote stale-reap command. Therefore:

1. Agents diagnose and report the stale IDs and heartbeat ages.
2. Users first close/restart the owning OMP sessions; this is the preferred cleanup because normal shutdown now disposes gateways.
3. If a crashed session remains registered, an administrator may terminate only the verified stale gateway process with `SIGTERM`, never use a blanket `pkill`, never kill the daemon/context-engine PID, and never edit `registry.json` by hand.
4. Re-run `ctx_agent` list and only resume Cook after capacity is available.

### Manual stale-process fallback

Because the binary does not publish an authoritative lease duration, heartbeat age is only a candidate signal; first confirm the owning OMP session is closed. For a confirmed stale entry, an administrator can target one PID after revalidating its recorded process identity:

```bash
pid=<registry-pid>
expected_start=<registry-process_identity-start_marker>
expected_exe=<registry-process_identity-executable>
actual_start=$(awk '{print $22}' "/proc/$pid/stat")
actual_exe=$(readlink -f "/proc/$pid/exe")
test "$actual_start" = "$expected_start" && test "$actual_exe" = "$expected_exe" || exit 1
kill -TERM "$pid"
```

This command is intentionally user/admin-only: the current daemon has no remote stale-reap API, and an agent must not terminate processes on the user's behalf.

## Verification

```bash
cd plugins/lean-ctx
bunx vitest run --config vitest.config.ts
```

The extension's gateway lifecycle tests cover idempotent disposal and session-shutdown cleanup. Full repository validation uses `just verify` from the repository root.
