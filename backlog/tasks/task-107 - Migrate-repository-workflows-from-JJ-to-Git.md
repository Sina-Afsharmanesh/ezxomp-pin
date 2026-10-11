---
id: TASK-107
title: Migrate repository workflows from JJ to Git
status: In Progress
assignee: []
created_date: '2026-09-09 21:57'
updated_date: '2026-09-09 23:02'
labels:
  - refactor
dependencies: []
type: task
ordinal: 227000
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
1. Replace workflow governance evidence, repository guard, and isolation adapter with Git root/status/branch/commit probes plus native git worktrees.
2. Preserve fail-closed identity and journal provenance while renaming JJ fields and gate IDs to Git equivalents.
3. Replace Cook, Evo, project rules, skills, runbooks, tests, and tool config with one Git-main protocol; delete obsolete JJ-only docs.
4. Verify targeted contracts, then run just verify.
Risk: existing .jj state includes active user workspaces; leave it local and untracked as archival state. Do not delete it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit found Plannotator runtime still selected a full JJ VCS provider, exposed JJ review modes/prompts, and kept a JJ-only integration test. This falls within AC1/AC3: remove the provider and generated JJ artifacts, retain Git/GitButler review support, regenerate the shipped bundle, and verify the local Git review path.
<!-- SECTION:NOTES:END -->
