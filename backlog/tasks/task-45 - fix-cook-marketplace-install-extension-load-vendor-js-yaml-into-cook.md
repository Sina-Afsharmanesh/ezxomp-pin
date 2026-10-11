---
id: TASK-45
title: 'fix cook marketplace-install extension load: vendor js-yaml into cook'
status: Done
assignee: []
created_date: '2026-08-28 21:16'
updated_date: '2026-08-28 21:17'
labels:
  - bug
dependencies: []
references:
  - docs/authoring-extensions.md
  - plugins/evo/vendor/VENDORED.md
  - plugins/cook/vendor/VENDORED.md
type: bug
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
@ezxomp/cook failed to load under OMP marketplace install: extensions/config.ts and extensions/agents.ts imported js-yaml via cross-plugin relative path ../../evo/vendor/js-yaml.mjs, which only resolves in the repo working copy. Each plugin is copied to its own ~/.omp/plugins/cache/plugins/<name>@<version> tree by the marketplace installer (no npm/bun install), so cook raised "Cannot find module '../../evo/vendor/js-yaml.mjs?mtime=...'" (user-reported startup warning). Fix: vendored js-yaml 4.3.1 + argparse 2.0.1 into plugins/cook/vendor (byte-identical copy of plugins/evo/vendor), switched imports to local ../vendor/js-yaml.mjs, added vendor to package.json#files, bumped 0.1.7-ezxomp.4 -> 0.1.7-ezxomp.5 across package.json/UPSTREAM.json/.omp-plugin/marketplace.json/test/manifest.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cook extensions load without 'Cannot find module' for js-yaml under the marketplace install layout (separate per-plugin cache trees)
- [x] #2 just verify (tsc + bun test + fallow audit) passes
- [x] #3 version bump synced across package.json, UPSTREAM.json, .omp-plugin/marketplace.json, test/manifest.test.ts
- [x] #4 CHANGELOG.md records the fix
- [x] #5 user-scope OMP installation carries the fix and a fresh OMP session starts with no cook load warning
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in same session as creation. Commit e308c662 on main (pushed to origin/main, verified via git ls-remote). Verification: (1) just verify green — tsc, 392 pass / 0 fail, fallow audit clean; (2) marketplace simulation per authoring-extensions.md — clean temp tree, cook copied without node_modules, symlinked as @ezxomp/cook: both extension files import and yaml roundtrip OK; (3) ozm plugin doctor 17 ok / 0 warnings / 0 errors after re-linking all 14 plugins; (4) fresh OMP agent spawned under Herdr in a split pane — new session logs (pids 3202303/3203142) show 0 cook load errors; only the pre-fix long-lived session (pid 3175917) carries the stale failure line, matching the reported ?mtime=1787950770926 error exactly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Vendored js-yaml@4.3.1 + argparse@2.0.1 into plugins/cook/vendor (copy of plugins/evo/vendor, ESM wrapper + licenses) and switched extensions/config.ts + extensions/agents.ts to local ../vendor/js-yaml.mjs; added vendor to package.json#files; bumped cook to 0.1.7-ezxomp.5 in all four sync points. Verified: just verify green (tsc + 392 tests + fallow), clean-tree marketplace simulation loads both extension files, doctor 17ok/0warn/0err after full re-link, and a fresh OMP session spawned via Herdr shows zero cook load errors (pre-fix session's stale error line matches the user-reported warning exactly). Commit e308c662 pushed to origin/main.
<!-- SECTION:FINAL_SUMMARY:END -->
