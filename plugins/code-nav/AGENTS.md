# AGENTS.md — code-nav

## Purpose
Grounded symbol navigation companion for OMP. Sits between CodeSight discovery and native LSP operations: exact symbol reads, definition/reference resolution, call-chain tracing, session-aware ranking, and a bounded navigation planner.

## Ownership
- Package: `@ezxomp/code-nav` (fork of `pi-code-nav`)
- Entry: `src/index.ts` — registers tools and commands; clears cache and resets state on `session_start`/`session_shutdown`

## Local Contracts
- Tools: `code_nav_get_symbol`, `code_nav_find_definition`, `code_nav_find_references`, `code_nav_trace` (depth 1-3), `code_nav_compare`, `code_nav_rank_context` (session state only, never repo scan), `code_nav_plan_navigation` (1-4 hop plan; routes: `discovery|code_nav|lsp|read|answer`)
- Commands: `/symbol`, `/refs`, `/rank`, `/nav`
- Reads no external config; internal cache is mtime-scoped per file
- Multi-language symbol navigation via plugin-owned ast-grep backend + language-aware fallback scanner; native LSP stays TypeScript-focused
- Peer dep: `@oh-my-pi/pi-coding-agent` (17.3.8)

## Work Guidance
- Navigation policy: broad/fresh tasks → `codesight_*`/`glob`/`read`; grounded symbols → `code_nav_*`; IDE-style semantic ops → native `lsp`. See `docs/TOOL-CHOOSER.md` and `docs/WORKFLOWS.md`.

## Verification
- No test script. `bun run check` (import smoke test) and `bun run bench:*` harness/live benchmarks exist.

## Child DOX Index
No child AGENTS.md files needed.
