---
id: TASK-47
title: Wire pstack-suite into the ezxomp marketplace as a first-class plugin
status: Done
assignee: []
created_date: '2026-08-28 22:00'
updated_date: '2026-08-28 22:15'
labels:
  - refactor
  - architecture
dependencies: []
type: feature
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pstack-suite (plugins/pstack-suite) is a full OMP plugin but is not registered in .omp-plugin/marketplace.json, so it could only be installed via omp plugin link (the one documented exception to the marketplace-install invariant from TASK-46). The user confirmed plugins/pstack-suite is the official/canonical location. Wiring: rename the package from @ezxomp/omp-pstack-suite to @ezxomp/pstack-suite to satisfy the repo manifest contract (slug == dir == package name minus @ezxomp/, enforced by test/manifest.test.ts and plugins/AGENTS.md), bump version to the ezxomp convention (1.0.0-ezxomp.0), add the marketplace.json entry + UPSTREAM.json + manifest-test entries, update all current-state doc references, then run the two-phase protocol (docs/omp-marketplace-update.md): Phase 1 re-link under the new name + fresh OMP agent self-check + commit/push; Phase 2 remove the link, install pstack-suite@ezxomp from the marketplace, fresh-agent self-check, leave as-is. Result: all 14 plugins install from the marketplace; the link exception is retired.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Package renamed to @ezxomp/pstack-suite (dir plugins/pstack-suite unchanged); manifest test, marketplace.json, and UPSTREAM.json agree on name + version 1.0.0-ezxomp.0
- [x] #2 just verify green (tsc + full test suite)
- [x] #3 Current-state docs updated (root AGENTS.md, docs/AGENTS.md, docs/authoring-extensions.md, docs/omp-marketplace-update.md exception retired, CLAUDE.md/codex.md/.cursorrules, codesight artifacts, CHANGELOG Unreleased entry)
- [x] #4 User OMP install cut over: pstack-suite@ezxomp installed from the marketplace, old @ezxomp/omp-pstack-suite link removed, 14/14 marketplace installs, doctor clean
- [x] #5 Verified by a fresh OMP agent per phase with the herdr report-back contract (printed report + herdr notification show)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed 2026-08-28. Wiring (commit b8473188, pushed): package rename @ezxomp/omp-pstack-suite -> @ezxomp/pstack-suite (1.0.0-ezxomp.0) in package.json + src/index.ts (PLUGIN_NAME/PLUGIN_VERSION) + coverage test; 4 agents/*.md frontmatter; UPSTREAM.json (born-in-repo); marketplace.json 14th entry; test/manifest.test.ts (EXPECTED_PLUGINS/PACKAGE_IDS/VERSIONS); new plugins/agent-learning/skills/pstack-suite/SKILL.md (catalog now covers all 14 marketplace plugins — this entry was REQUIRED by test/agent-learning.test.ts 'covers every marketplace plugin'); bun.lock synced via bun install; docs updated (root AGENTS.md x2, docs/AGENTS.md, docs/authoring-extensions.md, docs/omp-marketplace-update.md exception retired, CLAUDE.md, codex.md, .cursorrules, .codesight x3, CHANGELOG Unreleased). just verify: 396 pass / 0 fail, all gates passed.
Phase 1 (link): re-linked under new identity; OLD-identity uninstall quirk RECURRED (omp plugin uninstall omp-pstack-suite@ezxomp left the symlink + lock entry — removed manually via fs.rmSync + lock/installed_plugins JSON edit; matches TASK-46 skills quirk). Fresh agent pstack-p1b-omp (pane w3:p18, file-based prompt, report-back contract executed incl. herdr notification show): sources=1 local (pstack) + 13 marketplace, old-identity=GONE, pkg-name=PASS, startup-load-errors=0. NOTE: agent verdict line was FAIL only because my prompt's expectation ('14 local') didn't match the actual phase-1 state for this task (13 already-marketplace plugins + the pstack link under test); all four substantive checks passed — this is a prompt-expectation mismatch, not an install defect. (First attempt on pane w3:p17 failed: pane hosted a running cook agent that hijacked the prompt; fresh pane w3:p18 used.)
Phase 2 (marketplace): omp plugin marketplace update ezxomp (cache at b847318), uninstall pstack-suite@ezxomp (link removed cleanly this time), install pstack-suite@ezxomp -> cache ezxomp___pstack-suite___1.0.0-ezxomp.0, doctor 0w/0e. Fresh agent pstack-p2-omp (pane w3:p19): PSTACK-P2 sources=14 marketplace/0 local, pstack-mkt-tree=PASS (renamed PLUGIN_NAME x8 in marketplace-tree index.ts), startup-load-errors=0, verdict=MARKETPLACE-OK. Herdr notification show gotcha: unquoted subject 'pstack-p2-omp done' parsed 'done' as an option (rc 2); agent self-corrected with quoted subject (rc 0, shown:false reason:disabled).
Final install state: 14/14 marketplace, 0 links — the link exception is retired. Managed skills updated: herdr-omp-validation-agent (pane-reuse + prompt-quoting gotchas), ezxomp-marketplace-sync (exception note now obsolete — all 14 registered).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
pstack-suite is now a first-class ezxomp marketplace plugin (14th entry), installed from the marketplace like all other plugins. Package renamed @ezxomp/omp-pstack-suite -> @ezxomp/pstack-suite (1.0.0-ezxomp.0) to satisfy the manifest contract (slug == dir == package name); directory plugins/pstack-suite unchanged (user-confirmed canonical location). Added UPSTREAM.json, manifest-test entries, and the required agent-learning catalog entry (plugins/agent-learning/skills/pstack-suite/SKILL.md); updated all current-state doc references (root AGENTS.md, docs/AGENTS.md, docs/authoring-extensions.md, docs/omp-marketplace-update.md — link exception retired, CLAUDE.md, codex.md, .cursorrules, codesight artifacts, CHANGELOG). just verify green (396 pass / 0 fail). Two-phase protocol executed per docs/omp-marketplace-update.md: Phase 1 fresh agent pstack-p1b-omp (old identity GONE, pkg-name PASS, 0 load errors) + commit/push b8473188; Phase 2 marketplace cutover + fresh agent pstack-p2-omp verdict=MARKETPLACE-OK (14/14 marketplace, 0 local, pstack probe PASS through the marketplace tree, 0 load errors). Install left as-is: 14/14 marketplace installs, the last link-local exception is retired.
<!-- SECTION:FINAL_SUMMARY:END -->
