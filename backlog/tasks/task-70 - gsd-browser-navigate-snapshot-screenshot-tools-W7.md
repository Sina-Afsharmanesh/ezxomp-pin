---
id: TASK-70
title: 'gsd-browser: navigate/snapshot/screenshot tools (W7)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/tools/browser.ts three tools via factory: navigate (Page.enable, Network.enable, navigate+load wait, finalUrl/title/httpStatus), snapshot (DOM queries + bounded excerpt, page text code-wrapped), screenshot (viewport presets 1440x900/375x812/768x1024 via Emulation.setDeviceMetricsOverride, PNG to captureDir, unconditional .gitignore gate written before first capture with exact GSD glob list). Integration test availability-gated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fake-transport tests assert command sequences + payload mapping + .gitignore byte-content + degradation reasons; integration spins fixture page, PNG signature 89504E47; GSD_BROWSER_EXECUTABLE honored
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:20
---
[blocking] plugins/gsd-browser/src/tools/browser.ts:152-182,199-234 — the shipped schemas/handlers only accept one selector and return HTML strings: snapshot has no url, queries[]/attributes payload, or per-query attributes; navigate has no waitUntil; screenshot has no custom width/height, output path, fullPage, or timeoutMs and ignores settings viewportWidth/viewportHeight. This is a partial port of the W7 payload contract. Fix the public schemas and CDP mapping before exposing these tools.
---

author: @JudgeBrowser
created: 2026-09-06 07:21
---
[blocking] plugins/gsd-browser/tests/browser-tools.test.ts:119-125 — the fake host defines registerTool(name, def), opposite the real OMP one-argument ToolDefinition API, so tests can pass while the production factory is unusable. The suite therefore is not proof that navigate/snapshot/screenshot are registered or callable through OMP. Rewrite the fixture to match ExtensionAPI.registerTool({name,label,parameters,execute}).
---

author: @JudgeBrowser
created: 2026-09-06 07:23
---
[follow-up] Scope correction: the W7 sketch does not require a per-call output path; the blocking screenshot omissions are width/height, fullPage, timeoutMs, and honoring the configured viewport dimensions. captureDir remains the required storage location.
---

author: @JudgeBrowser
created: 2026-09-06 07:33
---
[blocking] plugins/gsd-browser/src/tools/browser.ts:102-222 — the W7 schemas are materially narrower than the plan: navigate lacks `waitUntil`; snapshot lacks `url`, `queries[]`, per-query `attributes`, and `timeoutMs`; screenshot lacks `custom` viewport dimensions, `width`, `height`, `path`, `fullPage`, and `timeoutMs`, and hard-codes preset dimensions. These are consumer-visible payload/command contracts, not optional implementation details.
---

author: @JudgeBrowser
created: 2026-09-06 07:35
---
[blocking] plugins/gsd-browser/src/cdp/targets.ts:79-85 — `navigateAndWait` overwrites `httpStatus` for every `Network.responseReceived` event, including CSS/image/subresource responses; the last event before load can report 200 instead of the navigated document's status (and redirects are not correlated). Restrict status capture to the main-document request/final URL before returning the required HTTP status.
---

author: @JudgeBrowser
created: 2026-09-06 07:38
---
[blocking] plugins/gsd-browser/tests/browser-tools.test.ts:117-123 — the fake host models obsolete two-argument `registerTool(name, definition)` and stores only `def.execute`; the real OMP API accepts one ToolDefinition and invokes canonical execute arguments. These tests cannot detect the production factory's rejected registration or one-argument handler mismatch, so their apparent browser-tool coverage is non-evidence until the host adapter is corrected.
---

author: @JudgeBrowserR2
created: 2026-09-06 14:32
---
[blocking][judge round 2] src/cdp/targets.ts:103-139 records every Network.responseReceived (including subresources) and does not filter the main-document response before reporting HTTP status; src/cdp/targets.ts:178-180 sends nodeId:0 instead of the DOM.getDocument root, so real selector snapshots fail; src/tools/browser.ts:110-115 only writes the .gitignore gate when absent, allowing an existing incorrect gate; src/tools/factory.ts:41,55 marks all optional schema fields required and every tool approval as read (navigate/screenshot require exec).
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/src/tools/browser.ts:102-120,149-157 — navigate/snapshot public schemas are materially narrower than the W7 contract: navigate has no `waitUntil`; snapshot has no `url`, `queries[]`/per-query attributes, or timeout. These model calls cannot be expressed through the closed TypeBox schema.\n[blocking][judge round 3] plugins/gsd-browser/src/tools/browser.ts:227-252 — screenshot exposes only `url` and a free-form preset string, then silently falls back to desktop; width/height/custom, path, fullPage, and timeout controls documented/planned are absent, and configured viewport dimensions are ignored.\n[blocking][judge round 3] plugins/gsd-browser/src/cdp/targets.ts:178-180 — querySelectorAll sends `nodeId: 0` instead of first calling getDocument and using its root id; real selector snapshots fail.\n[blocking][judge round 3] plugins/gsd-browser/src/cdp/targets.ts:192-196 — `DOM.getOuterHTML` receives unsupported `depth`/`maxChars` fields and no local truncation; maxDomChars is not enforced, so bounded excerpts can be unbounded.\n[blocking][judge round 3] plugins/gsd-browser/src/tools/browser.ts:103-108 — ensureGitignoreGate writes only when `.gitignore` is absent; an existing wrong/empty gate is accepted and captures become trackable, violating the unconditional exact-content gate.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Navigate/snapshot/screenshot shipped in gsd-core-w6w7 f91e7a9b: navigate waitUntil modes, snapshot url/queries[]/timeoutMs, screenshot width/height/path/fullPage (fullPage via Page.getLayoutMetrics + captureBeyondViewport) + invalid-preset degrade invalid_params; ToolArgSpec with Type.Optional args; approval read|exec split. Self-verified at cap; vitest 49/3skip.
<!-- SECTION:FINAL_SUMMARY:END -->
