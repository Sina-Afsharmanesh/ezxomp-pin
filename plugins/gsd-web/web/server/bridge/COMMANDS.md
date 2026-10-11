# COMMANDS.md — GSD RPC union → OMP `omp --mode rpc` mapping

Empirical audit, 2026-09-05 (W4). Method: live probe of `omp --mode rpc`
(disposable profile, `PI_CODING_AGENT_DIR=$(mktemp -d)`,
`ANTHROPIC_API_KEY=sk-dummy`), one negotiated-v2 session, every GSD union
member from `packages/contracts/src/rpc.ts:138-167` sent and its response
recorded. Cross-checked against host source
`@oh-my-pi/pi-coding-agent/src/modes/rpc/rpc-mode.ts` (45 `case` handlers).

Legend: **mapped** = OMP handles the command (possibly with shape deltas);
**unsupported** = OMP replies `Unknown command` / missing → the adapter
returns a typed `{code:"unsupported_command"}` error, never a silent no-op.

## Command mapping table

| GSD union member | OMP verdict | Notes |
|---|---|---|
| `prompt` | mapped | OMP returns `{agentInvoked?}` when a builtin intercepts; success otherwise. GSD's `streamingBehavior` ("steer"/"followUp") maps to OMP's steer/follow_up paths. |
| `steer` | mapped | success, no data |
| `follow_up` | mapped | success, no data |
| `abort` | mapped | success, no data; adapter also settles the UI turn state (`omp-rpc-adapter-debugging` tolerance) |
| `new_session` | mapped | data `{cancelled}`; GSD's `parentSession` has no OMP equivalent (ignored) |
| `get_state` | mapped | OMP state shape (model/session/streaming flags) superset-differs from GSD's; bridge service normalizes |
| `get_project_progress` | unsupported | no OMP handler |
| `set_model` | mapped | `{provider, modelId}` → model object; unknown pair errors (`Model not found`) |
| `cycle_model` | mapped | data `{model}` |
| `get_available_models` | mapped | data `{models: [...]}` |
| `set_thinking_level` | mapped | emits `thinking_level_changed` event (tolerated) |
| `cycle_thinking_level` | mapped | data `{level}` |
| `set_steering_mode` | mapped | |
| `set_follow_up_mode` | mapped | |
| `compact` | mapped | can fail with domain error ("Nothing to compact") — surfaced as failed response, not unsupported |
| `set_auto_compaction` | mapped | |
| `set_auto_retry` | mapped | |
| `abort_retry` | mapped | |
| `bash` | mapped | data `{exitCode, output, truncated, …}`; concurrent execution — correlate by `id` |
| `abort_bash` | mapped | |
| `get_session_stats` | mapped | data `{sessionFile, …}` — note OMP's own session store path (D2 evidence) |
| `export_html` | mapped | data `{path}` |
| `switch_session` | mapped | rejects unknown/malformed session paths with a domain error |
| `fork` | unsupported | OMP has `branch` instead (not in GSD union) |
| `get_fork_messages` | unsupported | OMP's `get_branch_messages` is the counterpart — adapter may rename internally (W3 bridge-service decision) |
| `get_last_assistant_text` | mapped | data `{text}` |
| `set_session_name` | mapped | |
| `get_messages` | mapped | data `{messages}` |
| `get_commands` | unsupported | OMP pushes slash commands via `available_commands_update` events instead of a request/response |
| `terminal_input` / `terminal_resize` / `terminal_redraw` | unsupported | no embedded-TUI RPC in OMP (D7 → `GSD_WEB_BRIDGE_TUI` never set on the rpc child); Power User Mode renders the main session from bridge events, not a TUI |
| `init` | unsupported | OMP's handshake is `ready` frame + `negotiate_protocol`, not an `init` command |
| `shutdown` | unsupported | graceful shutdown = stdin EOF (see below), never a command |
| `subscribe` | unsupported | OMP streams events unconditionally; no subscription filter |
| `extension_ui_request` / `extension_ui_response` | mapped (passthrough) | host-initiated; adapter answers with `extension_ui_response` frames keyed by host `id` (setWidget/setStatus/confirm/open_url…) |

OMP-only commands the bridge may adopt later (not in the GSD union):
`abort_and_prompt`, `get_available_commands`, `set_todos`, `set_host_tools`,
`set_host_uri_schemes`, `set_subagent_subscription`, `get_subagents`,
`get_subagent_messages`, `get_branch_messages`, `get_messages_page`,
`get_login_providers`, `login`, `handoff`, `set_fast_mode`,
`set_interrupt_mode`.

## Handshake / framing verdicts (probe evidence)

- **Ready frame**: always first stdout frame: `{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}`. Nothing is processed before it.
- **negotiate_protocol v2**: `{id,type:"negotiate_protocol",protocolVersion:2}` → success `{protocolVersion:2}`. After negotiation the transport may emit/receive `rpc_chunk` sequences.
- **No-models abort**: without env keys/models.yml the child exits *before* ready with "No models available" on stderr, exit code 0. Adapter surfaces typed phase `failed/no_models` → drives the onboarding gate.
- **rpc_chunk**: `{type:"rpc_chunk",chunkId,index,count,byteLength,data}`; data is base64 (≤256 KiB payload/chunk); reassembly validates chunkId/index/count/byteLength and applies strict UTF-8 decode. Chunk sequences begin at index 0, count ≥ 2, byteLength ≥ 1 MiB.
- **Event tolerance**: `available_commands_update`, `thinking_level_changed`, `message_start`, `message_end`, `tool_execution_update`, `auto_compaction_start`, `auto_compaction_end`, `rpc_frame_error`, `extension_ui_request` are consumed by the adapter (first two ignored; last fanned to the UI bridge). `notice` events surface to the UI as notices.
- **D-flag evidence**:
  - **D2** (`--continue`): not probed in this unit's budget; transport does not pass `--continue`. `get_session_stats.sessionFile` confirms OMP's own cwd-keyed session store under `$PI_CODING_AGENT_DIR/sessions/…` — session-browser routes (W3/W7) should read that store.
  - **D7** (embedded TUI): `terminal_*` all unsupported → no bridge-terminal view exists; the web UI renders the main session from the bridge event stream (`bridge-terminal/*` routes and `MainSessionTerminal` were removed). `GSD_WEB_BRIDGE_TUI` is never set on the bridge child.
  - **D5** (onboarding credentials): OMP exposes `login`/`get_login_providers` over RPC with `extension_ui_request`-based OAuth flow (`open_url` + pasted-code `input`), so onboarding can authenticate the *bridge child itself* without writing OMP's storage files directly. Recommended refinement of plan option (a).
- **Graceful shutdown**: end stdin (EOF). Pending requests are rejected by the host, buffered frames flushed, exit code 0. SIGTERM/SIGKILL lose trailing JSONL — the adapter never signals the child except via `kill()` for abnormal teardown.
