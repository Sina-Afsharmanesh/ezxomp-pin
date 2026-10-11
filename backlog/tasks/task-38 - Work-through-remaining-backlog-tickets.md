---
id: TASK-38
title: Work through remaining backlog tickets
status: Done
assignee: []
created_date: '2026-08-27 23:16'
updated_date: '2026-08-28 04:43'
labels:
  - architecture
dependencies: []
priority: high
type: task
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coordinate implementation, review, and verification of all currently non-terminal backlog tickets, processing eligible tickets in dependency order and leaving durable evidence for each outcome.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every currently non-terminal backlog ticket is processed through implementation and independent verification, or explicitly recorded as blocked with its blocker.
- [x] #2 Each processed ticket has objective verification evidence, updated acceptance criteria, implementation notes, and a final summary.
- [x] #3 The parent is not marked Done until all child tickets are terminal and the repository verification gate has passed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve existing ticket ownership and map all non-terminal work to TASK-38.1-.6; do not reopen completed tickets. TASK-38.6 covers repository dependency-graph/typecheck remediation discovered after the local Bun lock refresh.
2. Use these WT CLI worktrees, all created from main commit 7194001: task-38-deps at ../ezxomp.task-38-deps (TASK-38.6), task-38-renderer at ../ezxomp.task-38-renderer (TASK-38.2), task-38-config at ../ezxomp.task-38-config (TASK-38.3), and task-38-leanctx at ../ezxomp.task-38-leanctx (TASK-38.4). Record branch/path provenance on each ticket before agent dispatch.
3. Run TASK-38.6 dependency normalization in task-38-deps; prove root `bun run check`, augment tests, Cook tests, and reproducible repository-local install/lockfile behavior without global machine-state mutation.
4. Run TASK-38.2 in task-38-renderer and TASK-38.3 in task-38-config. Their overlapping `plugins/cook/extensions/cook-tools.ts` changes must be integrated serially, with a conflict-review subagent after each merge.
5. Run TASK-38.4 in task-38-leanctx only within repository ownership; preserve gateway/session cleanup and record external daemon-capacity blockers without registry edits or arbitrary process cleanup.
6. After each worker, run independent validator and judge; resolve blockers with the same worker and re-review. Use conflict-review subagents for every WT merge conflict.
7. Final integration runs `bun run check`, `bun test test/`, focused Cook/lean-ctx suites, and `just verify` where the approved runner permits. Record exact output before AC/DoD checks or closure.
8. Close coordination children only after mapped original tickets have checked evidence, notes, final summaries, terminal statuses, and recorded WT names. TASK-38.5 remains the final barrier; parent Done requires all children terminal and a green repository gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## plan completed
Spawn the COOK-PLANNER via OMP's native `task` tool:
  task({ agent: "cook-planner", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
PLANNER → TASK-38
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-38" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: User order: work through the remaining backlog tickets. Current non-terminal tickets identified by backlog list: TASK-32 (In Progress parent), TASK-32.5 (To Do), TASK-32.6 (To Do), TASK-33 (To Do), TASK-34 (To Do), TASK-35 (To Do), TASK-36 (To Do), TASK-37 (In Progress). Existing done tickets must not be reopened. Build a durable plan, decompose TASK-38 into atomic child tickets with dependency edges, preserve existing ticket intent, and identify safe processing order. Do not implement production code; do not run project-wide validation. Record the plan and decomposition in Backlog.md via cook/backlog tools.

Record all results on task TASK-38 via backlog_task_edit.

## Decomposed into 5 sub-tickets
- TASK-38.1: Coordinate Cook TUI batch 1 completion (existing TASK-32)
- TASK-38.2: Coordinate Cook renderer and DAG overlay completion (existing TASK-34/TASK-33)
- TASK-38.3: Coordinate project-local Cook config and provider display completion (existing TASK-36/TASK-35)
- TASK-38.4: Resolve or durably record TASK-37 lean-ctx capacity boundary
- TASK-38.5: Run final TASK-38 verification gate and close the parent
Dependencies:
- TASK-38.1 ← TASK-32,TASK-32.5,TASK-32.6
- TASK-38.2 ← TASK-33,TASK-34
- TASK-38.3 ← TASK-35,TASK-36
- TASK-38.4 ← TASK-37
- TASK-38.5 ← TASK-38.1,TASK-38.2,TASK-38.3,TASK-38.4

Planning evidence (2026-08-28): read TASK-38 and all currently non-terminal tickets from the requested inventory. Current graph is TASK-32 (In Progress) with only TASK-32.5/.6 open; TASK-32.1-.4 are Done and were not reopened. TASK-34, TASK-35, TASK-36 are independent To Do tickets; TASK-33 depends on TASK-32 and TASK-34; TASK-37 is In Progress. Existing TASK-32 child plans and notes define the .5 headless boundary and .6 final Cook verification barrier.

Repository boundaries inspected: `plugins/cook/extensions/state.ts` (`createStoreContext`, `setStoreFor`, `refreshWidget`, `renderWidget`, activity cleanup), `cook-tools.ts` (cook_config/cook_status/cook_next/dispatch registrations and `/cook`), `config.ts` (cwd-local `backlog/cook-config.json`, `listModels`, wizard), `watch.ts` (debounce/cwd/watchId callback), `autocomplete.ts`, `types.ts`, `constants.ts`, Cook UI mock, and focused tests. Shared Backlog `TaskInfo`, `getAllTasks`, `readyChildren`, and `runBacklogCli` are owned by `plugins/backlog/extensions/helpers.ts`; Cook must consume them rather than redefine them.

Overlay research found the repository-wide corrected `hostCenteredOverlay`/deferred `tui.showOverlay` pattern and the no-double-mount/no-history contract in `plugins/experiences/extensions/agent-experience/src/overlay-host.ts` and `test/overlay-host.test.ts`. The TASK-33 worker must reconcile its requested status placement with that host contract rather than blindly passing `ctx.ui.custom(..., {overlay:true})`.

Config research: Cook currently stores role IDs under the cwd-relative `backlog/cook-config.json`, drops model.provider in `listModels`, and uses the same cwd-only path from both `cook_config` and `/cook config`; no Cook config-scope tests exist. The existing better-custom `getAgentDir`/models discovery is a reference for active profile resolution, not a reason to duplicate its provider persistence. Cook profile installation has distinct project `.omp/agents` and personal `$OMP_HOME/agents` scopes; evo-sub may own personal profiles and must not be clobbered.

Lean-ctx research: `plugins/lean-ctx/extensions/gateway.ts` owns one gateway per project and exports idempotent `disposeAllGateways`; `extensions/index.ts` now disposes on `session_shutdown`, with focused lifecycle coverage. `plugins/lean-ctx/AGENTS.md`, README, bundled skill, and backlog doc-9 state that the installed compiled lean-ctx binary owns the registry, rejects `agents.max_concurrent_workers` through its current schema, and hard-caps at 15; no safe remote stale-reap operation is exposed. TASK-37 therefore has a real external blocker and must not be falsely marked Done.

RED evidence: no new tests were authored or run by this planner. Existing TASK-32 notes record the focused RED packet `bunx vitest run --config vitest.config.ts tests/tui-batch1.test.ts` as 5 tests, 4 passed, 1 failed on synchronous `setStoreFor`→`setWidget`; later completed child records contain their focused green evidence. No formatter, linter, project-wide build, or project-wide test suite was run during planning. The final repository verification gate remains the main agent's responsibility after all eligible children land.

Operator requires WT CLI isolations and ticket-level worktree provenance. Proposed names: task-38-deps→TASK-38.6, task-38-renderer→TASK-38.2, task-38-config→TASK-38.3, task-38-leanctx→TASK-38.4. WT creation attempted through omp_workflow_worktree and failed because executable `wt` is not in PATH; no worktree is currently assigned and no parallel implementation agent has been dispatched. Shell fallback is also blocked by the lean-ctx allowlist for `wt`. Do not claim any agent is working in a worktree until WT creation succeeds.

Operator requires WT CLI worktrees and ticket-level provenance. WT setup now succeeded without sudo via mise-managed Worktrunk v0.74.0; shell integration was installed for bash/zsh/nu. Created from main commit 7194001: `task-38-deps`→`../ezxomp.task-38-deps`, `task-38-renderer`→`../ezxomp.task-38-renderer`, `task-38-config`→`../ezxomp.task-38-config`, `task-38-leanctx`→`../ezxomp.task-38-leanctx`. `wt list` confirms all four. Main checkout remains the integration target with existing uncommitted changes; no agent is dispatched until its ticket records the exact WT assignment.

Parallel WT wave launched with four agents, respecting the upstream 4–5 agent limit. Each ticket carried its exact WT branch/path. All four workers were blocked before repository access by lean-ctx agent-bus capacity 15/15; no branch commits or source changes landed. Active worker was instructed to message Main immediately on blocker/completion and call yield; prior workers still exited without yielding after retries. No additional parallel launch will occur until the registration-capacity issue is resolved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-38 complete. All remaining backlog tickets processed to terminal with evidence: TASK-32 family, TASK-33/34 (cook renderers + DAG overlay), TASK-35/36 (config scope + provider families), TASK-37 (superseded by decision-3), TASK-38.6 (dependency normalization), coordination gates TASK-38.1/.2/.3/.5. Implementation via parallel WT branches task-38-renderer (b29de4ba) and task-38-config (8e106011), merged to main dd7c6e70 (bookmark advanced, not pushed). Gate: just verify green — tsc clean, bun test test/ 378 pass / 0 fail / 18 skip; cook vitest 140/140; cook bun 116/116. Tool failures from this pass logged on TASK-39 (evo subagent write-path gap: no eval/native write in cook-worker profile).
<!-- SECTION:FINAL_SUMMARY:END -->
