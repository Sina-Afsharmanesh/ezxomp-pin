---
id: TASK-108
title: Migrate repository workflows from JJ to Git
status: In Progress
assignee: []
created_date: '2026-09-09 22:04'
updated_date: '2026-09-09 22:07'
labels:
  - refactor
dependencies: []
type: chore
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make native Git with main the repository-management contract. Replace JJ-specific workflow guards, isolation, prompts, documentation, and verification rules while preserving serialized coordinator integration and Backlog evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Repository workflow tools verify and record native Git branch and commit state rather than JJ change or bookmark state
- [ ] #2 Parallel-agent protocol uses isolated Git worktrees, worker branches, serialized coordinator integration, and main-only push authority
- [ ] #3 Project instructions, Cook, Evo, and extensible-workflow guidance contain no active JJ workflow requirement
- [ ] #4 Relevant automated checks and project verification pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace extensible-workflows JJ governance with native Git branch/commit evidence; move selected isolation to guarded git worktrees with task/<slug> branches. Risk: preserve journal anti-forgery and fail-closed path/identity checks.
2. Migrate every active caller, tool/skill/profile prompt, and project workflow document to the Git protocol; remove obsolete JJ configuration and verification hooks. Risk: no stale JJ authority text may remain in active behavior.
3. Add/adjust behavior tests for Git guards and worktree lifecycle, then run targeted tests and just verify. Verify worker branch, commit handoff, serialized main-only push contract.
<!-- SECTION:PLAN:END -->
