---
id: TASK-52.2
title: >-
  Locator, liveness.last_output_at, and HERDR_PANE_ID orchestrator projection
  (E4+E5)
status: In Progress
assignee: []
created_date: '2026-08-29 02:20'
updated_date: '2026-08-29 04:56'
labels: []
dependencies: []
parent_task_id: TASK-52
priority: high
type: task
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
dagr.ts buildRunDoc already accepts DagrAttemptInput.pane/agent (dagr.ts:29-30) and DagrProjectionInput.orchestrator (dagr.ts:57) but pushDagr (cook-tools.ts:116-146) feeds NEITHER: liveness at dagr.ts:131 is hardcoded {prompt_acknowledged:true} with no last_output_at; run.orchestrator only emitted when input provides it (never today); no HERDR_PANE_ID read exists anywhere in plugins/cook (verified zero matches). Deliver: (1) buildRunDoc working-attempt branch accepts a liveness input {last_output_at?, queued_input?} and locator passthrough (already shaped, just unused by pushDagr); (2) pushDagr populates: locator.pane = process.env.HERDR_PANE_ID when set (E5), else locator.agent = claims[taskId]?.by for claimed tasks; liveness.last_output_at = timestamp of the freshest journal entry (intent/record/gate at) for the task from readJournal tail; (3) orchestrator = $HERDR_PANE_ID ? {pane: value} : {agent: 'cook-<cwdTag>'} fallback replacing the current hardcoded runId-only shape, keeping the same string when env absent. All changes confined to dagr.ts (pure), cook-tools.ts pushDagr region (:116-146), and the new pure input-builder from 52.2. No gate coupling, no pane interaction. evo-sub skip contract in agents.ts untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildRunDoc emits locator {pane|agent} on working attempts sourced from DagrAttemptInput.pane/agent
- [ ] #2 buildRunDoc emits liveness.last_output_at on working attempts when provided in input (string ISO timestamp; queued_input 0 when not known — contract count field), preserving prompt_acknowledged
- [ ] #3 run.orchestrator is derived when input.orchestrator present and unchanged when absent
- [ ] #4 orchestrator locator preference: pane when $HERDR_PANE_ID is set, else agent form; producer code reads env at pushDagr (or input-builder) once per projection, not inside buildRunDoc
- [ ] #5 pushDagr in cook-tools.ts populates these new fields from cook state (claims.by as agent locator fallback, journal tail timestamp as last_output_at) with HERDR_PANE_ID override
- [ ] #6 existing dagr-projection.test.ts suite remains green (no expectation flips; additive fields only)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the pure dagr input/output contract for supplied working-attempt liveness and locator facts without environment access.
2. Populate `$HERDR_PANE_ID`, claims, and journal-tail data in `pushDagr` once per projection; retain view-only failure behavior.
3. Verify the HERDR/locator test turns green while later freshness/recovery/kind tests remain intentionally red.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator dispatched TASK-52.2 into isolated jj workspace `/home/eag1/repo/ezxomp.task-52-2` from the completed lifecycle bookmark `task-52-1`.

Implemented dagr attempt liveness input and claim projection: working attempts now carry explicit liveness with freshest supplied journal timestamp (claim timestamp fallback), queued_input 0, and pane-or-agent locator preference. pushDagr reads HERDR_PANE_ID once per projection and supplies pane orchestrator or stable cook-cwdTag agent fallback. Targeted run: journal.test.ts 9/9 passed; dagr-projection.test.ts 14/15 passed with only pre-existing kind/projects TASK-52.4 red; dagr-push-triggers.test.ts blocked before tests by pi-natives path TypeError in environment.

Coordinator applied worker-drafted locator patch and committed `task-52-2` → `4e6bb3d3`. Controlled targeted suite: 29/32 green; TASK-52.2 HERDR locator/liveness test now passes. Remaining red tests are only TASK-52.3 freshness, TASK-52.4 kind/projects, and TASK-52.6 typed recovery.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.2 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-52.4
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Implement only TASK-52.4 from the lifecycle+locator base: add minimal pure kind derivation from task labels/type and top-level parent project hierarchy. Preserve all lifecycle pairing, locator, trigger, and recovery behavior. Do not edit tests. Keep uncertain mappings as `impl`; docs label maps docs; review label/role maps review only when direct; spike/investigation maps question. Run targeted tests; turn the kind/project test green.

Record all results on task TASK-52.4 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-52.7
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Implement only the user-priority turn-boundary sync: reconcile a stale tracked pointer to a unique In Progress task without replacing a valid pointer in ambiguous lanes; repaint widget/title; call a best-effort producer refresh after turn reconciliation. Extract/inject only the minimal refresh seam needed so later trigger work can reuse it. Preserve no-chain/headless behavior, no UI focus, no gate coupling. Do not edit tests.

Record all results on task TASK-52.7 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.7
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.7 via backlog_task_edit.
<!-- SECTION:NOTES:END -->
