---
id: TASK-21.1
title: Lock /evo-sub’s eval-and-hub contract with RED tests
status: Done
assignee: []
created_date: '2026-08-22 13:07'
updated_date: '2026-08-22 15:06'
labels:
  - feature
  - refactor
dependencies: []
parent_task_id: TASK-21
priority: high
type: feature
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the intended child-profile behavior before production work. “Eval-only” operationally means exactly eval plus hub: hub is the sole exception required to report to Main. The tests must prevent the broad /evo main allowlist, native tools, and MCP tools from leaking into spawned cook profiles, while preserving /evo isolation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests directly define the subagent allowlist as the ordered exact set ["eval", "hub"] regardless of the live main-tool pool
- [x] #2 Tests cover frontmatter round-trip preservation plus idempotent marked body injection with exactly one explicit reporting and survival-pattern block
- [x] #3 Tests prove on then off restores every selected profile byte-for-byte after injection and leaves non-cook profiles untouched
- [x] #4 A source-level regression guard detects a broad main-builder dependency in /evo-sub and preserves the existing /evo broad-tool behavior contract
- [x] #5 The plugin test script is run before production implementation and records intentional RED evidence caused by the new unimplemented contract
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planner authored the RED contract in `~/.omp/omp-evo-mode/tests/extension.test.ts` after backing up the original byte-for-byte outside the plugin tree.

Evidence: `bun run test -- tests/extension.test.ts` → exit 1, 20 tests total, 14 passed, 6 expected RED failures. The failures are the intended missing dedicated builder, marked body injector, exact child surface, cook-only selection, main-builder isolation, and hydrated status size.

The test file compiles under Vitest far enough to execute all 20 cases. The package typecheck script cannot be run successfully yet because `tsc` is absent (exit 127); recorded on the parent as a final-gate prerequisite.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RED contract suite delivered: tests/extension.test.ts extended to 20 tests pinning the /evo-sub revision contracts - buildEvoSubTools() ordered ["eval","hub"]; frontmatter round-trip; single stable EVO_SUB_BRIEF_START body marker; hub reports to Main for findings/status/blockers at milestones+completion; three survival patterns (pre-digested evidence/no exploration homework, file change within ~3 tool calls, single-file ownership); all-six-cook-profiles scope with non-cook control; on/off byte restoration; legacy snapshot hydration; /evo isolation source guard. Run at authoring time: 20 tests, 14 passed, 6 expected RED failures proving every not-yet-built behavior. Pre-edit test file backed up byte-for-byte at ~/.omp/agent/evo-mode/planner-backups/TASK-21/2026-08-22T13-09-06-031Z/ (SHA-256 6f4e2216e41d843484ac9f1afb571bcd0eb14ee989d21a8eb62f634073e36a66).
<!-- SECTION:FINAL_SUMMARY:END -->
