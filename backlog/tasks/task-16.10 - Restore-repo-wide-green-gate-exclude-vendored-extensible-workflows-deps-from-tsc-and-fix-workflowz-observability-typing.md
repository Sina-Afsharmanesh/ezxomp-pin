---
id: TASK-16.10
title: >-
  Restore repo-wide green gate: exclude vendored extensible-workflows deps from
  tsc and fix workflowz-observability typing
status: Done
assignee: []
created_date: '2026-08-22 01:59'
updated_date: '2026-08-23 01:52'
labels:
  - chore
  - bug
dependencies: []
references:
  - >-
    backlog/tasks/task-16.9 -
    Expose-and-verify-the-completed-custom-provider-OMP-command.md
  - /tmp/ezxomp-task-16.9-just-verify.log
parent_task_id: TASK-16
priority: high
type: chore
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unblocks TASK-16 parent AC#7 (just verify must pass at project root). Current state: `just verify` exits 2 during `bun run check` with exactly 878 pre-existing TypeScript diagnostics, none related to better-custom (evidence hash-pinned in TASK-16.9 comments): 874 diagnostics under plugins/extensible-workflows/node_modules/** (vendored dependency sources being type-checked) and 4 in test/workflowz-observability.test.ts (WorkflowActivityState missing observedTitle/observedMessage at lines ~86/87/92; string passed to boolean expect() at line ~119).\n\nRoot-cause first, minimal fixes:\n1. Investigate why tsc reaches plugins/extensible-workflows/node_modules — almost certainly a tsconfig include/exclude gap (vendored runtime deps should not be type-checked). Prefer a configuration fix; DO NOT edit vendored package sources.\n2. For test/workflowz-observability.test.ts: determine whether WorkflowActivityState genuinely evolved (then add the missing fields at the type's definition with correct optionality) or the test misuses the API (then fix the test's types). Do NOT weaken or delete test assertions.\n3. Full gate to green: bun run check exit 0, just verify exit 0, entire bun test suite passing.\n\nOut of scope: any plugins/better-custom change; any behavior change to workflowz runtime beyond what correct typing requires.\n\nType: chore. Labels: chore, bug. Priority: High (blocks parent closure).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run check (tsc --noEmit) exits 0 at repo root with zero diagnostics
- [ ] #2 just verify exits 0 at project root (typecheck + full test suite)
- [ ] #3 test/workflowz-observability.test.ts passes with its semantic assertions intact (no weakened/deleted expectations; WorkflowActivityState typing fixed at the correct layer)
- [ ] #4 Vendored/third-party code under plugins/extensible-workflows/node_modules is excluded from type-checking via configuration if that is the root cause, without altering vendored file contents
- [ ] #5 No plugins/better-custom/** file is modified by this ticket
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Orchestrator closure (2026-08-23): integration gate `just verify` exit 0 at combined tree (306 pass / 0 fail across 33 files; RUN_SMOKE=1 smoke-foundation 18 pass / 0 fail twice). AC#1/#2 satisfied by that run; AC#3 observability typing fixed at type layer (WorkflowActivityState optional observed fields) with assertions intact; AC#4 root cause was test-level imports of vendored nested package sources, resolved without touching vendored contents and later stations cleared residual scoped diagnostics; AC#5 no better-custom file modified by this ticket's scope (separate TASK-16.11 owns those changes).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: TASK-16.10 worker
created: 2026-08-22 02:42
---
Root cause: root tsconfig already excludes workspace node_modules, but both workflowz tests statically imported the nested `pi-coding-agent/src/config/settings.ts`, forcing tsc to type-check 874 vendored source diagnostics. Fix: tests now import the nested package root for the same runtime Settings singleton and dynamically load only upstream’s unexported test reset with its exact `() => void` type; `WorkflowActivityState.observedTitle` and `observedMessage` are optional because fresh state objects are valid before observation.

Verified: `bun run check` exits 0; `bunx tsc --noEmit --explainFiles` exits 0 with 0 nested vendored `src` headers; `bun test test/workflowz-observability.test.ts` passes 5/5. Full `bun test test/` is still blocked by pre-existing sibling failures: workflowz-p3-polish 0/5 (same failures with its original import), flat-cache extensible-workflows, and two augment tests. No acceptance criteria marked until full suite and `just verify` are green.
---

author: TASK-16.10 worker
created: 2026-08-22 02:51
---
Blocking dependency confirmed: TASK-15.3 is `To Do`; its recorded planner evidence explicitly says `test/workflowz-p3-polish.test.ts` is intentionally RED (0 pass, 5 fail) until TASK-15.3.2/.3/.5 production work lands. Therefore a repo-wide `bun test test/` / `just verify` green result is impossible without violating TASK-16.10’s out-of-scope restriction. TASK-16.10’s own type and observability repair remains verified; leave AC#2 unchecked pending TASK-15.3 completion.
---
<!-- COMMENTS:END -->
