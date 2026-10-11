---
id: TASK-104
title: 'gsd-web: ship OMP service compatibility adaptations'
status: In Progress
assignee: []
created_date: '2026-09-07 07:21'
updated_date: '2026-09-07 07:34'
labels:
  - feature
  - architecture
  - bug
dependencies: []
references:
  - TASK-103
  - TASK-103.1
  - TASK-103.2
  - TASK-103.3
  - TASK-103.4
  - TASK-103.5
  - TASK-103.6
  - TASK-103.7
  - TASK-103.8
priority: high
type: feature
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the eight actionable follow-ups produced by TASK-103, the read-only GSD Web audit. Bring provider resolution, skill discovery, recovery/settings data, activity events, standalone artifact invalidation, project-root discovery, overlay lifecycle, and onboarding diagnostics into alignment with OMP services and the attached brownfield monorepo. Preserve the audit scope: product-source changes are in scope, but do not initialize or mutate the attached project during verification. Existing follow-up tasks TASK-103.1 through TASK-103.8 are the source findings and must be reconciled into the implementation plan rather than silently ignored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GSD Web resolves visualizer, skill-health, and recovery data from the staged or OMP-compatible provider layout without the audited provider-not-found 500 responses.
- [ ] #2 Skill discovery and onboarding diagnostics identify the applicable OMP user and project skill roots while preserving valid legacy provider behavior.
- [ ] #3 Project attachment/discovery, Activity status emission, overlay lifecycle, and standalone artifact freshness behave consistently across the audited surfaces.
- [ ] #4 Each of TASK-103.1 through TASK-103.8 is either implemented and objectively verified or explicitly reconciled by the planner as out of scope with evidence.
- [ ] #5 The changed GSD Web package passes its targeted verification and the repository pre-merge gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Deliver TASK-104.1 (reconciles TASK-103.1): replace `web/server/visualizer-service.ts:21-52`’s stale `visualizer.mjs` resolution with the existing staged-service resolution contract in `web/server/subprocess-runner.ts:20-145`; preserve the `/api/visualizer` route’s no-store success/error boundary at `web/app/api/visualizer/route.ts:7-25`. Risk: a provider path that exists but lacks the expected export can still fail in the child process. Verify with a focused staged-layout endpoint/service smoke using a valid and an empty project.
2. Deliver TASK-104.2 (reconciles TASK-103.3): migrate `web/server/recovery-diagnostics-service.ts:359-400` and `web/server/settings-service.ts:12-62` from legacy source-path resolution to their staged `services-dist` bundles; retain visible recovery/settings error states in `web/lib/command-surface-store.ts:203-300`. Risk: recovery requires doctor plus session-forensics and settings requires five bundles, so validate every required bundle before spawning. Verify `/api/recovery`, settings recovery, settings experimental, and a repeat-refresh no-duplicate error scenario.
3. Deliver TASK-104.3 then TASK-104.4 (reconcile TASK-103.2 and TASK-103.8): establish one OMP-aware skill discovery/report contract used by `web/server/skill-health-service.ts:21-83`, its `/api/skill-health` route, `web/lib/diagnostics-types.ts:135-162`, `web/components/gsd/diagnostics-panels.tsx:394-412`, and onboarding/settings surfaces. TASK-104.4 consumes TASK-104.3’s report shape. Risk: diagnostics must not leak unrelated absolute paths while distinguishing unavailable from healthy empty. Verify the five documented roots and an empty project.
4. Deliver TASK-104.5 (reconciles TASK-103.4): coalesce unchanged `setStatus` activity summaries at the event-to-activity boundary spanning `web/lib/gsd-workspace-store.tsx:674-733`, `2389-2451`, and `2479-2553`, while continuing to update status state and retain lifecycle events. Risk: deduplication must not hide meaningful clear/change boundaries. Verify unchanged, changed, clear, and adjacent execution/git event ordering.
5. Deliver TASK-104.6 (reconciles TASK-103.5): make `extensions/host-launcher.ts:243-279` validate the standalone output against current source/build identity instead of only checking `STANDALONE_SERVER` and `STATIC_DIR`. Risk: startup validity checks must not reuse stale files nor cause needless rebuilds. Verify fresh install and source-update launch paths, then exercise Power Mode’s current session transcript.
6. Deliver TASK-104.7 (reconciles TASK-103.6): update the current-project/development-root relationship at `web/components/gsd/projects-view.tsx:253-516,880-980,1120-1170` and the relevant project/preferences routes so direct attachment remains visible when it is outside the one-level scanner. Risk: monorepo and ordinary directory labeling must remain distinct. Verify direct attachment, external development root, root changes, monorepo, and ordinary project cases.
7. Deliver TASK-104.8 (reconciles TASK-103.7): define one navigation-owned overlay lifecycle across `web/components/gsd/app-shell.tsx:80-180,583-587`, `projects-view.tsx:471-516`, and `command-surface.tsx:2282-2344`, with state transitions grounded in `web/lib/command-surface-contract.ts:830-900`. Risk: closing only one sheet can leave a focus-trapping sibling. Verify pointer and keyboard transitions among Projects, Git, Settings, Recovery, and all main views.
8. Execute each child in its own jj task workspace and bookmark under `docs/parallel-agents.md`; workers do not move or push `main`. Run focused tests/smokes per child only. The coordinator alone integrates, runs `just verify`, and performs the pre-merge gate. complexity: complex.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## plan completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-104
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-104" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: Operator order: implement the eight actionable follow-ups from completed TASK-103: TASK-103.1 visualizer provider, .2 OMP skill roots, .3 recovery/experimental settings providers, .4 Activity status coalescing, .5 standalone artifact invalidation, .6 attached project vs development-root discovery, .7 overlay lifecycle across surfaces, .8 onboarding diagnostics. Scope is the existing ezxomp repo and GSD Web plugin; preserve existing unrelated working-tree changes. Follow repo codesight/CodeNav and DOX contracts, and read backlog task-execution guidance. You own a facts-only context packet with files, symbols, exact targeted commands, and constraints; verify entries. Decompose into atomic child tasks via cook_decompose with dependency edges. Do not write production code or run project-wide validation; no progress chatter, work tool-call to DONE.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:planner:3".

## Decomposed into 8 sub-tickets
- TASK-104.1: Resolve Visualize from the staged provider contract
- TASK-104.2: Resolve recovery and settings data from staged providers
- TASK-104.3: Discover OMP and compatible skill roots
- TASK-104.4: Expose skill root diagnostics in onboarding and settings
- TASK-104.5: Coalesce unchanged Activity status heartbeats
- TASK-104.6: Invalidate stale standalone output before launch
- TASK-104.7: Represent the attached project outside development-root discovery
- TASK-104.8: Close unrelated overlays on main-surface navigation
Dependencies:
- TASK-104.4 ← TASK-104.3

## Context Packet (facts only)

### Observed files and roles
- `plugins/gsd-web/AGENTS.md:3-30` — package ownership, source/staged standalone, launch, and focused verification contracts.
- `plugins/gsd-web/web/server/services-dist/` — staged bundles include `visualizer-data.mjs`, `skill-health.mjs`, `doctor.mjs`, `session-forensics.mjs`, `preferences.mjs`, `model-router.mjs`, `context-budget.mjs`, `routing-history.mjs`, and `metrics.mjs`.
- `plugins/gsd-web/scripts/build-services.mjs:68-91` — staging bundle list maps `visualizer-data` to `gsd/visualizer-data.ts` and includes the provider modules above.
- `plugins/gsd-web/web/server/subprocess-runner.ts:20-145` — `resolveModulePaths`, `runSubprocess`, and `bundleHref` resolve and invoke staged bundles.
- `plugins/gsd-web/web/server/visualizer-service.ts:21-52` — Visualizer service uses `visualizer.mjs` and exports `collectVisualizerData`.
- `plugins/gsd-web/web/server/skill-health-service.ts:21-83` — skill-health service exports `collectSkillHealthData` and currently resolves a source-layout module.
- `plugins/gsd-web/web/server/recovery-diagnostics-service.ts:359-400,516-519` — recovery child provider resolution and exported collection function.
- `plugins/gsd-web/web/server/settings-service.ts:12-62` — settings collection resolves preferences, router, budget, history, and metrics providers.
- `plugins/gsd-web/web/app/api/{visualizer,skill-health,recovery}/route.ts` — Node dynamic GET routes call the respective service and return JSON with no-store headers.
- `plugins/gsd-web/web/lib/gsd-workspace-store.tsx:674-733,2389-2451,2479-2553` — activity summary, event dispatch, and `setStatus` state mutation.
- `plugins/gsd-web/extensions/host-launcher.ts:51-53,243-279` — standalone path constants, build existence condition, and launch invocation.
- `plugins/gsd-web/web/components/gsd/projects-view.tsx:253-516,880-980,1120-1170` — project sheet, development-root setup, and selection gate.
- `plugins/gsd-web/web/components/gsd/app-shell.tsx:80-180,583-587` — active-view and Projects sheet state, plus mounted overlay components.
- `plugins/gsd-web/web/components/gsd/command-surface.tsx:2282-2344` and `web/lib/command-surface-contract.ts:830-900` — command surface sheet and its open/close state transitions.
- `plugins/gsd-web/web/lib/diagnostics-types.ts:135-162` and `web/components/gsd/diagnostics-panels.tsx:394-412` — skill-health report and consuming panel.

### Observed symbols
- `collectVisualizerData` — `plugins/gsd-web/web/server/visualizer-service.ts:21`.
- `collectSkillHealthData` — `plugins/gsd-web/web/server/skill-health-service.ts:21`.
- `collectCurrentProjectRecoveryDiagnostics` — `plugins/gsd-web/web/server/recovery-diagnostics-service.ts:516`.
- `collectSettingsData` — `plugins/gsd-web/web/server/settings-service.ts:21`.
- `resolveModulePaths` — `plugins/gsd-web/web/server/subprocess-runner.ts:53`.
- `GSDWorkspaceStore` — `plugins/gsd-web/web/lib/gsd-workspace-store.tsx:1212`.
- `dispatchWorkspaceEvent` — `plugins/gsd-web/web/lib/workspace-coordinator.ts:46`.
- `openCommandSurfaceState` and `closeCommandSurfaceState` — `plugins/gsd-web/web/lib/command-surface-contract.ts:830,857`.

### Exact targeted commands
- `cd plugins/gsd-web/web && node --experimental-strip-types --test lib/__tests__/workspace-event-stream.test.ts`
- `cd plugins/gsd-web/web && node --experimental-strip-types --test lib/__tests__/workspace-live-state.test.ts`
- `cd plugins/gsd-web/web && npm run build`
- `bun test plugins/gsd-web/tests`

### Mechanical constraints
- `plugins/gsd-web/web/package.json` defines `test` as `node --experimental-strip-types --test "lib/__tests__/*.test.ts"` and `build` as `next build --webpack && node scripts/stage-standalone-static.mjs`.
- `plugins/gsd-web/AGENTS.md` states the standalone server must run under Node and says the plugin suite is `bun test plugins/gsd-web/tests`.
- `docs/parallel-agents.md` requires one jj task workspace and task bookmark per worker; workers never push or move `main`.

## Planning record
- complexity: complex
- Fake-edge analysis: TASK-104.4 consumes TASK-104.3’s skill report shape; it is the sole dependency. The other seven source findings have separately executable surfaces and no observed consumption edge, so no extra dependency was added.
- Reconciliation: TASK-104.1 through TASK-104.8 map one-for-one to TASK-103.1 through TASK-103.8; the original tasks remain audit finding records and the new children are the implementation delivery tree.
- Design selection: ADHD divergence/focus considered resolver, staged-only, catalog, and build-manifest options. The plan retains the existing `resolveModulePaths` staged resolver as the investigated reuse point; child owners must validate compatibility behavior before adopting it.
- RED-test decision: no permanent RED test was written in this planning workspace. The existing Node test entrypoint only includes `web/lib/__tests__`; the provider and launcher contracts are server/extension boundaries without an observed injectable public test seam. A new test here would either inspect source text or require a production test seam, both outside planner authority. Each provider/launcher child must first add a behavior-level focused contract and record its RED result; TASK-104.5 can add a behavior-level Activity event regression test through the existing workspace event/store test pattern.

## Context Packet refresh (facts only)
- Read-only scout `PlanTask104.ScoutTask104` completed and returned a TASK-103.1–TASK-103.8 source/test inventory; the agent artifact is available at `agent://PlanTask104.ScoutTask104`.
- Scout-recorded consumer locations include `web/components/gsd/visualizer-view.tsx:2020-2118`, `dashboard.tsx:135-138`, `status-bar.tsx:63-66`, `settings-panels.tsx:1692-1695`, and `activity-view.tsx:25-47`.
- Direct repository reads verified the staged bundle directory contains `visualizer-data.mjs` and not `visualizer.mjs`, and direct repository reads verified `subprocess-runner.ts:53` exports `resolveModulePaths`.
- Child ticket verification after decomposition showed TASK-104.4 depends on TASK-104.3. Type metadata was then set: TASK-104.1/.2/.3/.5/.6 are `bug`; TASK-104.4/.7/.8 are `enhancement`.
<!-- SECTION:NOTES:END -->
