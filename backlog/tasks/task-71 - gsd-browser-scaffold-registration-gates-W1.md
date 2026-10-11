---
id: TASK-71
title: 'gsd-browser: scaffold + registration gates (W1)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:22'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold plugins/gsd-browser per plan W1: package.json (omp.extensions src/index.ts, 18.0.6 pin, typebox 1.1.38 devDep, zero runtime deps), UPSTREAM.json (@opengsd/gsd-core v1.12.0), AGENTS/README/LICENSE. Registration hunks carried as REGISTRATION.patch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 manifest test green after wave
- [x] #2 peer pin 18.0.6
- [x] #3 omp.settings keys match adaptation map exactly
- [x] #4 no dependencies block
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:32
---
[blocking] plugins/gsd-browser/src/tools.ts:59-62 — registration exposes only `gsd_browser_fetch`; required guarded-factory surface is six tools (search, fetch, snapshot, navigate, screenshot, status). Snapshot/navigate/screenshot are implemented in a separate module but never registered, search/status are absent, and no factory guard is exercised from the entrypoint. Implement and register the complete six-tool set through the canonical host API.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
gsd-browser scaffold verified on gsd-integration 9cd9092b: manifest test green (434 tests/0 fail incl. gsd-browser triple), peer pin 18.0.6 present, omp.settings keys match adaptation map, no dependencies block (peerDeps only). Plugin final code f91e7a9b (gsd-core-w6w7).
<!-- SECTION:FINAL_SUMMARY:END -->
