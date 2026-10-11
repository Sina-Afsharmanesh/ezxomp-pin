---
name: lean-ctx
description: Context Engineering for AI Agents — 83 MCP tools, 10 read modes, 95+ shell patterns, tree-sitter AST for 27 languages. Compresses LLM context by up to 99%. Use when reading files, running shell commands, searching code, or exploring directories. Auto-installs if not present. omp-lean-ctx plugin wires this into OMP hooks + memory + checkpoint.
globs:
  - "**/*"
alwaysApply: false
hide: false
---

# LeanCTX — Context Engineering for OMP

LeanCTX optimizes LLM context through 83 MCP tools, 95+ shell compression patterns, and tree-sitter AST parsing for 27 languages. The **omp-lean-ctx plugin** wires these into OMP's hook system so the agent uses them by default — no steering rules required.

## How it works in OMP

This plugin installs hooks that:
- **Redirect** native `read`/`grep`/`glob`/`bash` tool calls to `ctx_read`/`ctx_search`/`ctx_glob`/`ctx_shell` automatically (tool_call interception)
- **Compress** verbose tool results (builds, tests, logs) on the post-execution path
- **Brief** the agent at session start with `ctx_overview` and persist progress via `ctx_session`
- **Bridge** OMP's `checkpoint`/`rewind` pair to lean-ctx session save/restore
- **Route** memory writes: durable decisions/preferences → Mnemopi (`retain`); operational/code-graph facts → `ctx_knowledge`

You should still call `ctx_*` tools directly when you want explicit control — but the hooks mean you don't *have* to remember to.

In collapsed-surface sessions the default active set is the core six (`ctx_glob`, `ctx_read`, `ctx_search`, `ctx_shell`, `ctx_tree`, `ctx_call`). Other `ctx_*` capabilities run through `ctx_call({tool, args})` and are activated on demand for the session on first use; unknown tool names are rejected deterministically without spawning the CLI.

## Setup (run first if tools are missing)

```bash
which lean-ctx || curl -fsSL https://leanctx.com/install.sh | sh
lean-ctx setup
```

The binary lives at `/root/.local/bin/lean-ctx`. The MCP server is declared in `~/.omp/agent/mcp.json` and serves all `ctx_*` tools.

## Agent capacity and gateway cleanup

OMP Cook fan-out uses `task.maxConcurrency` in `~/.omp/agent/config.yml`; use `12` as the recommended ceiling. The lean-ctx registry is daemon-owned; never edit `~/.local/share/lean-ctx/agents/registry.json` directly.

The binary's per-project registry ceiling is not a supported `lean-ctx config set` key; `agents.max_concurrent_workers` is rejected by the current release. Do not invent project config keys. Keep OMP fan-out at or below the documented `task.maxConcurrency` recommendation until the daemon exposes a configurable registry limit.

When a `ctx_*` call reports `agent capacity reached`, stop blind retries and inspect the project registrations:

```text
ctx_call({ tool: "ctx_agent", args: { action: "list" } })
```

The extension disposes gateway children on `session_shutdown`. Close/restart the owning OMP session first. Only a user/admin may terminate a verified stale gateway process after checking heartbeat age, PID, executable, and process-start identity. Never flush fresh workers, kill the context-engine daemon, use blanket `pkill`, or hand-edit registry state. The current lean-ctx binary has no safe remote stale-reap operation.

## When to use lean-ctx tools explicitly

Prefer the current shell's configured compression over nested wrappers. In agent
shells, run commands normally unless the user explicitly asks for
`lean-ctx -c <command>` or task setup/docs explicitly say the shell is not
wrapped. Do not inspect env vars just to decide; users may forbid env access.

Use `lean-ctx -c <command>` over running commands directly only when:
- The command produces verbose output (build logs, git diffs, dependency trees, test results)
- You are reading files and only need the structure or API surface
- You want to check token savings for the current session

## File reading (compressed modes)

```bash
lean-ctx read <file>                    # Full content with structured header
lean-ctx read <file> -m map             # Dependency graph + exports + API (~5-15% tokens)
lean-ctx read <file> -m signatures      # Function/class signatures only (~10-20% tokens)
lean-ctx read <file> -m aggressive      # Syntax-stripped (~30-50% tokens)
lean-ctx read <file> -m entropy         # Shannon entropy filtered (~20-40% tokens)
lean-ctx read <file> -m diff            # Only changed lines since last read
```

MCP equivalents (preferred — cached, ~13 tokens on re-read):
- `ctx_read(path, mode="full")` — verbatim
- `ctx_read(path, mode="map")` — structure overview
- `ctx_read(path, mode="signatures")` — API surface
- `ctx_read(path, mode="anchored")` — for editing; adds `N:hh|` anchors for `ctx_patch`
- `ctx_read(path, mode="lines:N-M")` — targeted range

Use `map` mode when you need to understand what a file does without reading every line.
Use `signatures` mode when you need the API surface of a module.
Use `anchored` mode when you will edit the file — `ctx_patch` edits by reference.

## Code understanding (call ctx_compose FIRST)

Before editing, debugging, or asking "how does X work":
- `ctx_compose(query)` — bundles multiple lookups into one call; replaces `ctx_search → ctx_read → ctx_search(symbol)` chains
- `ctx_explore(query)` — bounded multi-turn exploration with `path:start-end` citations
- `ctx_architecture()` — module structure without reading every file
- `ctx_callgraph(direction=callers|callees)` — function call edges

## Search

- `ctx_search(pattern, path)` — regex (default)
- `ctx_search(query, action=semantic)` — by meaning
- `ctx_search(name, action=symbol)` — exact symbol
- `ctx_search(file_path, line, action=find_related)` — files related to a position

## Shell commands

```bash
git status                      # Compressed by hook
git diff                        # Meaningful diff lines
cargo build                     # Build errors grouped by type
cargo test                      # Test failures with summary counts
npm install                     # Strips progress bars/noise
docker ps
kubectl get pods
```

Supported: git, npm, pnpm, yarn, bun, deno, cargo, docker, kubectl, helm, gh, pip, ruff, go, eslint, prettier, tsc, aws, psql, mysql, prisma, swift, zig, cmake, ansible, composer, mix, bazel, systemd, terraform, make, maven, dotnet, flutter, poetry, rubocop, playwright, curl, wget, and more.

For explicit compression (verbose output you want compressed regardless of hooks):
```bash
lean-ctx -c "cargo test"
lean-ctx -c "git log --oneline -50"
```

## Memory (layered roles)

**Operational / task-scoped → lean-ctx** (`ctx_knowledge`, `ctx_session`):
- Code-graph facts, file relationships, architectural decisions for the current task
- Session state: current task, findings, progress percentage
- Gotchas, procedural memory, episodic memory

**Durable / cross-session → Mnemopi** (`retain`, `recall`, `reflect`):
- User preferences, project-level conventions, recurring decisions
- The hook auto-routes `ctx_knowledge(category=decision|preference)` to Mnemopi `retain`

```bash
# lean-ctx operational memory
ctx_knowledge(action=remember, category=blocker, content="...")
ctx_session(action=task, value="implementing auth [40%]")

# Mnemopi durable memory (auto-routed by hook for decision/preference categories)
ctx_knowledge(action=remember, category=decision, content="use JWT not cookies")
# or directly:
retain(facts=["..."])
```

## Session continuity (CCP)

```bash
lean-ctx sessions list          # List all CCP sessions
lean-ctx sessions show          # Show latest session state
lean-ctx session                # Adoption statistics
lean-ctx wrapped                # Weekly savings report
lean-ctx benchmark run          # Real project benchmark
```

MCP:
- `ctx_session(action=status)` — current session state (~400 tokens)
- `ctx_session(action=load)` — restore previous session (cross-chat memory)
- `ctx_session(action=task, value="...")` — set current task
- `ctx_session(action=save)` — force persist
- `ctx_gain(action=wrapped)` — savings report in chat

## Checkpoint / rewind (OMP bridge)

OMP's `checkpoint` tool marks a conversation boundary; `rewind` collapses exploratory context into a report. This plugin bridges them to lean-ctx session save:
- `checkpoint` → hook calls `ctx_session(action=save)` to persist lean-ctx state at the boundary
- `rewind` → hook restores the lean-ctx session point after the report

Use the pair for exploratory investigations: `checkpoint` before diving in, `rewind` with findings when done. The agent is forced to `rewind` before yielding while a checkpoint is active.

## Analytics

```bash
lean-ctx gain                   # Visual token savings dashboard
lean-ctx dashboard              # Web dashboard at localhost:3333
lean-ctx discover               # Find uncompressed commands in shell history
```

## Tips

- The output suffix `[lean-ctx: 5029→197 tok, -96%]` shows original vs compressed token count
- For large outputs, lean-ctx automatically truncates while preserving relevant context
- JSON responses from curl/wget are reduced to schema outlines
- Build errors are grouped by type with counts
- Test results show only failures with summary counts
- Cached re-reads cost only ~13 tokens
- `ctx_expand` retrieves the full original of any compressed/archived output
- `ctx_compress` frees token budget by compressing the read cache without losing state
- OMP protocol URIs (`skill://`, `agent://`, `memory://`, `artifact://`, `history://`, `issue://`, `pr://`, `local://`, `omp://`) resolve through OMP-internal infrastructure, not the filesystem — use the native `read` tool for these, not `ctx_read`. The omp-lean-ctx hook blocks `ctx_read` on protocol URIs and redirects to native `read`

## Triage recovery

When `ctx_read` output contains `[lean-ctx: N lines filtered by triage]`, the file
exceeded the progressive disclosure threshold (the global-only `progressive_threshold_lines` key - check your effective value with `lean-ctx config`) and lean-ctx replaced
function bodies with signatures. To recover specific content:

- `ctx_retrieve(path, query="keyword")` — searches within the cached (but triaged)
  content for matching lines. Returns targeted results, not the full file.
- `eval(readFileSync(path, "utf-8"))` — full unfiltered content via the eval kernel.
  This is the de facto escape hatch when you need the complete file.
- `lean-ctx raw "cat <path>"` — CLI escape hatch that bypasses all compression.

Note: `ctx_expand` archives are not populated for triage-filtered `ctx_read` results.
`ctx_retrieve` also applies triage to the cached content. The only paths to full
unfiltered content are `eval(readFileSync)` and `lean-ctx raw`.
