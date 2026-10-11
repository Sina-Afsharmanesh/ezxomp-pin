---
id: TASK-15.1.3
title: 'P1: preserve recovery provenance across derived runs'
status: Done
assignee: []
created_date: '2026-08-21 16:07'
updated_date: '2026-08-23 01:52'
labels:
  - workflowz-v2
  - enhancement
  - lifecycle
dependencies:
  - TASK-15.2
  - TASK-15.1.2
documentation:
  - docs/plugin_proposal/workflowz-v2.md
modified_files:
  - plugins/extensible-workflows/src/runtime.ts
  - plugins/extensible-workflows/src/p0-tools.ts
  - test/workflowz-lifecycle.test.ts
parent_task_id: TASK-15.1
priority: high
type: enhancement
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the recovery provenance contract without changing the established resume/retry semantics. A resumed or retried run must retain its owner, route, JJ, and optional isolation lineage in its new journal record so later lifecycle and governance operations have durable evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resume creates a distinct child run with only validated completed-stage seeds and preserves normalized inputs and parent lineage
- [x] #2 Retry creates a distinct child run with the same normalized inputs and provenance but no seeded results
- [x] #3 Each derived created journal record retains Backlog owner IDs route and preview references JJ change/bookmark and optional Worktrunk name
- [x] #4 Malformed stopped terminal content-incompatible and snapshot-only sources remain refused
- [x] #5 Focused lifecycle tests pass without weakening existing recovery coverage
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend `test/workflowz-lifecycle.test.ts` only: register the real `omp_workflow_resume` and `omp_workflow_retry` tools with the existing in-process schema probe plus a no-op exec stub; persist a temporary project V2 workflow so the public tool resolver is exercised without network, JJ, or Worktrunk binaries.

2. Create a parent journal via `createRun` with Backlog owner IDs, JJ change/bookmark, Worktrunk name, route ref, and preview ref; assert both public recovery tools create distinct child journals whose `created` records retain that lineage. Preserve the existing lifecycle assertions unchanged.

3. Assert resume retains only the completed-stage seed and retry records no seeded results; assert the public resume tool continues to refuse malformed, stopped, terminal, content-incompatible, and snapshot-only sources.

4. Risk/checkpoint: runtime journal propagation already succeeds, so the intentional RED boundary is the P0 tool result envelope, which currently drops owner/JJ/Worktrunk lineage. Verify with the focused describe only; do not edit production code or run real repository/isolation executables.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planner added focused lifecycle-only coverage in `test/workflowz-lifecycle.test.ts`; no production source or existing assertion changed. The test uses a temporary project workflow and P0 registration probe with a stubbed exec, so it has no network/JJ/Worktrunk dependency.

RED evidence (2026-08-22): `bun test test/workflowz-lifecycle.test.ts --test-name-pattern "workflowz recovery provenance through tools"` exited 1. Summary: 1 pass, 6 filtered out, 2 fail, 15 expect calls, 3 selected tests. The malformed/stopped/terminal/content-incompatible/snapshot-only resume-refusal case passed.

Both intended tool-boundary failures are precise: resumed result at `test/workflowz-lifecycle.test.ts:248` and retried result at `:279` lack `details.ownerIds`, `details.jjChange`, `details.jjBookmark`, and `details.worktreeName`; existing `routeRef` and `previewRef` are present. Each test first verified its child `created` journal record retained the complete provenance, isolating the gap to the public P0 response envelope rather than runtime journal propagation.

WORKER fix (2026-08-22): closed the RED boundary at the P0 result envelope. plugins/extensible-workflows/src/runtime.ts — RunRecoveryEvidence gained optional ownerIds?: string[], jjChange?: string, jjBookmark?: string, worktreeName?: string (optionality mirrors journalProvenance/CreateRunOptions); journalReferences() widened from routeRef/previewRef-only to the full six-field provenance spread read off the parent `created` journal record. Both call sites (resumeWorkflowRun :887, retryWorkflowRun :915) already spread journalReferences(created) into RunRecoveryEvidence, so resume/retry seed-vs-freshness/refusal semantics are byte-for-byte untouched.

plugins/extensible-workflows/src/p0-tools.ts — omp_workflow_resume (:259) and omp_workflow_retry (:276) ok() details now include ownerIds, jjChange, jjBookmark, worktreeName alongside existing routeRef/previewRef/code. CHANGELOG.md — one entry under ## [Unreleased] ### Added documenting the full-provenance envelope.

Verification: bun test test/workflowz-lifecycle.test.ts -> exit 0, 9 pass / 0 fail / 31 expect, including both planner-authored provenance cases ('returns and journals full provenance for a resumed run', '...retried run without seeded results') and all pre-existing refusal cases. Scoped packet (lifecycle + v2-runtime + p0-tools + p0-runtime-guards + p1-contracts + smoke-workflowz) -> exit 0, 38 pass / 0 fail / 120 expect. No test file touched.

Scoped tsc evidence (bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json): bunx could not resolve tsc locally (repo has no root typescript dep; only skillforge pins ^7.0.2). Ran workspace tsc 7.0.2 directly: 5 exactOptionalPropertyTypes errors in runtime.ts WorkflowActivityState code (:1051/:1082/:128/:1129) + skills/src/gate.ts(:101). Proved PRE-EXISTING empirically: temporarily reverted runtime.ts+p0-tools.ts to pre-edit state, reran -> identical 5 errors shifted exactly -8 lines (= my 8 added lines), gate.ts error identical; restored my files byte-identically (sha256 match) and reconfirmed error-set parity + packet green. Repo-canonical gate 'bun run check' (bunx tsc --noEmit, warmed cache) -> exit 0 WITH my changes. My diff adds zero type errors under either compiler resolution.

POST-MERGE RE-VERIFICATION (2026-08-22, after sibling landed a +121-line repair-prompt/GovernanceContext block into runtime.ts): my provenance hunks confirmed intact (RunRecoveryEvidence now at :879 with the four optional fields; journalReferences still six-field; both p0-tools ok() details still carry ownerIds/jjChange/jjBookmark/worktreeName + routeRef/previewRef). TUIWorker's parse-break claim at :597 disproved empirically: the line is a double-quoted outer string containing inner backticks — valid TS; bun parses and passes. Re-ran over merged state: focused lifecycle exit 0 (9 pass), scoped 6-file packet exit 0 (43 pass / 0 fail / 133 expect, up from 38 due to sibling's added cases), all green including my provenance cases. Repo-wide 'bun run check' currently exits 2 with exactly 5 errors confined to test/workflowz-p3-polish.test.ts (implicit any x3, CommandSpec.handler missing, log signature) — sibling-owned test file outside my ownership boundary; not touched per contract.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-21 22:05
---
Review (orchestrator, 2026-08-21) of uncommitted working-tree delta vs HEAD 8fa1c71c:

PRESENT: plugins/extensible-workflows/src/runtime.ts +2 lines only — `worktreeName?: string` on CreateRunOptions (:504) and journalProvenance passthrough (:824). Scoped tsc exit 0 with hunks; focused lifecycle+p1-contracts 19 pass / 0 fail / 52 expect.

VERDICT per AC:
- AC#1/#2/#4 PASS — resume/retry/refusal semantics untouched (createRun :511 spreads options into the `created` event; journalProvenance feeds derived createRun at :884/:912; propagation chain parent-created -> derived options -> child-created is CLOSED).
- AC#3 PARTIAL — runtime-level retention works, but the field is orphaned at the edges: p0-tools.ts contains ZERO worktreeName references, so no tool flow (omp_workflow_run/worktree/resume/retry) ever records or forwards it; only direct programmatic createRun callers can set it. Prior AC12 probe evidence was an ephemeral harness, not committed coverage.
- AC#5 PARTIAL — existing coverage unweakened, but zero test references to worktreeName exist in test/; no committed regression asserts derived-record retention.

REMAINING WORK to close: (1) p0-tools.ts — thread worktreeName from isolation selection/run creation into CreateRunOptions so Worktrunk-isolated runs persist lineage; (2) test/workflowz-lifecycle.test.ts — focused case asserting resumed AND retried created records retain ownerIds/jjChange/jjBookmark/worktreeName/routeRef/previewRef; (3) scoped commit. Task moved To Do -> In Progress; not closable on current evidence.
---

author: JudgeW2.verifyV4-provenance-attack
created: 2026-08-23 00:12
---
Adversarial verification (JudgeW2.verifyV4-provenance-attack, 2026-08-22): VERDICT PASS STANDS (refuted=false). All 4 attack angles refuted with file:line evidence. (1) Aliasing/mutation: journalProvenance runtime.ts:972 and journalReferences :1002 copy ownerIds via map(String); effectiveInputs freshly built in resolveDefinitionInputs :319-330; seeds assembled fresh in stageSeedResults :943-956 from call-local disk parses; child writes serialize immediately (appendRunEvent :681) — no shared mutable structure crosses parent→child. (2) ownerIds shape: every consumer guards Array.isArray + coerces .map(String) (:972/:1002/governanceFromCreated); legacy junk shapes coerce or omit; undefined details keys drop in JSON — ok() envelope cannot break. (3) Retry seeding/refusal order: renders without recovery arg (:1072 → results={}), retried event has no seededResults (:1071), evidence results:{} skippedStages:[] (:1073); refusal prefix byte-identical to resume, resume-only gates intentionally absent per plan semantics. (4) Field parity: journalProvenance (:970-981) superset of AC#3 six; journalReferences (:1000-1009) carries exactly the six; none dropped into child created record (createRun spread :665), asserted on-disk + envelope by new tests. Independent re-execution: lifecycle 9/0; 4-file packet 49/0; all 14 plugin-referencing suites 94/0 (152 pass, 0 fail); bun run check exit 0. Lifecycle diff strictly +172/-0; sole repo test deletion is unrelated CommandSpec alias in p3-polish (15.3.x scope). Non-blocking observations: routeMode cast trusts journaled value (type-level only, :977); governanceFromCreated skips artifactKind/artifactPath (outside AC#3 six, deliberate); resume conservatively refuses when last status-bearing event is failed gate (fail-safe direction).
---

author: JudgeW2.verifyV4-provenance-attack-2
created: 2026-08-23 00:28
---
Adversarial verification round 2 (JudgeW2.verifyV4-provenance-attack-2, 2026-08-22): VERDICT PASS STANDS (refuted=false). All 4 attack angles refuted with independent evidence, including fresh empirical probes not run in round 1. (1) Aliasing/mutation: probe mutated returned evidence deeply (run.results.plan.deep.x, run.inputs) after resume — parent journal byte-identical after (readRunEvents re-read), child created/resumed records unaffected (appendRunEvent serializes at write time, runtime.ts:681); journalProvenance :972 and journalReferences :1002 copy ownerIds via map(String), inputs freshly built in resolveDefinitionInputs :319-329, seeds assembled fresh per call in stageSeedResults :943-956. (2) ownerIds junk shapes: fuzzed string/42/null/object/[42,null,true,{}]/[] through real resumeWorkflowRun — evidence and child created record always string[] or absent (Array.isArray guard + String coercion); ok() details is untyped pass-through (p0-tools.ts:40), no shape break possible. (3) Retry seeds nothing: child journal contains zero result-bearing records (every event lacks results/seededResults), rendered code contains `const results = {};` (renderWorkflowDefinition called without recovery, runtime.ts:1072); refusal ladder unchanged — diff hunk map confirms zero hunks inside resumeWorkflowRun/retryWorkflowRun/validateRunJournal/stageSeedResults bodies. (4) Six-field completeness: journalProvenance (:970-981) and journalReferences (:1000-1009) each carry all of ownerIds/jjChange/jjBookmark/worktreeName/routeRef/previewRef; grandchild-chain probe proved all six + contentHash survive a second derivation. Refusal ladder probe: 12 hostile sources (invalid id, missing journal, malformed, foreign workflow, hashless, content-incompatible, conflicting input, unknown input, stopped, terminal, snapshot-only, started-without-completion) all refused with precise WORKFLOW_RESUME_REFUSED/INVALID codes; retry accepting stopped+terminal is the intended distinct semantics. Independent test runs: lifecycle file 9 pass/0 fail/31 expect; full 9-file workflowz packet 71 pass/0 fail/315 expect, exit 0 — stronger than the judged 54-pass subset. Test diff strictly +172/-0. NON-BLOCKING follow-up (sibling scope, recorded for the governance-inheritance judge): resumeWorkflowRun :1044 and retryWorkflowRun :1072 render prompts without recovery.governance, so governanceFromCreated (runtime.ts:444) has no production caller — recovery-run prompt envelopes fall back to workflow-owners-only; derived journal records are unaffected (AC#3 satisfied). Minor hardening candidate (pre-existing, unchanged): stageSeedResults :950 accepts array-shaped complete.results (typeof check only).
---

author: cook-judge
created: 2026-08-23 00:35
---
JUDGE VERDICT (JudgeW2): REVIEW_PASSED — all five ACs verified against the working tree (delta vs c93419c), independently confirmed by a dedicated adversarial verifier with empirical probes beyond static review. AC#1/#2: resume/retry create distinct child runs (parentRunId+mode on created record, runtime.ts:1042/:1070); resume seeds ONLY validated completed stages (stageSeedResults :943-956), retry seeds nothing (results:{} :1073, rendered `const results = {}` confirmed in child code). AC#3: all six lineage fields (ownerIds/jjChange/jjBookmark/worktreeName/routeRef/previewRef) flow parent-created → journalProvenance (:970-981) → child CreateRunOptions → child created record, and journalReferences (:1000-1009) mirrors them into RunRecoveryEvidence; p0-tools.ts:369/:386 expose all six in the resume/retry ok() envelopes. Grandchild-chain probe proved retention across a second derivation. AC#4: 12-source hostile refusal ladder (invalid id, missing/malformed journal, foreign workflow, hashless, content-incompatible, conflicting/unknown inputs, stopped, terminal, snapshot-only, started-without-completion) all refused with precise codes; diff hunk map shows ZERO hunks inside resume/retry/validateRunJournal/stageSeedResults/journalInputs/conflictingInputs bodies — refusal semantics byte-stable vs HEAD. AC#5: focused lifecycle 9 pass/0 fail/31 expect (reproduced); full 9-file workflowz packet 71 pass/0 fail/315 expect (stronger than the 54-test subset I ran); test delta strictly additive (+172/-0). Adversarial angles all refuted: no aliasing/mutation hazard between parent journal and child records (deep-mutation probe, parent byte-identical on re-read); fuzzed legacy ownerIds shapes ('not-an-array', 42, null, {a:1}, [42,null,true,{}], []) normalize to string[] or absent via Array.isArray+map(String) (:972/:1002/:444); ok() is an untyped pass-through (p0-tools.ts:40) with no shape to break. Out-of-scope follow-ups (not this ticket's ACs): runtime.ts:1044/:1072 render without recovery.governance (governance-inheritance track, recorded on TASK-15.2 comments #8-#10); stageSeedResults :950-953 typeof-only object guard would accept array-shaped crafted results (pre-existing, hardening candidate). Disposition: ticket is closable on this evidence.
---
<!-- COMMENTS:END -->
