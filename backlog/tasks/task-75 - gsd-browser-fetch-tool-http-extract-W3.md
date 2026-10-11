---
id: TASK-75
title: 'gsd-browser: fetch tool + http/extract (W3)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/http.ts (streamed read, maxFetchBytes truncation marker, AbortController timeout, redirect cap 5, private-host policy), src/extract.ts zero-dep HTML-to-text, fetch tool via factory. tests/fetch.test.ts with node:http fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 extraction drops script/style; truncation marker at cap; timeout aborts; private-host allowed by default, blocked with exact reason when disabled; redirect cap honored
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:19
---
[blocking] plugins/gsd-browser/src/http.ts:70-103 — fetch clears its AbortController timer immediately after headers, so a response body that never yields hangs past timeout; the response.body===null branch returns response.text() without applying maxBytes or a truncation marker. Fix: keep the timeout active through body consumption and cap the fallback text path by encoded bytes.
---

author: @JudgeBrowser
created: 2026-09-06 07:20
---
[blocking] plugins/gsd-browser/src/tools.ts:84-89 — non-private fetch failures report details.reason="fetch_failed", which is outside the documented degradation vocabulary (no_browser_backend, no_websocket, profile_locked, target_unreachable, timeout, plugin_disabled, private_host_blocked). Map AbortError/timeouts and network failures to the prescribed reason codes and keep the reason visible to callers.
---

author: @JudgeBrowser
created: 2026-09-06 07:26
---
[blocking] plugins/gsd-browser/src/tools.ts:55-62,68-78 — the sole registered fetch definition uses a one-argument `execute(args)` and omits the host-required label/ToolDefinition contract. OMP invokes `execute(toolCallId, params, signal, onUpdate, ctx)`, so the handler receives the call-id string as `args`, resolves URL as `undefined`, and cannot serve `gsd_browser_fetch` even if registration succeeds. Adapt the handler to the canonical signature and register `label`/`parameters` fields.
---

author: @JudgeBrowserR2
created: 2026-09-06 14:32
---
[blocking][judge round 2] src/tools.ts:90-94 returns fetched page text directly instead of a fenced/code-wrapped untrusted block, and maps all non-private fetch failures to undocumented fetch_failed rather than the required degradation vocabulary. src/http.ts:34-55 checks only textual plain IPv4/private IPv6 forms; IPv4-mapped IPv6 loopback (for example ::ffff:127.0.0.1) bypasses allowPrivateHosts=false. src/http.ts:126-127 documents but does not clear redirect timers (follow-up resource leak).
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/src/http.ts:143-149 — the response.body-null fallback compares/slices UTF-16 character count rather than encoded byte count, so non-ASCII responses can exceed maxBytes and violate the advertised byte cap. Encode/cap by bytes consistently.\n[blocking][judge round 3] plugins/gsd-browser/src/tools.ts:84-89 — generic HTTP failures still report `details.reason: "fetch_failed"`, conflicting with the exact reason vocabulary in plugins/gsd-browser/AGENTS.md and the GSD degradation contract; map timeout/network/protocol failures to the prescribed reason and retain actionable details.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fetch tool + http/extract shipped in f91e7a9b: fetch fenced text blocks, http.ts byte cap on TextEncoder-encoded bytes + redirect clearTimeout, getOuterHtml drops bogus CDP params with local truncate. Self-verified at cap; vitest 49/3skip. Integrated 9cd9092b.
<!-- SECTION:FINAL_SUMMARY:END -->
