---
name: extensible-workflows
description: Saved multi-step workflow recipes for OMP Workflowz — omp_workflow_list, omp_workflow_save, omp_workflow_render tools and /workflows /workflow-library /workflow-run commands. Use to persist, validate, and rerun repeatable agentic procedures.
---
# Extensible Workflows (recipe library)

Persistence + authoring layer over native Workflowz: save validated recipes, list the library, render/run them.

## Tools

- `omp_workflow_list` — enumerate saved recipes.
- `omp_workflow_save` — persist a recipe (validated).
- `omp_workflow_render` — render a recipe's steps for execution.

## Commands

- `/workflows` — manage/list.
- `/workflow-library` — browse the library.
- `/workflow-run` — execute a saved recipe.

## DO

- DO save any 3+ step procedure you have retried manually twice.
- DO validate inputs/outputs at step boundaries inside the recipe.
- DO keep recipes idempotent — they may be resumed or re-run.

## DON'T

- DON'T hardcode machine-specific absolute paths in recipes.
- DON'T bake secrets into recipe steps; reference env/config instead.
- DON'T skip validation on save — a broken recipe fails mid-run later.

## Recovery

- Recipe fails midway → fix the failing step, re-save, re-run; steps are re-executable by design.
