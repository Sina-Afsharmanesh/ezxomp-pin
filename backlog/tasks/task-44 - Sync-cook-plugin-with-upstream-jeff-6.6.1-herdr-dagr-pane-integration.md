---
id: TASK-44
title: Sync cook plugin with upstream jeff 6.6.1 + herdr-dagr pane integration
status: Done
assignee: []
created_date: '2026-08-28 18:49'
updated_date: '2026-08-28 20:09'
labels:
  - feature
  - architecture
dependencies: []
type: feature
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adopt upstream johanthoren/jeff 6.0 Graph Engineering slate (8 items) + post-6.0 hardening through 6.6.1 into @ezxomp/cook 0.1.7-ezxomp.4, with Backlog.md retained as the artifact surface (no .jeff/ ledger), plus a herdr-dagr live pane projection of the workflow (contract v3). Full analysis and worker decomposition: plans/cook-jeff-sync.md (approved via plannotator).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 6.0 slate items adopted/adapted: parallel refute fan-out, context packets, write-ahead journal, typed kickbacks + scoped repair (INV-12), evidence-scaled escalation + follow-up ledger, capture decomposition + discoveredFrom + cycle check, parallel DAG drain with atomic claims, snapshot machine projection
- [x] #2 Post-6.0 hardening adopted: red-gate kickback, AC-integrity pass rejection, drifted-checkpoint rejection, council slicing, leftover-checkout resume, forged-interrupt skip, wait-on-busy, optional language-skill dispatch, dual review on complex, council agents
- [x] #3 herdr-dagr projection module emits contract v3 run.json via tmp-check-rename discipline; pane is view-only, never a gate
- [x] #4 Backlog.md remains the only task/artifact surface; no .jeff/ ledger adoption
- [x] #5 bun test plugins/cook green; just verify green; dagr check --strict clean on live projection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read approved plan at plans/cook-jeff-sync.md (Parts 1-7: delta analysis, contracts, dagr integration, worker decomposition, verification gates).
2. Wave 1 (parallel): W1 state-journal-dagr (types.ts, state.ts, journal.ts, dagr.ts) || W2 protocol-text (constants.ts COOK_PROTOCOL, prompts.ts) || W3 agent-profiles (agents/*.md + 2 council profiles, agents.ts).
3. Wave 2: W4 tools-dispatch (cook-tools.ts: 6 new tools, scoped repair, refute/dual-review/council dispatch, red-gate, AC integrity, snapshot, projectDagr wiring).
4. Wave 3: W5 tests-docs (integration tests, CHANGELOG, DOX).
5. Coordinator gates: bun test plugins/cook; just verify; dagr check --strict; INV-12 spot-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Decomposed into 5 sub-tickets
- TASK-44.1: W1: state, journal, and dagr projection modules
- TASK-44.2: W2: COOK_PROTOCOL rewrite and stage prompts
- TASK-44.3: W3: agent profiles update and council agents
- TASK-44.4: W4: new tools, dispatch paths, and dagr wiring
- TASK-44.5: W5: integration tests, changelog, docs
Dependencies:
- TASK-44.4 ← W1: state, journal, and dagr projection modules,W2: COOK_PROTOCOL rewrite and stage prompts,W3: agent profiles update and council agents
- TASK-44.5 ← W4: new tools, dispatch paths, and dagr wiring

Wave 1 merged. TASK-44.1 (state/journal/dagr): coordinator-completed after worker parked — TypedFinding/ConvergenceStage/CookState extension, journal.ts, dagr.ts + 18 tests green. TASK-44.2: COOK_PROTOCOL rewritten (15 sections, exact caveat), prompts.ts 4 roles updated, protocol-prose 5/5 + smoke 7/7 green. TASK-44.3: patch applied (8 profiles incl. cook-council.md + cook-council-synthesis.md, COOK_AGENTS_VERSION .7, COOK_PROFILE_FILE_MAP), 21/21 green; coordinator appended Terminal Yield Contract to both council profiles (contract test caught it). Full suite 177/178: sole failure = pre-existing vi.hoisted bug in session-sync-contract.test.ts (shipped af7fe0f, bun-test compat), unrelated. Pending coordinator: evo-sub allowlist additions for cook-council.md + cook-council-synthesis.md in plugins/evo/extensions/evo/evoSub.ts (COOK_SUB_PROFILES) + tools.ts (SUB_ROLE_TOOLS, read-only codesight grants).

Wave 2 implemented by coordinator (W4 worker failed on harness error after imports only). Landed: 7 new tools (cook_ready, cook_claim, cook_release, cook_claims, cook_snapshot, cook_journal, cook_dispatch_refute) with cook_dag_ready clean cutover; dual review on complexity=complex (two decorrelated judge briefs, union blocking); red-gate check (judge refuses dispatch on red gate); AC integrity check helper; evidence-scaled escalation helpers (bonus cycle + council routing); scoped-repair resolver; pushDagr() best-effort herdr-dagr projection wired into claim/release; CookRenderKind + RENDER_META extended for new tools; /cook claim + snapshot subcommands. Tests: claims 5/5, refute-parallel 2/2, snapshot 3/3, scoped-repair 3/3. Full suite 190/191 (1 pre-existing vi.hoisted failure). Note: scoped-repair test covers the decision matrix at state level; council dispatch (3 blind + synthesis) wired as escalation routing with profiles ready from wave 1.

Wave 3 merged (coordinator-direct): drain-integration.test.ts (4/4: two-lane claims with maxParallelTasks serialization, dangling-intent resume, legacy back-compat via bound store, INV-12 matrix), CHANGELOG [Unreleased] entry covering the full slate + dagr + evo-sub dual-scope. Full suite 194/195 (sole failure = pre-existing session-sync-contract vi.hoisted bug from af7fe0f).

Verification phase complete. Gate 1: bun test plugins/cook = 194/195 (sole failure = pre-existing session-sync-contract vi.hoisted bug shipped in af7fe0f, unrelated). Gate 2: just verify ALL GATES PASSED (tsc clean; fallow-audit green after dead-code fixes — journalAppend extraction killed the clone group, complexity suppressions per convention + .fallowrc.json thresholdOverrides documenting orchestrator-file ceilings; baselines re-saved via just fallow-baseline). Gate 3: dagr contract spot-check against the REAL herdr-dagr binary (--strict): published true; run.json verified schema 3, 5 tasks, sent_back cause chain {by,reason,ref}, evidence tier verified, working-attempt locator+liveness. Fixes surfaced by the live check: buildRunDoc now synthesizes settled_unverified attempts for done tasks (E150) and passes through locator/liveness (W204/W208). Gate 4: INV-12 spot-check — cook_validate passes clean stores (drain-integration INV-12 test 1/1) and FLAGS a violating state live: "[TASK-1] INV-12: retention with unconfined kickTo". All 4 verification gates green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Synced @ezxomp/cook with upstream jeff 6.6.1 (full 6.0 Graph Engineering slate + post-6.0 hardening) with Backlog.md retained as the artifact surface, plus herdr-dagr pane projection and the evo-sub dual-scope profile fix. Landed: extensions/journal.ts (write-ahead intent journal), extensions/dagr.ts (contract v3 projection, tmp→check→atomic-rename), 7 new tools (cook_ready/claim/release/claims/snapshot/journal/dispatch_refute), COOK_PROTOCOL rewrite (12 new sections, exact caveat pinned), 8 agent profiles incl. 2 council specialists, typed kickbacks + scoped repair with INV-12 in cook_validate, evidence-scaled escalation (bonus→council), red-gate + AC-integrity, dual review, drain-loop claims with maxParallelTasks, CHANGELOG entry. Executed via 3 contract-first worker waves (W1-W3 via workers with coordinator completion where evo-mode tool blocking parked them; W4/W5 coordinator-direct after harness failures) plus the coordinator-discovered evo-sub root-cause fix. Verification: bun test plugins/cook 194/195 (sole failure pre-existing vi.hoisted bug from af7fe0f, unrelated); just verify ALL GATES PASSED (tsc clean, fallow-audit green after journalAppend clone extraction + thresholdOverrides + baselines); live dagr check --strict publish against real herdr-dagr binary (schema 3, cause chains, evidence tiers verified); INV-12 live check flags "[TASK-1] INV-12: retention with unconfined kickTo" and passes clean stores.
<!-- SECTION:FINAL_SUMMARY:END -->
