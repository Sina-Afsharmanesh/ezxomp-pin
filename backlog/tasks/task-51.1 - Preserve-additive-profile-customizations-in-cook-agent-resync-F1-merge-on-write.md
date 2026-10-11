---
id: TASK-51.1
title: >-
  Preserve additive profile customizations in cook agent resync (F1
  merge-on-write)
status: In Progress
assignee: []
created_date: '2026-08-29 01:44'
updated_date: '2026-08-29 01:59'
labels: []
dependencies: []
parent_task_id: TASK-51
priority: high
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Defect ledger finding #1 (TASK-51): installCookAgents (plugins/cook/extensions/agents.ts:160) overwrites installed OMP agent profiles with shipped templates whenever profilesUpToDate() (agents.ts:152) detects hash drift, destroying operator customizations such as model: pins written by cook_config. Implement the planned F1 merge-on-write contract: before overwriting an installed profile, parse its existing YAML frontmatter and merge frontmatter keys ABSENT from the template (additive delta only; existing template keys always win; body drift or unparseable frontmatter → plain template write). Record the post-merge content hash in .cook-agents-marker.json so merged files count as fresh (no clobber-resync loop). Bump COOK_AGENTS_VERSION to heal the stale 8-profile installed roster (.omp/agents missing cook-audit/cook-refute) up to the 10-profile template roster. Do not touch evo-sub ownership-skip paths. RED suite to make green: plugins/cook/tests/cook-agents-pin-preservation.test.ts (already authored; currently 2 failed | 3 passed).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cd plugins/cook && bunx vitest run tests/cook-agents-pin-preservation.test.ts → all 5 tests pass (2 RED cases flip green; 3 guards stay green)
- [x] #2 cd plugins/cook && bunx vitest run tests/cook-agents.test.ts → all existing tests pass without expectation changes
- [x] #3 A cook_config-written model: pin (additive frontmatter key) survives syncCookAgents resync: merged marker hash makes profilesUpToDate() true and next sync returns 'current'
- [x] #4 Non-additive drift (body edit or edit of an existing template key) still reinstalls the template; unparseable frontmatter falls back to plain template write without throwing
- [x] #5 COOK_AGENTS_VERSION bumped so one resync heals the stale 8-profile installed roster to the 10-profile template roster
- [x] #6 CHANGELOG.md gains a Fixed entry under ## [Unreleased]; DOX pass run on plugins/cook/AGENTS.md (update only if install/sync contract text changes)
- [x] #7 Work delivered as jj bookmark TASK-51.1 in its own task workspace per docs/parallel-agents.md; never push or move main
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PLANNER HANDOFF NOTE (Planner51d): The RED spec file plugins/cook/tests/cook-agents-pin-preservation.test.ts exists UNCOMMITTED in the main working copy (written 2026-08-29 during plan stage; not yet in anyjj commit). Worker: create your jj task workspace per docs/parallel-agents.md, then copy this file from the main working copy (/home/eag1/repo/ezxomp/plugins/cook/tests/cook-agents-pin-preservation.test.ts) into your workspace FIRST — it is the binding spec. Make it green with the F1 implementation (plan v2 on TASK-51), keeping the 3 invariant guards green. Session mechanical facts: evo mode ON (natives blocked; use marketplace-plugin tools; hub process ops for shell); dispatch only with pinned model profiles (unpinned routes currently die to codex quota).

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-51.1
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Record all results on task TASK-51.1 via backlog_task_edit.

Dispatch-fault ledger obs #5 (2026-08-29): Worker51 failed 3.8s post-spawn — openai-codex/gpt-5.6-luna usage_limit_reached via session-default (worker unpinned; planner flagged this exact risk). Mitigation: cook_config worker → ollama-cloud/deepseek-v4-flash:0731 (project scope). Re-dispatch next.

Dispatch-fault ledger obs #6 (2026-08-29): Worker51b also failed 4.8s on gpt-5.6-luna quota despite cook_config worker pin to ollama-cloud/deepseek-v4-flash:0731 (project .omp/agents). Root cause: global config.yml task.agentModelOverrides for ALL cook roles (judge/researcher/scout/validator/worker) pointed at quota-dead openai-codex models and outrank profile pins in the running harness. Fix: removed all remaining cook-* entries from config.yml agentModelOverrides — profile frontmatter pins (project scope, live ollama-cloud models) now govern. This is the same defect class as finding #1 but global config scope.

WORKER (Worker51c) implementation complete. F1 merge-on-write implemented in plugins/cook/extensions/agents.ts: added mergeAdditiveFrontmatter() (parses installed + template frontmatter via vendored js-yaml, carries over keys absent from template, existing template keys win, body drift/unparseable frontmatter → plain template), extractFrontmatter() and frontmatterKeyLines() helpers; installCookAgents now merges before write and records the merged content hash in the marker so a second sync reports 'current'. COOK_AGENTS_VERSION bumped 0.1.7-ezxomp.6 → 0.1.7-ezxomp.8. CHANGELOG.md gained a Fixed entry under [Unreleased]; plugins/cook/AGENTS.md line 15 updated to document merge-on-write resync semantics (DOX pass). Delivered as jj bookmark task-51.1 (commit 9bf86835) in workspace ../ezxomp.task-51-1; never pushed or moved main. Verification: `bunx vitest run tests/cook-agents-pin-preservation.test.ts tests/cook-agents.test.ts` → 29/29 pass (5 RED + 24 existing).
<!-- SECTION:NOTES:END -->
