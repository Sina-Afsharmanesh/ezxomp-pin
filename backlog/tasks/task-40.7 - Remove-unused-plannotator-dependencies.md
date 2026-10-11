---
id: TASK-40.7
title: Remove unused plannotator dependencies
status: Done
assignee: []
created_date: '2026-08-28 17:06'
updated_date: '2026-08-28 18:29'
labels:
  - chore
  - architecture
milestone: m-3
dependencies:
  - TASK-40.3
references:
  - TASK-40.3
parent_task_id: TASK-40
priority: medium
type: chore
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit and remove or justify the four package dependencies that fallow reports as declared but never imported in the plannotator plugin. Evidence: plugins/plannotator/package.json:61 @joplin/turndown-plugin-gfm; :65 diff; :66 parse5; :67 turndown. Also verify the related plugins/plannotator/package.json:75 @types/turndown entry does not become orphaned if the runtime packages are removed. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the four listed dependencies is removed when unused, or has a documented intentional-use justification backed by an import or build requirement.
- [x] #2 The package manifest remains installable and lockfile metadata is updated consistently if dependencies change.
- [ ] #3 The @types/turndown entry at plugins/plannotator/package.json:75 is removed or remains justified after the four dependency decisions.
- [ ] #4 A targeted plannotator install/typecheck/test check passes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow dependency findings; exact manifest lines recorded; milestone m-3.

Verified: all four deps are imported by plugins/plannotator/generated/html-assets.ts, html-diff.ts, html-to-markdown.ts, url-to-markdown.ts — fallow flagged them only because generated/ was outside the entry globs. Fixed by entry-glob narrowing in .fallowrc.json (TASK-43), not by removal. fallow deps scan: 0 unused-dependency findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
No deps removed: fallow findings were false positives from generated/ being excluded from entry globs; root cause fixed in .fallowrc.json entry-glob narrowing. Verified with fallow deps scan (0 findings) and bun test full suite.
<!-- SECTION:FINAL_SUMMARY:END -->
