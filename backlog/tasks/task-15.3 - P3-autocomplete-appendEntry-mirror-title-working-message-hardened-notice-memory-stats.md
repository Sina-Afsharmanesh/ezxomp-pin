---
id: TASK-15.3
title: >-
  P3: autocomplete, appendEntry mirror, title/working-message, hardened notice,
  memory stats
status: Done
assignee: []
created_date: '2026-08-20 20:52'
updated_date: '2026-08-23 01:53'
labels:
  - workflowz-v2
  - enhancement
  - autocomplete
  - observability
dependencies:
  - TASK-15.4
documentation:
  - docs/plugin_proposal/workflowz-v2.md
modified_files:
  - test/workflowz-p3-polish.test.ts
parent_task_id: TASK-15
priority: low
type: enhancement
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
P3 of TASK-15. Polish: one composable `/workflows` command with nested argument completion, recipe/gate autocomplete, appendEntry native snapshot mirror with session reconstruction, terminal title/working-message during active chains, hardened catalog notice (templates, gates, active-run counts), adapter health diagnostics, and memory stats in the Runs tab. Design: docs/plugin_proposal/workflowz-v2.md sections 3A, 3C, 6, 8.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Recipe-name autocomplete provider registered via addAutocompleteProvider
- [x] #2 Run journal mirrored as session entries via pi.appendEntry and reconstructed on session_start/session_tree
- [x] #3 Terminal title and working message reflect active runs via setTitle/setWorkingMessage
- [x] #4 before_agent_start catalog notice extended with template and active-run counts, still capped at 8 KiB and gated on containsWorkflow + isWorkflowzEnabled hardening via getAllTools
- [x] #5 Memory stats (run counts, gate outcomes) exposed in library overlay Runs tab
- [x] #6 just verify passes; tests cover autocomplete provider, appendEntry round-trip, and notice cap
- [x] #7 Autocomplete covers recipe names, direct `/workflows run` selection, and approved GateFileV1 IDs with trust/prerequisite indicators
- [x] #8 Adapter health diagnostics expose detected Fallow, Oxlint, LSP, frontmatter, and language-tool versions without executing mutating commands
- [x] #9 Runs-tab memory stats distinguish route plans, chain completions, gate failures, missing-tool failures, and checkpoint outcomes
- [x] #10 `getArgumentCompletions` mirrors OMP's `AutocompleteItem` contract and returns full-prefix values with trailing spaces for every subcommand level
- [x] #11 Completion supports `/workflows run <recipe>`, `/workflows chain <recipe> -> <recipe>`, `/workflows list <surface>`, and run-control IDs without dropping entered text
- [x] #12 Snapshot mirror stores namespaced custom entries and artifact pointers, reconstructing from `sessionManager.getBranch` while keeping external run truth in the journal
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
1. Preserve completed observability boundaries; do not rewrite `mirrorRun`/`reconcileSessionMirrors` in `src/index.ts`, `applyWorkflowActivity`, `probeAdapterHealth`, `aggregateRunStatistics`, or checkpoint `pi.appendEntry` wiring. Treat the JSONL journal as execution authority and session entries as namespaced pointers only.
2. TASK-15.3.5 owns `src/index.ts` command completion: replace the inline `getArgumentCompletions` branch with one quote-aware grammar resolver returning OMP `AutocompleteItem` objects. Register one deduplicated `ctx.ui.addAutocompleteProvider` wrapper per UI/session; preserve fallback-provider results. Return full argument-prefix `value` strings with trailing spaces for root verbs, `run`, `chain ... ->`, `list` surfaces, and `status|resume|retry|stop` IDs. Consume GateFile trust/prerequisite metadata from TASK-15.2; do not add GateFile storage or trust policy here.
3. TASK-15.3.2 owns `buildCatalogNotice`/`isWorkflowzEnabled` in `src/index.ts`: require configured `eval` and `task` evidence from `pi.getAllTools()`, preserve disabled/non-workflow exits and existing counts, and bound the final UTF-8 encoded notice to 8 KiB without splitting invalid text.
4. TASK-15.3.3 starts only after TASK-15.4 supplies the library tab model. It owns the Runs-tab integration in `src/workflow-overlay.ts` and `openWorkflowLibrary`: render the existing journal-derived total, route-plan, chain-completion, gate-failure, missing-tool-failure, and approved/rejected checkpoint counts. Do not reimplement P2 tabs or create a second stats store.
5. Keep `test/workflowz-p3-polish.test.ts` as the contract packet. Extend focused existing tests only when they cover the same public behavior. After implementation, run `bun test test/workflowz-p3-polish.test.ts test/workflowz-command.test.ts test/workflowz-observability.test.ts test/workflow-memory-overlays.test.ts`, then `just verify` in TASK-15.3.4; check acceptance criteria only from that evidence.

Risks: GateFileV1 catalog/trust data is absent from the current plugin and belongs to TASK-15.2; P2 tabs are not implemented and gate Runs rendering behind TASK-15.4; UI autocomplete factories must not stack across session events; byte caps must measure UTF-8 rather than JS string length.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## AC activity-ownership fix — API-safe setter-only (WORKER 2026-08-21)

Implemented in plugins/extensible-workflows/src/runtime.ts. The real ExtensionUIContext (pi-coding-agent/src/extensibility/extensions/types.ts) exposes ONLY setTitle(title)/setWorkingMessage(message?) — no getters. Replaced the previous optional-getter probing (getTitle/getWorkingMessage) with narrow setter wrappers so terminal title/working-message reflect active runs and clear on terminal states without overwriting unrelated host state:
- WorkflowActivityState adds observedTitle/observedMessage (latest value any caller set).
- ensureObserved(ui,state): WeakMap-keyed, idempotent wrapper forwarding every call verbatim to the original setter (host behavior unchanged) while recording the latest value; releaseObserved(ui) restores original setters on terminal cleanup so wrappers never leak across sessions/callers.
- applyWorkflowActivity terminal path clears a workflow-owned signal only while observed* still equals the recorded owned* value; if the host replaced it, the external value is preserved and ownership released without clearing. Active path installs wrappers and writes owned signals.
- ActivityUI reduced to the supported setter-only contract (no fake optional getters).

Verification: bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json exit 0; test/workflowz-observability.test.ts 5 pass/0 fail/25 assertions; existing workflowz suites (5 files) 23 pass/0 fail/72 assertions. Throwaway runtime probe (not a committed test): active sets workflowz title/message; host replaces title/message post-activation; terminal completed preserves host-new-title/host-new-msg and releases ownership; wrapper forwards host calls verbatim (no duplication); still-owned path clears to "".

Commit: jj zovotryr 9f00ff4f (change zovotryrvour) — fix(extensible-workflows): API-safe workflow activity ownership via narrow setter wrappers. Contains EXACTLY plugins/extensible-workflows/src/runtime.ts (+69/-14), DCO Signed-off-by present, parent lowsrtlolmyt. 126 unrelated dirty files + backlog/cook-state.json preserved in sibling commit smktukkmvwyt.

NOTE: TASK-15.3 was concurrently re-planned (new AC set #1-#12, status To Do). This worker addressed the activity-ownership item under the prior AC numbering; AC indexes in the current file are owned by the planner re-scoping and were not checked here.

## plan completed
Spawn the COOK-PLANNER via OMP's native `task` tool:
  task({ agent: "cook-planner", task: "<the brief below>" })

Do NOT pass a model parameter — the agent's frontmatter selects its model.

Brief:
PLANNER → TASK-15.3
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-15.3" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: Replan the current TASK-15.3 P3 scope after concurrent re-scope. Current ACs are 12: autocomplete provider; appendEntry mirror/reconstruction; activity title/message; bounded catalog notice hardening via getAllTools; Runs-tab memory stats; just verify plus focused tests; recipe/direct-run/GateFile autocomplete with trust/prereqs; adapter health Fallow/Oxlint/LSP/frontmatter/language versions; stats categories; AutocompleteItem full-prefix/trailing spaces; run/chain/list/run-control completion; namespaced snapshot pointers/journal authority. Existing partial production commits 8b8af3c/75e27d67/zovotryr/244b0942 cover mirror/activity/notice/health/stats but not full autocomplete/overlay requirements. Preserve completed work, decompose only missing behavior, and record a current numbered plan plus test fixture requirements. Use native cook_decompose for any atomic children; do not implement production.

Record all results on task TASK-15.3 via backlog_task_edit.

## Decomposed into 1 sub-tickets
- TASK-15.3: undefined

## Decomposed into 3 sub-tickets
- TASK-15.3: P3: harden workflow catalog notice
- TASK-15.3: P3: surface journal statistics in the Runs tab
- TASK-15.3: P3: verify autocomplete and observability contracts

Replan evidence (2026-08-21):
- Implemented/current: AC2 and AC12 mirror pointers/reconstruction (`mirrorRun`, `reconcileSessionMirrors`, `buildRunMirror`); AC3 setter-only activity ownership (`applyWorkflowActivity`); AC8 non-mutating adapter probe; aggregate portion of AC5/AC9 (`aggregateRunStatistics`).
- Partial: AC4 has template/active-run counts and a 12-entry cap but lacks `getAllTools` hardening and a true 8 KiB UTF-8 cap.
- Missing: AC1, AC7, AC10, AC11 autocomplete provider/quote-aware grammar/full-prefix fields; Runs-tab integration for AC5/AC9. Current overlay is recipe-only.
- GateFileV1 catalog/trust/prerequisite read model is absent from current source; autocomplete consumes it only after TASK-15.2, without duplicating persistence/policy.
- Focused baseline: `bun test test/workflowz-observability.test.ts` → 5 pass, 0 fail, 25 assertions; `bun test test/workflowz-command.test.ts` → 1 pass, 0 fail, 3 assertions.
- RED proof: added `test/workflowz-p3-polish.test.ts`; `bun test test/workflowz-p3-polish.test.ts` → exit 1, 0 pass, 5 fail, 23 assertions. Failing contracts: provider registration, full-prefix grammar, required-tool notice gate, 8 KiB notice cap, Runs-tab stats.
- Created children: TASK-15.3.1 autocomplete (depends TASK-15.2/TASK-15.4); TASK-15.3.2 notice; TASK-15.3.3 Runs stats (depends TASK-15.4); TASK-15.3.4 final verification (depends all three). Parent stays To Do; no production source changed.

## Decomposed into 1 sub-tickets
- TASK-15.3: P3: command autocomplete grammar and provider

Subtask cleanup: the malformed filename produced by an empty exploratory decomposition was archived through Backlog. The active autocomplete child is TASK-15.3.5; TASK-15.3.4 now depends on TASK-15.3.2, TASK-15.3.3, and TASK-15.3.5.

Active P3 decomposition: TASK-15.3.5 autocomplete grammar/provider (TASK-15.2 + TASK-15.4), TASK-15.3.2 notice hardening, TASK-15.3.3 Runs-tab stats (TASK-15.4), then TASK-15.3.4 verification (depends TASK-15.3.2/.3/.5). No acceptance criteria were checked because the new focused contract test is intentionally RED and just verify was not run during planning.
<!-- SECTION:NOTES:END -->
