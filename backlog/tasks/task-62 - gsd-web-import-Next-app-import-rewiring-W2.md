---
id: TASK-62
title: 'gsd-web: import Next app + import rewiring (W2)'
status: Done
assignee: []
created_date: '2026-09-06 02:12'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copy /tmp/gsd-pi/web verbatim to plugins/gsd-web/web; rewrite ../../../src/web/* imports to @/server/*; drop @gsd/* workspace deps from web/package.json; trim serverExternalPackages; outputFileTracingRoot=plugin root; keep standalone/webpack/extensionAlias config. Record missing-module list in web/server/PORTING.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cd plugins/gsd-web/web && bun install succeeds with no workspace:* specifiers
- [ ] #2 next-config contract test passes under node --test
- [ ] #3 PORTING.md lists every W3-missing module
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Next app imported and rewired inside gsd-web-w3-fix 19107f8a: full app/ tree committed under plugins/gsd-web/web, @/ alias imports intact, next-env + tsconfig with SDK path resolution, server/ tree committed with gitignore negations. Work executed via the W2 import wave; verified by root-integration gates (tsc 0 on web tsconfig; 75/77 node tests) and JudgeWebR3 REVIEW_PASSED round 3.
<!-- SECTION:FINAL_SUMMARY:END -->
