---
id: TASK-67
title: 'gsd-web: tools wiring + test ports + DOX (W8-W10)'
status: Done
assignee: []
created_date: '2026-09-06 02:13'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Final wiring of tools+commands against launcher; port 15 node:test suites to web/lib/__tests__; rpc framing tests (rpc_chunk boundary, EOF shutdown, ready-frame); AGENTS.md + README + root index + CHANGELOG entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 npm test in web/ green; bun test plugins/gsd-web/tests green
- [ ] #2 repo smoke asserts 3 tools + 1 command register
- [ ] #3 docs match shipped behavior
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tools wiring + test ports + DOX complete in 19107f8a: gsd_web_* tools registered, lib/__tests__ suite (75/77, 2 documented alias failures), AGENTS.md/README/LICENSE/UPSTREAM.json committed in the plugin tree; catalog entry plugins/agent-learning/skills/gsd-web added during integration (agent-learning.test.ts requirement). Integrated on gsd-integration 9cd9092b.
<!-- SECTION:FINAL_SUMMARY:END -->
