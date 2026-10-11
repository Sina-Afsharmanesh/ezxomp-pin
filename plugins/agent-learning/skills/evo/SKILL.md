---
name: evo
description: ezxomp evo mode plugin — /evo toggle that restricts the main agent and subagents to an eval-first, marketplace-plugin tool profile and blocks native write/bash/edit/glob/grep. Use when switching between eval-first evaluation mode and the default tool set.
---
# Evo Mode (ezxomp)

`/evo` flips a persisted mode flag consulted by hooks every turn:

| Mode | Effect |
|------|--------|
| evo ON | agent + subagents limited to eval, marketplace-plugin tools, protocol-URI reads |
| evo OFF | default OMP tool profile |

## How to use

- Toggle with `/evo`; state survives restarts.
- In evo mode use the persistent `eval` kernel for file/shell/batch operations instead of native equivalents; marketplace-plugin tools (codesight, code-nav, backlog, cook, workflows, experiences) stay fully available.
- Blocked-tool attempts return structured redirect errors naming the eval/marketplace replacement.

### DO

- DO use eval-first workflows while evo mode is ON.
- DO turn evo OFF when a task genuinely needs native file mutation tools.

### DON'T

- DON'T fight blocked tools with shell workarounds; flip modes deliberately.
