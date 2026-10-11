# @ezxomp/backlog

Backlog.md integration plugin for OMP.

- Registers the full `backlog_*` tool suite (task create/edit/list/view, doc, decision, milestone, search, board export) as a thin, faithful wrapper over the `backlog` CLI.
- Ships shared task helpers (`runBacklogCli`, `getTaskJson`, `getAllTasks`, `computeReadySet`, `readyChildren`) and the `TaskInfo` type for other plugins.
- Injects the canonical Backlog.md workflow instructions (overview + task creation / execution / finalization guides + artifact quality standards) as the **default system-prompt overlay before every agent start** — the default instruction source for general model work.
- Document creation reports partial failure if content/tags cannot be saved; recover through the returned document ID instead of creating a duplicate. Public document types map to the CLI's supported values.

## Layout

```
extensions/
  index.ts          — entry: default-overlay hook + tool registration
  tools.ts          — registerBacklogTools (all backlog_* tools)
  helpers.ts        — CLI runners and task readers/normalizers
  instructions.ts   — verbatim Backlog.md instruction strings
  types.ts          — TaskInfo, BacklogToolsContext
tests/
```

## Consumers

`@ezxomp/cook` imports `registerBacklogTools`, the helpers, and
`BACKLOG_QUALITY_STANDARDS` from this package instead of defining its own
backlog configuration. Cook passes its full `StoreContext` (structural
superset of `BacklogToolsContext`).

## Instructions provenance

The instruction constants in `extensions/instructions.ts` are verbatim output
of `backlog instructions overview|task-creation|task-execution|
task-finalization` (backlog.md 1.50.1). Regenerate them from the CLI when the
CLI ships new guide text.
