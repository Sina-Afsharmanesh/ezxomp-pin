---
id: TASK-30.3
title: Rewire cook to consume @ezxomp/backlog and purge duplicates
status: Done
assignee: []
created_date: '2026-08-27 05:07'
updated_date: '2026-08-27 05:33'
labels:
  - refactor
dependencies:
  - TASK-30.1
  - TASK-30.2
parent_task_id: TASK-30
type: chore
ordinal: 75000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zero backlog tool/config definitions left in plugins/cook/extensions
- [x] #2 Cook compiles importing registerBacklogTools+helpers+standards from @ezxomp/backlog
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewire complete. Cook now consumes @ezxomp/backlog: index.ts imports helpers+BACKLOG_QUALITY_STANDARDS from package root and registerBacklogTools from extensions/tools.ts; state.ts/watch.ts/cook-tools.ts import helpers from package; types.ts re-exports TaskInfo type (dedup); inline quality-standards array replaced by imported constant (byte-identical: leading/trailing empty lines preserved by constants starting/ending pattern; injected string equality verified). DELETED cook/extensions/backlog-tools.ts + backlog-helpers.ts (clean cutover, zero re-export shims). cook/AGENTS.md DOX updated (module list + no-redefinition contract). Explicit dependencies {"@ezxomp/backlog": "workspace:*"} added to cook package.json following skillforge precedent - this also resolved an unintended install-time hoisting shift that had surfaced 276 strict @types/node v26 errors in plannotator (now 0). Package-root export of registerBacklogTools initially missing (TS2614): fixed by importing from tools.ts directly - kept deliberate so tools.ts remains importable without loading instructions module. tsc delta: cook 294->78, backlog +217 verbatim carryover, plannotator 0 (restored), lean-ctx 8 unchanged; total 302 == stale-workspace baseline, zero new error classes (only pre-existing TS2322 typebox + TS18046 params).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cook purged of all backlog definitions and rewired onto @ezxomp/backlog via workspace dependency; behavior preserved (verbatim constant reuse); zero new type errors vs baseline; plannotator regression found during verification and fully repaired.
<!-- SECTION:FINAL_SUMMARY:END -->
