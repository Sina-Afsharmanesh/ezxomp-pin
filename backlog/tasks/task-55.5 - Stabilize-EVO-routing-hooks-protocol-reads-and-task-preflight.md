---
id: TASK-55.5
title: Stabilize EVO routing hooks protocol reads and task preflight
status: To Do
assignee: []
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 16:13'
labels: []
dependencies:
  - TASK-55.7
parent_task_id: TASK-55
priority: high
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire canonical routing guidance, stable reason codes, protocol URI handling, and cook task-dispatch validation. Production boundary: plugins/evo/extensions/index.ts plus narrowly scoped new routing/preflight modules; this child owns the shared index integration boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 before_agent_start injects one concise canonical routing ladder while main EVO is active
- [ ] #2 Native read allows supported protocol URIs including xd:// and blocks filesystem paths with stable EVO_FS_READ_USE_NAV guidance
- [ ] #3 Repeated violations do not create redirect loops and same-tool replacements are revalidated at most once
- [ ] #4 When sub EVO is active, task dispatch resolves the project-nearest cook profile and blocks with EVO_SUBSTATE_INVALID unless the committed generation, policy/catalog identity, and effective hash match
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New plugins/evo/extensions/evo/routing.ts: canonical routing ladder (Domain operation / Repository orientation / Protocol artifact), stable reason codes EVO_FS_READ_USE_NAV / EVO_SUBSTATE_INVALID / EVO_REPEAT_VIOLATION, isProtocolUri() accepting supported schemes incl. xd://, PerTurnViolationTracker (teach-once + hard-block per tool per turn, reset at turn_start).
2. New plugins/evo/extensions/evo/preflight.ts: preflightSubTaskDispatch(agent, cwd) — while sub evo active, cook-* task dispatch must prove a committed active sub generation: project-nearest profile entry present, owner-cwd binding matches, committed effectiveContentHash equals contentHash(on-disk file) AND live EVO overlay marker present; else block with EVO_SUBSTATE_INVALID prefix referencing /evo-sub.
3. plugins/evo/extensions/index.ts wiring: before_agent_start injects ladder only while mainCtl.isActive(); tool_call hook: sub preflight for task dispatch, protocol-URI read/glob passthrough (incl. xd://), EVO_FS_READ_USE_NAV for fs-path read, teach-once per-tool-per-turn then EVO_REPEAT_VIOLATION; /evo refresh via MainEvoController.refresh; /evo-sub refresh + regenerate via SubEvoController methods.
4. Verify: bun/vitest targeted transactional-main-routing + transactional-sub-policy + typecheck. Do not edit tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan. Verification (plugins/evo, vitest 4.1.11):
- tests/transactional-main-routing.test.ts + tests/transactional-sub-policy.test.ts: 8/9 pass.
- Passed: AC1 ladder injection (before_agent_start returns systemPrompt + ladder containing Domain operation/Repository orientation/Protocol artifact/xd:///persistent eval), AC2 xd:// read passthrough + filesystem read blocked with /^EVO_FS_READ_USE_NAV:/ reason, AC4 task dispatch blocked with /^EVO_SUBSTATE_INVALID:/ + /evo-sub mention when sub generation unprovable (truncated state file), sub policy: least-privilege derivation, versioned generation hashes, conflict restoration, YAML/CRLF round-trips.
- Also wired: /evo refresh, /evo-sub refresh, /evo-sub regenerate (controller methods refresh/regenerate now reachable from commands); teach-once per native tool per turn via PerTurnViolationTracker with EVO_REPEAT_VIOLATION hard-block (no A<->B loops).
- Remaining failure (1/9): "persists the exact original grants and restores them after a process restart" reads ompStateFile() (sub-state.json) for the MAIN generation record; TASK-55.7 moved main-lane recovery authority to ompMainGenerationFile() (main-generation.json) — the assertion is structurally stale (main on can never produce sub-state.json) and flagged for planner test revision (parent-approved).
- extension.test.ts: identical failure set (11) before and after change in both main repo and task workspace — pre-existing EVO_GENERATION_INVALID baseline issues, no regression.
- tsc --noEmit: clean.
<!-- SECTION:NOTES:END -->
