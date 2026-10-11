---
id: TASK-111
title: 'gsd-web: restore discovered MCP server import'
status: Done
assignee: []
created_date: '2026-09-10 02:42'
updated_date: '2026-09-10 02:59'
labels:
  - bug
  - backend
dependencies: []
modified_files:
  - CHANGELOG.md
  - plugins/gsd-web/web/lib/command-surface-store.ts
  - plugins/gsd-web/web/server/mcp-management-service.ts
  - test/gsd-web-mcp-import.test.ts
type: bug
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GSD Web discovers compatible MCP servers but serializes their transport incorrectly during import, preventing valid stdio configurations from becoming project-local .gsd/mcp.json entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing a discovered stdio MCP server persists a project-local server with transport stdio and its command
- [x] #2 MCP manager rejects malformed transport and accepts valid stdio input without external config mutation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repair mcp-management-service import payload to forward its typed discovered transport, not command text.
2. Exercise staged MCP manager with malformed and stdio payloads in a temp project; confirm expected serialization.
3. Run web package type check or targeted tests available without altering external MCP configs.
Risk: generated child script is executed in standalone Node, so preserve its existing provider/module loading and response shape.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: bun test test/gsd-web-mcp-import.test.ts test/gsd-web.settings.test.ts passed (7 tests). npm run build produced standalone runtime; live POST /api/mcp-connections imported stdio server and persisted type plus command. just verify passed: 525 pass, 17 skip, 0 fail; Fallow passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed discovered stdio MCP imports to preserve transport and command. Added temp-project regression coverage for valid stdio and rejected unsupported transports. Verified direct tests, Next standalone endpoint smoke, npm run build, and just verify.
<!-- SECTION:FINAL_SUMMARY:END -->
