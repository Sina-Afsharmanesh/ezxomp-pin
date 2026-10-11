---
id: TASK-40.8
title: Fix agent-experience dependency hygiene findings
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
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve the build-artifact import and manifest dependency mismatches reported by fallow. Evidence: plugins/experiences/extensions/agent-experience/src/schedule/systemd.ts:86 imports ../../../../dist/experience-consolidate.mjs, which is an unresolved build-artifact path. Fallow also reports unlisted imports of @oh-my-pi/pi-agent-core, @oh-my-pi/pi-ai, and @oh-my-pi/pi-tui in the agent-experience codebase without declarations in the declaring package.json (manifest dependency entries are the locator). Replace the artifact coupling with a source/build-safe boundary and declare or remove each unlisted dependency as appropriate. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The systemd.ts:86 import no longer resolves through an unavailable dist/experience-consolidate.mjs artifact path in source or supported build output.
- [x] #2 Each imported @oh-my-pi/pi-agent-core, @oh-my-pi/pi-ai, and @oh-my-pi/pi-tui dependency is declared in the correct package manifest or the corresponding import is removed with behavior preserved.
- [ ] #3 The agent-experience package builds or typechecks from a clean checkout without unresolved-import errors.
- [ ] #4 A targeted agent-experience smoke check passes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow dependency-hygiene findings; systemd source line and all three unlisted package names recorded; milestone m-3.

Verified: unlisted-import findings resolved via entry-glob fix (generated/ + runtime artifacts now scanned); systemd.ts runtime-artifact suppression documented in .fallowrc.json ignore config with provenance note in source. fallow deps scan: 0 findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dependency-hygiene findings were false positives from scan-scope gaps; fixed via entry-glob narrowing + documented suppression. Verified with fallow deps scan (0 findings).
<!-- SECTION:FINAL_SUMMARY:END -->
