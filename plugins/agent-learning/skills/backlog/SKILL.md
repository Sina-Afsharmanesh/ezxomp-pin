---
name: backlog
description: ezxomp Backlog.md integration plugin — backlog_* tool suite over the backlog CLI plus the default Backlog.md workflow instruction overlay. Use when tracking tasks/plans/decisions as durable artifacts or when asked how Backlog.md agents record work.
---
# Backlog (ezxomp)

One plugin, three jobs:

| Job | How it shows up |
|-----|-----------------|
| tools | 35 `backlog_*` tools wrapping the `backlog` CLI flag-for-flag |
| helpers | `runBacklogCli`, `getTaskJson`, `getAllTasks`, `computeReadySet`, `readyChildren`, `TaskInfo` — shared with @ezxomp/cook |
| default instructions | injects Backlog.md overview + task creation/execution/finalization guides + artifact quality standards before EVERY agent start |

## How to use

- Record plans/notes/AC/summaries via `backlog_task_edit`; create tickets via `backlog_task_create`.
- Docs (spec/research/adr/guide/report) via `backlog_doc_create`; decisions via `backlog_decision_create`.
- Never edit files under `backlog/` directly; always go through the tools/CLI so metadata stays consistent.

### DO

- DO read `backlog instructions <guide>` guidance (it is injected by this plugin) before task lifecycle actions.
- DO cite objective verification evidence before checking AC or DoD items.

### DON'T

- DON'T hand-edit Backlog markdown files.
- DON'T duplicate backlog tooling in other plugins — cook consumes this package.
