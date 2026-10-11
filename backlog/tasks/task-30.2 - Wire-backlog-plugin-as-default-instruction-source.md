---
id: TASK-30.2
title: Wire backlog plugin as default instruction source
status: Done
assignee: []
created_date: '2026-08-27 05:07'
updated_date: '2026-08-27 05:21'
labels:
  - feature
dependencies:
  - TASK-30.1
parent_task_id: TASK-30
type: feature
ordinal: 74000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 before_agent_start hook injected unconditionally with Backlog.md workflow + quality standards overlay
- [x] #2 BACKLOG_QUALITY_STANDARDS exported for cook reuse
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in plugins/backlog/extensions/index.ts: pi.on('before_agent_start') registered UNCONDITIONALLY by the default export (no chain/cookmode gate), appending defaultOverlay() = BACKLOG_OVERVIEW + BACKLOG_TASK_CREATION + BACKLOG_TASK_EXECUTION + BACKLOG_TASK_FINALIZATION + BACKLOG_QUALITY_STANDARDS to event.systemPrompt (appended after host prompt so project/user rules keep precedence). Guide strings are verbatim 'backlog instructions' output captured at build time from backlog.md 1.50.1 CLI. BACKLOG_QUALITY_STANDARDS exported from the package root for cook reuse. Verified by smoke tests 3 ('injects default overlay unconditionally before every agent start' asserts systemPrompt[1] contains Overview + Quality Standards + Creation Guide) and 4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Default instruction source wired: unconditional before_agent_start overlay hook in backlog plugin entry; BACKLOG_QUALITY_STANDARDS exported; behavior proven by passing vitest overlay test.
<!-- SECTION:FINAL_SUMMARY:END -->
