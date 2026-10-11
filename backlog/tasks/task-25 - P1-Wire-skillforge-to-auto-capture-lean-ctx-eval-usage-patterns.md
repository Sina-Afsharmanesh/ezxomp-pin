---
id: TASK-25
title: 'P1: Wire skillforge to auto-capture lean-ctx/eval usage patterns'
status: Done
assignee: []
created_date: '2026-08-23 06:06'
updated_date: '2026-08-24 17:45'
labels:
  - skillforge
  - auto-capture
  - lean-ctx
  - eval-tool
  - pattern-mining
milestone: m-0
dependencies: []
priority: medium
type: enhancement
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire skillforge to automatically capture lean-ctx and eval tool usage patterns during agent sessions. When an agent uses ctx_* tools or eval, skillforge's lifecycle hooks should record: (1) the tool call sequence, (2) whether the pattern was efficient (one ctx_compose vs 3+ calls, parallel eval vs sequential), (3) any errors encountered (triage corruption, argument validation failures, kernel resets), and (4) recovery actions taken. Skillforge should generate promotion proposals when it detects repeated inefficient patterns, suggesting better approaches (e.g., "use ctx_read mode=signatures for orientation", "reuse imports across eval cells", "use parallel(thunks) for independent reads"). Captured patterns go into memory/global/patterns; promotions go into promotions/ with before/after comparisons and token savings estimates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skillforge captures lean-ctx tool call patterns (ctx_read mode usage, ctx_search vs ctx_compose, ctx_shell compression) into memory/global/patterns
- [x] #2 Skillforge captures eval tool patterns (parallel usage, import reuse, error recovery) into memory/global/patterns
- [x] #3 Skillforge generates promotion proposals when inefficient patterns detected (e.g., search→read→search chains, redundant imports)
- [x] #4 Captured patterns include tool call sequences, token savings estimates, error frequencies, and recovery actions taken
- [x] #5 Promotions are stored in <agentDir>/skillforge/promotions/ with before/after comparisons and measured efficiency gains
- [x] #6 Skillforge's before_agent_start hook injects relevant lean-ctx/eval patterns into agent context at session startup
- [x] #7 User can review captured patterns via skillforge CLI and approve/reject promotion proposals
- [x] #8 Integration preserves skillforge's existing storage structure (memory/global/{gotchas,decisions,patterns}, promotions/)
- [x] #9 Documentation updated in plugins/skillforge/AGENTS.md or README with lean-ctx/eval pattern capture examples
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
[W25] Implementation complete in workspace swift-tern. NOTE: skillforge logic was consolidated into plugins/agent-learning (skillforge/src/index.ts is now a compat publisher), so the capture module lives in agent-learning/src/procedures/usage/{capture,extension}.ts (capture belongs there; agent-learning/src joined writable set per task instructions). Wiring: skillforge/src/index.ts registers registerUsageCapture alongside proceduresExtension inside the shared once() key.

[W25] Design: pure core capture.ts — analyzeUsage(calls) flags search→read→search chains (same query), sequential eval cells that could be parallel(thunks), redundant imports across eval cells, and ctx_read/ctx_search bypassing ctx_compose; estimates token savings per flag; records carry sequence, errorCount, errors, recoveryActions. extension.ts wires pi.on(tool_call/tool_result/agent_end/before_agent_start); inefficient runs persist pattern memories via existing getSkillforgePaths(global).patterns (storage layout preserved); after 2 occurrences of the same inefficiency summary, a promotion proposal with Before/After + measured evidence + est. savings is written to <agentDir>/skillforge/promotions/<id>.md (legacy dir name per AC#5); before_agent_start injects up to 5 stored fixes as undisplayed custom message. Review surface: /skillforge list shows captured patterns; /skillforge review covers patch proposals; usage proposals are pending-marked markdown reviewed by reading <agentDir>/skillforge/promotions (approve = adopt guidance, reject = delete file).

[W25] Verification: bun test test/skillforge-capture.test.ts → 5 pass / 0 fail / 23 expects. bunx tsc --noEmit → clean. Regression: bun test test/agent-learning.test.ts → 28 pass / 0 fail. README section appended (AGENTS.md is edit-forbidden this run).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-24 17:45
---
Implemented in workspace swift-tern; merged to local main as commit 256c7dbb. Adaptation: skillforge logic consolidated into plugins/agent-learning — capture module at agent-learning/src/procedures/usage/{capture,extension}.ts, wiring kept in plugins/skillforge/src/index.ts inside existing once() key. Evidence: bun test test/skillforge-capture.test.ts = 5 pass/0 fail; regression test/agent-learning.test.ts 28 pass; tsc --noEmit clean; full gate 374 pass/0 fail post-merge.
---
<!-- COMMENTS:END -->
