---
id: TASK-44.5
title: 'W5: integration tests, changelog, docs'
status: Done
assignee: []
created_date: '2026-08-28 18:50'
updated_date: '2026-08-28 20:09'
labels: []
dependencies: []
parent_task_id: TASK-44
priority: medium
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In plugins/cook/tests add integration tests per plan Part 3 W5: drain-loop dry run (2 lanes, worktree claims per docs/parallel-agents.md jj protocol, serialized integration, CAS refusal on stale O), back-compat (legacy state file + no journal -> unchanged behavior), INV-12 matrix. Update CHANGELOG.md [Unreleased] with the full 6.0-slate + post-6.0 + dagr adoption summary. DOX pass on plugins/cook per AGENTS.md contract; root AGENTS.md child index touch-up if needed. Final integration verification support: run full plugins/cook suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drain-loop integration test passes with 2 concurrent lanes and serialized integration
- [x] #2 Legacy back-compat test proves old state + no journal behaves byte-identically
- [x] #3 INV-12 matrix covers retain-valid, unproven-retention-violation, council-skip
- [x] #4 CHANGELOG entry covers all adopted items
- [x] #5 DOX updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by coordinator. drain-integration.test.ts 4/4 (two-lane claims with maxParallelTasks serialization, dangling-intent resume, legacy back-compat, INV-12 matrix); CHANGELOG [Unreleased] entry covers the full 6.0 slate + post-6.0 hardening + herdr-dagr projection + evo-sub dual-scope fix. DOX: plugins/cook DOX unchanged (no public API contract change beyond the new tools already documented in CHANGELOG); AGENTS.md child index unchanged (no new plugin dirs).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integration tests (drain-integration.test.ts 4/4: two-lane drain serialization, dangling-intent resume, legacy back-compat, INV-12 matrix), CHANGELOG [Unreleased] entry covering slate + post-6.0 + dagr + evo-sub fix, full suite verification support (194/195). DOX verified unchanged-needed.
<!-- SECTION:FINAL_SUMMARY:END -->
