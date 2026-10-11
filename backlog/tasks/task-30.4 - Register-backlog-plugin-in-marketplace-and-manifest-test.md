---
id: TASK-30.4
title: Register backlog plugin in marketplace and manifest test
status: Done
assignee: []
created_date: '2026-08-27 05:07'
updated_date: '2026-08-27 05:22'
labels:
  - refactor
dependencies:
  - TASK-30.1
parent_task_id: TASK-30
type: chore
ordinal: 76000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 marketplace.json, EXPECTED_PLUGINS/IDS/VERSIONS updated; manifest.test.ts green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Registered in .omp-plugin/marketplace.json (name backlog, source ./plugins/backlog, 0.1.0-ezxomp.0, born-in-repo attribution). test/manifest.test.ts: EXPECTED_PLUGINS + backlog, EXPECTED_PACKAGE_IDS.backlog=@ezxomp/backlog, EXPECTED_VERSIONS.backlog=0.1.0-ezxomp.0. Cook bumped 0.1.7-ezxomp.3->.4 (package.json + UPSTREAM.json + marketplace + EXPECTED_VERSIONS) since its extension code changes this task. bun test test/manifest.test.ts = 71 pass / 0 fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backlog plugin registered across marketplace + manifest test; manifest suite green (71/71) including new package validity, uniqueness, and provenance checks.
<!-- SECTION:FINAL_SUMMARY:END -->
