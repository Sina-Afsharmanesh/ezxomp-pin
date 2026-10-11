---
id: TASK-90
title: 'gsd-loop: command surface (WU-8)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands.ts registerCommand gsd-loop: smart entry, start --verbose, next --dry-run, stop (graceful same-session, STOP flag foreign), pause, resume --wedge, status, enqueue, list. tests/commands.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every subcommand routed correctly; unknown yields usage; wedge hint on smart entry
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/commands.ts:57-86 — parseArgs accepts unknown flags, extra positional arguments, and non-numeric/negative retries (values are silently ignored or converted to undefined), contrary to the strict parser contract. Reject unknown flags, arity violations, and invalid numeric values with usage before dispatch.
---

author: @JudgeLoop
created: 2026-09-06 07:44
---
[blocking] plugins/gsd-loop/src/commands.ts:117-137 — smartEntry branches only on `s.run.status`; an idle/paused state with a live foreign loop.lock is reported as the fresh branch instead of the required running-foreign status/recovery branch. Expose a lock-status facade query and route foreign ownership distinctly.
---

author: @JudgeLoopR2
created: 2026-09-06 14:25
---
[blocking] plugins/gsd-loop/src/commands.ts:110-116 — numberFlag returns undefined for invalid values instead of raising a usage error; executeSubcommand then enqueues successfully with no maxRetries. Number() also silently coerces `1e2` and `0x10`, so the strict --retries contract is not enforced. Parse the lexical decimal-integer form and reject invalid values. [blocking] plugins/gsd-loop/src/commands.ts:190-191 — command notify() checks only ctx.ui.notify, not ctx.hasUI, so a headless/RPC slash-command path can invoke UI output contrary to the no-RPC-visible-UI contract. [follow-up] plugins/gsd-loop/src/commands.ts:42-82 — parser accepts unknown flags and ignores extra positional arguments; enforce the documented subcommand arities/flag set. [blocking] plugins/gsd-loop/plugins/gsd-loop/tests/commands.test.ts:147-151 — the purported strict-number test passes an array to parseArgs (which expects a string), so it throws a TypeError before exercising --retries and is vacuous; drive the real command input string.
---

author: @JudgeLoopR2
created: 2026-09-06 14:25
---
[blocking] plugins/gsd-loop/tests/commands.test.ts:147-151 — the purported strict-number test passes an array to parseArgs (which expects a string), so it throws a TypeError before exercising --retries and is vacuous; drive the real command input string.
---

author: @JudgeLoopR2
created: 2026-09-06 14:30
---
[blocking] plugins/gsd-loop/src/commands.ts:110-116 — the contract-relevant defect is silent fallback: `numberFlag` returns undefined for `-1` and `1.5`, then `doEnqueue` treats undefined as null/default and reports success instead of rejecting the usage. This remains blocking even though Number('1e2')/Number('0x10') are integer nonnegative values and are not independently prohibited by the stated criterion.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/commands.ts:115-120,190 — numberFlag returns undefined for invalid --retries values instead of rejecting -1/1.5, silently enqueueing a default; notify calls UI without checking ctx.hasUI. Both violate command contract/headless safety.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Command surface shipped in 785f29dc: /gsd-loop start|status|resume|stop|enqueue|record-result|verify-retry; lexically strict numberFlag (commands.ts:110-116, throws on 1e2/0x10/+1); UI guard commands.ts:191-194; enqueue foreign fence. JudgeLoopR3 REVIEW_PASSED; vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
