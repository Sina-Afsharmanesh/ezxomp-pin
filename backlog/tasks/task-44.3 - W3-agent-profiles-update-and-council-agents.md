---
id: TASK-44.3
title: 'W3: agent profiles update and council agents'
status: Done
assignee: []
created_date: '2026-08-28 18:50'
updated_date: '2026-08-28 20:08'
labels: []
dependencies: []
parent_task_id: TASK-44
priority: high
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update plugins/cook/agents/*.md per plan Part 2 (Agent profiles section): cook-planner.md (context-packet ownership + refresh-on-re-entry, complexity marking, plan-split escalation fork, fake-edge decomposition guidance); cook-worker.md (factual maintenance duties: only facts directly verified/created/moved, no scope expansion, no conclusions); cook-judge.md (typed findings contract in returns, read-only packet stance, AC-integrity rule never pass with unverified AC, dual-review decorrelation briefs); cook-validator.md (gate event journaling, red-gate semantics); NEW cook-council.md + cook-council-synthesis.md (3 blind inquiry + 1 synthesis, per-finding votes, one typed recovery route). Bump COOK_AGENTS_VERSION + freshness marker in extensions/agents.ts; spawn authority: council dispatch from orchestrator only; update evo-sub sync/allowlists. Extend tests/cook-agents.test.ts: new profiles install, freshness marker, allowlist grants.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 6 existing profiles updated with their Part 2 duties
- [x] #2 cook-council.md and cook-council-synthesis.md created and installable
- [x] #3 COOK_AGENTS_VERSION bumped; sync test green
- [x] #4 Council spawn authority restricted to orchestrator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by worker W3 (patch applied by coordinator). All 6 existing profiles updated; cook-council.md + cook-council-synthesis.md created (read-only, no task tool); COOK_PROFILE_FILE_MAP exports 8 profiles, COOK_AGENTS_VERSION 0.1.7-ezxomp.7; cook-agents.test.ts 21/21 (90 expect calls). Coordinator additions: Terminal Yield Contract appended to both council profiles (contract test caught the gap); evo-sub allowlists updated (COOK_SUB_PROFILES + SUB_ROLE_TOOLS read-only codesight grants) as coordinator integration step; evo-sub dual-scope fix (project-local profiles now rewritten by /evo-sub on|off) with regression test evo-sub-dual-scope.test.ts 3/3.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
8 agent profiles landed (6 updated + cook-council.md + cook-council-synthesis.md, read-only, orchestrator-only spawn authority); COOK_AGENTS_VERSION bumped to 0.1.7-ezxomp.7 with COOK_PROFILE_FILE_MAP; evo-sub allowlists wired for council profiles; evo-sub dual-scope profile rewrite fixed with regression test. Verified by cook-agents.test.ts 21/21 and evo-sub-dual-scope.test.ts 3/3.
<!-- SECTION:FINAL_SUMMARY:END -->
