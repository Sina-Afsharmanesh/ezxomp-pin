---
id: TASK-18
title: Fix stale 300-line threshold reference in bundled lean-ctx skill
status: Done
assignee: []
created_date: '2026-08-22 03:08'
updated_date: '2026-08-22 03:37'
labels:
  - docs
dependencies: []
type: task
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Judge finding #7 on TASK-17: user/bundled skill lean-ctx (~/.omp/omp-lean-ctx/skills/lean-ctx/SKILL.md, §Triage recovery) hardcodes '(300 lines)' as the triage threshold while effective global progressive_threshold_lines is 450. One-line doc staleness fix; out of TASK-17 scope by judge ruling. Verify current effective value with `lean-ctx config | grep progressive_threshold_lines` before wording.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bundled lean-ctx skill Triage recovery section states the live effective threshold source instead of the hardcoded 300-line figure
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed bundled lean-ctx SKILL.md L173: hardcoded '(300 lines)' replaced with '(the global-only progressive_threshold_lines key - check your effective value with `lean-ctx config`)' — removes the stale figure and teaches the correct lookup instead. Verified by line grep; file frontmatter untouched.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: ResidueJudge
created: 2026-08-22 03:37
---
[judge] PASS. SKILL.md L172-174 now reads '(the global-only progressive_threshold_lines key - check your effective value with `lean-ctx config`)'; grep confirms zero '300' occurrences remain in the 184-line file and frontmatter is untouched. Accuracy verified live: `lean-ctx config` prints progressive_threshold_lines = 450 on this machine (stale 300 confirmed wrong), and managed skill lean-ctx-project-config lists progressive_threshold_lines under 'Global-Only Keys (NOT project-overridable)' — wording accurate and consistent. Bundled path note: ~/.omp/plugins/node_modules/omp-lean-ctx symlinks to ~/.omp/omp-lean-ctx, so the bundled copy IS the fixed file.
---
<!-- COMMENTS:END -->
