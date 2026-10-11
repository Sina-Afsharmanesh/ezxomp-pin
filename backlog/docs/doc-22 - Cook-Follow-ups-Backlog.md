---
id: doc-22
title: Cook Follow-ups Backlog
type: guide
created_date: '2026-08-31 01:46'
updated_date: '2026-09-07 09:19'
---
# Cook Follow-ups Backlog

Durable, non-blocking follow-up ledger. Format (one line each):
`- [ ] task <id> · <file>:<line> · <what> (<source>, <YYYY-MM-DD>)`

A follow-up graduates to a real task only on operator demand, recording discoveredFrom.

## TASK-58 — Durable augment plugin

- [ ] task TASK-58 · plugins/augment/src/enhance.ts:126 · Validate terminal stop reason + non-empty text and reject error/length/toolUse before parsing; preserve provider errorMessage instead of collapsing into sentinel-format error (doc-21 rank 3, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/enhance.ts:32 · Add typed content-free outcome categories (smol_unconfigured, auth, permission, rate_limited, provider_transient, timeout, truncated, empty, invalid_envelope) and actionable notices; record outcome/attempt/stop/timing evidence (doc-21 rank 4, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/enhance.ts:115 · Enforce one total deadline across both completion attempts instead of a fresh 45s timer per call (doc-21 rank 5, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/parser.ts:18 · Align parser behavior, fallback contract, first-block extraction, and exactly-one copy with the prompt contract (doc-21 rank 6, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/settings.ts:28 · Snapshot settings at request start and make read/save fallback explicit rather than silent defaults (doc-21 rank 7, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/context.ts:21 · Minimize/disclose optimizer context (history, cwd, branch, active model) and consider size preflight against the selected model budget (doc-21 rank 8, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/index.ts:13 · /aug with no args prints usage naming /augment (EXTENSION_COMMAND constant in shared handler); make notice name-agnostic (/aug[ment]) or accept (JudgeA, 2026-08-31)
- [ ] task TASK-58 · plugins/augment/src/settings-overlay.ts:188 · Comment "Lazy import (static import cannot work here)" overstates — static import works in production; it fails only under a test runner mock.module rebind after first load; fix comment to state the real constraint (JudgeB, 2026-08-31)

- [ ] task TASK-104.1 · plugins/gsd-web/web/server/visualizer-service.ts:28 · Remove stale resolveTsLoaderPath/pathToFileURL fallback or restore a valid loader variable after staged-only switch (judge, 2026-09-07)
