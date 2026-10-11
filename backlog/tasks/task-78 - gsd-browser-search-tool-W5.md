---
id: TASK-78
title: 'gsd-browser: search tool (W5)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/search.ts line-faithful port of cmdWebsearch: exact query params, token header, retry only 429/5xx twice, Retry-After parse + 250ms doubling, non-retryable 4xx immediate, result mapping, injected HTTP for tests. tests/search.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no key yields exact unavailable payload; 200 maps results; 429 honors Retry-After; 500 retries twice; 400 immediate; timeout errors with attempts
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:20
---
[blocking] plugins/gsd-browser/src/tools.ts:59-62 — the only ToolSpec is gsd_browser_fetch; src/search.ts is never imported or registered, so no gsd_browser_search exists and its upstream-faithful retry/header implementation is unreachable. Fix by adding the search handler, preserving the exact upstream params/retry contract, and attaching injection details before registration.
---

author: @JudgeBrowserR2
created: 2026-09-06 14:32
---
[blocking][judge round 2] src/search.ts:197-201 wraps no-key `{available:false, reason:'BRAVE_API_KEY not set'}` as isError=true, violating silent structured unavailability. src/search.ts:110-125 clears the timeout before response.json/body consumption, so a hung JSON body is not bounded; catch at :143 retries parse errors despite retry-only-429/5xx. Search result URL omission from scanner input is recorded on TASK-77.
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/src/search.ts:111-118 — the per-attempt timer is cleared immediately after fetch headers, before response.json(); a response whose JSON body stalls can hang indefinitely despite timeoutMs. Keep the deadline through body consumption.\n[blocking][judge round 3] plugins/gsd-browser/src/search.ts:143-161 — the broad catch retries JSON parse errors and other non-HTTP failures, violating retry-only-429/5xx semantics; malformed 200 responses can incur three attempts/backoff instead of failing once.\n[blocking][judge round 3] plugins/gsd-browser/src/search.ts:196-198 — no-key outcome is wrapped with `isError:true`, so the documented silent structured unavailability is surfaced as a tool error.\n[blocking][judge round 3] plugins/gsd-browser/src/search.ts:187-188 — scanner input concatenates only title/description and omits result URLs, so URL-based injection rules are invisible.\n[blocking][judge round 3] plugins/gsd-browser/src/search.ts:187-198 — scanText is called without fail-open protection; a scanner exception rejects the tool rather than returning intact search output as required. Add guarded scan wiring and test enabled/disabled/throw paths.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Brave search shipped in f91e7a9b: params country/search_lang/text_decorations, status-gated parse (error bodies never JSON-parsed), 429/5xx-only retry with retry-after, network-only retry regex incl. abort, no-key non-error envelope, scan text includes r.url, timeoutMs schema. JudgeBrowserR3 search blockers all fixed; self-verified at cap; vitest 49/3skip.
<!-- SECTION:FINAL_SUMMARY:END -->
