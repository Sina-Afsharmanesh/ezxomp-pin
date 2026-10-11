---
name: lean-ctx-errors
description: "Failure playbook for lean-ctx ctx_* tools in OMP. Use when a ctx_read/ctx_search/ctx_shell/ctx_patch/ctx_glob call errors, returns a lines-filtered-by-triage notice or a shaken-artifact recover pointer, reports CONFLICT or stale hash, rejects patch arguments (missing op, missing hash, replace_lines fields), refuses a path outside the roots jail, times out at 30s, blocks python3 -c, or when compressed output looks wrong or mangled. Maps each observed error string to its verified recovery, with an escalation ladder for reads that stay filtered."
globs:
  - "**/*"
alwaysApply: false
hide: false
---

# lean-ctx Errors — Recovery Playbook

Every entry below was observed in real OMP sessions. Rule zero: a filtered or
shaken result is COMPRESSION, not failure. Verify before reacting.

## Error → fix

### `[lean-ctx: N lines filtered by triage (level N)]`
Triage dropped lines it deemed low-signal. Output may be EMPTY yet marked ok.
Escalation ladder — stop at the first rung that returns clean bytes:

1. `ctx_read(raw=true)` / `ctx_shell(raw=true)` — fixes SOME cases.
2. Marker persists? Triage is applied regardless of mode. TRUE bypasses only:
   `eval` `open(path).read()` in the persistent kernel, or the CLI:
   `lean-ctx raw "cat <path>"`. `ctx_retrieve`/`ctx_expand` stay triaged.
3. Never conclude from a filtered-only view. If one file class constantly
   over-filters, raise `progressive_threshold_lines` GLOBALLY (global-only key).

### `[shaken ~N tokens — recover: artifact://ID (region M)]`
Output archived to an artifact. Recover EXACT content via native
`read artifact://ID` (or ctx_expand). NEVER guess or paraphrase elided ranges —
fabricating elided content is the top corruption vector.

### ctx_patch argument contract (45+ observed arg errors)
- `missing 'op'` — every call needs `op`. Valid set per schema/runtime:
  set_line, replace_lines, insert_after, delete, replace_unique, create,
  replace_all (plus replace_symbol per docs). There is NO insert_before —
  that symbol belongs to a different tool (ctx_refactor insert_before_symbol).
- `replace_lines requires start_line, end_line, new_text` — supply all three;
  start_hash/end_hash optional conflict guards.
- `missing 'hash'` — anchored ops need the line-content fingerprint from a
  FRESH `ctx_read(mode="anchored")`. Stale hash ⇒ CONFLICT (see below).
- `replace_unique requires non-empty old_text` — `old_text` must be present
  and occur exactly once; for multiple occurrences use the separate
  `replace_all` op (a boolean flag would belong to ctx_edit, not ctx_patch).

### `CONFLICT` from ctx_patch / stale hash
Your anchor predates the file. Fix: fresh `ctx_read(mode="anchored")` limited to
the changed region, then re-issue with the NEW line/hash. Never blind-retry the
same anchor. For simple unique-string swaps skip anchoring entirely:
`replace_unique(path, old, new)`.

### Roots refusal ("outside project root")
Path not jailed-in. Check global `allow_paths` (~/.agents, /tmp, repos) via
`lean-ctx doctor`; add project paths to `.lean-ctx.toml` + run `lean-ctx trust`.
Un-jailable targets (session stores, home dotfiles): use `eval` — not repeated
ctx_* attempts.

### `Interpreter 'python3' with inline code execution flag '-c' is blocked [DO NOT RETRY]`
Permanent shell-security block. Write a script file (eval `write()`) and execute
the file. Retrying `-c` forms cannot succeed.

### `command not found: wc/sed/md5sum/...` inside ctx_shell
Some agent shells lack coreutils on PATH. Use `bun` one-liners, the persistent
`eval` kernel, or absolute binary paths. Do not apt-install mid-task.

### `MCP error: Request timeout after 30000ms` and `[exit:N]`
Two distinct limits: the MCP request timeout (~30s) kills the CALL; the
foreground inline cap (~110s) DETACHES a still-running command to a pollable
background job. For anything long: `run_in_background=true` (job lifetime up to
`timeout_ms` 3600000), then poll/cancel via `background_action`. Set
`LEAN_CTX_SHELL_TIMEOUT_MS` to shift the cap. A trailing `[exit:N]` is the
command's REAL exit code delivered losslessly — treat N≠0 as command failure,
not an MCP error; read stderr above it.

### Protocol URIs through ctx_*
`skill:// memory:// artifact:// history:// local:// agent:// issue:// pr:// omp://`
resolve ONLY through native `read`. ctx_* cannot see OMP internals — the
reverse redirect ("use ctx_read") you get for filesystem paths does NOT apply here.

## Compression sanity rules

1. Structural summaries/signatures are for ORIENTATION; edit only from
   `anchored`/`full`/`raw` reads — and per the ladder above, escalate to eval
   when raw stays filtered.
2. If compressed output contradicts expectations (file "looks empty", symbols
   missing), suspect the compressor first: ladder before acting.
3. After ANY successful edit, prefer `ctx_delta` over full re-reads.

## Config quick facts

Project `.lean-ctx.toml` accepts ONLY project-level keys:
`compression_level`, `tool_profile`*, `read_redirect`, `read_dedup`,
`allow_paths`* (*needs `lean-ctx trust`; trust PINS to file contents — re-run
`lean-ctx trust` after every edit or overrides are silently withheld).
Global-only (ignored in project file): `progressive_threshold_lines`,
`shadow_mode`, `shell_security`, `shell_timeout_secs`, `recovery_hints`,
`output_density`. `lean-ctx config validate` checks the GLOBAL source only —
confirm project effectives with `lean-ctx config`. Details: managed skill
`lean-ctx-project-config`.
