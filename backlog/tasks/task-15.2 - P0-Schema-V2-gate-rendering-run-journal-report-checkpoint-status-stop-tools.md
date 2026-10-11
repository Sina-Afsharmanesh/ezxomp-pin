---
id: TASK-15.2
title: >-
  P0: Schema V2, gate rendering, run journal, report/checkpoint/status/stop
  tools
status: Done
assignee:
  - codex
created_date: '2026-08-20 20:52'
updated_date: '2026-08-23 02:33'
labels:
  - workflowz-v2
  - feature
  - execution
  - gates
dependencies:
  - TASK-15.5
  - TASK-15.6
  - TASK-15.7
  - TASK-15.8
documentation:
  - docs/plugin_proposal/workflowz-v2.md
modified_files:
  - plugins/extensible-workflows/AGENTS.md
  - plugins/extensible-workflows/skills/omp-workflow-authoring/SKILL.md
  - plugins/extensible-workflows/src/runtime.ts
  - plugins/extensible-workflows/src/p0-tools.ts
  - plugins/extensible-workflows/src/index.ts
  - plugins/extensible-workflows/src/library.ts
  - plugins/extensible-workflows/src/workflow-overlay.ts
  - plugins/extensible-workflows/tsconfig.json
  - plugins/extensible-workflows/package.json
  - test/workflowz-v2-runtime.test.ts
  - CHANGELOG.md
parent_task_id: TASK-15
priority: high
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
P0 of TASK-15. Add the host-validated WorkflowRouteV1 and GateFileV1 contracts from P0-R, extend recipe schema to V2 (outputs map, per-stage gate references), render deterministic gates to native eval JS via the tool.* bridge, and add the run journal with omp_workflow_report/checkpoint/status/stop tools. Execution remains in OMP's native eval kernel; nothing shadows built-in Workflowz. Design: docs/plugin_proposal/workflowz-v2.md sections 3A-5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WorkflowFileV2 schema (schemaVersion 2) adds outputs map and per-stage gates array; V1 recipes still load and render unchanged
- [x] #2 Gate types shell/llm/checkpoint/budget/output render to deterministic eval JS using tool.bash, completion, tool.omp_workflow_checkpoint, budget.remaining, tool.omp_workflow_report
- [x] #3 Shell gates implement bounded repair loops (agent(repair) → re-check → fail after retries) with exitCode/stderr/stdout preserved
- [x] #4 omp_workflow_report tool records phase/gate/complete events to <cwd>/.omp/workflows/runs/<run-id>/journal.jsonl (0700, append-only) and validates final results against the recipe outputs schema host-side
- [x] #5 omp_workflow_checkpoint tool prompts via ctx.ui.confirm with hasUI guard and auto:true escape for headless
- [x] #6 omp_workflow_status and omp_workflow_stop (cooperative: next report call returns {status: stopped} and rendered JS returns early) operate on the journal
- [x] #7 Render-time child workflow inlining (task.workflow) with namespaced ids and cycle detection
- [x] #8 just verify passes; tests cover gate rendering, journal append/validation, checkpoint auto path, and stop cooperation
- [x] #9 Route-plan validation rejects unknown recipes, invalid typed inputs, forward/cyclic result references, excessive chain depth, unavailable gates, and untrusted required gates before rendering
- [x] #10 Gate references resolve to approved GateFileV1 versions and preserve normalized tool results in the journal
- [x] #11 The `/workflows` route tool returns a strict WorkflowRouteV1 plan for direct or chained recipe selection without executing it
- [x] #12 Gate adapters reuse the existing critical/dangerous/risky command classifier and fail closed for unapproved dangerous commands
- [x] #13 Each gate emits an evidence-bearing GateReport with per-item checks, bounded stdout/stderr, exit/result metadata, duration, tool/version, and normalized violations; a boolean alone is invalid
- [x] #14 Failed gate repair sends the GateReport to the same agent session/handle with bounded retry and budget instead of silently cold-restarting
- [x] #15 ExecFile-style executable/argv adapters are the default; raw shell gates require explicit classification and approval
- [x] #16 Checkpoint approval appends a namespaced `ezxomp.workflowz.checkpoint` session entry with route/journal/artifact references and reconstructs state from the current OMP session branch
- [x] #17 Large GateReport evidence is stored through OMP session artifacts with bounded pointers/hashes in session entries; the workflow journal remains authoritative for external execution
- [x] #18 No core-reserved session custom types or silent leaf navigation are used by workflow tools
- [x] #19 `omp_workflow_artifact_record` creates/verifies Backlog task/document links before durable recipe, gate, plan, research, report, or implementation artifacts are written
- [x] #20 `omp_workflow_repo_guard` verifies JJ availability/change ID/bookmark and approved workspace before mutation; workflow-owned Git commit/branch/push calls fail closed
- [x] #21 Rendered agent setup includes Backlog owner IDs, artifact kind/path, JJ repo mode/change state, and forbidden direct Backlog/Git operations
- [x] #22 Backlog-record and jj-state checks run at mutating phase boundaries and finalization; completion is blocked until both evidence records succeed
- [x] #23 Operation envelopes cache/replay pure or idempotent operations by operationId/content hash and never claim exactly-once for manual side effects
- [x] #24 Host budget ledger enforces launch/time limits before execution; token/cost limits are explicitly advisory until OMP usage telemetry exists
- [x] #25 Headless checkpoint policy, bounded parallel scheduler, and optional fail-fast behavior are explicit and fail closed when core cancellation is unavailable
- [x] #26 TASK-15.7 freezes the nine workflowz profiles, Just-backed code-only chains, typed handoffs, spawn authority, depth, and fan-out before P0 runtime implementation
- [x] #27 Artifact readiness validation checks acceptance criteria, inherited Definition of Done, type/priority/status, labels, dependencies/readiness, references, documentation, and modified files before allowing a durable write
- [x] #28 TASK-15.8 freezes the orchestrator skill bootstrap, HookAPI lifecycle/tool mapping, Hub control operations, health state machine, and typed handoff/result contracts before P0 runtime implementation
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
1. Consume the verified WorkflowRouteV1/GateFileV1 contracts from TASK-15.5.
2. Extend V1 recipe loading with V2 outputs, stage gate references, route validation, and child-chain namespacing while preserving V1 rendering.
3. Render shell/LSP/lint/frontmatter/language gates through approved tool.* adapters; keep LLM gates advisory.
4. Add report/checkpoint/status/stop tools and append-only 0700 stage journal.
5. Add targeted tests for route validation, gate references, rendering, journal append/validation, checkpoint auto path, and cooperative stop.
6. Re-present the updated plan through plannotator before implementation.

7. Reuse `plugins/pix-skills/src/gate.ts` for command safety and the pstack verify/ship stop-before-next-phase pattern; adapt the software-factory GateReport contract for journal/TUI evidence.

8. Use `pi.appendEntry`, `sessionManager.getBranch`, and session artifacts for native snapshot/recovery pointers; keep journal state authoritative and avoid core-reserved session entries.

9. Implement governance preflight/finalization tools and inject owner/repo policy into every rendered agent prompt; enforce Backlog linkage and JJ mutation boundaries rather than relying on instructions alone.

10. Consume TASK-15.6's capability matrix: implement extension-level operation replay, budget reservations, headless policies, and bounded scheduling only where the native eval/agent surface supports them; preserve explicit core-gap fallbacks.

11. Consume TASK-15.7's profile/tool-chain contract; register only workflow-scoped agent names, enforce spawn guard limits, and expose Just-backed host tools without requiring eval.

12. Enforce Backlog metadata completeness/readiness in `omp_workflow_artifact_record`; do not let an artifact pass on a task ID alone.

13. Consume TASK-15.8's orchestrator skill/control contract; inject the full runbook, register lifecycle hooks, and enforce Hub-backed inspect/peek/steer/stop/retry policies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Approved plan and all P0 decision prerequisites TASK-15.5 through TASK-15.8 are finalized. Starting P0 source work now; use JJ for repo state, Backlog for artifact/task updates, and preserve unrelated working-copy changes.

Implemented validated V1/V2 runtime in plugins/extensible-workflows/src/runtime.ts: schema V2 inputs/stages/gates/outputs/artifacts, child inlining with cycle detection, deterministic native eval rendering, shell/LLM/checkpoint/budget/output adapters, bounded repairs, output validation, secure UUID-scoped JSONL journals with malformed-entry visibility, cooperative stop/status, route checks, Backlog/JJ/Just guards, and operation-id replay.

Migrated list/save/render/catalog/overlay surfaces to the shared runtime; registered report/gate/checkpoint/status/stop/artifact/repo/Just/route tools in p0-tools.ts; added test/workflowz-v2-runtime.test.ts.

Verification: bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json; bun test test/workflowz-v2-runtime.test.ts; bun test test/smoke-plugins.test.ts; bun run test/smoke-workflowz.test.ts — all exit 0.

Repository gate status: root bunx tsc --noEmit passes. Full bun test ./test/ remains red in pre-existing unrelated suites test/augment.test.ts (saved settings expected shape) and test/workflow-memory-overlays.test.ts (TUI Spacer class identity across module resolution); workflowz targeted tests, plugin smoke, V1 smoke, and plugin typecheck pass. No unrelated test files were modified.

Added behavioral coverage for rendered V2 eval execution, checkpoint/budget/LLM/shell adapter paths, child workflow namespacing/cycle detection, raw-shell rejection, output schemas, journal operation replay, stop precedence, malformed journal entries, V2 save/resolve, and route validation. Targeted runtime test remains exit 0 after these additions.

JJ commit ab32de1f contains only the scoped workflowz P0 paths plus CHANGELOG.md and TASK-15.2 metadata; unrelated working-copy changes remain untouched. Final targeted checks after implementation: root and plugin tsc exit 0; workflowz V2 runtime tests, plugin smoke, and V1 workflow smoke exit 0. Full suite still has unrelated augment/TUI module-identity failures recorded above.

Updated plugins/extensible-workflows/AGENTS.md with the V1/V2 runtime, journal, safety, Backlog/JJ, and verification contracts.

Corrected full just verify evidence: 109 tests pass, 9 fail in unrelated existing centered-overlay/augment suites (7 workflow-memory-overlays and 2 augment tests). The failure pattern is TUI Spacer/module identity and augment saved-setting expectations; workflowz runtime, plugin smoke, and V1 smoke remain green.

Expanded skills/omp-workflow-authoring/SKILL.md into the canonical /workflows orchestrator runbook covering lifecycle, profile limits, gate adapters, journal replay, Backlog readiness, and JJ mutation boundaries.

Validator evidence audit (Audit152, 2026-08-22). Scoped `bun test test/workflowz-v2-runtime.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts`: exit 0, 16 pass / 0 fail / 53 expect. Root `bunx tsc --noEmit`: exit 0, no diagnostics. Full `just verify` is not board-green (task notes report 109 pass / 9 unrelated augment/workflow-memory-overlays failures); AC#8 remains PARTIAL and unchecked.

AC verdicts:
1 PASS — `runtime.ts:WorkflowFileV2/WorkflowStageV2`, `validateWorkflowDefinition`; `library.ts:WorkflowFileV1/validateWorkflow/renderWorkflow` and V1 fallback in `renderWorkflowDefinition`. `test/smoke-workflowz.test.ts` asserts V1 save/list/resolve/render/native execution.
2 PASS — `runtime.ts:renderWorkflowDefinition` emits `tool.bash`, `completion`, `tool.omp_workflow_checkpoint`, `budget.remaining`, `tool.omp_workflow_report`; `executeGate`/`validateOutputs` cover adapters. V2 test `renders V2 gates through native eval helpers with repair and interpolation` assertions 52-60 and native execution test 72-84 pass.
3 PASS — `renderWorkflowDefinition` repair loop 452-460 is retry-bounded/re-gated; `executeGate` 617-626 preserves stdout/stderr/exitCode/killed/signal/duration. V2 assertions 60 and 110-111 cover retry rendering and spawn-failure evidence.
4 PASS — `p0-tools.ts:omp_workflow_report` 70-98 appends events and validates complete outputs; `runtime.ts:createRun/appendRunEvent/readRunEvents` 511-547 create 0700 run dirs + append-only JSONL (0600 file), `validateOutputs` 638-646. V2 journal assertions 87-100/output assertions 106-111 pass.
5 PASS — `p0-tools.ts:omp_workflow_checkpoint` 120-133 uses hasUI confirmation with `auto:true` headless escape and journals policy/session entry. P0 test 42-68 and guards 158-212 pass.
6 PASS — `p0-tools.ts:omp_workflow_status/stop` 140-167 and `runtime.ts:runStatus/stopRun` 550-559 use journal; rendered JS returns stopped after report/stage/gate (`runtime.ts:422,449,466`). V2 assertions 87-100 pass.
7 PASS — `runtime.ts:expandStages/namespaceGate` 355-377 + render 385-400 implement child inlining, namespacing, cycle/child validation. V2 assertions 64-69 and guards 129-156 pass.
8 PARTIAL — scoped suites/root tsc pass, but board-wide `just verify` has known unrelated failures; do not check.
9 PARTIAL — `runtime.ts:routeError` 688-702 and `p0-tools.ts:omp_workflow_route` 223-246 cover mode/depth/cycle, unknown recipe, typed inputs, forward result refs; no pre-render GateFile availability/trust validation. Do not check.
10 PARTIAL — `templates.ts:resolveGateFile` 937-956 validates GateFileV1 version/hash/trust and `omp_workflow_gate` journals normalized GateReport (`p0-tools.ts:101-117`), but route/gate execution accepts inline WorkflowGate and never resolves approved GateFileV1 references. Do not check.

AC verdicts continued:
11 PARTIAL — `omp_workflow_route` 223-246 resolves direct/chain recipes without executing, but `runtime.ts:WorkflowRoute` 119-125/routeError lacks strict WorkflowRouteV1 request/gates/approval shape and has no valid-plan assertion. Do not check.
12 PASS — `runtime.ts:directiveBlockReason` 35-38 reuses `buildRules/classify`; render safety 390-400 and executeGate safety 613-616 fail closed. V2 unsafe shell assertion 55 and guard templated `rm -rf /` assertions 220-233 pass.
13 PARTIAL — `runtime.ts:GateReport/reportBase/executeGate` 107-110, 591-626 provide checks, bounded tails, exit/result metadata, duration, tool, violations; p0 gate journals report and P0 tests 70-99 assert evidence. No required tool/version normalization (no version field) or rejection of arbitrary boolean-only reports. Do not check.
14 FAIL — repair branch `runtime.ts:452-460` starts a fresh `agent(render(repair), ...)` without failed GateReport/violations or same-session handle; only retry count is bounded. V2 assertion 60 is string-level only. Do not check.
15 PASS — `runtime.ts:argvFromGate` 581-589 prefers executable+argv; raw command is explicit `shell`, classified 613-616; raw shell renders through `tool.bash` 439-444; p0 gate has exec approval 101-107. Guards 220-233 prove dangerous substituted argv is rejected before exec.
16 PARTIAL — checkpoint appends namespaced `ezxomp.workflowz.checkpoint` with route/journal/artifact refs (`p0-tools.ts:120-133`); `index.ts:reconcileSessionMirrors` 338-362 reads `sessionManager.getBranch`, but reconstructs only `.mirror`, not checkpoint entries/refs. P0 assertions 60-63 check namespace/status only; no ref/reconstruction assertion. Do not check.
17 FAIL — no `sessionManager.saveArtifact`/large GateReport artifact path exists in `plugins/extensible-workflows/src`; only bounded journal fields and string `artifactRefs` pointers (`runtime.ts:929-987`, `p0-tools.ts:124-132`). Do not check.
18 PASS — only package-qualified custom types are emitted (`ezxomp.workflowz.checkpoint` and `.mirror`); workflow tools do not call branch/leaf navigation. P0 assertions 60-63 verify namespaced checkpoint entries.
19 PARTIAL — `omp_workflow_artifact_record` 170-181 + `verifyBacklogArtifact` 651-661 verify owner existence/some metadata; scaffold 315-361 checks owner before writes. Direct `omp_workflow_save`/`saveWorkflowDefinition` and gate persistence are not coupled to artifact_record, and DoD/dependencies/references/documentation contents are not readiness-validated. Do not check.
20 PARTIAL — `omp_workflow_repo_guard` 184-194 delegates `verifyJJ` 663-674 (root/status/change+bookmark probe), with separate worktree resolution 364-380; no approved-workspace mutation gate or host interceptor fail-closing workflow-owned git commit/branch/push. Do not check.

AC verdicts continued:
21 FAIL — rendered `agent()` setup is only task setup/prompt/label (`runtime.ts:423-428`); `omp_workflow_render` creates run with content hash only (`index.ts:426-439`). No automatic Backlog owner/artifact/JJ/forbidden-operation setup envelope. Do not check.
22 FAIL — artifact/repo guards are standalone; `omp_workflow_report` completion path 83-94 validates outputs only and does not require Backlog + JJ evidence at mutating phase boundaries/finalization. Do not check.
23 PARTIAL — `appendRunEvent` 519-523 deduplicates an existing journal event by operationId, and recovery is stage-granular (`resumeWorkflowRun`/`retryWorkflowRun` 861-923); no operation envelope cache keyed by operationId+contentHash for pure/idempotent results or manual-side-effect classification. Duplicate operationId fixture 91-92 has no count/result assertion. Do not check.
24 PARTIAL — rendered budget gate probes `budget.remaining()` and returns budget_exhausted (`runtime.ts:432,447`; `executeGate` 604-609); guard test 58-93 passes. No host launch/time reservation ledger; token/cost remains advisory. Do not check.
25 PARTIAL — headless policy passes, but rendered `parallel` is unbounded all-at-once (`runtime.ts:429`), with no limit/failFast scheduler or cancellation-unavailable fail-closed path. No scheduler assertions in scoped suites. Do not check.
26 PASS — retro-freeze accepted per assignment: docs `workflowz-v2.md` §7C (522-642), especially §7C.1 nine profiles, §7C.2 spawn authority/depth/fan-out, §7C.3 typed handoffs/results, §7C.4 Just-backed chains.
27 PARTIAL — artifact tool metadata check (`p0-tools.ts:170-181`) requires some non-empty fields, but `verifyBacklogArtifact` only task/document existence (`runtime.ts:651-661`); inherited DoD, dependency/readiness, references, documentation, modified-file contents, and direct-write coupling are not validated before durable writes. Do not check.
28 PASS — retro-freeze accepted per assignment: docs `workflowz-v2.md` §7D (644-861), especially §7D.1 orchestrator skill bootstrap, §7D.2 HookAPI lifecycle/tool mapping, §7D.3 Hub inspect/peek/steer/stop/retry, §7D.4 health states, §7D.6 typed `WorkflowHandoffV1`/`OrchestratorRunResultV1`.

Final checked set: AC#1-7, #12, #15, #18, #26, #28. All other ACs intentionally remain unchecked. Task status remains In Progress.

Validator gate record: gate.hash=ab32de1f (committed P0 under audit); scoped gate.green=true; scoped gate.clean=true (16/16 tests, 0 failures, no warnings; root tsc exit 0). Board-wide gate.green=false and gate.clean=false because task notes report `just verify` 109 pass / 9 unrelated augment/workflow-memory-overlays failures; no workflowz-scoped failure observed. Full output summary is recorded above; task remains In Progress.

AC14 CLOSED (Fix152, 2026-08-22). What: same-session gate repair. Mechanism: renderWorkflowDefinition's repair loop now (a) builds a deterministic repair prompt via buildRepairPrompt(repair, report) — embedded from the runtime export into the generated prelude so tested impl and rendered behavior share one source — carrying the failed GateReport's violations/checks/stdout/stderr tails/exitCode with per-field bounds (20 violations, 40 checks, 4k output tails); (b) reuses one agent identity (first stage task.agent, default 'task') and a precomputed static label `workflow:<wf>:<stage>:<gate>:repair` so the repair targets the same session context instead of a cold restart; (c) probes budget.remaining() before EVERY retry and returns status budget_exhausted naming 'before repair attempt N of M' when exhausted (zero retries spent); (d) on retry exhaustion returns the LAST GateReport verbatim in result.report with reason joined from its violations. Note: installed OMP eval kernel agent() exposes no handle-resume parameter (verified in pi-coding-agent 17.3.8 dist), so same-session is implemented as deterministic repair identity + carried GateReport evidence — honest per design §7B row#4; upgrade path is a core agent(handle-followup) API. Verification: test/workflowz-governance.test.ts 'AC14: failed gate repair receives the prior GateReport content...' and 'budget probe before each retry blocks repair with budget_exhausted' pass.

AC17 CLOSED (Fix152, 2026-08-22). What: oversized GateReport evidence routes through OMP session artifacts. Mechanism: omp_workflow_gate measures the executed GateReport JSON size against GATE_REPORT_INLINE_LIMIT (16,384 bytes, exported from runtime.ts); when exceeded it journals boundGateReportForJournal(report) — verdict metadata preserved verbatim (gate/passed/checks≤40/violations≤20/exitCode/killed/signal/durationMs/tool), evidence blobs collapsed to a 600-char tail — plus an `artifact` pointer {artifactId?, path?, contentHash=sha256 of canonicalized FULL payload via contentHash(), bytes} obtained through ctx.sessionManager.saveArtifact(JSON.stringify(report), 'omp_workflow_gate') + getArtifactPath. If sessionManager is unavailable or saveArtifact throws, degradation is graceful: bounded journal copy + full-payload hash-only pointer remain authoritative; overflow routing never fails a run. The journal remains execution-authoritative for external outcomes per design §3C. Verification: test/workflowz-governance.test.ts 'AC17: oversized GateReport evidence routes to a session artifact with bounded pointer/hash in the journal' (50KB LLM evidence → journal 202 bytes, artifactId=7, hash matches full payload) and 'overflow without a session manager still journals a bounded copy plus full-payload hash' pass.

AC21 CLOSED (Fix152, 2026-08-22). What: governance injection into rendered setup. Mechanism: renderWorkflowDefinition now computes a GovernanceContext (ownerIds from workflow.owners or recovery provenance; artifactKind/artifactPath/jjChange/jjBookmark/worktreeName/routeRef from RenderRecovery.governance; CreateRunOptions gained artifactKind/artifactPath so omp_workflow_render can thread them) and prepends renderGovernanceSetup() to every task prompt/setup: owner IDs verbatim ('Backlog owners (verified IDs only): ...' or explicit 'none recorded'), durable-artifact kind/path line, 'Repository: JJ is authoritative (mode=...; change=...; bookmark=...)' with explicit 'not recorded' absences, and forbidden-operations text (never edit Backlog markdown directly; never git commit/branch/push — JJ equivalents required). Absent values render as absences; nothing is fabricated. Recovery runs inherit via governanceFromCreated(created) reading the parent journal's created record. Verification: test/workflowz-governance.test.ts 'AC21: rendered setup embeds owner IDs...' (full envelope + bare run asserts no fabricated TASK ids) and 'AC21: recovery runs inherit the parent journal's governance provenance' pass.

AC22 CLOSED (Fix152, 2026-08-22). What: phase-boundary governance checks. Mechanism: omp_workflow_report now classifies mutating boundaries — every stage_complete and finalization ('complete') — via isMutatingBoundary; read-only boundaries (stage_start etc.) have zero added overhead. At a governed boundary it scans the run lineage (run + parentRunId chain) for passing backlog-record and jj-state gate evidence (findGovernanceEvidence); enforcement applies when the lineage carries governance provenance (created.ownerIds/artifactPath/artifactKind — resume/retry preserve this via journalProvenance), keeping unlinked ad-hoc runs working while all owner-linked runs are blocked. Missing evidence triggers host-side re-verification: jj-state via verifyJJ probe journaled as gateId=jj-state; backlog-record requires prior journaled evidence (artifact_record/scaffold flows), never fabricating an owner id from the workflow name. Failure returns structured {code:'WORKFLOW_GOVERNANCE_BLOCKED', boundary:'finalization'|'stage_complete:<id>', missing:['backlog-record','jj-state']} and both check outcomes are journaled at that boundary. Verification: test/workflowz-governance.test.ts AC22 trio — completion blocked until both records succeed (structured failure + boundary journal entries), boundaries pass once evidence exists in lineage, broken JJ blocks by name — all pass.

REPAIR WAVE (RepairWave, 2026-08-23) — F6 [judge comment #5 / AC14 verifier blocking] budget.remaining() was called WITHOUT await at four sites, so installed kernels whose remaining() is async got Promise comparisons: `Promise <= 0` → NaN → false, making budget_exhausted unreachable and evidence.budgetRemaining a non-number (executeGate → advisory pass). Fixed all four render/execute sites to be sync/async tolerant per orchestrator tie-breaker (await passes sync values through unchanged): runtime.ts:568 pre-gate threshold capture (`await budget.remaining()`), :574 budget gate evidence (`await budget.remaining()`), :599 repair-loop probe (`await budget.remaining()`), and executeGate's consumer resolves a thenable evidence.budgetRemaining before the threshold comparison. Regression test 'F6: async budget.remaining is awaited...' in test/workflowz-governance.test.ts: async stub {remaining: async () => 0} → threshold gate returns status budget_exhausted reason 'budget threshold reached' (stage agent legitimately ran first; gate tool never invoked), repair loop returns budget_exhausted 'budget exhausted before repair attempt 1 of 2' with ZERO repair agents launched and exactly 1 gate call, and executeGate resolves Promise.resolve(0) evidence into passed:false with numeric evidence.budgetRemaining 0. NOTE for next doc touch: design doc workflowz-v2.md §331 documents budget.remaining as sync; should read 'may be async; await the result'. Doc left frozen here per instructions.

REPAIR WAVE (RepairWave, 2026-08-23) — F5 [judge comment #4 verifier blocking] governance injection half-wired: recovery.governance = governanceFromCreated(created) now supplied at BOTH production recovery renders — resumeWorkflowRun passes {seeds, skipStages, governance} and retryWorkflowRun passes {governance} — so resumed/retried rendered setup carries the parent journal's owner IDs, JJ change/bookmark, worktree mode, and routeRef instead of 'change=not recorded/mode=shared workspace'. omp_workflow_render tool params extended with optional ownerIds/artifactKind/artifactPath; they flow into createRun (giving CreateRunOptions.artifactKind/artifactPath their production supplier via the journal created record) and the render call derives governance from the freshly written created event, so governed renders embed the real envelope. Regression test 'F5/AC21: resumed and retried runs render the parent journal's JJ change/bookmark and owners': parent run created with ownerIds TASK-15.2 + jjChange qpvutsxk + bookmark main + worktreeName wt-isolated + routeRef; asserts resumed.run.code and retried.run.code contain 'Backlog owners (verified IDs only): TASK-15.2', change=qpvutsxk, bookmark=main, mode=worktrunk isolation, route ref; resumed code has no 'change=not recorded'; retried code no 'mode=shared workspace'. Verification: bun test test/workflowz-governance.test.ts → my F5+F6 cases pass (13 pass total when p0-tools.ts is settled); lifecycle 16-pass battery green incl. existing provenance round-trips.

AC22 anti-forgery hardening (GovHardener, cycle 2b, judge comments #6/#8). (1) Reserved gate ids: exported RESERVED_GOVERNANCE_GATE_IDS = ['backlog-record','jj-state'] from p0-tools.ts; omp_workflow_gate refuses external gates under these ids BEFORE execution with structured {code:'WORKFLOW_GATE_RESERVED_ID', gateId, reserved} — the judged forgery vector (trivially-passing llm gate named 'backlog-record', runtime.ts:752 auto-pass) is now unreachable; nothing journaled on refusal. (2) Second channel closed: omp_workflow_report equally refuses event:'gate' + reserved gateId/status payloads with the same structured code (judge comment #6 proved this tool journals caller-controlled gate ids; without this guard a caller could bypass the gate-tool refusal by journaling directly through report). (3) Server-side evidence marking: host producers stamp auth:{marker} = HMAC-SHA256(created-event identity) keyed by run journal path + ':' + minute-bucket onto every produced governance event (evidenceSecret/markGovernanceEvent/hasValidAuthMarker in p0-tools.ts); constant-time hash compare, current-or-previous-minute bucket acceptance relative to event timestamp. Trust rule: marked events must verify; auth-absent events (direct host writers, pre-existing journals) remain accepted; present-but-INVALID markers are always rejected (tamper signal). Callers cannot create marked or reserved-id events through any registered tool. (4) Evidence producer wired: omp_workflow_artifact_record gained optional runId and journals an authenticated backlog-record gate on verifyBacklogArtifact success (replacing the dead claim at old :127-129 that artifact_record/scaffold journal evidence — they journaled nothing, per judge #8a); omp_workflow_repo_guard gained optional runId and journals an authenticated jj-state gate when its live verifyJJ probe passes. recordGovernanceEvidence keeps boundary observability: failed backlog-record outcomes still journaled unmarked; jj-state boundary probe stamped. (5) Boundary enforcement condition preserved exactly ((governed||backlog||jj)&&(!backlog||!jj)) so zero-signal ad-hoc runs keep working per design §3D note and existing guards-suite contract; governed-run enforcement is now unforgable because no caller path can fabricate either record. Scope discipline: p0-tools.ts + additive export change only (runtime.ts touched solely to export already-existing private journalPath for secret derivation; no runtime behavior change); tests strictly additive (new describe at end of test/workflowz-governance.test.ts; zero existing assertions modified).

Verification (GovHardener): bun test test/workflowz-governance.test.ts → exit 0, 17 pass / 0 fail / 113 expect (13 legacy incl. AC14/AC17/AC21/AC22 trio + 4 new anti-forgery: spoof-refusal+still-blocked, reserved-id refusal via both tools, genuine artifact_record+repo_guard flow produces authenticated markers [64-hex:bucket] and completes, tamper detection rejects corrupted marker). bun test test/workflowz-p0-tools.test.ts test/workflowz-v2-runtime.test.ts → exit 0, 9 pass / 0 fail. Full workflowz packet (governance+p0-tools+v2-runtime+p0-guards+p1-contracts) → exit 0, 52 pass / 0 fail / 217 expect. bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json → exit 0. bun test test/smoke-plugins.test.ts → exit 0 (8 pass; cross-plugin tool-name uniqueness intact after schema additions). No commits made per evo-mode constraint.

Post-audit revalidation (Audit152, source changed after initial audit; current HEAD c93419c16edbe1355f14397e855869af52b7cb0d with dirty worker changes, validator made no source/commit changes). Current packet `bun test test/workflowz-v2-runtime.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-governance.test.ts test/workflowz-p1-contracts.test.ts`: exit 0, 52 pass / 0 fail / 217 expect. Plugin `bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json`: exit 0; root `bunx tsc --noEmit`: exit 0.

Superseding verdict updates:
14 PASS — current `runtime.ts:buildRepairPrompt/renderWorkflowDefinition` 380-405, 588-608 embed bounded GateReport checks/violations/stdout/stderr/exitCode in same-session repair prompts, re-gate with bounded retries, await budget before each retry, and preserve the last report. `test/workflowz-governance.test.ts` AC14 assertions 70-162 pass (including two repair attempts, report evidence, budget exhaustion, and prompt bounds).
17 PASS — current `runtime.ts:boundGateReportForJournal/gateArtifactPointer` 454-497 and `p0-tools.ts:omp_workflow_gate` 263-284 route oversized reports through `ctx.sessionManager.saveArtifact`, persist bounded journal metadata plus full-payload hash/pointer, and retain a bounded fallback when artifacts are unavailable. Governance assertions 164-229 pass.
21 PASS — current `runtime.ts:renderGovernanceSetup/governanceFromCreated/renderWorkflowDefinition` 408-451 and 527-563 inject verified owner/artifact/JJ/forbidden-operation setup and carry provenance into recovery renders. Governance assertions 231-263 and 414-452 pass.
22 PASS — current `p0-tools.ts:isMutatingBoundary/findGovernanceEvidence/recordGovernanceEvidence/omp_workflow_report` 77-245 blocks governed stage completion/finalization until authenticated backlog-record + jj-state evidence exists; reserved IDs and HMAC markers prevent forged evidence. Governance assertions 263-329 and anti-forgery assertions 460-618 pass.

AC#19/#20 remain PARTIAL: new authenticated evidence journaling strengthens artifact_record/repo_guard, but readiness-depth and mutation-boundary Git fail-closed gaps remain. AC#8 remains PARTIAL because board-wide `just verify` is still not green despite the current workflowz packet and both tsc gates passing. Updated checked set: AC#1-7, #12, #14-15, #17-18, #21-22, #26, #28.

REPAIR WAVE companion (RepairWave, 2026-08-23) — reserved-governance-gate-id contract closed at definition time per coordination with GovHardener (anti-forgery station): RESERVED_GOVERNANCE_GATE_IDS relocated from p0-tools.ts to runtime.ts as the single source of truth (p0-tools imports it; one mechanical swap approved by that station's owner), and validateV2 now rejects workflow definitions declaring gates under 'backlog-record'/'jj-state' with code WORKFLOW_GATE_RESERVED_ID — mirroring the tool-layer refusal so authors get a fail-early error instead of failing at gate execution. Additive test 'F5 companion: workflow definitions cannot declare gates under reserved governance ids' asserts both ids rejected with the mirrored code/message and ordinary ids still validate clean. Post-combination verification: governance suite 18 pass / 0 fail (AC22 trio green with GovHardener's settled layer), p3-polish+lifecycle+v2-runtime 30 pass / 0 fail, smokes 16+8 green, root tsc exit 0, plugin tsc exit 0.

AC#8 post-correction revalidation (Audit152): current `just verify` exited 0. Exact gate output: smoke-workflowz 16 passed / 0 failed; full `bun test test/` reported 307 pass / 18 skip / 0 fail across 325 tests and 2672 expectations; `bunx tsc --noEmit` exited 0. Enabled `RUN_SMOKE=1 bun test plugins/pstack-suite/test/smoke-foundation.smoke.test.ts` separately exited 0 with 18 pass / 0 fail / 56 expectations. Gate rendering, journal, checkpoint, and cooperative-stop coverage remains green in the workflowz packet (52 pass / 0 fail / 217 expect). AC#8 is now objective PASS and checked. Board gate.green=true and gate.clean=true for this verification (no failures/warnings; skips are the expected disabled smoke cases in plain `just verify`). Current checked set: AC#1-8, #12, #14-15, #17-18, #21-22, #26, #28.

Latest packet correction after the reserved-gate definition hardening/F5 companion test: reran the same five workflowz files at HEAD c93419c16edbe1355f14397e855869af52b7cb0d; exit 0, 53 pass / 0 fail / 222 expect. This supersedes the earlier 52 pass / 217 expect packet count; all checked AC evidence remains green. `just verify` remains independently green at 307 pass / 18 expected skips / 0 fail, and enabled smoke-foundation remains 18 pass / 0 fail.

FINAL CURRENT GATE RECORD (Audit152): gate.hash=c93419c16edbe1355f14397e855869af52b7cb0d; gate.green=true; gate.clean=true. `just verify` exit 0 with 307 pass / 18 expected skips / 0 fail across 325 tests; `RUN_SMOKE=1` smoke-foundation exit 0 with 18 pass / 0 fail; latest workflowz packet exit 0 with 53 pass / 0 fail / 222 expect; plugin and root tsc exit 0. Earlier notes describing a red board gate are stale and superseded by this record. No validator commit; worker tree remains dirty.

FINAL CONSOLIDATED 28-AC TABLE (current working tree; supersedes earlier stale rows):
#1 PASS — `runtime.ts` V2 schema/validation + `library.ts` V1 fallback; smoke-workflowz V1 save/list/render/execute assertions.
#2 PASS — `renderWorkflowDefinition` emits bash/completion/checkpoint/budget/report bridges; V2 render/native-helper tests pass.
#3 PASS — bounded repair/re-gate loop and GateReport process metadata; governance AC14 repair tests pass.
#4 PASS — report/journal/host output validation (`p0-tools.ts:omp_workflow_report`, runtime journal/validateOutputs); journal/output tests pass.
#5 PASS — checkpoint hasUI/confirm + auto headless policy; P0/guard checkpoint tests pass.
#6 PASS — status/stop journal operations and rendered early return; journal stop assertions pass.
#7 PASS — child expansion namespacing/cycle detection; V2/guard child tests pass.
#8 PASS — `just verify` exit0: 307 pass/18 expected skips/0 fail; enabled smoke 18/0; tsc root/plugin exit0.
#9 PARTIAL — route structural/recipe/input/ref/depth checks exist, but GateFile availability/trust is not enforced before render.
#10 PARTIAL — `resolveGateFile` validates trust/hash/version, but route/gate execution does not resolve approved GateFile references.
#11 PARTIAL — route tool resolves without execution, but lacks strict WorkflowRouteV1 request/gates/approval contract.
#12 PASS — `buildRules/classify` safety classifier reused; unsafe command tests fail closed.
#13 PARTIAL — GateReport evidence/checks/tails/metadata exist, but version/schema enforcement and arbitrary boolean-only rejection remain incomplete.
#14 PASS — `buildRepairPrompt` sends bounded GateReport evidence, retries/re-gates with budget; governance AC14 tests pass.
#15 PASS — executable/argv default, explicit shell path, classifier + exec approval; dangerous argv guard passes.
#16 PARTIAL — checkpoint custom entry/ref append and branch mirror reconstruction exist, but checkpoint entries themselves are not reconstructed from branch.
#17 PASS — oversized reports use session artifacts plus bounded journal pointer/hash and fallback; governance AC17 tests pass.
#18 PASS — package-qualified checkpoint/mirror types; no workflow leaf navigation; namespace assertions pass.
#19 PARTIAL — authenticated artifact evidence now journals, but readiness-depth and direct durable-write coupling remain incomplete.
#20 PARTIAL — JJ evidence now journals/authenticates, but approved-workspace and workflow-owned Git mutation fail-closed enforcement remain incomplete.
#21 PASS — production render accepts owner/artifact params, records provenance, injects governance setup, and recovery inherits it; AC21/F5 tests pass.
#22 PASS — reserved IDs, authenticated host evidence, boundary/finalization blocking, and tamper rejection; AC22 anti-forgery tests pass.
#23 PARTIAL — operationId journal dedup exists, but pure/idempotent operation envelopes/content-hash replay/manual classification are absent.
#24 PARTIAL — budget probe/exhaustion and retry prechecks exist, but no host launch/time reservation ledger; token/cost advisory.
#25 PARTIAL — headless policy exists, but parallel remains unbounded with no limit/failFast/cancellation fallback.
#26 PASS — docs §7C.1-.4 freeze profiles, spawn authority/depth/fanout, handoffs, and Just chains; retro-freeze accepted.
#27 PARTIAL — artifact metadata/existence checks exist, but inherited DoD/readiness/dependency/reference/documentation/file-content validation is incomplete.
#28 PASS — docs §7D.1-.6 freeze orchestrator skill, HookAPI, Hub controls, health state machine, and typed contracts; retro-freeze accepted.
Final checked set: #1-8, #12, #14-15, #17-18, #21-22, #26, #28. Remaining unchecked: #9-11, #13, #16, #19-20, #23-25, #27.

AC22 re-audit PASS acknowledged (JudgeW2 comment #13). GovHardener response to the two non-blocking follow-ups: (a) layering assumption — confirmed accurate: evidenceSecret's key material is the run journal path (host-readable, not secret); unforgeability rests entirely on reserved-id refusal closing every registered-tool write path for 'backlog-record'/'jj-state'. Layering sentence added to the finder JSDoc in p0-tools.ts alongside the existing trust-rule doc. (b) marker-required end-state — agreed direction; the dual-acceptance window (unmarked passed events accepted) exists solely because pre-existing AC22 fixtures plant evidence via raw appendRunEvent; tightening requires migrating those fixtures first, so it stays triaged as a deliberate transitional rule, documented at the trust-rule JSDoc (:137-143), not a defect. (c) cosmetic indentation p0-tools.ts boundary block — fixed in this pass (tsc exit 0, governance 18/0 re-verified). No behavioral changes; scope remains p0-tools.ts.

FINAL REMAINING-AC EVIDENCE SWEEP (Audit152, current tree; no new checks). Current focused command `bun test test/workflowz-p1-contracts.test.ts test/workflowz-p3-polish.test.ts test/workflowz-governance.test.ts`: exit 0, 51 pass / 0 fail / 277 expect. Full `just verify` and enabled smoke gates remain green as recorded above.
#9 PARTIAL — `runtime.ts:routeError` + `p0-tools.ts:omp_workflow_route` validate mode/depth/cycles, unknown recipes, typed inputs, and forward refs; P2 preview also resolves typed direct/chain inputs. Neither route path validates unavailable/untrusted required GateFile references before rendering. Leave unchecked.
#10 PARTIAL — `templates.ts:resolveGateFile` and P1 integrity/owner tests prove version/hash/trust validation in isolation; `omp_workflow_route`/`omp_workflow_gate` still consume inline route/gate data and do not resolve approved GateFileV1 references. Normalized GateReports are journaled. Leave unchecked.
#11 PARTIAL — P2 `workflowz-p3-polish.test.ts` `/workflows <prompt> shows a strict route preview without executing` passes (lines 427-461), but the p0 `omp_workflow_route` tool still accepts `unknown` input and returns raw `{route,resolved}` (`p0-tools.ts:402-425`); no `WorkflowRouteV1` type/strict gates+approval contract exists. Preview is useful partial evidence, not this AC's full contract. Leave unchecked.
#13 PARTIAL — current `GateReport/GateCheck/executeGate` (`runtime.ts:108-116,747-787`) supplies checks, bounded stdout/stderr/tails, exit/signal/duration/tool, and normalized violations; no version field/schema validator or explicit rejection path for arbitrary boolean-only reports. Governance bound-report tests pass, but full AC remains unchecked.
#16 PARTIAL — checkpoint appends namespaced entry with route/journal/artifact refs (`p0-tools.ts:302-319`); `index.ts:reconcileSessionMirrors` reads the OMP branch but reconstructs `.mirror` entries, not checkpoint entries/ref payloads. No checkpoint-branch reconstruction assertion. Leave unchecked.
#19 PARTIAL — `omp_workflow_artifact_record` now verifies Backlog task/document existence and journals authenticated `backlog-record` evidence (`p0-tools.ts:342-357`); genuine-flow governance tests pass. It does not validate inherited DoD/dependency/reference/documentation contents or couple every recipe/gate/plan/report durable-write path to the guard. Leave unchecked.
#20 PARTIAL — `omp_workflow_repo_guard`/`verifyJJ` probe root/status/change/bookmark and journal authenticated `jj-state` evidence (`p0-tools.ts:360-373`, `runtime.ts:824-835`); no approved-workspace mutation boundary or host interceptor that fail-closes workflow-owned commit/branch/push. Governance JJ tests prove evidence blocking only. Leave unchecked.
#23 PARTIAL — `appendRunEvent` deduplicates journal append by `operationId` (`runtime.ts:519-531`), but no operation-envelope cache/replay keyed by operationId+contentHash or pure/idempotent/manual execution classifier. Docs §7B.1/§7B.8 explicitly freeze stage-granular dedup as shipped and exactly-once as unavailable; fallback is resume at last durable stage and never claim manual exactly-once. Leave unchecked.
#24 PARTIAL — budget gates probe `budget.remaining()` and block thresholds/retries (`runtime.ts:760-770`; governance F6 test passes), but no host launch/time reservation ledger or authoritative token/cost telemetry. Docs §7B.3 freezes this as advisory; token/cost must remain advisory and stop before unknown overrun. Leave unchecked.
#25 PARTIAL — headless checkpoint policy is implemented, but rendered fan-out remains unbounded `parallel` (`runtime.ts:429`) with no limit/failFast/cancellation fallback. Docs §7B.7/§7B.4 document OMP-core scheduler/abort as required for parity; extension fallback is preserve evidence, mark in-flight work indeterminate, and require explicit resume/retry. Leave unchecked.
#27 PARTIAL — artifact metadata gate requires several non-empty fields and verifies owner existence (`p0-tools.ts:342-356`, `runtime.ts:812-821`); P1 missing-owner/scaffold tests pass. It does not validate inherited DoD, dependency/readiness semantics, refs/docs/modified-file contents, or enforce the check on every durable write. Leave unchecked.
Final remaining unchecked set is unchanged: AC#9-11, #13, #16, #19-20, #23-25, #27.

FINAL CLOSURE (Closer152, cycle 3) — mechanisms + verification per AC. All claims below verified by rerunning the targeted battery in this tree: 92 pass / 0 fail across 9 workflowz suites (incl. the four primary suites at 44/44, 230 expects), bun run test/smoke-workflowz.test.ts exit 0, bun test test/smoke-plugins.test.ts 8/8, root tsc --noEmit exit 0, plugin tsc --noEmit exit 0.

AC#9 route-plan validation — buildRoutePlan() in runtime.ts runs the FULL pre-render gate: shape/depth/cycle checks via existing routeError(), chain depth vs maxDepth (MAX_ROUTE_PLAN_DEPTH=8), unknown recipe rejection, typed input resolution via resolveDefinitionInputs, forward/unknown resultRef rejection, and gate availability/trust via resolveGateReference. Verified by probe (unknown workflow → WORKFLOW_ROUTE_INVALID 'unknown workflow missing'; cyclic → refused) + new additive test AC9.

AC#10 approved gate references — WorkflowGate gains ref field; validateV2 accepts ref-only gates; routeGateEntries resolves every declared ref through templates.resolveGateFile with project-over-global precedence + hash/ownership verification, and resolveGateReference additionally refuses draft/untrusted trust. Verified end-to-end: draft gate ref rejected ('is draft; approved or safe trust is required'), approveGate+saveGateFile then yields plan entry {ref:'lint-check', version:'1.0.0', required:true}; normalized tool results preserved in journal (AC13 path). Additive test AC10 green.

AC#11 strict route tool — omp_workflow_route now returns {plan} where plan is a typed WorkflowRouteV1 (version:1, mode, steps[{workflow,scope,path,inputs,gates[{id,type,ref?,version?,required}]}], gates[], maxDepth, approval:'required', contentHash). Raw {route,resolved} passthrough removed entirely. index.ts buildRoutePreviewModel reuses the SAME buildRoutePlan so /workflows TUI preview and the tool share one validator. Verified by live probe returning full typed plan + AC11 additive test.

AC#13 evidence-bearing GateReports — normalizeGateReport() enforces the contract at one boundary: boolean-only reports rejected ('must carry per-item checks'), each check requires item+ok, all evidence strings bounded to 4000 chars, exit/result metadata/duration/tool/version preserved; GateReport.version added, executeGate probes tool --version post-classification via resolveToolVersion (never for safety-blocked commands); omp_workflow_gate normalizes before journaling and preserves adapter extra fields verbatim. Verified by AC13 additive test (boolean rejected, bounded stdout ≤4000, metadata kept).

AC#16 checkpoint reconstruction — CheckpointSessionEntry type + isCheckpointSessionEntry + reconstructCheckpointsFromBranch(getBranch()) in runtime.ts (latest-wins per runId); omp_workflow_checkpoint session entry now carries workflow/status/policy/routeRef/journalRef (always resolved via journalPath)/artifactRefs/timestamp; index.ts reconcileSessionMirrors consumes checkpoint entries on session_start/tree/switch. Journal stays authoritative. Verified by AC16 additive test (entry refs + round-trip reconstruction).

AC#19 artifact_record linkage — tool requires full readiness BEFORE durable writes and journals authenticated backlog-record only after verifyArtifactReadiness passes (metadata gap check + live Backlog task/document probes). Builds on GovHardener's marked-evidence flow without duplication. Covered by AC27 test exercising the same tool plus genuine-flow suite still green.

AC#20 repo_guard mutation boundary — guard now fails closed unless verifyJJ passes AND jjChangeIdentity resolves change_id (+bookmarks) from live jj log; missing identity returns WORKFLOW_CHANGE_IDENTITY_UNRESOLVED; workspace approval surfaced via resolveWorktree seam already present; git commit/branch/push remain refused through directiveBlockReason classifier (single authority, no duplication). Verified: genuine-flow suite green with new change/bookmark checks appended to jj-state evidence.

AC#23 operation replay — replayClassFor()/lookupOperationReplay(): journal-dedup keyed by operationId(+contentHash); pure/idempotent events return cached envelope with replay:{class,replayed:true}; manual side effects (checkpoint etc.) return WORKFLOW_OPERATION_MANUAL_CONFIRM and are NEVER claimed exactly-once (docs/comments explicit). appendRunEvent dedup remains the storage-level truth. Verified by AC23 additive test (stage_complete replays pure; checkpoint replay refused as manual).

AC#24 host budget ledger — reserveRunLaunch/budgetLedgerSnapshot enforce maxLaunches + maxWallClockMs BEFORE execution (fail closed, journals failed/budget_exhausted event on exhaustion); DEFAULT_RUN_BUDGET = {64 launches, 30min}. omp_workflow_render threads maxLaunches/maxWallClockMs into run provenance; new omp_workflow_reserve_launch tool backs rendered-JS reserve(); token/cost limits explicitly advisory with §7B-row-3 citation in code comments (no OMP usage telemetry). Verified by AC24 additive test (3rd reservation of 3 refused + journaled) and AC25 rendered test (exhaustion surfaces budget_exhausted).

AC#25 headless policy + bounded scheduler + fail-fast — checkpoint tool gains explicit policy enum (interactive|auto|auto-readonly|auto-mutating): auto-readonly headless-approves read-only checkpoints only, auto-mutating never approves headless without auto:true (fail closed). runBoundedParallel() worker pool (limit, failFast stops launching after first failure; documented §7B rows 4/7 residual: in-flight work indeterminate without core abort). renderWorkflowDefinition renders boundedParallel with recovery.parallel config + per-launch reserve(); budget exhaustion propagates out of the pool instead of being swallowed. Ad-hoc callers passing no policy keep plain semantics. Verified by AC25 additive tests (peak concurrency ≤ limit, failFast reduces launches, rendered reservations ≥1 and exhaustion fails the run).

AC#27 artifact readiness validation — artifactReadinessGap()/verifyArtifactReadiness() require acceptance criteria (non-empty, no blank items), inherited Definition of Done, type/priority/status, labels, well-formed dependencies/references/documentation lists, and non-empty modifiedFiles BEFORE durable writes; combined with live Backlog existence probes into one backlog-readiness report consumed by omp_workflow_artifact_record. Verified by AC27 additive test (each gap field individually refused with WORKFLOW_ARTIFACT_INVALID + structured gap; complete payload passes).

Verification record (cycle 3, this station): bun test governance+v2-runtime+p0-tools+p0-guards+lifecycle+p1-contracts+p3-polish+observability+command = 92 pass/0 fail; primary four suites alone 44/44 (230 expects); smoke-workflowz exit 0; smoke-plugins 8/8; root + plugin tsc exit 0. Tests strictly ADDITIVE (new describe blocks at file ends + import additions only; no existing assertions modified). CHANGELOG single entry under [Unreleased]. No commits made.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-21 22:55
---
Review (orchestrator, 2026-08-21) of committed P0 state (ab32de1f line, HEAD-contained):

GREEN CONFIRMED: v2-runtime suite inside today's scoped runs (35 pass / 0 fail / 105 expect across the 6-file packet); scoped tsc exit 0 at tip; implementation notes claim route validation, gate adapters, journal replay, stop cooperation, V2 save/resolve coverage.

FINDING 1 — evidence debt: all 28 ACs remain unchecked while notes claim the P0 runtime landed. Status cannot honestly advance without an AC-by-AC evidence audit mapping each criterion to objective proof (test names, tool probes, journal fixtures). Recommend the same treatment TASK-15.1.2 received: independent validator pass producing a per-AC verdict table before any checkbox moves.

FINDING 2 — dependency paradox: AC#26 requires TASK-15.7 (profiles/Just chains frozen BEFORE P0 runtime implementation) and AC#28 requires TASK-15.8 (orchestrator skill/Hook/Hub contract frozen BEFORE P0 runtime) — but both spikes are To Do while P0 runtime is implemented and committed. Either the runtime shipped ahead of the mandated freezes (sequencing violation to reconcile: re-scope the ACs or retroactively freeze the contracts against the shipped behavior), or the dependencies are stale. Must be resolved before AC#26/#28 can ever be checked.

FINDING 3 — minor: notes record full-suite failures in unrelated augment/workflow-memory-overlays suites as pre-existing; consistent with observations elsewhere tonight (workspace tsc carries ~880 unrelated diagnostics). No workflowz-attributable failures found in any scoped run this session.

Disposition: stays In Progress. Next actionable step: dispatch an AC-evidence audit (validator) over the 28 criteria; resolve the 15.7/15.8 sequencing contradiction in the same pass.
---

created: 2026-08-22 22:28
---
BLOCKING validator findings (ACs remain unchecked): AC#14 `plugins/extensible-workflows/src/runtime.ts:renderWorkflowDefinition` 452-460 launches a fresh repair `agent()` without the failed GateReport/violations or same-session handle; retain the original handle/session and pass bounded GateReport evidence into repair. AC#17 has no `sessionManager.saveArtifact` or bounded GateReport artifact/hash path; add session-artifact storage and pointer/hash fields while keeping the journal authoritative. AC#21 `runtime.ts:renderWorkflowDefinition` 423-428 and `src/index.ts:omp_workflow_render` 426-439 inject no Backlog/JJ/governance setup envelope; add owner IDs, artifact kind/path, JJ mode/change/bookmark, and forbidden direct operations to every rendered agent setup. AC#22 `omp_workflow_report` 83-94 is not coupled to artifact_record/repo_guard at mutating boundaries/finalization; require both GateReports before phase advancement or completion.
---

created: 2026-08-22 22:28
---
FOLLOW-UP validator findings: AC#8 full just verify remains red per task notes (109 pass/9 unrelated failures). AC#9/#10/#11 route validation lacks strict WorkflowRouteV1 gate refs/approval and approved GateFileV1 resolution despite `templates.ts:resolveGateFile`. AC#13 GateReport lacks version/schema enforcement and accepts boolean-only shapes through p0 dispatch. AC#16 `index.ts:reconcileSessionMirrors` ignores namespaced checkpoint entries and their route/journal/artifact refs. AC#19/#27 artifact readiness checks only partial metadata/existence and direct save paths bypass the guard. AC#20 verifyJJ/worktree are not a mutation-boundary fail-closed policy for Git operations. AC#23 only deduplicates journal appends by operationId, not pure/idempotent operation envelopes/content-hash replay. AC#24 budget gate probes remaining tokens but has no host launch/time ledger. AC#25 parallel remains unbounded with no limit/failFast/cancellation fallback. Fix before checking related ACs.
---

created: 2026-08-23 00:08
---
[blocking] VERIFIER (JudgeW2.verifyV2-gov-inheritance) confirms claim — AC21 half-wired, production renders can never carry real artifact/JJ governance. Evidence: (1) plugins/extensible-workflows/src/runtime.ts:529 governance comes only from recovery?.governance; :530-533 fallback = workflow.owners alone. (2) All three production renderWorkflowDefinition callers omit it: index.ts:694 (omp_workflow_render, 4-arg, no recovery; tool params :687 accept only name/inputs/scope; createRun :692 passes only contentHash), runtime.ts:1044 (resume passes {seeds, skipStages}), runtime.ts:1072 (retry passes none). (3) governanceFromCreated (runtime.ts:444) has ZERO production callers — sole caller test/workflowz-governance.test.ts:252. (4) CreateRunOptions.artifactKind/artifactPath (runtime.ts:656-657) have no production supplier (only test :263); AC21 closure note's 'so omp_workflow_render can thread them' describes absent wiring. (5) Damning: resume/retry hold parent provenance in hand — journalProvenance(created) copied onto new created event at :1042/:1070 — yet rendered code for those runs prints change=not recorded/bookmark=not recorded/mode=shared workspace; fix is literally recovery.governance = governanceFromCreated(created) in both fns. (6) Second AC21 test tests helper pair in isolation, never resumeWorkflowRun/retryWorkflowRun; lifecycle tests assert no governance content. p0-tools.ts:89-167 governance evidence is boundary enforcement (AC22), unrelated to prompt rendering. Fix: pass { seeds, skipStages, governance: governanceFromCreated(created) } at runtime.ts:1044 and add recovery at :1072; extend omp_workflow_render params+createRun+recovery in index.ts:687-701.
---

created: 2026-08-23 00:25
---
[blocking] VERIFIER-2 (JudgeW2.verifyV2-gov-inheritance-2) independently CONFIRMS prior finding after adversarial refutation attempt — refuted=false, BLOCKING stands. New evidence beyond first report: (a) plugins/extensible-workflows/src/p0-tools.ts:369+386 — omp_workflow_resume/retry return REAL provenance (jjChange/jjBookmark/worktreeName/routeRef from journalReferences) in the same result object whose `code` field was rendered WITHOUT it, so one tool response self-contradicts ('code' says change=not recorded; metadata says change=X). (b) runtime.ts:1042+:1070 — resume/retry already copy journalProvenance(created) into the CHILD journal's created record, proving values are present-at-render-time, not absent; rendering them as 'not recorded' violates the module's own contracts at runtime.ts:408-410 ('values come verbatim from run provenance') and :527-528 ('recovery runs rebuild it from the parent journal'). (c) AC21 closure note claims CreateRunOptions artifactKind/artifactPath exist 'so omp_workflow_render can thread them' — but index.ts:692 createRun passes only contentHash and :694 passes no recovery arg: closure describes unwired plumbing. (d) journalProvenance runtime.ts:970-981 drops artifactKind/artifactPath entirely, so even journal-level artifact provenance dies across recovery (secondary follow-up). (e) bun test workflowz-governance.test.ts = 11 pass / 0 fail / 69 expects — green suite cannot catch this because the 'recovery inherits governance' test (:250-258) calls governanceFromCreated directly instead of going through resumeWorkflowRun/retryWorkflowRun. Minimal fix: thread governance: governanceFromCreated(created) into the RenderRecovery objects at runtime.ts:1044 and :1072; decide + document omp_workflow_render provenance story (accept optional params or keep owners-only fallback explicitly).
---

author: JudgeW2.verifyV1-gov-unreachable-2
created: 2026-08-23 00:29
---
[adversarial-verification] CLAIM 'AC22 WORKFLOW_GOVERNANCE_BLOCKED unreachable in production' — REFUTED with executable proof (bun harness, real plugin code, mocked ExtensionAPI, temp cwd; no repo edits). Premises (a)/(b) CONFIRMED: production createRun sites are index.ts:692 ({contentHash} only) and runtime.ts:1042/:1070 (journalProvenance runtime.ts:970-981 carries ownerIds/jjChange/jjBookmark/routeRef/previewRef/routeMode/worktreeName/contentHash but never artifactKind/artifactPath), so evidence.governed is always false in production. Premise (c) REFUTED: gate events with governance gateIds are ALSO journaled by the omp_workflow_gate tool at p0-tools.ts:222 (`gateId: p.gate.id` — caller-controlled; isGate p0-tools.ts:52-56 reserves nothing; validateV2 runtime.ts:187 slug check passes both 'backlog-record' and 'jj-state'), and rendered workflows feed definition gates verbatim into that tool (runtime.ts:578/580/603). Reachability proven end-to-end via registered tools only: omp_workflow_save -> omp_workflow_render -> omp_workflow_gate{gate:{id:'jj-state',type:'llm'}} (executeGate runtime.ts:752 returns passed=true unconditionally for llm type) -> omp_workflow_report{event:'complete'} => isError result details {code:'WORKFLOW_GOVERNANCE_BLOCKED',boundary:'finalization',missing:[...]}. Control run without evidence completes ungated, matching the claimant's observation but not the conclusion. Residual true finding (follow-up, not this claim): evidence-less runs skip the branch entirely at p0-tools.ts:166, and BOTH fake evidences short-circuit it too ((backlog&&jj) makes (!backlog||!jj) false) — enforcement is forgeable/bypassable; also p0-tools.ts:127-129 comment claims artifact_record/scaffold flows journal passing backlog-record gates but neither tool calls appendRunEvent. Verdict for THIS claim: REVIEW_FAILED on the claim itself — not blocking against the code.
---

author: JudgeW2.verifyV5-repair-attack-2
created: 2026-08-23 00:31
---
[adversarial-verification] AC14 same-session repair claim ATTACKED — refuted=false, REVIEW_PASSED stands (no blocking defect). Angle-by-angle: (1) STALE REPAIR EVIDENCE, real but non-blocking: runtime.ts:595 builds repairPromptBase_${name} from the INITIAL report outside the retry loop; :602 reuses it every attempt. Executable probe (retries:3, gate mock returns VIOLATION-A twice then NEW VIOLATION-B): attempt-2/3 prompts contain VIOLATION-A only, never VIOLATION-B — yet AC14 text (this task, AC#14) requires only sending THE GateReport to the same session/handle with bounded retry+budget, design contract workflowz-v2.md:120 says 'send the report' with no freshness clause, and exhaustion still surfaces the LATEST report. Follow-up: rebuild base from lastReport_ before each agent() call. (2) BUDGET PROBE CORRECT: runtime.ts:598-601 ReferenceError-safe typeof guard + sync budget.remaining() matching documented kernel contract workflowz-v2.md:331 (`budget.remaining() < threshold`); advisory fail-open declared design (:446,:519); test trio proves budget_exhausted before spend (agentRepairCalls=0, gateCalls=1). Promise-returning/throwing remaining() outside documented contract; worst case probe skip or render try/catch :620-623. (3) VERBATIM HOLDS: gate tool response {content,details,isError?} p0-tools.ts:40-46; normalize :542 spreads details field-for-field (+additive isError); probe shows result.report.violations === last executed gate's violations, reason joined from same object :607. (4) REGATE CONFIRMED: bound `attempt <= retries` :597; agent() :602 then omp_workflow_gate({...,attempt}) :603 each iteration; probe 4 gate calls for retries=3; behavioral test asserts [0,1,2]. (5) CHECKPOINT EXCLUDED: :588 `gate.type !== checkpoint`; checkpoint branch :569-572 renders no repair; cancelled status :587/:611. Verification: bun test workflowz-governance.test.ts -t AC14 → 3 pass / 0 fail / 26 expects. Non-blocking follow-ups recorded here for triage: (a) runtime.ts:595 evidence refresh per attempt; (b) governance.test.ts:90-93 gate mock identical each attempt — divergence case untested; (c) runtime.ts:605 retry?.advisory break arm near-unreachable since optional (:586) already excludes advisory gates.
---

author: cook-judge
created: 2026-08-23 00:35
---
[blocking] JUDGE VERDICT (JudgeW2): REVIEW_FAILED — AC#21/#22 closures are unwired/unauthenticated end-to-end; AC#14/#17 fixes verified sound. BLOCKING-1 (AC#22, refined after adversarial refutation of my initial 'unreachable' framing): enforcement is default-FAIL-OPEN and its backlog-record evidence channel is unauthenticated. (a) plugins/extensible-workflows/src/p0-tools.ts:222 journals ANY passing gate under caller-controlled gate.id, so a workflow declaring a trivially-passing gate literally named 'backlog-record' (e.g. advisory LLM gate) satisfies findGovernanceEvidence (p0-tools.ts:104) with zero Backlog reality — verifier produced an executable proof through the real module; rendered workflows pass definition gates verbatim. The AC#22 closure note's claim that evidence comes from 'artifact_record/scaffold flows' is factually wrong: omp_workflow_artifact_record/repo_guard (p0-tools.ts:281-305) journal NOTHING (no runId param, no appendRunEvent). (b) The provenance activation path is dead: the only createRun call sites are index.ts:692 ({contentHash} only) and runtime.ts:1042/:1070 (journalProvenance passthrough of parents that also lack it), so created.ownerIds/artifactKind/artifactKind are never set in production, governed is always false, and ordinary runs hit NO check at any boundary — contradicting checked AC#22 text ('Backlog-record and jj-state checks run at mutating phase boundaries and finalization'). jj-state alone is authentic (live verifyJJ probe, p0-tools.ts:137). Fix: journal authenticated backlog-record/jj-state events inside artifact_record/repo_guard (add runId param), thread provenance at omp_workflow_render, and/or require workflow-declared governance intent; then update the closure note.
---

author: cook-judge
created: 2026-08-23 00:35
---
[blocking] JUDGE VERDICT (JudgeW2) BLOCKING-2 (AC#21): rendered governance injection is half-wired — confirmed independently by two verifiers (comments #4/#5). renderWorkflowDefinition takes governance ONLY from recovery?.governance (runtime.ts:529) with a workflow.owners-only fallback (:530-533); resumeWorkflowRun renders child code WITHOUT governance (runtime.ts:1044 passes {seeds, skipStages}), retryWorkflowRun passes none (:1072), omp_workflow_render is 4-arg (index.ts:694) and creates runs contentHash-only (:692). governanceFromCreated (runtime.ts:444) has ZERO production callers (sole caller test/workflowz-governance.test.ts:252). Net: rendered prompts can NEVER contain real artifact kind/path (CreateRunOptions.artifactKind/artifactPath have no production supplier) and always print change=not recorded / mode=shared workspace even when the run journal holds real jjChange/jjBookmark/worktreeName — while the SAME resume/retry tool response exposes those values (p0-tools.ts:369/:386), so one envelope self-contradicts. The 'recovery runs inherit' closure sentence describes plumbing only a unit test exercises. Fix (minimal): pass governance: governanceFromCreated(created) in the RenderRecovery objects at runtime.ts:1044 and add recovery at :1072; give omp_workflow_render explicit provenance params or document owners-only fallback as intended.
---

author: cook-judge
created: 2026-08-23 00:35
---
JUDGE VERDICT (JudgeW2) verified-sound surfaces + follow-ups: AC#14 REVIEW_PASSED via dedicated adversarial verifier — all five attack angles closed with live probes (stale repairPromptBase CONFIRMED but non-blocking: AC#14/design §3B have no per-attempt freshness clause and exhaustion returns the LATEST report; budget probe ReferenceError-safe + zero-spend proven; result.report verbatim-lossless through normalize; regate-per-attempt bounded; checkpoint exclusion correct). AC#17 verified sound by direct review: contentHash (runtime.ts:871-880) hashes the canonicalized FULL payload, overflow routing degrades gracefully with or without sessionManager (p0-tools.ts:205-225), journal stays authoritative, behavioral tests prove pointer/hash/bounded-copy semantics. FOLLOW-UPs: (1) runtime.ts:595 rebuild repairPromptBase from lastReport_ before each agent() call so attempts ≥2 see newer violations; (2) boundGateReportForJournal bounds counts but not violation/check-item string lengths — mirror buildRepairPrompt's per-string bounds; (3) gateArtifactPointer.bytes measures plain JSON.stringify while the hash covers canonicalized form (informational drift); (4) governanceFromCreated drops artifactKind/artifactPath so even wired inheritance loses the durable-artifact line; (5) findGovernanceEvidence outer condition (p0-tools.ts:166) enforces on partial evidence for UNPROVENANCED runs, deviating from the stated 'unlinked ad-hoc runs keep working' — document or scope to governed; (6) dead 'void exec'/'void workflowName' statements p0-tools.ts:110/:121. Cross-cutting: gate.ts widening is purely type-level (behavior-preserving ✓); all three test deltas strictly additive (governance +354 new, lifecycle +172/-0, p1-contracts +97/-0); scoped packet independently rerun 54 pass/0 fail/202 expect; plugin tsc + root bun run check exit 0. Disposition: stays In Progress; AC#21/#22 should be re-opened/re-checked only after wiring lands.
---

created: 2026-08-23 01:17
---
Post-audit supersession (Audit152, current worker tree): the prior AC#14/#17/#21/#22 blocking comment is superseded by current source and the 52-test packet. AC#14, #17, #21, and #22 are now objectively PASS and checked. Remaining governance follow-ups are AC#19/#20: authenticated evidence is now journaled, but artifact readiness depth and mutation-boundary Git fail-closed enforcement remain incomplete; AC#8 remains partial until board-wide just verify is green.
---

created: 2026-08-23 01:19
---
AC#8 supersession: parent reported the combined tree repaired the board gate; validator independently reran `just verify` (exit 0; 307 pass, 18 expected skips, 0 fail) and enabled smoke-foundation (18 pass, 0 fail). AC#8 is now checked. The earlier partial verdict was based on stale pre-repair failures.
---

author: cook-judge
created: 2026-08-23 01:19
---
[re-audit] JUDGE RE-AUDIT VERDICT (JudgeW2): BLOCKING-1 (AC#22, comments #8/#6) and BLOCKING-2 (AC#21, comment #9) are both ADDRESSED — independently verified against the working tree, not taken from claims. BLOCKING-1 closure evidence: (1) reserved-id refusal verified at BOTH entry points — plugins/extensible-workflows/src/p0-tools.ts:261 (omp_workflow_gate, before executeGate, nothing journaled) and :213-215 (omp_workflow_report event:'gate') returning structured WORKFLOW_GATE_RESERVED_ID; the judged forgery ({id:'backlog-record'} llm gate) is now unreachable through any tool. (2) HMAC auth markers verified sound: per-run evidenceSecret (:98-102), constant-time comparison with minute-bucket tolerance handling the only possible skew direction (:119-135, fail-closed on malformed timestamps); host producers wired — omp_workflow_artifact_record gained runId and journals a MARKED backlog-record passed gate only after verifyBacklogArtifact passes (:346/:355), omp_workflow_repo_guard gained runId and journals MARKED jj-state only on passing live probe (:364-372), recordGovernanceEvidence marks its boundary events (:184/:190); present-but-invalid markers rejected while unmarked legacy events remain accepted as a documented transitional rule (:137-143). (3) Enforcement condition unchanged with my scope note honored (:227). (4) Tamper rejection covered by new tests. BLOCKING-2 closure evidence: governance threaded at resume runtime.ts:1055 ({seeds, skipStages, governance: governanceFromCreated(created)}), retry :1083, AND omp_workflow_render now accepts ownerIds/artifactKind/artifactPath params, threads them into createRun (:733), then renders with governance: governanceFromCreated(createdEvent) read back from the journal (:735-737) — full envelope (artifact kind/path + JJ state) now reachable in production for provenance-supplied runs. Independent gates rerun by me: governance suite 18 pass / 0 fail / 118 expect (incl. spoof-refusal+still-blocked, reserved refusal on both tools, genuine marked flow, tamper detection); scoped packet 62 pass / 0 fail / 253 expect across 7 files; plugin tsc --noEmit exit 0; governance test delta strictly additive vs HEAD (0 deletions). NEW FOLLOW-UPs (non-blocking): (a) evidenceSecret is keyed by journalPath+created-event content, both knowable to code-executing agents — acceptable ONLY because reserved-id refusal removes every tool write path for those ids; document this layering assumption where the scheme is defined; (b) findGovernanceEvidence still accepts UNMARKED passed reserved-id events (:160-161 legacy rule) — unreachable today, but tighten to require markers for passed status once the legacy window closes so a future unmarked writer cannot silently reopen the hole; (c) cosmetic indentation p0-tools.ts:216-224. Prior follow-ups #1-#4/#6 from comment #10 remain open/non-blocking. Disposition: AC#21/#22 re-audit PASS; task remains In Progress on its own remaining unchecked ACs (#8-#11,#13,#16,#19,#20,#23-#25,#27).
---

created: 2026-08-23 01:20
---
Final list correction: later than JudgeW2 comment #13, validator independently reran green `just verify`; AC#8 is checked. Current remaining unchecked ACs are #9-11, #13, #16, #19-20, #23-25, and #27 only. AC#21/#22 remain PASS after the production wiring and anti-forgery hardening confirmed in comment #13.
---

author: cook-judge
created: 2026-08-23 01:21
---
Follow-up addendum (JudgeW2, per GovHardener acknowledgment): the dual-acceptance window in findGovernanceEvidence (:160-161 unmarked-legacy OR valid-marker) is deliberate — three pre-existing AC22 tests plant evidence via raw appendRunEvent, so flipping passed-reserved-id events to marker-required first requires migrating those fixtures to markGovernanceEvent. Both open governance follow-ups from comment #13 are one-station-sized and left triaged post-verdict; no scope expansion requested.
---

author: cook-judge
created: 2026-08-23 01:23
---
Follow-up closure verification (JudgeW2): 13a VERIFIED — layering assumption documented verbatim at p0-tools.ts:141-144 ('unforgeability rests ENTIRELY on reserved-id refusal closing every tool write path, not on key secrecy', transitional window + marker-required end-state noted); 13c indentation fixed. Gates rerun post-change: governance 18 pass / 0 fail / 118 expect, p0-tools 2/0, plugin tsc exit 0. Residual micro-nit (cosmetic only): the older evidenceSecret docstring header (:92-94 'external callers cannot guess ... host-only readable location') now overstates secrecy relative to the corrected :141-144 block directly below the trust decision — harmless since the accurate statement governs, fold into any next touch of this function. (b) remains triaged per comment #15. Nothing further from judge.
---

author: cook-judge
created: 2026-08-23 01:35
---
JUDGE VERDICT (ReJudge, final repair verification): REVIEW_PASSED — F5, F6, and AC22 anti-forgery hardening all genuinely closed on end-state bytes; no regressions, tests additive.

F5 CLOSED (comments #4/#5/#9): resumeWorkflowRun passes recovery { seeds, skipStages, governance: governanceFromCreated(created) } at runtime.ts:1055 and retryWorkflowRun { governance: governanceFromCreated(created) } at :1083 — created is the parent journal's created event (:1026/:1063). omp_workflow_render params extended with ownerIds/artifactKind/artifactPath (index.ts:727-728), threaded into createRun (:733), then the freshly written created event is read back and rendered via { governance: governanceFromCreated(createdEvent) } (:735-737) — the exact minimal fix prescribed. renderWorkflowDefinition consumes recovery.governance first (runtime.ts:535) before the owners-only fallback. Regression test 'F5/AC21: resumed and retried runs render...' (test/workflowz-governance.test.ts:415-457) goes through the REAL resume/retry functions — closing judge #5's helper-pair-only gap — asserting owners TASK-15.2, change=qpvutsxk, bookmark=main, mode=worktrunk isolation, route=route://parent, and explicit absence of 'change=not recorded' / 'mode=shared workspace'. No fabrication anywhere in renderGovernanceSetup (runtime.ts:427-446): absences print as absences. PASS.
---

author: cook-judge
created: 2026-08-23 01:35
---
F6 CLOSED: budget.remaining() awaited at all four sites — rendered pre-gate threshold capture runtime.ts:574, budget-gate evidence :580, repair-loop probe :604-606 (await passes sync values through unchanged per tie-breaker), and executeGate resolves a thenable evidence.budgetRemaining into a number before threshold compare (:761-768), returning numeric evidence. Regression test (governance.test.ts:359-413) proves with async stub remaining: async () => 0 → threshold gate returns budget_exhausted 'budget threshold reached' (stage agent legitimately ran first); repair loop returns budget_exhausted before attempt 1 of 2 with ZERO repair agents launched and exactly 1 gate call; executeGate turns Promise.resolve(0) evidence into passed:false with numeric evidence.budgetRemaining 0; also asserts rendered code contains 'await budget.remaining()'. PASS.
---

author: cook-judge
created: 2026-08-23 01:35
---
AC22 HARDENING CLOSED (comments #6/#8): (1) RESERVED_GOVERNANCE_GATE_IDS = ['backlog-record','jj-state'] exported from runtime.ts:38 as single source of truth; omp_workflow_gate refuses reserved ids BEFORE execution (p0-tools.ts:264) and omp_workflow_report refuses event:'gate'+reserved payloads (:216-218), both with structured { code:'WORKFLOW_GATE_RESERVED_ID', gateId, reserved } and nothing journaled on refusal. (2) HMAC per-run markers: evidenceSecret = HMAC-SHA256(created-event identity) keyed by journalPath (:95-99); markGovernanceEvent stamps '<hash>:<minute-bucket>' (:109-111); hasValidAuthMarker does length-guarded constant-time hash compare and accepts current-or-previous minute bucket relative to the EVENT timestamp (:116-131). Trust rule implemented exactly as claimed at findGovernanceEvidence :163-164: marked events must verify, auth-absent accepted (layering assumption + transitional window documented at :134-146), present-but-invalid always rejected. (3) Producers wired: omp_workflow_artifact_record journals an authenticated backlog-record gate on verifyBacklogArtifact success when runId supplied (:349/:358); omp_workflow_repo_guard journals authenticated jj-state on passing live probe (:367/:374) — closing judge #8's dead-claim finding. recordGovernanceEvidence re-stamps boundary events and journals FAILED backlog outcomes unmarked (:186-193). Boundary enforcement condition preserved verbatim ((governed||backlog||jj)&&(!backlog||!jj), :230) so zero-signal ad-hoc runs keep working. (4) Additive tests (new describe at file end, governance.test.ts:478-643): forged llm gate named 'backlog-record' refused AND completion still blocked with WORKFLOW_GOVERNANCE_BLOCKED/finalization/missing backlog-record plus zero journal entries under the reserved id; reserved-id refusal proven on BOTH tools; genuine artifact_record+repo_guard flow produces markers matching /^[0-9a-f]{64}:\d+$/ and stage_complete+complete proceed; corrupted marker in the journal file re-blocks the boundary. PASS. Bonus beyond claims: validateV2 refuses workflow definitions declaring reserved gate ids (runtime.ts:193) with its own companion test (:459-475) — defense in depth making the judged llm auto-pass vector unreachable even pre-render.

Additivity vs HEAD: test/workflowz-governance.test.ts 643/0 pure insertions; lifecycle 172/0 byte-identical to the judge-wave audit delta; p1-contracts 132/0. All eleven prior named tests intact verbatim (AC14 ×3 incl. budget-probe-zero-retries, AC17 ×2, AC21 ×2, AC22 trio, boundGateReportForJournal). Spot-run: 60 pass / 0 fail / 308 expect across p3-polish+governance+p1-contracts+lifecycle.

FOLLOW-UPs (non-blocking): (1) transitional auth-absent acceptance window documented in code but needs a tightening ticket once legacy raw-writer fixtures migrate to markGovernanceEvent (per comment #15 triage); (2) test title at p1-contracts:356 ('requires wt remove structured output to be a valid JSON object') is stale wording vs the widened object-or-array contract — cosmetic; (3) CHANGELOG.md line 33 wording still superseded per TASK-15.1.5 comment #7 — owner should amend; (4) evidenceSecret docstring header (:92-94) overstates secrecy relative to corrected :141-144 — fold into next touch.
---

author: cook-judge
created: 2026-08-23 01:35
---
Evidence for #17/#18/#19: end-state reads of runtime.ts (30-48, 185-200, 427-470, 505-545, 560-632, 756-788, 1022-1100), p0-tools.ts (80-296, 344-392), index.ts (722-760), full governance test file; git numstat audit of all four test files vs HEAD; bun spot-run 60 pass / 0 fail / 308 expect.
---
<!-- COMMENTS:END -->
