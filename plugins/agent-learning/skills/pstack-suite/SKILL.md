---
name: pstack-suite
description: ezxomp pstack unified workflow command suite — the alternative workflow to the Backlog.md cookbook: 19 /pstack subcommands (review, quality, docs, ci, ship, arena, blast, tdd, ...) plus five review/ops agents and workflow skills. Use when running pstack workflows or when asked how the pstack command suite works.
---
# pstack-suite (ezxomp)

Unified agent workflows in one command surface: code quality, PR review, docs,
CI, and team ops. The alternative workflow to the Backlog.md cookbook
(@ezxomp/cook) — pstack drives repeatable command-based workflows instead of
decomposing work into backlog sub-tickets.

| Job | How it shows up |
|-----|-----------------|
| commands | 19 `/pstack ...` subcommands: setup, review, pr-canvas, quality, docs, ship, ci, pr, verify, deslop, weekly, why, how, arena, blast, tdd, benny, mode, info |
| agents | five review/ops agents: ci-watcher, comment-sicko, poteto, review-correctness, review-quality |
| skills | bundled workflow skills: benny-setup, mode, reproduce-and-fix-issues, triage-issue-reports |
| state | shared run receipts, event stream, and optional TUI overlays (run-scoped runId) |

## How to use

- Invoke the workflow as a slash command, e.g. `/pstack review`, `/pstack quality`, `/pstack ci`.
- `/pstack info` lists every command; `/pstack how <name>` explains one.
- `/pstack setup` configures the model-per-role mapping (pstack-models.json).
- Mutating ship paths are gated; `/pstack ship --dry-run` is a non-mutating preview.

### DO

- DO use `/pstack info` or `/pstack how` before composing a multi-step pstack run.
- DO pass the same runId across runner, phases, and receipts for any command that shows a progress overlay.
- DO gate mutating ship flows behind explicit confirmation; prefer `--dry-run` first.

### DON'T

- DON'T mix pstack workflows and cook sub-tickets in one run — pick one workflow owner.
- DON'T introduce shell execution in commands; pstack uses direct executable-plus-argv invocation.
- DON'T treat an individual progress check as a terminal receipt; only the final receipt is terminal.
