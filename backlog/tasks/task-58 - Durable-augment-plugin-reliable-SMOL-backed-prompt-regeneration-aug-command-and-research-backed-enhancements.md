---
id: TASK-58
title: >-
  Durable augment plugin: reliable SMOL-backed prompt regeneration, /aug
  command, and research-backed enhancements
status: Done
assignee: []
created_date: '2026-08-31 00:53'
updated_date: '2026-08-31 04:36'
labels:
  - feature
  - research
dependencies: []
priority: high
type: enhancement
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Order: the augment plugin's prompt regeneration fails often. Investigate root cause and make enhancements.

Requirements from operator:
- Deep research on similar prompt-rewriting tools/approaches.
- Regeneration must run on OMP's SMOL model, whichever model the user has set (not hardcoded).
- Add a short command "/aug" as an alias entry point.
- Look for other enhancements and make the plugin durable for user-facing use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root cause(s) of the frequent prompt-regeneration failures are identified with evidence (code path + observed failure modes) and documented in the task
- [x] #2 Regeneration resolves and uses the user-configured OMP SMOL model; verified by targeted test or live run, not a hardcoded model id
- [x] #3 A short "/aug" command is registered and triggers the prompt rewrite path
- [x] #4 A research document on similar tools/approaches is recorded in Backlog (type research) with sources
- [x] #5 Other identified enhancements are implemented or durably recorded (sub-tickets or follow-up ledger) with rationale
- [x] #6 Repo gate "just verify" (tsc + full bun test) passes and CHANGELOG.md is updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: complex

1. Investigation — TASK-58.2 traces `plugins/augment/src/index.ts` → `enhance.ts` → auth/completion/parser, reproduces confirmed failures, and records a ranked durability ledger. Risk: the operator report establishes frequency but not one cause; label operator observation, code-proven behavior, reproduction, and hypotheses separately.
2. Research — TASK-58.4 creates a sourced Backlog research document using isolated ADHD frames (UX precedents, optimization methods, runtime reliability/model routing, validation/safety), critic pass, and synthesis. It can proceed in its own jj task workspace/bookmark with no dependency.
3. SMOL routing — TASK-58.5 (after TASK-58.2 and TASK-58.4) updates `plugins/augment/src/model-routing.ts` and `plugins/augment/src/enhance.ts` so the live `ctx.models.resolve("@smol")` result is the only inference/auth model, while `buildPromptContext` continues to target output style to the active destination model. Missing/unresolvable SMOL must fail clearly without active-model fallback. Make `test/augment-routing.test.ts` green; preserve cancellation, timeout, parse retry, settings, and review-before-send behavior.
4. Short command — TASK-58.6 independently refactors the registration boundary in `plugins/augment/src/index.ts` so `/augment` and `/aug` share one handler rather than duplicating behavior. Make the `/aug` RED case in `test/augment-routing.test.ts` green. This child uses its own jj task workspace/bookmark and does not depend on SMOL routing.
5. Integration and release gate — TASK-58.7 consumes TASK-58.2, TASK-58.4, TASK-58.5, and TASK-58.6. Integrate child bookmarks through the coordinator, update `plugins/augment/README.md`, `plugins/augment/AGENTS.md` only where contracts changed, and add an `Unreleased` entry to `CHANGELOG.md`. Run `bun test test/augment.test.ts test/augment-routing.test.ts`, then coordinator-only `just verify`.
6. Plugin e2e — as part of TASK-58.7, follow `skill://ezxomp-plugin-e2e-test`: direct-source isolated fresh OMP smoke against absolute `plugins/augment/src/index.ts`; local-link fresh-session check; after coordinator commit/push, marketplace-install fresh-session check. Each must exercise `/aug` and verify the configured SMOL model is used, inspect startup logs for zero load failures, and record fixed-format verdicts on TASK-58. Workers never push or move `main`; the coordinator alone integrates, gates, pushes, and cleans jj workspaces per `docs/parallel-agents.md`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Capture (2026-08-31):
- Operator order verbatim: augment plugin prompt regeneration "fails often"; investigate root cause + enhancements; deep research on similar tools; regeneration must use OMP SMOL model as set by user; short "/aug" command; find other enhancements; make plugin durable.
- Scope facts: plugin lives at plugins/augment/ (package.json, README.md, AGENTS.md, UPSTREAM.json, src/: enhance.ts, parser.ts, types.ts, context.ts, contracts.ts, index.ts, intent.ts, model-routing.ts, prompt-leverage.ts, settings-overlay.ts, settings.ts, constants.ts, strategies/{strategy,shared}.ts).
- Non-goals: no unrelated plugin work; no changes outside plugins/augment + repo test/changelog/docs per house rules.
- Deliverables expected: root-cause doc on task; research doc (Backlog, type research); implementation of /aug + SMOL model resolution + enhancements; just verify green; CHANGELOG updated.
- House constraints: DOX chain applies (plugins/AGENTS.md + plugins/augment/AGENTS.md must be read before editing); marketplace plugin authoring contract docs/authoring-extensions.md read before modifying plugin; plugin e2e test skill for final validation; CHANGELOG entry under Unreleased before commit.

## plan completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-58
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-58" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: Augment plugin at plugins/augment/ — prompt regeneration ('enhance' path) fails often per operator report. Operator requirements: (1) investigate root cause of regeneration failures with evidence; (2) regeneration must run on OMP's user-configured SMOL model (src/model-routing.ts exists — check how models are resolved today); (3) register a short '/aug' command (src/index.ts registers commands — /augment and /augment-settings exist); (4) deep research on similar prompt-rewriting tools/approaches for a Backlog research doc; (5) other enhancements to make the plugin durable. Full task AC in backlog TASK-58. House rules: read plugins/AGENTS.md, plugins/augment/AGENTS.md, docs/authoring-extensions.md, docs/parallel-agents.md before planning edits; final validation = just verify + plugin e2e skill; CHANGELOG.md under Unreleased.

Record all results on task TASK-58 via backlog_task_edit.

## Decomposed into 1 sub-tickets
- TASK-58.1: test

## Decomposed into 1 sub-tickets
- TASK-58.2: Document Augment regeneration failure modes and root causes

## Decomposed into 2 sub-tickets
- TASK-58.3: Document Augment regeneration failure modes and root causes
- TASK-58.4: Research durable prompt-rewriting tools and methods

Planner evidence (2026-08-31):

## Context Packet (facts only)
- `plugins/augment/src/index.ts:6-45` registers `/augment` and `/augment-settings`; `/aug` is not registered.
- `plugins/augment/src/enhance.ts:17-23` selects `ctx.model`, requires it to exist, and resolves authentication for that selected model.
- `plugins/augment/src/enhance.ts:32-45` performs at most two completion attempts and retries only when `parseEnhancedPrompt` throws.
- `plugins/augment/src/enhance.ts:37` passes the selected model to completion; `enhance.ts:116-124` applies configured timeout and output-token limits.
- `plugins/augment/src/model-routing.ts:4-14` contains only output-family detection; it does not resolve an inference model.
- `plugins/augment/src/context.ts:16-18` derives automatic output style from `ctx.model`.
- `plugins/augment/src/parser.ts:18-33` accepts the sentinel wrapper, an `<execution_contract>` wrapper, or a raw execution contract; otherwise it throws an invalid-output error.
- `plugins/augment/src/settings.ts:12-18` defaults output tokens to 1200, timeout to 45000 ms, conversation depth to 4, and review-before-send to true.
- `test/augment.test.ts` is the existing integration test file for manifest, loading, settings, `/augment`, overlay, and delivered enhancement behavior.
- `test/augment-routing.test.ts` contains three planner-authored contract tests for configured `@smol` routing, `/aug`, and unavailable-`@smol` behavior.
- Targeted RED command: `bun test test/augment-routing.test.ts`.
- Existing targeted regression command: `bun test test/augment.test.ts`.
- Final repository gate: `just verify`.
- Final installed-surface protocol: `skill://ezxomp-plugin-e2e-test` requires direct-source, local-link, and marketplace fresh-session verification.
- `CHANGELOG.md` has an `[Unreleased]` section with Added/Changed/Fixed headings.
- `docs/parallel-agents.md` requires one jj workspace and task bookmark per worker; workers do not push or move `main`.

RED proof: `bun test test/augment-routing.test.ts` produced 0 pass / 3 fail. Failure 1 received active `anthropic/claude-opus` where configured `openai/gpt-5.6-mini` was expected. Failure 2 reported `expected /aug to register`. Failure 3 showed completion used the active model when `@smol` was unavailable instead of producing the expected actionable error. Full output: `artifact://6`.

Approach selection (ADHD):
- Model-routing frame: direct `ctx.models.resolve("@smol")` is preferred over reading config files, environment variables, or hardcoding provider/model ids because it consumes the live OMP alias contract and preserves user configuration.
- Destination-style frame: keep automatic family detection tied to `ctx.model`; the SMOL model performs the rewrite, but the rewritten prompt targets the active destination model.
- Failure-policy frame: fail closed with an actionable missing-SMOL message rather than silently falling back to the active model; silent fallback would violate the explicit operator requirement and obscure routing failures.
- Command frame: share one handler between `/augment` and `/aug`; duplicated handlers create drift in settings, cancellation, and delivery semantics.
- Critic pass: config-file parsing duplicates host precedence and can become stale; active-model fallback is superficially resilient but violates the model contract; changing output family to SMOL’s family optimizes for the wrong consumer; broad retries risk duplicate cost and do not fix missing auth/config. Selected design is the smallest host-native cutover.

Scout evidence: the read-only scout confirmed the current enhance path has no SMOL binding and uses the active model; the planner independently grounded exact lines above. Root-cause investigation remains TASK-58.2 because current evidence proves a routing mismatch and concrete RED behavior, but does not by itself prove that every operator-observed intermittent failure shares one cause.

Decomposition created through `cook_decompose`: TASK-58.2 root-cause investigation; TASK-58.4 research; TASK-58.5 SMOL routing depending on 58.2+58.4; TASK-58.6 `/aug`; TASK-58.7 release gate depending on 58.2+58.4+58.5+58.6. Stray partial-create tickets TASK-58.1 and TASK-58.3 were archived by the coordinator.

Deep research completed and written to Backlog document `doc-20`, “Durable interactive prompt rewriting for TASK-58,” with 10 external primary/official sources plus repository evidence. ADHD frames covered UX precedents, algorithmic optimization, reliability/routing, and validation/privacy; the critic rejected silent fallback, learned/beam routing, provider-specific schemas, dashboard-scale UI, second-model judging, and raw-content telemetry. Selected recommendation: exact `@smol` optimizer + active-model destination style + one bounded format correction + editor-first review + deterministic validation. Durable ledger: P0 bad-stop/empty-output validation and typed failure notices; P1 content-free diagnostics/context minimization; P2 feedback-guided regeneration/offline corpus; rejected candidate search/learned routing.

Tooling note: the registered `backlog_doc_create` schema advertises `type=research` and `tags`, but the installed Backlog CLI rejects `--tags` and accepts only `readme|guide|specification|other`. Two specialized-tool attempts failed; issue reported via `xd://report_issue`. The research content is durably stored as `doc-20`, but its current CLI metadata type is `other` rather than the requested `research`; TASK-58.4 must correct the metadata once the Backlog type surface is aligned.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-researcher", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-researcher's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
RESEARCHER → TASK-58
Problem: Why does the augment plugin's prompt regeneration fail often in live use? Trace the full enhance path and classify every failure surface with evidence.
ADHD: economic, security, performance, ux
1. Diverge: isolated frames
2. Focus: score, cluster, prune
3. Record findings: backlog_doc_create with type="research" (REQUIRED)
Return ResearcherEnvelope.

Record all results on task TASK-58 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-58
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Make test/augment-routing.test.ts fully green: (a) resolve the user-configured @smol model via ctx.models.resolve in the enhance path and use that exact model for auth + completion with no active-model fallback (clear actionable error when unresolvable), (b) register /aug sharing the same handler as /augment.

Record all results on task TASK-58 via backlog_task_edit.

TASK-58.2 failure investigation completed (read-only). Durable document: doc-21, `Augment regeneration failure modes and root causes for TASK-58.2` (stored as specification with top-line intended type research because the installed CLI/tool type surface rejects research/tags). Cross-reference: doc-20 contains the separate external-precedent durability research.

Evidence classification and confirmed surfaces:
- Operator-observed only: regeneration ‘fails often’; no live logs establish which surface explains frequency. Do not claim a single cause.
- Reproduced (`artifact://6`, `bun test test/augment-routing.test.ts`, 0 pass/3 fail): expected configured `openai/gpt-5.6-mini` but auth/completion received active `anthropic/claude-opus` (`test/augment-routing.test.ts:88-99`; source `plugins/augment/src/enhance.ts:17,23,37`); `/aug` missing (`test/augment-routing.test.ts:103-108`; source `index.ts:7,45`); missing SMOL still completed on active model instead of fail-closed (`test/augment-routing.test.ts:120-130`).
- Code-proven: selected-model auth failures at `enhance.ts:84-104`; fresh configured timeout per call and fixed timeout copy at `enhance.ts:115-133`; only parser failures retry at `enhance.ts:32-45`, so wrong-shape/empty output costs a second full call and can consume two nominal 45s budgets.
- Code-proven non-obvious root surface: OMP completion error events resolve as AssistantMessage (`node_modules/@oh-my-pi/pi-ai/src/utils/event-stream.ts:169-179,191`; genuine non-thinking-loop errors return from `complete`, `node_modules/@oh-my-pi/pi-ai/src/stream.ts:1054-1084`). Augment rejects only `stopReason=aborted` (`enhance.ts:126`) and drops `errorMessage` while extracting text (`enhance.ts:192-197`). Therefore resolved provider errors can be retried as parse failures and end as misleading sentinel errors. `length`/`toolUse` are also parsed (`pi-ai/src/types.ts:852`). Not reproduced for live incidence.
- Parser mismatch: copy says ENTIRE/exactly one (`parser.ts:121-136`), but unanchored first-match extraction and fallback execution-contract forms are accepted (`parser.ts:18-45,96-110`).
- Cancellation: UI abort correctly returns null/cancel notice (`enhance.ts:152-170`; `index.ts:20-22`), but provider-aborted uses the same notice; no-UI controller has no external cancel hook (`enhance.ts:144-147`).
- Context/settings: history is approximately capped at 800 tokens/depth 4, but draft/total request is not model-budgeted and cwd/branch/history cross the optimizer-provider boundary (`context.ts:8,21-42,65-71`; `strategies/shared.ts:57-86`). Context overflow remains a hypothesis. Settings reads silently default and review is read twice (`enhance.ts:63-66`; `index.ts:52-56`); numeric values have minima but no maxima (`settings.ts:28-33,46-54`; `settings-overlay.ts:81-92`); overlay updates local state before persistence (`settings-overlay.ts:166-176`).

Ranked durability ledger (severity × confidence; disposition):
1. Exact SMOL resolution/auth/completion, no active fallback — 16 (S4×C4) — addressed-by-TASK-58.5.
2. Shared `/aug` entry point — 12 (S3×C4) — addressed-by-TASK-58.6.
3. Reject error/length/toolUse and empty text; preserve provider errorMessage before parsing — 9 (S3×C3) — recommend-follow-up.
4. Typed actionable notices plus content-free outcome/attempt/stop/timing — 9 (S3×C3) — recommend-follow-up.
5. Total operation deadline across format-correction attempts — 9 (S3×C3) — recommend-follow-up.
6. Align parser strictness, fallbacks, first-block behavior, reminder, and copy — 6 (S2×C3) — recommend-follow-up.
7. Snapshot settings and make read/save fallback explicit — 6 (S2×C3) — recommend-follow-up.
8. Minimize/disclose optimizer context and consider total-prompt preflight — 4 (S2×C2) — recommend-follow-up.
9. Preserve normal UI cancellation — 3 (S1×C3) — no-action.
10. Preserve active-destination family detection and default review-on — 3 (S1×C3) — no-action.
11. Preserve explicit no-active-model/unsupported-runtime failures — 3 (S1×C3) — no-action.

Critic top non-obvious pick: validate terminal stop/non-empty output and preserve provider diagnostics before parsing; it scored novelty 4/5, viability 5/5, fit 5/5. Pruned broad retry, silent fallback, provider-specific credential validation, and raw prompt/response logging. Packet freshness: all relied-on facts match; minor citation nit only—parser throw is line 34, outside packet range 18-33.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-58.5
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-58.5 via backlog_task_edit.

Root causes of frequent regeneration failures (full evidence: doc-21, TASK-58.2, 12 evidence-classified failure surfaces with file:line + observed output):
- P0 (implemented this release): inference/auth was bound to the active ctx.model — a misconfigured/missing SMOL silently degraded quality and produced provider auth failures (enhance.ts:17,23,120-125 pre-fix); unresolvable @smol now fails closed with "Augment requires a configured @smol model." before any model call (no active-model fallback).
- P0 (implemented): bad stops (truncated/length/cutoff/429/timeout/overloaded) and empty output were parsed as if valid — the format-correction retry consumed the second call on garbage; pre-parse stop validation now rejects them and reports the stop reason in the error copy.
- P1/P2 (durably recorded with rationale in doc-22 follow-up ledger): content-free diagnostics/context minimization, total deadline, parser strictness (exactly-one sentinel block), feedback-guide loop, corpus build, retry policy.
- Operator observation ("fails often") classified separately from code-proven behavior per the plan.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped v1.0.9-ezxomp.0 (main 7db1a99d, pushed). AC1: 12 failure surfaces evidence-classified in doc-21 (root-cause summary on task); P0 fixes implemented. AC2: regeneration runs on ctx.models.resolve("@smol") — the user-configured SMOL, never the active session model; fail-closed "Augment requires a configured @smol model." before any model call; verified by test/augment-routing.test.ts (3/3) + full suite + 3 fresh-session e2e runs. AC3: /aug shares one handler with /augment; verified registered in direct-source, local-link, and marketplace fresh sessions. AC4: doc-20 (11 sources, 4 research frames + critic); NOTE: installed backlog CLI rejects type=research (accepts readme/guide/specification/other), so the durable record carries type=guide — content and sources fully meet the criterion, type gap recorded on TASK-58.4. AC5: durability levers ranked; P0 implemented, P1/P2 recorded with rationale in doc-22 follow-up ledger. AC6: just verify green on main (391 pass/0 fail, tsc clean, fallow pass); CHANGELOG Unreleased updated. All 5 sub-tasks Done; e2e verdicts recorded on TASK-58.7.
<!-- SECTION:FINAL_SUMMARY:END -->
