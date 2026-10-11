---
name: cook
description: ezxomp Backlog.md cookbook workflow plugin — decomposes work into atomic sub-tickets and drives scout/planner/worker/judge agents through OMP's native task tool with DAG iteration and Done-gate enforcement. Use when driving the multi-agent cook loop over Backlog tickets.
---
# Cook (ezxomp)

Multi-agent workflow engine over Backlog.md tickets:

| Stage | Specialist |
|-------|-----------|
| capture | orchestrator |
| plan | cook-planner (decomposes into atomic sub-tickets) |
| implement | cook-worker |
| verify | cook-validator |
| review | cook-judge |

## How to use

- `/cook` command and `cook_*` tools manage chains; backlog_* tools come from @ezxomp/backlog.
- Done-gate: parents cannot reach Done while sub-tickets are open, AC unchecked, or a final summary is missing.
- Quality standards for artifacts (plans/notes/AC/summaries) are injected by @ezxomp/backlog's instruction overlay.

### DO

- DO classify orders by label — labels select the workflow chain.
- DO keep every judgment in a fresh specialist context.

### DON'T

- DON'T redefine backlog tooling locally; consume @ezxomp/backlog.
- DON'T advance stages without the prior stage's deliverable.
