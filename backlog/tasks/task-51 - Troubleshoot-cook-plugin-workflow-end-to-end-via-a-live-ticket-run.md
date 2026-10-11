---
id: TASK-51
title: Troubleshoot cook plugin workflow end to end via a live ticket run
status: In Progress
assignee: []
created_date: '2026-08-29 01:14'
updated_date: '2026-08-29 01:53'
labels:
  - investigation
dependencies: []
priority: high
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use the cook multi-agent workflow to take one real ticket from creation to closed with evidence, exercising every stage (create, propose, start, plan/decompose, implement, validate, judge, finalize). Troubleshoot and fix cook-plugin workflow issues discovered during the loop as they surface. The exercise itself is the proof: if the cook toolchain has gaps (dispatch tools, decompose, next/claim, gate enforcement), find and fix them in the plugin source under plugins/ (or the associated skill/profile sync), then retry the loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A sub-ticket is created, planned, implemented, validated, judged, and marked Done via the cook workflow
- [ ] #2 cook_next reports null-state (ALL_SUBTICKETS_DONE) after all children are Done
- [ ] #3 Parent task is closed with checked ACs and a final summary naming objective verification evidence
- [ ] #4 Any workflow defects observed during the loop are recorded with file:line evidence in Backlog (notes or follow-up ledger) and fixed in the plugin source where in scope
- [ ] #5 No stage is skipped: each chain stage's specialist is dispatched and waited on, with intents journaled before dispatch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN v2 (planner stage, 2026-08-29, Planner51d; supersedes v1 after RED self-review):
Approach selected via ADHD diverge→focus over 4 frames; winner F1 "merge-on-write" (score 12; runner-up sidecar F2 scored 10; F3 exempt-pins rejected — partial fix, still clobbers on version bump; F4 managed-region rejected — conflicts with evo-sub byte-exact rewrite/backup contract).

F1 contract — installCookAgents (plugins/cook/extensions/agents.ts:160) preserves operator customizations during resync:
1. Before overwriting an installed profile, read the existing dest file; parse its YAML frontmatter (vendored js-yaml already imported in agents.ts). Frontmatter keys present in the INSTALLED file but ABSENT from the template (e.g. model:, added tools entries as whole new keys) are merged into the template frontmatter before write — additive delta only. Missing dest file → plain template write. Unparseable frontmatter → plain template write (never fail install).
2. Marker .cook-agents-marker.json records the hash of the post-merge content actually written, so profilesUpToDate() sees merged files as current — pin-clobber-resync loop ends, and a re-sync after merge returns "current".
3. Non-additive drift (body edits, edits to existing template keys) still reinstalls the template: only absent KEYS are merged, existing template keys always win.
4. Bump COOK_AGENTS_VERSION so the one-time resync also heals the stale 8-profile installed roster (.omp/agents currently missing cook-audit/cook-refute templates; marker 0.1.7-ezxomp.7 has 8 hashes vs 10-profile template roster).
5. evo-sub ownership-skip contract untouched: cook-agents.test.ts:207-263 evo-skip tests stay green unchanged.
6. NO expectation flip needed (v1 correction): existing drift test cook-agents.test.ts:109-124 uses a non-additive fixture (name/tools keys exist in template, body replaced) and stays green under F1; the new preservation suite is purely additive coverage in a separate file. Existing file untouched except if worker finds a genuine contradiction (none observed).

RED PROOF (2026-08-29, recorded by planner): plugins/cook/tests/cook-agents-pin-preservation.test.ts (5 tests) run `cd plugins/cook && bunx vitest run tests/cook-agents-pin-preservation.test.ts` → 2 failed | 3 passed: FAIL "keeps an added model pin across resync" (pin wiped on resync) and FAIL "keeps added frontmatter keys when a version bump forces reinstall" (cook-agents-pin-preservation.test.ts:101). The 3 passing cases are intended invariant guards (body drift reinstalls, template-key edit reinstalls, unparseable falls back) — they pass before AND must pass after the fix.

Sub-tickets (cook_decompose; fake-edge test — exactly one genuine work slice plus verification and closure):
- TASK-51.1 [no deps] F1 implementation in agents.ts (merge + marker-merged-hashes + COOK_AGENTS_VERSION bump) making the RED suite green, CHANGELOG [Unreleased] Fixed entry, DOX pass on plugins/cook/AGENTS.md if contract text changes. jj task workspace per docs/parallel-agents.md; bookmark TASK-51.1 = deliverable. DISPATCH RISK (fact): native task spawn of UNPINNED profiles resolves session-default route (openai-codex) which is quota-dead — pin or verify cook-worker model before dispatch (cook_config shows only scout pinned).
- TASK-51.2 [dep 51.1] scoped verification: targeted tests/cook-agents-pin-preservation.test.ts + existing tests/cook-agents.test.ts must pass, then full cook suite; judge review; defect-ledger append on TASK-51; DAG-order proof (cook_next offers 51.2 only after 51.1 Done).
- TASK-51.3 [dep 51.2] parent closure: cook_next null-state (ALL_SUBTICKETS_DONE) evidence, parent ACs 1-5 checked with objective evidence, final summary, parent status Done.

Verification commands: targeted `cd plugins/cook && bunx vitest run tests/cook-agents-pin-preservation.test.ts tests/cook-agents.test.ts`; cook suite `cd plugins/cook && bunx vitest run`; full gate coordinator-only: `just verify` (bunx tsc --noEmit + bun test test/ + fallow audit).
complexity: simple (all three sub-tickets; single-module fix, no cross-boundary risk; dual-review floor not warranted).
Risks: YAML parse failure fallback (covered by RED test 5); marker hash semantics must keep all existing freshness tests green except none (no flips); merged-write must be atomic-ish (single writeFileSync as today).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## capture completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-51
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-51" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: Repo: /home/eag1/repo/ezxomp — TypeScript monorepo of OMP plugins. Parent ticket TASK-51 is a live exercise: run the cook workflow end to end on one real sub-ticket (create→plan→implement→verify→review→done with evidence), and fix cook-plugin workflow defects discovered during the loop (in plugins/ cook subtree or agent profiles). Read AGENTS.md rules (just verify gate; CHANGELOG.md updates needed for meaningful changes; parallel-agents doc for jj protocol). The exercise ticket itself should be small and real — something the worker can implement in one pass (e.g. a small code cleanup or bugfix in a plugin), so the loop exercises the cook machinery rather than becoming a giant feature. Decompose TASK-51 into atomic sub-tickets with depends_on edges; keep the ticket count small (2-4: implement the real slice of work, fix any workflow defects found, plus a verify/finalize ticket). Build a facts-only context packet: relevant files+roles, key symbols with file:line, exact targeted test/build commands, mechanical constraints (e.g. bun test, just verify, CHANGELOG rule)

Workflow defect #1 (attempt 1, 2026-08-29): cook-planner dispatch via native task tool failed after 7m5s with provider error `openai-codex/gpt-5.6-terra: usage limit reached (code=usage_limit_reached)`. Root cause: provider quota, not plugin logic. Action: retry dispatch (cook retry cap 3).

Workflow defect #1 (attempt 2, 2026-08-29): cook-planner failed 3.5s after dispatch, same `usage_limit_reached` from openai-codex/gpt-5.6-terra. Failure is immediate now (quota exhausted), so retry 3 likely fails too — preparing fallback: check cook-planner profile frontmatter for a model override we can point at a different provider.

Workflow finding #1 root-caused (2026-08-29): all three cook-planner dispatches failed with `openai-codex/gpt-5.6-terra usage_limit_reached`. Not a cook-plugin bug: global `~/.omp/agent/config.yml` → `task.agentModelOverrides.cook-planner = openai-codex/gpt-5.6-terra:max` shadows the profile-level `model:` pin (`.omp/agents/cook-planner.md` has `model: deepseek-v4-flash:0731`). Precedence: config.yml agentModelOverrides > profile frontmatter. Fix: remove/clear the cook-planner override in global config so the profile pin or session default applies. Also observed secondary defect (needs fix regardless): `installCookAgents` (plugins/cook/extensions/agents.ts:161-190) overwrites installed profiles with templates on drift — a model pin written by cook_config is wiped whenever profilesUpToDate() sees hash mismatch, so profile model pins do not survive re-sync.

## capture completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-scout", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-scout's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
SCOUT → Facts-only context packet for TASK-51: AGENTS.md mechanical rules, docs/parallel-agents.md jj protocol, plugins/cook/extensions/agents.ts symbol map (installCookAgents, profilesUpToDate, resolveTemplate + dirs), plugins/cook/tests inventory + scoped test command, cook package.json, CHANGELOG.md format, .omp/agents and plugins/agents listings.
1. Search codebase, docs, web
2. Facts, not opinions
3. Evidence only — no judgment

Record findings on the parent task via backlog_task_edit once assigned.

## Context Packet (facts only) — TASK-51, refreshed 2026-08-29 by Planner51d (plan re-entry, attempt 4)

OBSERVED FILES AND ROLES
- plugins/cook/extensions/agents.ts — cook agent profile installer/sync logic; exports syncCookAgents (auto-resync entry, ~line 134), profilesUpToDate (line ~152; marker version + per-file hash check), installCookAgents (line 160, export; async; srcDir = join(__dirname,"..","agents") i.e. plugins/cook/agents templates; destDir = <cwd>/.omp/agents project scope | ompHome()/agents personal scope), ompHome() (env OMP_HOME ?? ~/.omp), COOK_PROFILE_FILE_MAP (line 8: ROLE_FILE_MAP + cook-council, cook-council-synthesis, cook-audit, cook-refute → 10 profiles), evo-sub ownership detection via evo config/state-file; imports vendored js-yaml (../vendor/js-yaml.mjs).
- plugins/cook/tests/cook-agents.test.ts — vitest; describes: baseline install (:63), freshness/drift (:99; drift-clobber assertion at :109-124), scope/evo interplay (:179), spawn-authority frontmatter contract (:266), roster (:309). Runner: vitest run (script "test"); vitest.config.ts at plugins/cook/vitest.config.ts; repo root gate = just verify.

- plugins/cook/package.json — @ezxomp/cook 0.1.7-ezxomp.6; scripts.test = "vitest run"; deps @ezxomp/backlog workspace:*, vendored js-yaml under plugins/cook/vendor.
- .omp/agents/ (installed, project scope): 8 profiles (cook-council, cook-council-synthesis, cook-judge, cook-planner, cook-researcher, cook-scout, cook-validator, cook-worker); missing cook-audit, cook-refute templates. Marker .omp/agents/.cook-agents-marker.json = version 0.1.7-ezxomp.7, 8 file hashes (version ahead of installed package version 0.1.7-ezxomp.6).
- plugins/cook/agents/ (templates): 10 files as in COOK_PROFILE_FILE_MAP.
- cook_config state (2026-08-29): planner/researcher/worker/validator/judge "(inherits session model)"; scout pinned ollama-cloud/deepseek-v4-flash:0731. Installed .omp/agents/cook-planner.md frontmatter observed WITHOUT a model: pin (installed roster is stale vs templates).
- docs/parallel-agents.md — exists, normative, "Parallel Agent Work Protocol — jj Workspaces, Local Merge, Push main Only" (decision-2). Worker rules: workspace = ../ezxomp.<task>, base jj new main at start, jj describe -m, deliverable = jj bookmark create <task> -r @-, never push/move main/rebase main, report task+bookmark+jj log line.
- AGENTS.md: just verify = pre-merge gate (bunx tsc --noEmit + bun test test/ + fallow audit); every meaningful change updates CHANGELOG.md under ## [Unreleased] (Keep a Changelog); DOX pass requirement; codesight-first context ladder.
- CHANGELOG.md root: Keep a Changelog; entries under ## [Unreleased] with Added/Fixed subsections.
- Mechanical constraints: evo mode ON in this session (natives write/bash/edit/read-to-fs blocked; eval unregistered; hub process ops work); cook_dispatch_* tools emit the exact task() brief (spawn happens via native task tool); task spawn default agent "task" disabled — spawn must pass explicit agent type.
- Dispatch-fault ledger (obs): #1,#2 cook-planner via native task ×2 → openai-codex/gpt-5.6-terra usage_limit_reached (7m5s, 3.5s; override removed 01:35Z — root-caused as config.yml agentModelOverrides). #2 attempt#3 same terra fault. #4 cook-scout (Planner51d.Scout51) died 4.1s — openai-codex/gpt-5.6-luna usage_limit_reached via session-default route; scout profile unpinned so session default resolves to codex. Conclusion fact: quota exhaustion is environmental; surviving profiles with model pins (cook-planner deepseek-v4-flash:0731, scout ollama cloud deepseek-v4-flash in cook_config state) dispatch fine.
- Packet consumers: worker (51.1), validator/judge (51.2), coordinator closure (51.3). Verify entries you rely on; report stale facts rather than trusting them.

## Decomposed into 3 sub-tickets
- TASK-51.1: Preserve additive profile customizations in cook agent resync (F1 merge-on-write)
- TASK-51.2: Verify and judge TASK-51.1 profile-pin preservation fix
- TASK-51.3: Close parent TASK-51 with AC evidence and final summary
Dependencies:
- TASK-51.2 ← TASK-51.1
- TASK-51.3 ← TASK-51.2

PLAN STAGE COMPLETE (Planner51d, 2026-08-29):
- RED proof: plugins/cook/tests/cook-agents-pin-preservation.test.ts (authored by planner, 5 tests) → run `cd plugins/cook && bunx vitest run tests/cook-agents-pin-preservation.test.ts` = 2 failed | 3 passed (351ms). Failures = the 2 new F1-contract cases (model pin wiped on plain resync @:76 area; pin wiped on version-bump reinstall @:101). 3 passing guards = intended pre+post-fix invariants (non-additive body drift still reinstalls; existing-template-key edit still reinstalls; unparseable frontmatter falls back to template).
- Decomposed → TASK-51.1 (F1 implement; no deps), TASK-51.2 (scoped verify + judge + DAG-order proof; ← 51.1), TASK-51.3 (parent closure incl. cook_next null-state; ← 51.2). Priorities High. complexities: simple (recorded in plan v2).
- Plan-split escalation evaluated (fake-edge test): the dispatch-route fault (unpinned cook profiles resolve the quota-dead openai-codex session default — scout died in 4.1s) is environmental/config (provider quota; cook_config pinning), not repo work; kept inside the 51.1 dispatch-risk note + ledger instead of a separate repo ticket. Exactly one genuine repo work slice = 51.1.
- Facts added since packet v1: cook-agents.test.ts:109-124 drift fixture is non-additive (keys name/tools exist in template; body replaced) → stays green under F1; no expectation flip required (plan v1 correction). vitest 4 has no "basic" reporter (startup error on --reporter=basic); default reporter works. Sub-ticket priority vocabulary is High/Medium/Low (P1 rejected by backlog CLI).

DAGR-producer gap analysis vs author intent (dagr-producer SKILL.md, herdr-dagr upstream, read 2026-08-29). Current cook producer (plugins/cook/extensions/dagr.ts + cook-tools.ts pushDagr) vs the author's contract:

ALIGNED (author intent already honored)
- Producer loop correct: run.json.tmp -> dagr check --strict --json -> atomic rename (publishRunDoc, dagr.ts:167-196); never publishes invalid candidates; exit!=0 -> silent disable (view never gate).
- Validator resolution: DAGR_BIN -> command -v dagr -> DAGR_PLUGIN_BIN (dagr.ts:73-79) matches skill steps 1/2/3.
- Contract v3, stale-done -> synthetic settled_unverified attempt (E150 guard, dagr.ts:100-113), generated_at refreshed per write, DAG per deps.

GAPS vs INTENT (ranked)
G1 STALENESS: projection fires ONLY on cook_claim (cook-tools.ts:1457) and cook_release (:1487). All other store/journal mutations (cook_next claims, dispatch intents, done-gate, status transitions) never re-publish. Live file: generated_at 01:10Z, zero attempts recorded since. Pane goes stale between claims — violates author intent that producer keeps file live ("update last_output_at... staleness is rendered").
G2 ATTEMPT HISTORY: projection builds attempts exclusively from cs.agentLog — which is NEVER appended anywhere (grep: zero write sites; live state agentLog=[]). Result: every live working task has NO working attempt (violates invariant 1: working needs a working attempt -> the run.json we produce for In Progress tasks would fail strict check... currently masked because those tasks were done pre-projection and get synthetic attempts). Attempts/events arrays are effectively dead code paths.
G3 EVIDENCE TIERS: journal gate records exist (cook_validate writes gate events to .cook-journal JSONL) but are NOT projected — events: [] today. Author: evidence tier verified requires mechanical receipt; we have the receipts in the journal and drop them.
G4 LOCATOR/LIVENESS: working attempts want locator {pane} + liveness.last_output_at; we emit liveness {prompt_acknowledged: true} with no locator and no timestamps (cook-tools.ts:135-142) — check-clean only because attempt state mapping collapses working->(no attempt at all, G2).
G5 RUN.orchestrator: hardcoded "cook-<cwdtag>" id; skill says auto-set from $HERDR_PANE_ID; operator message delivery keys on this locator.
G6 PROJECTS: parent tasks map to per-task project homes; sub-sub-tickets (TASK-51.1 under TASK-51) do map via t.parent — OK; but projects array is never emitted, so no visual hierarchy.
G7 KIND: all tasks kind "impl" — review/gate/docs/question shapes (which change dagr's drawing and gates' fan-in) unused.

INTENT-FIT ENHANCEMENT PLAN (for user approval, would be its own task after TASK-51)
E1 Trigger on every store-mutating commit: add void pushDagr(ctx) after setStore in cook_next/claim/release/validate/journal/done-gate + after dispatch tools record agentLog (cheap, idempotent projection).
E2 Make agentLog real: append an AgentLogEntry (role, taskId, timestamp) on each dispatch/validate/journal record; then attempts/events project true lifecycle (attempt_started on dispatch intent; attempt_settled on journal record; evidence tier = verified when journal has gate receipt, reported when envelope recorded, else asserted).
E3 Emit events from .cook-journal: map journal gates (event: "gate") to dagr attempt_settled + evidence verified with receipt=journal note/hash.
E4 locator + liveness from herdr (pane id via HERDR_PANE_ID or claim holder), last_output_at = journal tail timestamp.
E5 orchestrator from $HERDR_PANE_ID env when present (fall back to current).
E6 kind mapping from labels/type: bug/feature/enhancement->impl, review cycles->review, validator/judge stages could be gate tasks (fan-in on deps). Keep minimal: only map judge/validator to review/gate if trivially derivable.

Constraints honored: pane stays a view (no gate coupling), producer loop unchanged, evo-sub skip contract untouched. Author's "publish operator-visible work, not internal runtime steps" = keep one attempt per dispatch record, not per tool call.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
false
<!-- SECTION:FINAL_SUMMARY:END -->
