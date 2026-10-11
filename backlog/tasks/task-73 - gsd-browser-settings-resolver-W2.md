---
id: TASK-73
title: 'gsd-browser: settings resolver (W2)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/settings.ts resolveGsdBrowserSettings(raw) covering full adaptation map incl domVerification, brave key chain env-setting-file, timeouts, injectionBlocking, maxFetchBytes, allowPrivateHosts, viewport triple, captureDir, browserProfileDir, backend, browserExecutablePath, headless, enabled. tests/settings.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests prove defaults, per-key normalization, env precedence, key-chain ordering, malformed fallbacks
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:19
---
[blocking] plugins/gsd-browser/src/settings.ts:78-84 — Number.parseInt accepts prefixes, so malformed env values such as GSD_WEBSEARCH_TIMEOUT_MS=2500junk resolve to 2500 instead of falling back; direct probe returned 2500. Fix: require a full positive-integer match before parsing, then apply the documented fallback/clamp chain. Also reconcile the manifest's extra enabledKill key (package.json:119-123) with the plan map's enabled kill-switch.
---

author: @JudgeBrowser
created: 2026-09-06 07:37
---
[blocking] plugins/gsd-browser/src/cdp/browser.ts:166-188 and src/tools/browser.ts:202-211 — resolver outputs `browserExecutablePath`, `browserProfileDir`, `headless`, `viewportWidth`, and `viewportHeight` are dead configuration: manager calls discovery with no override, always creates a temp profile and `--headless=new`, while screenshot always selects fixed preset dimensions. The config map is not merely resolved; its browser controls have no effect.
---

author: @JudgeBrowserR2
created: 2026-09-06 14:32
---
[blocking][judge round 2] src/tools.ts:40-45 defaultSettingsProvider accepts cwd but discards it and always resolves {}, so omp.settings (including enabled/backend/profile/executable/headless) never reaches tools. src/tools/browser.ts:82-85 accepts settings but does not thread them to browserManager. src/commands.ts:25-27 likewise resolves {} instead of the per-cwd plugin settings. The enabled kill-switch is not enforced by tool handlers.
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/src/tools.ts:31 — defaultSettingsProvider discards cwd and always resolves `{}`, so host PluginManager settings (enabled/backend/allowPrivateHosts/injectionBlocking/etc.) never reach production tool calls; the configured kill switch and private-host security policy are ineffective. Fix the provider to load the plugin settings for the executing cwd and normalize them.\n[blocking][judge round 3] plugins/gsd-browser/src/cdp/browser.ts:155-157 — ensureClient never receives/uses resolved settings and always discovers/spawns its own temporary headless profile, so browserExecutablePath, browserProfileDir, headless, backend=none, and enabled cannot affect the backend. Thread settings through acquisition and enforce disable/profile/executable/headless.\n[blocking][judge round 3] plugins/gsd-browser/src/commands.ts:37,80 — status/doctor independently resolve `{}` rather than the per-cwd plugin settings, so the operator surface reports defaults instead of actual configuration.
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/package.json:88-95 — the manifest exposes viewportWidth/viewportHeight but has no `maxDomChars` setting even though resolver/settings and the W7 contract define it; operators cannot configure the documented DOM excerpt bound through omp.settings. Add the key with its default/min metadata and keep the runtime resolver path aligned.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settings resolver shipped in f91e7a9b: defaultSettingsProvider(cwd, pi) reads pi.settings threaded from registerGsdBrowserTools; ensureClient connect/settings (enabled=false/backend=none → no_browser_backend refusal). Self-verified at cap; vitest 49/3skip.
<!-- SECTION:FINAL_SUMMARY:END -->
