---
name: mode
description: Engineering mode with playbook routing — select a playbook to guide how the agent approaches your work. Use when starting a feature, fixing a bug, investigating an issue, refactoring, shipping, or any other engineering task.
---

# Pstack Mode — Engineering Playbook Routing

Select a playbook to guide agent behavior. `/pstack` or `/pstack help` shows the menu; an explicit task dispatches immediately.

## Menu-First Rule

The menu appears only when no task is given: bare `/pstack`, `/pstack help`, or `/pstack mode <playbook>` with no task arguments presents the playbook menu for selection.

Providing a task bypasses the menu entirely: `/pstack mode <playbook> [task...]` selects, and `/pstack <playbook> [task...]` dispatches directly. With a task present there is no confirm step — dispatch is immediate and a run receipt is recorded in `.omp/pstack-runs/`.

Command reference:
- `/pstack` or `/pstack help` — show the menu.
- `/pstack mode <playbook> [task...]` — select a playbook; with a task, dispatch immediately (no confirm).
- `/pstack <playbook> [task...]` — dispatch the playbook directly; with no task, show that playbook's menu for selection.

## Core Principles

### fix-root-causes

Address the underlying problem, not its symptoms. When fixing a bug or improving code, trace the failure to its origin and eliminate it there. Bandage fixes create technical debt and recurring incidents.

### subtract-before-you-add

Remove unnecessary code, configuration, or complexity before adding new features or structure. Deleting dead paths, unused imports, and redundant abstractions reduces surface area and makes additions land cleaner.

### prove-it-works

Verify changes with a concrete test, reproduction, or observable behavior before declaring success. A fix that cannot be demonstrated is not a fix. Run the failing case, then run the passing case.

### outcome-oriented-execution

Focus on the deliverable outcome, not the activity. The goal is working software that meets acceptance criteria, not writing tests, refactoring modules, or updating docs for their own sake. Every step should advance toward the shipped result.

### never-block-on-the-human

Make progress without waiting for human input when the path forward is clear. Autonomously run tests, explore the codebase, and iterate on implementation. Pause only when the next step requires a decision the human must make.

### model-the-domain

Build a mental model of the codebase structure, data flow, and domain concepts before making changes. Understand the existing architecture, naming conventions, and patterns. Work with the grain, not against it.

### foundational-thinking

Start from first principles when designing solutions. Question assumptions about how something "should" work. The simplest correct solution often emerges when you strip away inherited complexity and rebuild from the core requirement.

### exhaust-the-design-space

Explore multiple approaches before committing to one. Consider trade-offs in performance, maintainability, testability, and cognitive load. The best solution is often the one you would have missed without deliberate exploration.

### build-the-lever

Create tools, abstractions, and patterns that pay repeated dividends. A well-designed function, script, or configuration that eliminates recurring manual work compounds its value with each use. Invest in levers that amplify future work.

### encode-lessons-in-structure

Bake learnings into the codebase itself: types, tests, lints, documentation, and guardrails. Make it easy to do the right thing and hard to repeat past mistakes. The codebase should teach the next person who touches it.

## Playbooks (23)

- **feature** — Build a new feature end-to-end with tests and verification
- **bug-fix** — Diagnose and fix a bug with reproduction and verification
- **investigation** — Explore and understand an unfamiliar codebase or behavior
- **refactoring** — Restructure code without changing behavior
- **shipping** — Review, verify, and merge ready-to-ship work
- **autonomous-run** — Execute a task end-to-end with minimal human guidance
- **opening-a-pr** — Create a branch, implement, and open a pull request
- **multi-phase-plan** — Plan and execute multi-phase work with gates between phases
- **orchestrate** — Coordinate parallel work across multiple agents or threads
- **hillclimb** — Iteratively improve a solution through small, measured steps
- **eval** — Evaluate code quality, architecture, or design decisions
- **prototype** — Build a quick prototype to explore feasibility
- **perf-issue** — Diagnose and fix a performance bottleneck
- **runtime-forensics** — Investigate runtime behavior, crashes, or unexpected states
- **trace-forensics** — Trace execution paths to understand flow or find issues
- **visual-parity** — Achieve visual matching between designs and implementation
- **session-pickup** — Resume work from a previous session or handoff
- **pause-safely** — Pause work in a recoverable state with clear context
- **worktree-cleanup** — Clean up branches, worktrees, and stale state
- **authoring-a-skill** — Create or update an agent skill definition
- **babysit** — Monitor and react to long-running processes or services
- **autopilot-full** — Full autonomous execution of a complex multi-step task
- **autopilot-stack** — Autonomous execution of a stack of dependent tasks

## Edge Cases

- **Model not available**: Fall back to the default OMP model and log a warning via `console.warn`.
- **Autonomous run hits irreversible action**: Pause execution, create a task for the action, and surface to the user for confirmation.
- **Git conflict during parallel work**: Each worker owns its `task/<slug>` branch in an isolated `git worktree`; serialize only coordinator integration of `main`.


## Selection State & Resume

### Direct Playbook Selection

`/pstack mode <playbook>` selects a playbook directly and creates a run record (phase: `selected`). Providing a task (`/pstack mode <playbook> <task...>` or `/pstack <playbook> <task...>`) dispatches immediately — receipt recorded, no confirm step. The selection is observable in `.omp/pstack-runs/` receipts — no menu interaction needed for headless use.

### Resume

`/pstack resume` is read-only: loads `latestRun(cwd)` and prints:
- Selected playbook, current phase, status
- Last confirmed action and next safe action
- Run history with action markers

Next safe action mapping:
| Last confirmed | Next |
|---|---|
| (none) | select/start |
| verify | push |
| push | pr (for opening-a-pr playbook) or pr/merge |
| pr | merge |
| other | continue |

### Unknown Playbook Protection (AC4)

Unknown playbook names produce an error notification listing available playbooks. No run record is created, and no irreversible action is started.

## Role-Model Resolution

`resolveRoleModel(cwd, role, sessionDefault?)` and `resolveRoleModelDetailed(cwd, role, sessionDefault?)` provide deterministic resolution:
1. **Config role match** — `config.roles[role]` if set and non-empty
2. **Session default** — passed `sessionDefault` parameter
3. **Project default** — `config.default` if set
4. **Undefined** — no mapping available; callers must display "model: unavailable"

`loadPstackConfigResult(cwd)` distinguishes:
- `{ ok: true, config }` — valid config read
- `{ ok: false, reason: "missing" }` — no `.omp/pstack-models.json`
- `{ ok: false, reason: "invalid" }` — malformed JSON or missing `roles` key

When config is missing or invalid, resolution falls through to `sessionDefault` (if provided), then `undefined` — agents must display "model: unavailable" when resolution returns `undefined` and must NOT pretend a config mapping is active.
