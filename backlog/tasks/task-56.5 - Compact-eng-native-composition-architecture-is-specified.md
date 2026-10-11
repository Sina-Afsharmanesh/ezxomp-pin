---
id: TASK-56.5
title: Compact-eng native-composition architecture is specified
status: Done
assignee: []
created_date: '2026-08-30 00:14'
updated_date: '2026-08-30 01:32'
labels:
  - architecture
  - design
dependencies:
  - TASK-56.4
parent_task_id: TASK-56
priority: high
type: docs
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the compact-eng architecture spec after research synthesis. Define the plugin boundary, public commands/config, per-turn watermark/hysteresis state machine, Shake and snapcompact composition, vision/text-model behavior, artifact recovery, failure/circuit handling, native fallback, preservation invariants, observability, and test matrix. The design must extend OMP-native behavior and must not duplicate or intercept native Shake/snapcompact transformations. Publish a Backlog document of type spec; no production edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Backlog spec linked to TASK-56 defines inputs, outputs, state transitions, watermark units, reentrancy/coalescing, and post-compaction headroom checks with edge cases.
- [x] #2 The spec names only research-verified public OMP/snapcompact surfaces and explicitly forbids session_before_compact/tool_result replacement where it would bypass native behavior.
- [x] #3 The spec defines behavior for Shake success/no-progress, snapcompact vision eligibility/renderability/frame budgets, fallback order, text-only models, aborts, pending turns, and compaction failures.
- [x] #4 The spec maps each parent outcome and test/verification checkpoint to concrete plugin files/symbols without prescribing unsupported private-core access.
- [x] #5 The spec includes non-goals, marketplace dependency constraints, and a clean-cutover migration boundary.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: complex

1. Ground the architecture in TASK-56, doc-14/15/16/17, docs/authoring-extensions.md, the current ultra-compact entry/engine/types/skill, and test/compact-eng.test.ts; treat doc-14 public OMP contracts as the capability ceiling.
2. Specify a clean native-composition boundary and public surface: /compact-eng only, session/turn lifecycle observation, native compact delegation, configuration defaults, skill guidance, and explicitly checkpoint any proposed LLM tool registration not verified by doc-14 in TASK-56.7.
3. Define a lower-of percent/token watermark governor with hysteresis and states armed → requesting → compacting → settling → cooldown, including single-flight/coalescing, pending-turn/abort safety, stale completion suppression, no-progress detection, and failure circuit behavior.
4. Specify native Shake/snapcompact composition, preservation/recovery invariants, text-only and vision paths, fallback order, and honest operator/agent observability without session_before_compact, tool_result, context replacement, direct Shake, direct snapcompact library calls, or private-core access.
5. Map outcomes and targeted verification to concrete post-rename plugins/compact-eng files/symbols, explicitly retire the current engine tiers/eviction transformers, record dependency/non-goal/migration constraints, publish one Backlog spec linked to TASK-56, then verify all five TASK-56.5 ACs against the document text.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-56.5
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-56.5" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: TASK-56.5 design brief: author the compact-eng architecture spec as a Backlog spec doc, consuming doc-14/15/16/17; no production edits; no decomposition (DAG is fixed).

Record all results on task TASK-56.5 via backlog_task_edit.

## Context Packet (facts only)

### Observed records and roles
- `doc-18` — Backlog document titled `Compact-eng native-composition architecture [TASK-56]`, CLI type `specification`, tags `spec`, `TASK-56`, `TASK-56.5`, `compact-eng`, `architecture`.
- `doc-14` — OMP 18.0.6 Shake/snapcompact public-contract evidence with file:line citations.
- `doc-15` — pi-agenticoding context-management pattern evidence.
- `doc-16` — Pi-dcp candidate evidence; doc-17 records pi-vault/pi-dcp as the operator-resolved primary source.
- `doc-17` — parent synthesis with binding constraints and optional-pattern candidates.
- `docs/authoring-extensions.md:23-86,112-135` — marketplace copy/symlink model and dependency rules.
- `plugins/ultra-compact/extensions/index.ts:66-82,85-337` — current command, replacement compaction handler, and registrations.
- `plugins/ultra-compact/extensions/engine.ts:110-169,289-299,353-501,558-900` — current thresholds, micro/full tiers, summarization, preprocessing/classification, and eviction implementation.
- `plugins/ultra-compact/extensions/types/index.ts:6-100` — current config, eviction, result and compaction-tier types.
- `plugins/ultra-compact/skills/ultra-compact/SKILL.md:1-180` — current teaching and `/ultracompact` surface.
- `test/compact-eng.test.ts:1-100` — parent RED contracts for clean command/hook composition, watermark request, below-watermark no-op, and concurrent coalescing.

### Exact targeted commands
- `bun test test/compact-eng.test.ts`
- `bun test test/compact-eng.test.ts test/manifest.test.ts test/smoke-plugins.test.ts`
- `bunx tsc --noEmit`
- `bun test test/`
- `just verify`
- `omp --no-extensions -e /home/eag1/repo/ezxomp/plugins/compact-eng/extensions/index.ts`

### Mechanical constraints
- The parent DAG remains TASK-56.1–TASK-56.8; no sub-ticket was created.
- No production file or test was edited for TASK-56.5.
- Backlog CLI accepts document type `specification`, not tool-schema type `spec`; `backlog_doc_create` also forwarded an unsupported `--tags` option. The fallback record is type `specification` with explicit `spec` tag.

## Specification evidence
- AC1: verified `doc-18` §§2–4 define inputs/outputs, lower-of token/percentage thresholds, defaults, `armed → requesting → compacting → settling → cooldown`, single-flight/coalescing, stale completion, and two-part headroom checks.
- AC2: verified `doc-18` §§1,5,10 cite doc-14 public surfaces/file lines, forbid `session_before_compact`, hook compaction, `tool_result`/`context` replacement and private core, and mark `agent_end`/tool registration UNVERIFIED for TASK-56.7.
- AC3: verified `doc-18` §4 covers no-progress, Shake observation, bitmap preflight ownership, text-only models, guarded fallback, abort/pending safety, failures and circuit handling.
- AC4: verified `doc-18` §8 maps outcomes and test checkpoints to post-rename files/symbols and explicitly removes current `engine.ts` tiers/eviction without private-core access.
- AC5: verified `doc-18` §§7,9 define optional-pattern dispositions, non-goals, marketplace dependency rules and the TASK-56.6 clean-cutover ADR boundary.
- Objective check: `backlog_doc_view doc-18` returned the persisted title, `specification` type, `spec`/TASK tags, parent link, and all ten sections listed above.

Context-packet correction: TASK-56.5 depends on TASK-56.4; the dependency was restored after the edit wrapper cleared it when passed an empty dependency array.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published doc-18, the TASK-56-linked compact-eng native-composition architecture specification. It defines the OMP/plugin ownership boundary, clean `/compact-eng` surface, config defaults, lower-of watermark state machine, native Shake/snapcompact/text paths, preservation/recovery rules, fallback/circuit/pending-turn behavior, honest receipts, optional-pattern decisions, post-rename file/symbol verification map, engine-tier removal, marketplace constraints and TASK-56.6 migration boundary. Verified by reading persisted doc-18; all five ACs have section-level evidence. CLI fallback uses type `specification` plus `spec` tag because tool schema and installed CLI document flags differ.
<!-- SECTION:FINAL_SUMMARY:END -->
