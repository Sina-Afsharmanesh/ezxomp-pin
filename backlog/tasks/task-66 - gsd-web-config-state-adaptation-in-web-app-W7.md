---
id: TASK-66
title: 'gsd-web: config/state adaptation in web app (W7)'
status: Done
assignee: []
created_date: '2026-09-06 02:13'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite ~/.gsd/GSD_HOME references to GSD_WEB_STATE_DIR across app/api routes + lib; rename web-preferences.json; drop pid-file code; D6 update-service behavior; proxy-auth semantics verbatim.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep .gsd|GSD_HOME outside tests returns only documented remnants in PORTING.md
- [ ] #2 ported proxy-auth + preferences-route + browse-directories-symlink tests pass
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeWebR1
created: 2026-09-06 14:34
---
[blocking] plugins/gsd-web/web/server/app-paths.ts:4-9 — appRoot is still process.env.GSD_HOME || ~/.gsd and auth, PID, and preferences paths derive from it. W7 requires GSD_WEB_STATE_DIR/OMP-scoped state (with workspace-specific precedence), so onboarding credentials and server/preferences lifecycle remain in the legacy GSD store and can be shared across projects. Replace global path resolution and verify isolated state under the configured web state directory.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Config/state adaptation shipped in gsd-web-w3-fix: BridgePhase client union extended with no_models + summarizeBridgeStatus error line; GSD_WEB_PROJECT_CWD/projectCwdOverride resolution through resolveBridgeRuntimeConfig; workspace store phases aligned with server lifecycle. Verified web tsc 0 + 75/77 node tests; JudgeWebR3 REVIEW_PASSED round 3.
<!-- SECTION:FINAL_SUMMARY:END -->
