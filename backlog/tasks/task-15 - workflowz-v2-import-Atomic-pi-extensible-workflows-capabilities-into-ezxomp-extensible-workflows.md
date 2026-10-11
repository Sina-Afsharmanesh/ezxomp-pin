---
id: TASK-15
title: >-
  workflowz v2: import Atomic + pi-extensible-workflows capabilities into
  @ezxomp/extensible-workflows
status: Done
assignee: []
created_date: '2026-08-20 20:52'
updated_date: '2026-08-23 02:33'
labels:
  - workflowz-v2
  - architecture
  - orchestration
  - extension
dependencies: []
references:
  - 'https://github.com/bastani-inc/atomic/tree/main/packages/workflows'
  - 'https://vekexasia.github.io/pi-extensible-workflows/'
  - 'https://github.com/disler/super-simple-software-factory'
documentation:
  - docs/plugin_proposal/workflowz-v2.md
priority: high
type: feature
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upgrade the @ezxomp/extensible-workflows plugin from a recipe persistence/authoring layer to a full workflowz enhancement layer, importing Atomic and upstream pi-extensible-workflows capabilities while keeping OMP's native eval Workflowz as the execution foundation. The primary UX is `/workflows <prompt>`: an OMP agent selects existing predefined recipes or a validated chain; it never implicitly authors or executes new recipes/gates. `/workflows run`, `chain`, `list`, `status`, `resume`, `retry`, and `stop` are composable and autocomplete through the ExtensionAPI. The slash command bootstraps a complete orchestrator skill/runbook, and Hook/Agent Hub monitoring proactively inspects, peeks, steers, stops, retries, and chains child agents. Reusable deterministic GateFileV1 definitions can be explicitly drafted, approved, versioned, and reused across projects. Every durable artifact is Backlog-linked and enforced by workflow tools; JJ owns repository management and is enforced for mutations; Worktrunk is optional isolation. Execution stays in native eval where useful; Just-backed code-only tools/chains do not require eval. Must enhance, never override, OMP Workflowz. Design: docs/plugin_proposal/workflowz-v2.md. Phases: P0-R verifier/router/governance/profile/orchestrator research, P0 engine, P1 lifecycle/templates/scaffolds, P2 routing/gate/run TUI, P3 polish/adapter health.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Schema V2 recipes render to self-contained eval JS using only native primitives (agent/parallel/phase/budget) plus tool.* bridge calls
- [x] #2 Deterministic code gates (shell/llm/checkpoint/budget/output) execute with bounded repair loops and record outcomes in the run journal
- [x] #3 Run journal persists under .omp/workflows/runs/<run-id>/ with 0700 perms; status/stop/resume/retry tools operate on it
- [x] #4 All new tools and commands register through the OMP Extension API without shadowing or overriding built-in Workflowz behavior
- [x] #5 TUI surfaces (library overlay tabs, run overlay, footer widget, lifecycle cards, shortcuts) render through OMP extension UI surfaces
- [x] #6 Builtin recipe templates from Atomic and pi-extensible-workflows ship read-only and are scaffoldable to global scope
- [x] #7 just verify passes with tests covering gate rendering, journal lifecycle, and tool registration
- [x] #8 `/workflows <prompt>` routes natural-language requests to a host-validated predefined recipe or acyclic ordered chain; `/workflows run <name>` supports direct selection and `/workflow-library` remains available
- [x] #9 WorkflowRouteV1 validates recipe IDs, typed inputs, namespaced result references, chain depth/cycles, gate references, approval mode, and missing/untrusted prerequisites before rendering
- [x] #10 GateFileV1 supports versioned reusable deterministic command/LSP/lint/frontmatter/language gates with trust state, content hash, prerequisites, typed inputs, expected result, timeout, and failure policy; LLM gates remain advisory
- [x] #11 The research prerequisite verifies Fallow, Oxlint, LSP, frontmatter, and Rust/Go/Python/JavaScript/TypeScript adapter contracts before runtime adapters are hard-coded
- [x] #12 Gate execution reuses existing pix-skills command safety classification and pstack verify/ship stop-before-next-phase behavior
- [x] #13 GateReport evidence records one check per examined item plus bounded output, normalized violations, tool/version, duration, and repair-session context
- [x] #14 Checkpoint approval appends a namespaced OMP session snapshot with route/journal/artifact references; session reconstruction never treats a snapshot as proof of external execution completion
- [x] #15 One extension `/workflows` command exposes `getArgumentCompletions` for concatenating nested subcommands, recipe/gate/run IDs, and `key=value` inputs without discarding the existing prefix
- [x] #16 Every durable plan/spec/research/decision/review/recipe/gate/report artifact carries a Backlog task/document reference before creation or update; `omp_workflow_artifact_record` and finalization gates fail closed when the link is missing
- [x] #17 Mutating workflow routes require `omp_workflow_repo_guard` to verify JJ availability/change state and approved workspace; workflow-owned Git commit/branch/push operations are rejected
- [x] #18 Every rendered agent receives the Backlog/JJ contract and owner IDs in setup text; phase-boundary and finalization gates record Backlog evidence plus JJ change/bookmark state
- [x] #19 Worktrunk may create/clean optional isolation but never substitutes for JJ repository management
- [x] #20 The design includes a limitation-mitigation matrix distinguishing extension-level parity, OMP-core dependencies, hard guarantees, advisory signals, and fail-closed fallbacks
- [x] #21 TASK-15.6 completes the OMP-core capability-gap decision before P0 runtime implementation begins
- [x] #22 TASK-15.7 freezes nine workflow-scoped profiles, Just-backed code-only chains, typed handoffs, and bounded Orchestrator/Planner/Judge spawn policy before P0 runtime work
- [x] #23 `omp_workflow_artifact_record` verifies acceptance criteria, inherited Definition of Done, task type/priority/status, labels, dependencies/readiness, references, documentation, and modified-files metadata before durable artifact writes
- [x] #24 TASK-15.8 freezes the slash-command orchestrator skill, HookAPI lifecycle mapping, Hub-backed inspect/peek/steer/stop/retry control, health states, and typed handoff/result contracts before P0 runtime work
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are met
- [ ] #2 Code changes are tested and documented
- [ ] #3 No regressions in existing functionality
- [ ] #4 Changes are reviewed and approved
- [ ] #5 Documentation is updated to reflect changes
- [ ] #6 All new code follows project coding standards
- [ ] #7 Changes are committed with clear, descriptive messages
- [ ] #8 No known bugs or issues remain unresolved
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. P0-R research: verify Fallow CLI, Oxlint, LSP diagnostics, frontmatter validation, and Rust/Go/Python/JavaScript/TypeScript tool contracts; freeze WorkflowRouteV1 and GateFileV1 schemas, trust policy, and `/workflows` semantics.
2. P0 engine: add Schema V2 gate references/rendering, route-plan and gate validation, report/checkpoint/status/stop tools, and stage-granular journal while preserving native eval execution.
3. P1 lifecycle: add resume/retry, worktrees, predefined recipes, workflow chaining/inlining, and LLM-created recipe/gate scaffolding with global versioned reuse.
4. P2 TUI: add route preview/approval, Recipes/Templates/Gates/Runs catalog views, live chain/gate run inspector, footer/status widgets, lifecycle cards, and shortcuts through OMP extension APIs.
5. P3 polish: autocomplete recipes/gates, appendEntry mirror, terminal status, hardened catalog notice, memory/adapter health stats.
6. Review checkpoint: re-present this design through plannotator after P0-R contract updates; do not implement runtime changes before approval.

P0-C decision: complete TASK-15.6's capability-gap matrix before P0; implement extension mitigations only where native OMP supports them and record core-dependent parity as separate work.

Parity roadmap: operation replay envelopes, host budget reservations, headless policies, bounded scheduling, and governance are plugin work; per-task capability isolation, authoritative token/cost telemetry, true cancellation, footer hooks, and extension inheritance remain OMP-core boundaries.

P0-A profile/tool-chain decision: define nine workflowz profiles, Just-backed code-only chains, typed handoffs, and spawn guard limits before registering runtime agents/tools.

P0-O orchestrator control: define the skill bootstrap, hook lifecycle evidence, proactive Hub watchdog, child health state machine, steer/stop/retry policy, and typed handoffs before registering runtime control tools.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Contracts-P0 freezes (2026-08-22) — docs/plugin_proposal/workflowz-v2.md §§7B/7C/7D appended (TOC-linked, §§3A-5/6/8 not rewritten): §7B TASK-15.6 OMP-core capability-gap matrix (8 rows: operation replay, per-task policy, budgets, cancellation, headless checkpoints, footer, parallel concurrency/fail-fast, subagent inheritance; each with shipped mitigation runtime.ts:p0-tools.ts, residual, exact OMP-core API/event, hard-guarantee/advisory/non-goal, fail-closed fallback); §7C TASK-15.7 nine workflowz-* profiles + spawn caps 8/4/4 depth1 terminal specialists + normal/background/parallel typed handoff/result contracts + Just chains artifact-ready/repo-ready/verify-local/verify-premerge/review-loop/research-ready/release-ready mapped to justfile check/test/verify/smoke (§7C.4) + typed host tools (§7C.5) + OMP discovery/precedents Conductor/gh-aw/opencode-orchestrator (§7C.6); §7D TASK-15.8 slash-command durable skill/runbook (§7D.1) + Hook mapping before_agent_start/agent_start/turn_start/turn_end/tool_call/tool_result/agent_end/session_start/session_tree/session_shutdown (§7D.2) + Hub-backed omp_workflow_agent_control inspect/peek/steer/stop/retry (§7D.3, Hub/history/agent) + health states/heartbeat 30s/stall 60s/retry-stop escalation (§7D.4-5) + OrchestratorRunResultV1/WorkflowHandoffV1 (§7D.6) + child-without-extensions parent-authoritative handling (§7D.7). P0 runtime ground truth cited; future-work deltas marked; no runtime code claimed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: plannotator
created: 2026-08-20 21:39
---
Plannotator review requested changes: add `/workflows <prompt>` agent routing, direct recipe selection, validated workflow chaining, predefined templates, reusable agent-created deterministic code gates, and a research matrix for Fallow, Oxlint, LSP, frontmatter, Rust, Go, Python, and JS/TS tools. Updated design and added TASK-15.5 as the research prerequisite.
---

author: plannotator
created: 2026-08-20 21:51
---
Additional plannotator feedback: ground verifier gates in the repository's existing code gate and compare disler/super-simple-software-factory. Added GateReport evidence semantics, execFile/argv default, safety classifier reuse, same-session repair, and references to pix-skills/pstack sources and the external factory.
---

author: plannotator
created: 2026-08-20 22:04
---
Third plannotator review feedback incorporated: verified exact Fallow/Oxlint/LSP/language-tool contracts and local prerequisites. The plan now distinguishes canonical `oxlint` from this repo's VitePlus `vp lint`, records Fallow JSON/exit semantics, LSP stdio diagnostics, and fail-closed missing-tool behavior.
---

author: plannotator
created: 2026-08-20 22:21
---
Final plannotator feedback incorporated: use OMP's append-only namespaced session entries, branch/tree reconstruction, and artifact storage as a complementary snapshot layer while keeping the workflow journal authoritative; implement all `/workflows` subcommand concatenation/autocomplete through ExtensionAPI `getArgumentCompletions`.
---

author: codex
created: 2026-08-20 23:52
---
Clarification incorporated: Backlog/JJ governance must be executable workflow behavior, not only documentation. Added route preflight, `omp_workflow_artifact_record`, `omp_workflow_repo_guard`, per-agent setup injection, phase-boundary checks, and finalization blocking in the design and acceptance criteria.
---

author: plannotator
created: 2026-08-21 00:51
---
Latest plannotator feedback asked how to overcome the listed limitations. Added a concrete mitigation/core-boundary matrix, created TASK-15.6, and made P0 depend on it. No implementation begins until this parity decision is reviewed.
---

author: plannotator
created: 2026-08-21 01:08
---
Latest review feedback added a Just/code-only tool layer and nine workflow-scoped profiles: Orchestrator, Planner, Judge may spawn; depth 1; fan-out 8/4/4; specialists terminal. Created TASK-15.7 and made P0 depend on it.
---

author: codex
created: 2026-08-21 01:08
---
Backlog artifact metadata is now explicit: acceptance criteria, inherited DoD, type, priority, status, labels, dependencies/readiness, references, documentation, and modified files must be present and verified.
---

author: plannotator
created: 2026-08-21 03:51
---
Latest review feedback incorporated: `/workflows` now bootstraps a complete orchestrator skill/runbook; parent hooks monitor lifecycle/tool evidence; Hub-backed control can inspect, peek, steer, stop, retry, and decide continuation without waiting for child pings. Created TASK-15.8 and made P0 depend on it.
---
<!-- COMMENTS:END -->
