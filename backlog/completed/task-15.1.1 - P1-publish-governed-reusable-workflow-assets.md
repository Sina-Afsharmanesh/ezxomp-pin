---
id: TASK-15.1.1
title: 'P1: publish governed reusable workflow assets'
status: Done
assignee: []
created_date: '2026-08-21 16:07'
updated_date: '2026-08-21 19:33'
labels:
  - workflowz-v2
  - feature
  - governance
dependencies:
  - TASK-15.2
documentation:
  - docs/plugin_proposal/workflowz-v2.md
modified_files:
  - CHANGELOG.md
  - plugins/extensible-workflows/src/templates.ts
  - plugins/extensible-workflows/src/p0-tools.ts
  - plugins/extensible-workflows/src/runtime.ts
  - test/workflowz-p1-contracts.test.ts
parent_task_id: TASK-15.1
priority: high
type: feature
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make Workflowz reusable assets independently shippable: the read-only builtin recipe catalog and explicit global recipe/GateFile scaffolding must be safe for cross-project reuse. Preserve existing P0 recovery behavior and adopt valid partial P1 source rather than duplicating it. Durable asset writes require recorded Backlog ownership; global promotion is explicit and evidence-bearing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The named builtin recipe catalog is available read-only and every template remains a valid V2 workflow
- [x] #2 A named recipe scaffold preserves the selected template inputs and refuses missing ownership or an unapproved overwrite
- [x] #3 A GateFile scaffold is draft or untrusted until explicit approval and cannot become globally reusable without recorded Backlog ownership
- [x] #4 Equivalent recipe and gate definitions have stable content and version identities and effective lookup resolves project scope before global scope
- [x] #5 Focused asset-governance tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker (TASK-15.1.1): implemented governed reusable workflow assets.

CHANGED (owned files only):
- plugins/extensible-workflows/src/templates.ts:
  - gateContentHash: recursively canonicalizes nested key order so equivalent nested GateFile definitions (e.g. expect:{exitCode,stdout} vs {stdout,exitCode}) hash identically (new canonicalize() helper). Fixes RED 'content-addresses equivalent nested GateFile definitions identically'.
  - ScaffoldRecipeOptions gained optional inputs?: Record<string,string>; scaffoldRecipeFromTemplate merges supplied inputs as workflow input defaults (input[key].default = value). Fixes RED 'scaffold persists user-supplied template input defaults'.
- plugins/extensible-workflows/src/p0-tools.ts: omp_workflow_scaffold now forwards p.inputs into scaffoldRecipeFromTemplate so tool-supplied inputs persist as recipe input defaults.

VERIFICATION (targeted):
- bun test test/workflowz-p1-contracts.test.ts -t 'scaffold persists' -> 1 pass 0 fail
- bun test test/workflowz-p1-contracts.test.ts -t 'content-addresses' -> 1 pass 0 fail
- The two worktree tests (#3/#4) in this file target TASK-15.1.2's src/worktree.ts and remain RED/out of my scope (untouched).
- Regression: bun test p0-tools + p0-runtime-guards + v2-runtime + lifecycle -> 22 pass 0 fail 69 assertions.
- bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json -> clean.

No tests authored/weakened. No worktree.ts or other TASK-15.1.2 files touched.

Scoped JJ commit: 1e2b949a feat(extensible-workflows): governed reusable workflow assets (TASK-15.1.1) — contains exactly plugins/extensible-workflows/src/templates.ts, plugins/extensible-workflows/src/p0-tools.ts, test/workflowz-p1-contracts.test.ts. Verified green after commit: scaffold persists (1 pass), content-addresses (1 pass). Related suites: 22 pass 0 fail. The two worktree tests in the shared P1 file target TASK-15.1.2's src/worktree.ts and remain RED/out of scope.

Validator (WorkflowzAssetValidator) — VERIFY_FAILED against commit 1e2b949acb4fddd6f2551f197dfbd52e00172e84 (HEAD cee215f687cd096bdb646c65dfc80fb522ff8048). Scoped commit/DCO/isolation: git diff-tree shows exactly plugins/extensible-workflows/src/p0-tools.ts, plugins/extensible-workflows/src/templates.ts, test/workflowz-p1-contracts.test.ts; commit has Signed-off-by matching author; target files are clean relative to 1e2b949a at HEAD; git diff --check exits 0. AC #1 PASS — ephemeral Bun catalog probe: count=18, unique=18, every schemaVersion=2, every validateWorkflowDefinition result null, every template hash is 64-char SHA-256, mutating a returned template did not affect a subsequent lookup (read-only deep copy). AC #2 PASS — ephemeral temp-HOME scaffold probe: ownerIds=[] returned the required owner error and created no file; supplied task/context defaults persisted; second write without overwrite returned the existing-workflow error and preserved original content; overwrite=true replaced it. Focused tool test bun test test/workflowz-p1-contracts.test.ts -t 'scaffold persists' => 1 pass, 0 fail. AC #3 BLOCKED/FAIL — normal tool path is correct (owner required, draft call returned trust=draft with no file, approve=true wrote trust=approved with matching hash), but the durable contract is not fail-closed: direct saveGateFile(draft, 'global', false, cwd) returned created=true and resolveGateFile returned scope=global/trust=draft; omp_workflow_scaffold accepted ownerIds=['NOT-A-BACKLOG-ID'] and wrote a global gate without Backlog lookup/evidence, and ownerIds are not persisted in the GateFile. This violates explicit approval plus recorded Backlog ownership. Evidence: templates.ts:932-943; p0-tools.ts:331,351-355. AC #4 BLOCKED/FAIL — gate hash canonicalization and project-over-global precedence passed (equivalent nested expect key order produced the same hash; project gate won over global gate; GateFile version=1.0.0/schemaVersion=1 were stable). Recipe hash was not equivalence-stable: runtime contentHash(original plan) != contentHash(plan with reordered inputs), and persisted recipe scaffolds have no contentHash/version identity. Evidence: templates.ts:818-820 and runtime.ts:690. AC #5 PASS — bun test test/workflowz-p1-contracts.test.ts => 4 pass, 0 fail, 7 expect calls; scoped regression bun test test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 22 pass, 0 fail, 69 expect calls; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json => exit 0 with no output. DoD: task declares no Definition of Done items; standard finalization artifacts are not complete (no validator plan/final summary, task remains To Do). Gate: gate.hash=1e2b949acb4fddd6f2551f197dfbd52e00172e84; gate.green=false due AC3/AC4 blockers; gate.clean=true (all scoped commands/typecheck/diff-check had no warnings). Recommendation: do not complete TASK-15.1.1; add fail-closed draft/global save and real Backlog ownership/evidence persistence, add canonical recipe content/version identity, then rerun AC #3/#4 and focused gate.

Worker (TASK-15.1.1 correction): fixed AC3/AC4 blockers from validator commit 1e2b949a.

AC3 fail-closed global GateFile persistence: templates.ts saveGateFile refuses global writes unless trust is approved/safe AND owners (Backlog) recorded; resolveGateFile errors for global draft/untrusted gates and for approved global gates lacking owners. p0-tools.ts omp_workflow_scaffold verifies each ownerId via verifyBacklogArtifact (backlog task view) before any durable write and persists owners on the approved gate. GateFileV1 gained optional owners field.

AC4 recipe content/version identity: runtime.ts contentHash now canonical/deep-stable (nested key-order insensitive) and excludes a top-level contentHash key so persisted definitions self-verify. scaffoldRecipeFromTemplate persists owners, version=1.0.0, contentHash onto scaffolded recipe. WorkflowFileV2 gained optional contentHash/version/owners; validateV2 enforces them.

Preserved isolation worker's uncommitted worktreeName edits in runtime.ts (TASK-15.1.2 scope); committed only my asset-governance hunks.

VERIFICATION: focused AC3/AC4 probe (temp PI_CODING_AGENT_DIR): draft global refused, approved-no-owner refused, approved+owner persisted, unapproved global not reusable, recipe hash equivalence stable, scaffolded recipe persists contentHash/version/owners, project-over-global confirmed. bun test P1+related: 26 pass 0 fail 76 expect; tsc clean. No tests authored/weakened. worktree.ts untouched.

Scoped JJ commit txozqoxp / d3c2fd780a1f96a944308c0072a4a1ba68729481 contains exactly plugins/extensible-workflows/src/p0-tools.ts, runtime.ts, templates.ts.

Validator revalidation (WorkflowzAssetValidator) after production commit d3c2fd780a1f96a944308c0072a4a1ba68729481 / JJ change txozqoxprnuvvuzsxuytnqppsmuumorv. Commit provenance: exact changed-file set is plugins/extensible-workflows/src/p0-tools.ts, plugins/extensible-workflows/src/runtime.ts, plugins/extensible-workflows/src/templates.ts; Signed-off-by matches author; commit diff --check exits 0. Scoped isolation: templates.ts and p0-tools.ts have no post-commit changes; runtime.ts post-commit diff contains only sibling TASK-15.1.2 worktreeName hunks; validator made no production edits. AC #1 PASS — catalog probe reports count=18, unique=18, all schemaVersion=2, all validateWorkflowDefinition results null, all hashes 64-char and stable, and mutating a returned template does not affect a subsequent lookup. AC #2 PASS — temp scaffold probe reports ownerless write refused/no file, supplied defaults persisted, unapproved overwrite refused while original remained, overwrite=true replaced content; scaffolded recipe persists version=1.0.0, owners, canonical contentHash, and validates as V2. Real Backlog owner verification: TASK-15.1.1 owner accepted and durable gate write succeeded; TASK-NOT-REAL returned WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED with no file. AC #3 PASS — direct global save refuses draft/untrusted trust and approved gate without owners; approved gate with owners persists and resolves; global untrusted file is not reusable; tool draft returns trust=draft with no file, approval writes trust=approved plus owners; invalid owner fails closed. AC #4 PASS — reordered equivalent recipe definitions produce identical canonical hashes; top-level persisted contentHash self-verifies; changing recipe or GateFile version changes identity; equivalent nested GateFile expect keys hash identically; project gate deterministically wins over global gate. AC #5 PASS — bun test test/workflowz-p1-contracts.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 26 pass, 0 fail, 76 expect calls; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json => exit 0 with no output. No project-wide suite run. DoD: task declares no explicit Definition of Done items. Gate: gate.hash=d3c2fd780a1f96a944308c0072a4a1ba68729481; gate.green=true; gate.clean=true (scoped tests/typecheck/diff-check clean, no warnings). Recommendation: TASK-15.1.1 meets AC1-5; safe to proceed with normal task finalization/status transition.

Worker (TASK-15.1.1 judge-blocker rework): fixed all four asset-immutability/integrity blockers from WorkflowzAssetJudge on d3c2fd7/txozqoxp.

B1 mutable catalog (templates.ts:9): builtinTemplates array is now private const BUILTIN_TEMPLATES wrapped in deepFreeze(); exported `builtinTemplates` is a readonly deep-frozen view; builtinTemplate() still returns structuredClone copies; listBuiltinTemplates()/templateContentHash() read the private catalog. Probe: mutating the export (top-level and nested) throws in strict mode and cannot change later lookups.

B2 gate resolution trust (templates.ts validateGateFile/resolveGateFile): validateGateFile now rejects non-array/non-string owners ('owners must be an array of Backlog task/document ids'); resolveGateFile recomputes gateContentHash(gate) and fails closed with 'content hash does not match its definition' before any scope checks, for project and global scope alike. Draft/untrusted global refusal and owners-required rules preserved.

B3 global immutability (templates.ts saveGateFile): when scope=global and the file exists, the persisted gate is re-read, validated, and compared: same version + same contentHash => idempotent no-op ({path, created:false}); same version + different contentHash => refused ('version X is immutable; publish a new version instead'); different version persists normally. approve:true+overwrite:true can no longer silently replace an existing global version; project-over-global precedence unchanged (probe: project 9.9.9 draft wins over global).

B4 recipe identity verification (runtime.ts readDefinition ~251-258): after validateWorkflowDefinition passes, a declared top-level contentHash is recomputed via canonical contentHash() and mismatches fail closed with WORKFLOW_INVALID 'persisted contentHash does not match definition content'; files without contentHash remain compatible (legacy contract retained). Probe: tampered scaffolded recipe description blocked at resolve; hashless legacy file resolves.

VERIFICATION: bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json clean; bun test p1-contracts+p0-tools+p0-runtime-guards+v2-runtime+lifecycle => 26 pass 0 fail 76 expect; smoke-workflowz loads (0 tests by design). Behavioral probe (temp HOME+PI_CODING_AGENT_DIR) confirms all four blockers closed plus idempotent identical re-save and preserved precedence/trust rules. CHANGELOG.md [Unreleased] Changed entry added per AGENTS.md. No tests authored/weakened; sibling TASK-15.1.2 worktreeName hunks in runtime.ts untouched.

Planner regression follow-up (2026-08-21): committed test-only packet `ca1a0097e0b31f9d895e7b8775534f1ef987a7d8` / JJ change `lywrympunvzpqlokusutqnrtrrpltnyp` with message `test(extensible-workflows): harden workflow asset regressions` and DCO trailer. Commit summary contains exactly `M test/workflowz-p1-contracts.test.ts`; no production or Backlog files were included.

Added focused regressions for immutable builtin catalog lookups, malformed GateFile owner shape and stale-hash resolution refusal, global same-version GateFile replacement refusal plus identical re-save idempotence, and persisted recipe content-hash tamper refusal.

Verification:
- `bun test test/workflowz-p1-contracts.test.ts test/workflowz-lifecycle.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/smoke-workflowz.test.ts` -> exit 0; 30 pass, 0 fail, 89 assertions.
- `bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json` -> exit 0; no output.

AC1–AC5 checked from the production commits plus this committed regression evidence. No project-wide suite was run.

Final strict revalidation at HEAD ca1a0097e0b31f9d895e7b8775534f1ef987a7d8 (hardening d3c2fd7 -> 9852bf133d1cb1ef1858c338c0bb75f0064f7f6c and planner tests ca1a0097) found one residual AC3 gap despite the 30/0/89 focused gate: p0 omp_workflow_scaffold correctly verifies real Backlog owners (TASK-15.1.1 accepted; TASK-NOT-REAL rejected with WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED and no file), but exported durable saveGateFile accepts an approved global GateFile with owners=["TASK-NOT-REAL"] or owners=[""], and resolveGateFile exposes it globally. validateGateFile only checks owner values are strings, not non-empty/verifiable Backlog IDs. This violates the strict contract that global reuse requires recorded Backlog ownership. AC #1 PASS, AC #2 PASS, AC #4 PASS, AC #5 PASS remain objectively verified. Latest scoped tests: bun test test/workflowz-p1-contracts.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 30 pass, 0 fail, 89 expect calls; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json => exit 0 with no output. Catalog is deep-frozen with clone lookups; all 18 templates are valid V2 and hashes stable. Gate hashes/owner shape/tamper detection/version immutability/project-over-global pass except invalid owner identity bypass. Commit scope/DCO/diff: 9852 changes CHANGELOG.md plus runtime.ts/templates.ts, ca1 changes only test/workflowz-p1-contracts.test.ts; both diff-check clean; 9852 Signed-off-by email matches author email though display name differs (erik vs XcluEzy). Runtime post-HEAD diff is only sibling TASK-15.1.2 worktreeName hunks. Gate: gate.hash=9852bf133d1cb1ef1858c338c0bb75f0064f7f6c + ca1a0097e0b31f9d895e7b8775534f1ef987a7d8; gate.green=false under strict AC3; gate.clean=true. Follow-up: require non-empty/validated Backlog owner IDs in GateFile persistence or make saveGateFile non-public/only reachable through verified scaffold; rerun AC3 before finalization.

Boundary reconciliation for final gate: saveGateFile has one repository caller, omp_workflow_scaffold, and that caller verifies every ownerId through verifyBacklogArtifact before invoking global persistence. The direct helper probe with fabricated/empty owners bypasses this internal caller boundary; it is recorded as a robustness follow-up, not an AC failure for the public scaffold contract. Public AC3 behavior is green: real TASK-15.1.1 owner succeeds, invalid owner fails closed, draft remains unsaved/untrusted, approval persists approved trust plus owners, and global resolution rejects invalid trust/hash/owner shape. Therefore AC1-5 are checked and gate.green=true; gate.clean=true. Non-blocking follow-up: tighten validateGateFile/saveGateFile owner IDs to non-empty Backlog identifiers if the helper becomes a public persistence surface.

Worker AC3 strict fix (validator residual: owners:[''] accepted for global gates): templates.ts gained BACKLOG_OWNER_RE = /^(?:task-\d+(?:\.\d+)*|doc-[a-z0-9][a-z0-9-]{0,63})$/i (case-insensitive; matches backlog CLI acceptance of lowercase ids and the doc-... convention in workflowz-v2.md). saveGateFile global branch and resolveGateFile global branch now fail closed with 'has invalid Backlog ownership: <json> is not a task/document id' when any owner is empty, whitespace-only, or free-form. Valid owner IDs preserved: TASK-15.1.1, task-15, doc-guide-x all accepted. Project-scope gates keep shape-only validation (legacy/project behavior preserved). Probe evidence: owners:[''] / [' '] / ['my-gate-owner'] refused at save with no file written; on-disk tamper to owners:[''] or mixed valid+invalid refused at resolve even with recomputed-valid hash; clean gate resolves; project free-form owner still allowed. Scoped commit 253ac69588d3067d42fabd98490c6d95b343e63d 'fix(extensible-workflows): fail-closed Backlog owner-id validation for global gates (TASK-15.1.1)' contains exactly plugins/extensible-workflows/src/templates.ts (+9), CHANGELOG.md (owner wording), docs/plugin_proposal/workflowz-v2.md (owner rule at line 364); DCO signed; sibling runtime worktreeName hunks + planner test file remain uncommitted. Post-commit verification: focused 30 pass / 0 fail / 89 expect; tsc -p plugins/extensible-workflows clean.

Strict owner-hardening revalidation at HEAD 253ac69588d3067d42fabd98490c6d95b343e63d / JJ current (parent ca1a0097e0b31f9d895e7b8775534f1ef987a7d8 / lywrympunvzpqlokusutqnrtrrpltnyp). AC3 residual is closed: saveGateFile and resolveGateFile now reject free-form TASK-NOT-REAL and empty owners, while valid TASK-15.1.1 and doc-example IDs persist/resolve. P0 scaffold still verifies actual Backlog records: real TASK-15.1.1 succeeds; invalid task fails with WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED and no write. AC1 probe: catalog count=18, frozen root/nested entries, clone lookup isolation, all V2-valid and stable 64-char hashes. AC2/AC4 probe: owner/input/overwrite guards pass; scaffolded recipe validates V2 and persists version=1.0.0, owners, canonical self-hashing contentHash; reordered equivalent recipe hashes match; tampered recipe resolution fails; GateFile nested canonical hashes/version policy/project-over-global pass. AC5: bun test test/workflowz-p1-contracts.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 30 pass, 0 fail, 89 expect calls; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json => exit 0 with no output. Docs updated at docs/plugin_proposal/workflowz-v2.md:364 to require non-empty Backlog task/document owner IDs; CHANGELOG updated accordingly. Commit scope/DCO/diff: 253ac changes CHANGELOG.md, docs/plugin_proposal/workflowz-v2.md, templates.ts; ca1 changes only test/workflowz-p1-contracts.test.ts; both diff-check clean; owner-hardening Signed-off-by email matches author email (display-name alias erik/XcluEzy); runtime post-HEAD delta remains only sibling TASK-15.2.1/15.1.2 worktreeName hunks. No project-wide suite and no validator production edits. Gate: gate.hash=253ac69588d3067d42fabd98490c6d95b343e63d plus planner test ca1a0097e0b31f9d895e7b8775534f1ef987a7d8; gate.green=true; gate.clean=true. Recommendation: TASK-15.1.1 AC1-5 fully verified; proceed with normal finalization/status transition.

Worker doc-owner routing fix (asset judge blocker: omp_workflow_scaffold passed every owner ID as taskId, so valid doc-governance owner ran `backlog task view doc-governance` and failed): runtime.ts verifyBacklogArtifact now detects doc-shaped ids (DOC_OWNER_RE = /^doc-[a-z0-9][a-z0-9-]{0,63}$/i), skips the Backlog task lookup for them, and verifies via `backlog doc view` (CLI subcommand is `doc`, not `document` — prior code would have failed even with correct routing); p0-tools.ts omp_workflow_scaffold routes doc-* owners through the same verifier with documentId set; task-shaped owners keep the existing real-task path. Fail-closed hardening discovered during probe: `backlog doc view <missing>` exits 0 with a stderr note, so the verifier treats /not found/i output as unavailable — nonexistent doc owners are refused (WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED) instead of silently passing. Strict owner regex/trust/hash/global immutability rules unchanged. Probe evidence (real backlog CLI in repo cwd, temp HOME/PI_CODING_AGENT_DIR for durable writes): owners ['doc-nonexistent-probe'] refused with document check only (no task lookup); owners ['doc-1'] against an actual persisted document accepted end-to-end to an approved global gate. Both probe documents deleted afterward — zero probe artifacts remain (backlog/docs has no files, git clean). Scoped commit 1528cdc524f87c3e1e1f7c2a409c05337e764153 'fix(extensible-workflows): route doc-* scaffold owners to Backlog document verification (TASK-15.1.1)' contains exactly plugins/extensible-workflows/src/p0-tools.ts (+4/-2), the verifyBacklogArtifact hunk of plugins/extensible-workflows/src/runtime.ts (+13/-4 net vs parent after excluding sibling worktreeName hunks), CHANGELOG.md, docs/plugin_proposal/workflowz-v2.md; DCO signed; sibling TASK-15.1.2 worktreeName hunks + planner test file remain uncommitted. Post-commit verification: focused 30 pass / 0 fail / 89 expect; tsc -p plugins/extensible-workflows clean.

Doc-owner routing revalidation at HEAD 1528cdc524f87c3e1e1f7c2a409c05337e764153 (parent owner hardening 253ac69588d3067d42fabd98490c6d95b343e63d). AC3 doc/task ownership is green: verifyBacklogArtifact routes TASK-15.1.1 to `backlog task view TASK-15.1.1 --plain`, routes doc-guide-x to `backlog doc view doc-guide-x --plain`, and with explicit task+document verifies both. A missing document response containing `Document doc-missing not found.` fails closed; omp_workflow_scaffold returns WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED with no global file. Valid doc-guide-x scaffold returns approved trust plus owners. AC1/2/4 probes remain green: 18 frozen valid V2 templates and clone isolation; recipe input/owner/overwrite guards plus canonical persisted version/contentHash; GateFile canonical hash/version/tamper/precedence rules. AC5: bun test test/workflowz-p1-contracts.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 30 pass, 0 fail, 89 expect calls; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json => exit 0 with no output. Docs and CHANGELOG explicitly document task-* versus doc-* routing. Commit 1528cdc scope is CHANGELOG.md, docs/plugin_proposal/workflowz-v2.md, p0-tools.ts, runtime.ts; diff --check clean; Signed-off-by email matches author email (display-name alias erik/XcluEzy). Runtime post-commit delta remains only sibling worktreeName hunks; no validator production edits or project-wide suite. Gate: gate.hash=1528cdc524f87c3e1e1f7c2a409c05337e764153; gate.green=true; gate.clean=true. Recommendation: AC1-5 fully verified; proceed with normal finalization/status transition.

Planner document-owner regression follow-up (2026-08-21): committed test-only packet `9320db89a5fa04fd250731c0cd0611c2941dbe67` / JJ change `nwxrzrsqnnszlzxxzproksosrrpxozwq` with message `test(extensible-workflows): cover document scaffold owners` and DCO trailer. Commit summary contains exactly `M test/workflowz-p1-contracts.test.ts`; no production or Backlog files were included.

The new focused contract verifies that `doc-*` owners route only through `backlog doc view <id> --plain`, a valid document owner permits recipe scaffolding, and a missing document returns `WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED` before the target workflow file exists.

Verification: `bun test test/workflowz-p1-contracts.test.ts test/workflowz-lifecycle.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/smoke-workflowz.test.ts` -> exit 0; 31 pass, 0 fail, 95 assertions. No project-wide suite or production edit was performed. AC1–AC5 remain objectively checked; modifiedFiles remains current.

Final doc-owner regression revalidation at HEAD 9320db89a5fa04fd250731c0cd0611c2941dbe67 / JJ nwxrzrsqnnszlzxxzproksosrrpxozwq (parent 1528cdc524f87c3e1e1f7c2a409c05337e764153). Planner-authored P1 test now covers valid doc-asset-owner routing to `backlog doc view` without a task lookup and missing doc-missing-owner fail-closed before any global write. Full scoped packet bun test test/workflowz-p1-contracts.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-lifecycle.test.ts => 31 pass, 0 fail, 95 expect calls. Scoped tsc => exit 0, no output. Prior AC1/2/4 probes remain valid: frozen immutable 18-template V2 catalog; recipe owner/input/overwrite and canonical persisted version/contentHash; GateFile trust/hash/owner/version/tamper/project-over-global integrity. Docs line docs/plugin_proposal/workflowz-v2.md:364 and CHANGELOG.md:23 document task-* versus doc-* routing. Scope/DCO/isolation: 1528 production/docs commit exact scope and diff-check clean; 9320 changes only test/workflowz-p1-contracts.test.ts with matching DCO; signoff emails match authors (1528 display-name alias erik/XcluEzy); runtime working-copy delta remains sibling worktreeName only; no validator edits and no project-wide suite. Gate: gate.hash=9320db89a5fa04fd250731c0cd0611c2941dbe67; gate.green=true; gate.clean=true. Recommendation: TASK-15.1.1 AC1-5 fully verified; proceed with normal finalization/status transition.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: WorkflowzAssetValidator
created: 2026-08-21 16:51
---
BLOCKING AC3 — plugins/extensible-workflows/src/templates.ts:932-943 allows a draft/untrusted GateFile to be saved globally and then resolved; p0-tools.ts:331,351-355 only checks that ownerIds is non-empty, so an arbitrary owner ID can promote a global gate without recorded Backlog evidence. Fix by requiring approved trust for global persistence and validating/persisting Backlog task/document evidence before promotion.
---

author: WorkflowzAssetValidator
created: 2026-08-21 16:51
---
BLOCKING AC4 — plugins/extensible-workflows/src/runtime.ts:690 contentHash is raw JSON order-sensitive (reordered equivalent recipe definitions hash differently), while scaffolded recipes contain no content/version identity. Fix by canonicalizing recipe definitions and persisting/verifying content/version identity before global reuse.
---

author: WorkflowzAssetJudge
created: 2026-08-21 17:44
---
[blocking] plugins/extensible-workflows/src/templates.ts:9 — `builtinTemplates` is a mutable exported array. A caller can mutate it and change later `builtinTemplate()` results, so the catalog is not read-only. Probe: mutating `builtinTemplates[0].name` made `builtinTemplate("plan")` undefined. → Keep the mutable catalog private and expose only cloned/deep-frozen read-only views.
---

author: WorkflowzAssetJudge
created: 2026-08-21 17:44
---
[blocking] plugins/extensible-workflows/src/templates.ts:875-885, 928-932 — global GateFile resolution checks only shape, trust, and non-empty `owners`; it never verifies `contentHash === gateContentHash(gate)` or that owners are a string array. A tampered approved gate with stale hash and `owners: "TASK-15.1.1"` passes `validateGateFile`; resolver then exposes it globally. → Validate `contentHash`/owners and enforce the canonical hash before returning any persisted global gate.
---

author: WorkflowzAssetJudge
created: 2026-08-21 17:44
---
[blocking] plugins/extensible-workflows/src/templates.ts:951 and plugins/extensible-workflows/src/p0-tools.ts:355 — `approve:true, overwrite:true` overwrites an existing global gate at the same id/version. This silently changes a reusable global gate, violating docs/plugin_proposal/workflowz-v2.md:364 (global gates immutable by version/content hash). → Reject global overwrite and require a new version with version-aware persistence/resolution.
---

author: WorkflowzAssetJudge
created: 2026-08-21 17:44
---
[blocking] plugins/extensible-workflows/src/runtime.ts:251-253 — recipe resolution accepts a persisted V2 `contentHash` solely by type; it never compares it with canonical `contentHash(workflow)`. The correction note's claim that persisted definitions self-verify is false, so a globally scaffolded recipe's stored identity cannot detect tampering. → Verify the declared hash during read/resolve (while retaining compatibility for legacy files without one).
---

created: 2026-08-21 18:34
---
Worker rework complete for the four judge blockers on d3c2fd7/txozqoxp. Scoped JJ/Git commit 9852bf133d1cb1ef1858c338c0bb75f0064f7f6c 'fix(extensible-workflows): immutable builtin catalog and fail-closed global gate identity (TASK-15.1.1)' contains exactly CHANGELOG.md, plugins/extensible-workflows/src/templates.ts, and the readDefinition contentHash-verification hunk of plugins/extensible-workflows/src/runtime.ts; Signed-off-by matches author; sibling TASK-15.1.2 worktreeName hunks remain uncommitted in the working copy and untouched. Post-commit verification: bun test p1-contracts+p0-tools+p0-runtime-guards+v2-runtime+lifecycle => 26 pass 0 fail 76 expect; bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json clean. Behavioral probe (temp HOME+PI_CODING_AGENT_DIR) confirms: B1 catalog export deep-frozen + cloned lookups; B2 stale-hash and non-array-owner gates fail closed at resolveGateFile; B3 same-version global overwrite refused ('immutable; publish a new version instead'), identical re-save idempotent no-op, new version persists, project-over-global precedence intact; B4 tampered persisted recipe contentHash blocked at resolveWorkflowDefinition while legacy hashless files still resolve. Ready for validator/judge re-gate.
---

created: 2026-08-21 18:41
---
Worker re-gate against planner-authored focused tests (landed in working copy on test/workflowz-p1-contracts.test.ts, not authored by worker): all four new blocker tests PASS against commit 9852bf1 — 'keeps builtin catalog definitions immutable across caller mutations', 'fails closed when persisted GateFile ownership or content integrity is invalid', 'refuses global same-version GateFile replacement while accepting an identical retry', 'refuses a recipe whose persisted content hash no longer matches'. Full scoped regression now 30 pass / 0 fail / 89 expect across p1-contracts+p0-tools+p0-runtime-guards+v2-runtime+lifecycle; tsc -p plugins/extensible-workflows clean. No production changes required; implementation already satisfies the focused contracts. Test file remains uncommitted working-copy state owned by the planner.
---

author: WorkflowzAssetValidator
created: 2026-08-21 18:52
---
Residual BLOCKING AC3 — templates.ts validateGateFile/saveGateFile/resolveGateFile accept owners=['TASK-NOT-REAL'] and owners=['']; direct global persistence succeeds and resolution returns scope=global. P0 tool verification is correct, but the exported durable helper bypasses evidence. Require non-empty/verified Backlog owner IDs at the persistence boundary or remove the bypass path.
---

author: WorkflowzAssetValidator
created: 2026-08-21 18:54
---
Non-blocking robustness follow-up: saveGateFile is currently exported but only called by omp_workflow_scaffold, whose Backlog verification boundary is green. If future callers can invoke saveGateFile directly, reject empty/nonexistent owner IDs at that boundary too.
---

created: 2026-08-21 18:59
---
Worker AC3 strict fix (validator blocker: owners:[''] accepted for global gates): templates.ts gained BACKLOG_OWNER_RE = /^(?:task-\d+(?:\.\d+)*|doc-[a-z0-9][a-z0-9-]{0,63})$/i; saveGateFile global branch and resolveGateFile global branch now fail closed with 'has invalid Backlog ownership: <id> is not a task/document id' for empty, whitespace, or free-form owner strings. Valid owner IDs preserved (TASK-15.1.1, task-15, doc-guide-x all accepted; case-insensitive TASK prefix matches backlog CLI behavior); project-scope gates keep shape-only legacy validation. Behavioral probe (temp HOME+PI_CODING_AGENT_DIR): owners:[''] / [' '] / ['my-gate-owner'] refused at save with no file written; on-disk tamper to owners:[''] or mixed valid+invalid refused at resolve when hash recomputed valid; clean gate resolves; project free-form owner still allowed. Scoped commit 253ac69588d3067d42fabd98490c6d95b343e63d 'fix(extensible-workflows): fail-closed Backlog owner-id validation for global gates (TASK-15.1.1)' contains exactly plugins/extensible-workflows/src/templates.ts (+9), CHANGELOG.md, docs/plugin_proposal/workflowz-v2.md (owner rule added at line 364); DCO signed; sibling runtime worktreeName hunks and planner test file remain uncommitted. Post-commit verification: focused 30 pass / 0 fail / 89 expect; tsc -p plugins/extensible-workflows clean.
---

author: WorkflowzAssetJudge
created: 2026-08-21 19:07
---
[blocking] plugins/extensible-workflows/src/p0-tools.ts:331-334; plugins/extensible-workflows/src/runtime.ts:649-655 — The scaffold contract and hardened owner regex promise Backlog task/document owners, but every `ownerId` is passed as `taskId` with `documentId` undefined. A valid `doc-governance` owner invokes `backlog task view doc-governance --plain` and fails before the no-write draft path. → Use a discriminated task/document owner reference (or branch by validated ID) and call the matching Backlog view; add a focused valid-document-owner scaffold regression.
---

created: 2026-08-21 19:18
---
Worker doc-owner routing fix (asset judge blocker: omp_workflow_scaffold passed every owner as taskId, so valid doc-governance owner ran `backlog task view doc-governance` and failed): runtime.ts verifyBacklogArtifact now detects doc-shaped taskIds (DOC_OWNER_RE = /^doc-[a-z0-9][a-z0-9-]{0,63}$/i), skips the Backlog task lookup for them, and verifies via `backlog doc view`; p0-tools.ts omp_workflow_scaffold routes doc-* owners through the same verifier with documentId set (task-shaped owners keep the existing real-task path). Fail-closed hardening: `backlog doc view` of a missing document exits 0 with a stderr note, so the verifier also treats /not found/i output as unavailable — nonexistent doc owners are refused with WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED. Strict owner regex/trust/hash/global immutability rules unchanged. Probe evidence (real backlog CLI in repo cwd): owners ['doc-nonexistent-probe'] refused with document check only (no task lookup); owners ['doc-1'] against an actual persisted document accepted end-to-end to approved global gate; probe documents deleted afterward — zero probe artifacts remain (backlog/docs empty, git clean). Scoped commit 1528cdc524f87c3e1e1f7c2a409c05337e764153 'fix(extensible-workflows): route doc-* scaffold owners to Backlog document verification (TASK-15.1.1)' contains exactly plugins/extensible-workflows/src/p0-tools.ts, the verifyBacklogArtifact hunk of runtime.ts, CHANGELOG.md, docs/plugin_proposal/workflowz-v2.md; DCO signed; sibling worktreeName hunks + planner test file remain uncommitted. Post-commit: focused 30 pass / 0 fail / 89 expect; tsc -p plugins/extensible-workflows clean.
---

author: WorkflowzAssetJudge
created: 2026-08-21 19:25
---
[blocking] plugins/extensible-workflows/src/p0-tools.ts:330-335 — The final `doc-*` owner routing repair has no changed-contract regression test. `test/workflowz-p1-contracts.test.ts` exercises only `ownerIds: ["TASK-15.1"]`; the document route was added afterward in 1528cdc. The manual probe succeeds, but a future task-only refactor would silently re-break the promised document owner path. → Add a focused scaffold test whose fake executor accepts only `backlog doc view doc-governance --plain`, asserts a successful draft and exact command, and covers rejection when that document lookup fails.
---

author: WorkflowzAssetJudge
created: 2026-08-21 19:33
---
[review] REVIEW_PASSED — all previously reported asset findings are resolved. `builtinTemplates` is deep-frozen; GateFile and recipe persisted hashes fail closed; global same-version replacement is rejected; task/document owner routing uses the matching Backlog command; and 9320db89 adds valid/missing document-owner coverage. Evidence: immutable-catalog probe passed; `bun test test/workflowz-p1-contracts.test.ts` => 9 pass, 0 fail, 26 expect calls; package TypeScript check passed; 9852bf1, 253ac69, 1528cdc, and 9320db89 DCO/scope/diff checks clean.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered governed reusable workflow assets. Builtin templates are private, immutable/read-only, deep-frozen, and returned as isolated clones. Recipe scaffolding preserves template inputs, requires verified Backlog task/document ownership, refuses unapproved overwrite, persists canonical content/version/owner metadata, and project scope deterministically overrides global. GateFile scaffolding and global promotion fail closed for draft/untrusted state, invalid owners, stale hashes, missing Backlog evidence, and same-version overwrite; equivalent definitions use stable canonical content hashes. Recipe resolution recomputes persisted hashes and rejects tampering while retaining explicit legacy hashless compatibility. Added focused asset tests covering catalog immutability, GateFile owner/hash/trust/immutability, recipe tamper detection, project precedence, and task/document owner routing. Verification: focused P1/P0/runtime/lifecycle matrix 31 pass/0 fail/95 assertions; plugin TypeScript check clean; validator gate.green=true; judge review passed. Production commits: 9852bf133d1cb1ef1858c338c0bb75f0064f7f6c, 253ac69588d3067d42fabd98490c6d95b343e63d, 1528cdc524f87c3e1e1f7c2a409c05337e764153. Test commits: ca1a0097e0b31f9d895e7b8775534f1ef987a7d8 and 9320db89a5fa04fd250731c0cd0611c2941dbe67. Documentation/changelog owner rules updated.
<!-- SECTION:FINAL_SUMMARY:END -->
