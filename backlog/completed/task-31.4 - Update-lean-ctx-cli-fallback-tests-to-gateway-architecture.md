---
id: TASK-31.4
title: Update lean-ctx cli-fallback tests to gateway architecture
status: Done
assignee: []
created_date: '2026-08-27 14:07'
updated_date: '2026-08-27 14:20'
labels:
  - bug
  - tech-debt
dependencies: []
parent_task_id: TASK-31
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
3 tests in plugins/lean-ctx/tests/collapsed-surface-cli-fallback.test.ts assert the removed per-call pi.exec('lean-ctx', ['call', ...]) dispatch path. Commit 06b205be replaced it with the shared module-scope MCP gateway (ensureGateway().callTool); tests were never migrated and now fail (33 pass / 3 fail in the plugin suite). gateway.test.ts (7/7) covers the new path. Judge ruling on TASK-31.1 closure: FOLLOW-UP, not blocking.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 collapsed-surface-cli-fallback.test.ts mocks ensureGateway().callTool instead of pi.exec
- [x] #2 All 3 tests pass; lean-ctx plugin suite is 36/36
- [x] #3 Assertions cover: JSON forwarding to callTool, structured CLI failure mapping, non-zero exit error mapping
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read tests/collapsed-surface-cli-fallback.test.ts fully + gateway.test.ts mock pattern + extensions/gateway.ts exports.
2. Replace pi.exec mocks with vi.mock of ../extensions/gateway.ts (ensureGateway) in the 3 failing tests; keep freshExtension module-reset flow working.
3. Test 1: ensureGateway resolves { callTool: vi.fn(async () => decodedResult) }; assert callTool('ctx_compose', payload) called once with exact args; result deep-equals decodedResult.
4. Test 2: callTool returns { content: [...], isError: true }; assert structured error result mapping (structuredCliError shape).
5. Test 3: callTool rejects (simulated non-zero CLI exit); assert structured error result, no throw.
6. Verify: cd plugins/lean-ctx && bunx vitest run -> 36/36; bunx tsc --noEmit -> 0 errors.
Risk: gateway module-scope singleton persists across tests — must vi.resetModules() + mock before freshExtension import (mirror existing __mocks__ pattern); ensure afterEach dispose if gateway.test.ts does so.
Verification checkpoint: 36/36 green, tsc 0, no production source changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migrated tests/collapsed-surface-cli-fallback.test.ts to gateway architecture (TASK-31.4). Replaced per-call pi.exec('lean-ctx', ['call', ...]) mocks with vi.mock('../extensions/gateway') using vi.hoisted state: ensureGatewayMock resolves { callTool: callToolMock }; disposeAllGateways exported as no-op (index.ts only imports ensureGateway, but the mock exports it for safety). Mock registered before freshExtension()'s dynamic import so index.ts binds the mocked ensureGateway. Test 1: callTool resolves decodedResult; asserts ensureGateway(ctx.cwd) called, callTool called exactly once with ('ctx_compose', payload), result deep-equals decodedResult. Test 2: callTool resolves {content:[{type:'text',text:'boom'}], isError:true}; asserts structuredCliError mapping (isError true, text contains 'boom' and tool name). Test 3: callTool rejects Error('exit code 1: lean-ctx call failed'); asserts execute resolves (no throw) with structured error containing 'exit code 1'. beforeEach resets callToolMock/ensureGatewayMock; afterEach vi.restoreAllMocks kept. Verification: bunx vitest run tests/collapsed-surface-cli-fallback.test.ts -> 3/3 pass; full suite -> 36/36 pass (7 files); root bunx tsc --noEmit -> exit 0. Note: full suite reports 1 pre-existing unhandled rejection from tests/collapsed-surface-expansion.test.ts (real lean-ctx spawn ENOENT, occurs when run alone too, file untouched by this change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated 3 collapsed-surface-cli-fallback tests from removed pi.exec dispatch to ensureGateway().callTool mocks (vi.hoisted + vi.mock before dynamic import). Verified: lean-ctx vitest 36/36 (7 files), tsc --noEmit exit 0. Commit 3fdacc61 on origin/main. Judge (WorldwideToucan): APPROVE — AC1/AC2/AC3 all PASS, no BLOCKING. Pre-existing ENOENT in expansion.test.ts ruled out of scope (separate debt: missing HAS_LEAN_CTX guard).
<!-- SECTION:FINAL_SUMMARY:END -->
