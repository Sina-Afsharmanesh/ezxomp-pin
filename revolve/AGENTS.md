# REVOLVE Workspace

## Purpose

Reproducible agentic self-improvement research for the ezxomp project. REVOLVE gives a disciplined workflow: define success first, preserve the current state, explore candidate changes, evaluate them comparably, and promote only validated improvements.

## Active Project

none

## Project Index

No improvement projects yet. Created on first improvement cycle.

## Resume

To resume an interrupted improvement cycle:
1. List projects: `ls revolve/projects/`
2. Read the active project's `AGENTS.md` for the last known state
3. Check the latest revision's run index for the last completed evaluation
4. Continue from the next step in the protocol

## Protocol Overview

1. **Define** — write a project `AGENTS.md` with the improvement goal and success criteria
2. **Checkpoint** — capture the current state as a checkpoint before any changes
3. **Branch** — create a branch for each candidate change (hypothesis)
4. **Evaluate** — run the evaluation contract on each branch, record results
5. **Promote** — if a branch passes all criteria, promote it to the live codebase

## Directory Structure (Lazy Creation)

```
revolve/
  AGENTS.md                  — workspace index (this file)
  projects/
    <id>/
      AGENTS.md              — one long-lived improvement goal
      revisions/
        <id>/
          AGENTS.md          — versioned evaluation context
          eval/
            AGENTS.md        — evaluation contract
          branches/
            <id>/
              AGENTS.md      — search hypothesis
          checkpoints/
            <id>/
              AGENTS.md      — one subject state
          runs/
            AGENTS.md        — run index
          promotion/
            AGENTS.md        — promotion record
```

## Rules

- Every checkpoint, run, branch, and promotion must be recorded in its `AGENTS.md` before advancing
- External promotion to the live codebase is a separate decision
- For quick fixes, skip REVOLVE and answer normally
- REVOLVE research stays local under `revolve/`
