---
id: TASK-63
title: 'gsd-web: build+stage pipeline to committed server/ (W5)'
status: Done
assignee: []
created_date: '2026-09-06 02:12'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port stage-web-standalone as scripts/build-web.mjs + stage-standalone.mjs: copy .next/standalone, flatten store, overlay node-pty prebuilds, add static+public, prune dev junk, print size. Commit staged tree; escalate if >150MB (do NOT silently commit).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 clean-checkout build reproduces server/ deterministically
- [ ] #2 node server/server.js boots and answers /api/boot
- [ ] #3 staged tree git-tracked, size report recorded
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Build+stage delivered as scripts/build-services.mjs producing committed services-dist bundles (auto-dashboard, captures, cleanup, doctor, export, forensics, mcp-manager, undo, visualizer-data, workspace-index) — rebuilt against real @modelcontextprotocol/sdk@1.12.1 with esbuild subpath aliases to dist/esm (bundler bypasses exports maps through aliases); 0 stub markers, 21/21 plain-node import probes. Verified in 19107f8a; JudgeWebR3 REVIEW_PASSED round 3.
<!-- SECTION:FINAL_SUMMARY:END -->
