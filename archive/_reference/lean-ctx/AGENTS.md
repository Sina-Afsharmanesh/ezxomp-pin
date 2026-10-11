# AGENTS.md — lean-ctx (ARCHIVED)

> **ARCHIVED 2026-08-27.** This plugin is detached from the ezxomp marketplace
> (removed from `.omp-plugin/marketplace.json`) and no longer installed or
> shipped. Its multi-worker agent registry hard-cap (15/15 saturation) starved
> subagents under parallel cook fan-out — see `doc-9` / TASK-37. Evo mode no
> longer routes through lean-ctx (`eval` is the default surface). Source kept
> for reference only; do not re-enable without fixing the registry cap.

## Purpose
OMP-native lean-ctx integration. Wires lean-ctx's 83 MCP context-intelligence tools, CCP session memory, knowledge graph, and `.ctxpkg` portability into OMP's hooks, memory, and checkpoint/rewind system.

## Ownership
- Package: `@ezxomp/lean-ctx` (fork of `pi-lean-ctx`)
- Entry: `extensions/index.ts` — wires hooks (tool_call, tool_result, context, session_start, session_shutdown, session_before_compact)

## Local Contracts
- Imports `Type` from `typebox` (not `@oh-my-pi/omptype/typebox`). OMP's marketplace install does not run npm/bun install, so peer packages are not on the plugin's module resolution path; the host ships the original `typebox` in the plugin node_modules.
- Peer dep: `@oh-my-pi/pi-coding-agent` 18.0.6
- Memory layering: lean-ctx → operational/task-scoped; Mnemopi → durable cross-session. Hook routes `ctx_knowledge(decision|preference)` to Mnemopi retain.

## Work Guidance
- Skills: `skills/lean-ctx/SKILL.md` (auto-mirrored into `~/.omp/agent/skills/lean-ctx/SKILL.md` on `session_start`)
- Redirects: `read` → `ctx_read`, `grep` → `ctx_search`, `glob` → `ctx_glob` (skipped on protocol URIs and when evo-mode is active)

## Agent Capacity and Recovery
- OMP fan-out is controlled by `task.maxConcurrency` in `~/.omp/agent/config.yml`; the recommended local setting is 12, leaving headroom for the lean-ctx context engine.
- The lean-ctx agent registry is process-owned at `~/.local/share/lean-ctx/agents/registry.json`; never edit it directly.
- If a `ctx_*` call reports `agent capacity reached`, inspect with `ctx_call({ tool: "ctx_agent", args: { action: "list" } })` or `lean-ctx call ctx_agent --project-root "$PWD" --json '{"action":"list"}'`. Do not retry blindly.
- Normal session shutdown disposes gateway children. Reap only registrations with stale heartbeats and verified process identity; active/fresh workers must not be flushed.
- The current lean-ctx binary exposes diagnostics but no safe remote stale-reap operation. Agents must report stale capacity and request host/admin cleanup rather than editing registry state or killing arbitrary processes. The README contains the recovery procedure.

## Existing Issues
- [Known issue: lean-ctx agent-bus worker capacity](../../backlog/completed/docs/known-issues/doc-9%20-%20Known-Issue-lean-ctx-Agent-Bus-Worker-Capacity.md) — the installed upstream binary hard-caps per-project workers at 15; configuration-only changes cannot raise it. TASK-37 tracks the upstream source/config-schema fix.

## Verification
- `bunx vitest run --config vitest.config.ts` (see `tests/`).

## Child DOX Index
No child AGENTS.md files needed.
