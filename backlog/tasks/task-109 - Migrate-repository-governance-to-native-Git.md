---
id: TASK-109
title: Migrate repository governance to native Git
status: In Progress
assignee: []
created_date: '2026-09-09 23:19'
labels:
  - refactor
dependencies: []
priority: high
type: task
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace active Jujutsu-specific repository workflow and Plannotator review support with native Git, keeping `main` authoritative and preserving only historical records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operational docs, agent profiles, and skills describe Git worktrees and Git `main` governance without active Jujutsu procedures.
- [ ] #2 Plannotator local review detects and serves Git and GitButler only; it ships no Jujutsu provider, diff modes, or JJ CLI hooks.
- [ ] #3 Repository checks reject detached HEAD and require a clean Git `main` coordinator state before integration or push.
- [ ] #4 Relevant targeted tests and bundle verification pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove Jujutsu-only repository governance, profile, skill, and specification instructions while preserving changelog and backlog history.
2. Strip Jujutsu provider, diff modes, workspace mappings, review prompts, CLI runtime, and tests from Plannotator generated runtime artifacts; remove stale upstream manifest/vendor entries.
3. Rebuild the tracked Plannotator bundle, run focused review tests plus repository and bundle checks, then record objective evidence.
<!-- SECTION:PLAN:END -->
