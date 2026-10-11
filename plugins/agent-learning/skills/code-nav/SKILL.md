---
name: code-nav
description: LSP-grade code navigation tools — code_nav_get_symbol, code_nav_find_definition, code_nav_find_references, code_nav_trace, code_nav_compare, code_nav_rank_context, code_nav_plan_navigation plus /symbol /refs /rank /nav commands. Use instead of grep for definition/reference/trace questions in indexed projects.
---
# Code Nav (precise navigation)

AST/LSP-backed navigation. Prefer these tools over text grep when asking structural questions.

## Tools

- `code_nav_get_symbol` — resolve a symbol's declaration.
- `code_nav_find_definition` / `code_nav_find_references` — exact def/ref edges.
- `code_nav_trace` — call/path tracing between symbols.
- `code_nav_compare` — diff two symbols/files structurally.
- `code_nav_rank_context` — rank files by relevance to a task.
- `code_nav_plan_navigation` — plan a multi-hop navigation.

Commands: `/symbol`, `/refs`, `/rank`, `/nav`.

## DO

- DO use find_references before renaming anything.
- DO use rank_context to pick the 2–4 files that matter before reading broadly.
- DO fall back to text search for string literals, configs, and comments.

## DON'T

- DON'T trust navigation results in unindexed or generated code — verify the file:line it cites.
- DON'T chain more than a few hops in code_nav_trace; long traces drift from the question.

## Recovery

- Empty/wrong results usually mean stale index — re-run after saves, or fall back to grep and note the discrepancy.
