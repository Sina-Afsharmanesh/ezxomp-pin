---
id: TASK-110
title: Migrate repository workflows to native Git
status: Done
assignee: []
created_date: '2026-09-10 00:54'
updated_date: '2026-09-10 02:05'
labels:
  - refactor
dependencies: []
type: chore
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace active Jujutsu-specific repository management with native Git while preserving isolated parallel work, coordinator-only integration, and fail-closed workflow governance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parallel work uses task/<slug> Git worktrees and workers deliver branch plus immutable HEAD OID
- [x] #2 Active project rules, profiles, skills, runtime governance, and Plannotator review flows contain no Jujutsu dependency
- [x] #3 Workflow governance rejects detached HEAD and verifies Git root, branch, commit, and status
- [x] #4 Repository gate passes with the Git workflow configuration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map active Jujutsu references and replace repository contract with docs/parallel-agents.md native Git worktree protocol.
2. Migrate Cook, extensible-workflows, Plannotator, skills, manifests, and durable documentation; retain historical references only.
3. Verify source/profile synchronization, targeted governance contracts, Fallow gate, and full just verify; record any gate blocker with evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: `bun test test/workflowz-p1-contracts.test.ts test/workflowz-governance.test.ts test/workflowz-p0-tools.test.ts` passed 47 tests. Cook profile synchronization passed 30 tests and refreshed `.omp/agents` from shipped Git templates. Full `just verify` passed: TypeScript check, 523 passing tests with 17 skips, and Fallow new-only audit with zero introduced dead-code, complexity, or duplication findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced active Jujutsu repository management with native Git task worktrees and fail-closed Git governance. Verified by targeted workflow/Cook contracts and full `just verify`.
<!-- SECTION:FINAL_SUMMARY:END -->
