---
id: TASK-64
title: 'gsd-web: service layer port + vendored core + services bundling (W3)'
status: Done
assignee: []
created_date: '2026-09-06 02:12'
updated_date: '2026-09-06 20:20'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port src/web/*.ts (28 modules) into web/server/; vendor @gsd/agent-core + @opengsd/contracts modules with PROVENANCE.md (pinned sha); esbuild-bundle service subprocess entrypoints to services-dist/*.mjs keeping GSD_*_MODULE env contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every GSD_*_MODULE env consumer resolves to an existing built file
- [ ] #2 grep @gsd/|@opengsd/ imports outside vendor returns nothing
- [ ] #3 one probe per service family prints JSON from services-dist bundles
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeWebR1
created: 2026-09-06 14:31
---
[blocking] plugins/gsd-web/scripts/build-services.mjs:51-62; web/server/services-dist/workspace-index.mjs:210,4356 — Bundling explicitly externalizes @gsd/native, @gsd/pi-coding-agent, @gsd/pi-ai, @gsd/pi-tui, and @opengsd/contracts although they are not plugin runtime dependencies, leaving unresolved imports in generated service bundles. Independently, a direct Node import of workspace-index.mjs exits 1 with Dynamic require('assert') unsupported from proper-lockfile at generated line 4356. Service subprocess entrypoints cannot boot from a clean standalone install, so W3 AC #1/#3 fail. Vendor/alias runtime dependencies and produce Node-loadable bundles, then probe each service family.
---

author: @JudgeWebR2
created: 2026-09-06 16:14
---
[blocking] plugins/gsd-web/scripts/build-services.mjs:92-103; plugins/gsd-web/web/server/services-dist/mcp-manager.mjs:4-6 — the generated bundles still externalize `@modelcontextprotocol/sdk`, while `plugins/gsd-web/package.json:14-16` declares it only as a devDependency and the committed package `files` list has no runtime node_modules. A clean marketplace install therefore cannot load mcp-manager (and any bundle importing it); local plain-Node probes pass only because this checkout's ignored plugin node_modules supplies the stub. → Bundle the SDK or ship/declare it as a runtime dependency in the staged artifact, then probe from a clean package-shaped tree.
---

author: @JudgeWebR3
created: 2026-09-06 17:01
---
[blocking] plugins/gsd-web/web/server/mcp-management-service.ts:58,101-112,133 — the child receives `GSD_MCP_ACTION: JSON.stringify(action.action)` (a JSON string like "list"), then parses it and dereferences `action.action`; every list/mutation falls through to `Unknown MCP management action: undefined` and the GET route returns a 200 error-shaped payload instead of MCP data. The import branch also references an undeclared `item`, so imports fail even after the envelope is corrected. Fix the action payload/branch variables and exercise GET + each mutation through /api/mcp-connections.
---

author: @JudgeWebR3
created: 2026-09-06 17:09
---
[blocking] plugins/gsd-web/web/server/services-dist/mcp-manager.mjs:3-20 — the rebuilt bundle does not contain the MCP SDK implementation; it embeds plugin-local stub classes whose constructors always throw `MCP client/transport is not available`. Therefore `testMcpServerConnection` can never connect to stdio/HTTP servers, despite the bare-import probe passing. Bundle the real SDK implementation (not a stub) and verify the test action against a fixture server.
---

author: @JudgeWebR3
created: 2026-09-06 17:11
---
[blocking] plugins/gsd-web/web/server/notifications-service.ts:74,90-93; web/server/subprocess-runner.ts:129 — DELETE /api/notifications invokes clearNotificationsData(), whose child writes raw `ok`; shared runSubprocess always JSON.parse(stdout), so successful clearing rejects with an invalid-JSON error and the route returns 500. Emit valid JSON or use a runner mode that accepts an empty/ack output, then exercise DELETE.
---

author: @JudgeWebR3
created: 2026-09-06 17:12
---
[blocking] plugins/gsd-web/web/server/settings-service.ts:72,130,158-166 — the project-scoped child is launched with `cwd: packageRoot` and calls `loadEffectiveGSDPreferences()` / `resolveDynamicRoutingConfig()` without the supported `basePath`; those upstream functions default to `process.cwd()`, so selected-project `.gsd/PREFERENCES.md` is ignored while global/package-root defaults are reported. Pass `GSD_SETTINGS_BASE` to both APIs (and verify a second project with distinct preferences).
---

author: @JudgeWebR3
created: 2026-09-06 17:13
---
[blocking] plugins/gsd-web/web/server/hooks-service.ts:39-47,52-63; web/server/subprocess-runner.ts:86-107 — comments claim the child runs with `projectCwd`, but collectHooksData omits `cwd`, so runSubprocess defaults to packageRoot. `getHookStatus()`/`formatHookStatus()` resolve `.gsd/PREFERENCES.md` from process.cwd(); `GSD_HOOKS_BASE` is never read. A selected project therefore displays package-root hook configuration. Pass `cwd: projectCwd` (or use base-aware APIs) and verify from a different project directory.
---

author: @JudgeWebR3
created: 2026-09-06 17:21
---
[blocking] mcp-management-service.ts:58-112 — child receives GSD_MCP_ACTION=JSON.stringify(action.action), a JSON string, then reads action.action; every operation is treated as undefined/unknown. Import additionally dereferences undeclared item (item.headers and item.source.toolName), so MCP management save/enable/disable/delete/test/import cannot complete. → kickTo implement. [blocking] services-dist/mcp-manager.mjs:4-20 — committed bundle embeds local SDK stub classes whose constructors throw MCP client/transport is not available; service test/connection paths can never connect to configured stdio/HTTP MCP servers despite the bundle being present. → kickTo implement. [blocking] notifications-service.ts:90-93 — clearNotificationsData child writes raw ok while subprocess-runner.ts:129 always JSON.parse(stdout), so DELETE /api/notifications rejects invalid JSON instead of clearing. → kickTo implement. [blocking] settings-service.ts:72,130,158-166 — selected projectCwd is exported as GSD_SETTINGS_BASE but child runs with cwd=packageRoot and calls loadEffectiveGSDPreferences()/resolveDynamicRoutingConfig()/computeBudgets() without basePath; project .gsd/PREFERENCES.md is ignored. → kickTo implement. [blocking] hooks-service.ts:39-63 — selected projectCwd is exported as GSD_HOOKS_BASE but runSubprocess executes with cwd=packageRoot and getHookStatus()/formatHookStatus() have no base argument; project-specific hook preferences are ignored despite the comment claiming cwd was set. → kickTo implement.
---

author: @JudgeWebR3
created: 2026-09-06 20:00
---
[blocking] mcp-management-service.ts:114 — the corrected import branch still passes `transport: action.server.command` rather than `action.server.transport`. serializeServerInput() then treats stdio imports as HTTP and rejects them for missing URL; MCP import remains unusable for every stdio discovered server. → kickTo implement.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
gsd-web service layer shipped at gsd-web-w3-fix 19107f8a: settings/hooks/notifications/mcp-management child services rooted at selected project, bridge service with typed no_models phase + unsupported_command 400 mapping + real @modelcontextprotocol/sdk 1.12.1 bundled (0 stub markers, 21/21 import probes). REVIEW_PASSED by JudgeWebR3 round 3 (11 blockers + 2 follow-ups verified fixed). Gates: web tsc 0, node tests 75/77 (2 pre-existing alias failures documented). Integrated on gsd-integration 9cd9092.
<!-- SECTION:FINAL_SUMMARY:END -->
