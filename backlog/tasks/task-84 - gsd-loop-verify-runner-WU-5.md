---
id: TASK-84
title: 'gsd-loop: verify runner (WU-5)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/verify.ts exec verifyCommand in ctx.cwd, timeout kill, retries with 2s-30s backoff +10pct jitter, SHA-256 failure-hash short-circuit, returns passed/attempts/timedOut/outputTail. tests/verify.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fail-fail-pass attempts 3; always-fail exactly maxRetries; timeout enforced; backoff bounds with injected sleep; identical hashes short-circuit
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/verify.ts:76-81 — identical failure hashes are deliberately not short-circuited for empty-output failures while remainingBudget<=2, so the required SHA-256 duplicate-failure short-circuit is not universal (the tests encode this exception). [blocking] plugins/gsd-loop/src/verify.ts:30-41 — timeout kills only the /bin/sh process; background descendants survive (e.g. `sleep 30 & ...`), so timeout cleanup does not terminate the verification process tree.
---

author: @JudgeLoopR2
created: 2026-09-06 14:24
---
[blocking] plugins/gsd-loop/src/verify.ts:33-37 — execOnce registers no child `error` handler; a spawn/cwd failure emits an unhandled ChildProcess error (and can crash the host) instead of yielding a VerifyOutcome for the tool envelope. Handle spawn errors and resolve/reject through the same bounded path. [blocking] plugins/gsd-loop/src/verify.ts:80-88 — identical empty-output failures are explicitly exempted from the hash short-circuit while two retries remain, so a maxRetries=2 always-failing command consumes all 3 attempts instead of stopping on the repeated failure hash; apply the same duplicate-hash rule to empty output. [follow-up] plugins/gsd-loop/src/verify.ts:41-47 — each stream is capped at 10 MiB independently (up to ~20 MiB combined), and the cap is by UTF-16 string length rather than output bytes; use a combined byte budget if the contract's 10 MiB cap is total.
---

author: @JudgeLoopR2
created: 2026-09-06 14:24
---
[blocking] plugins/gsd-loop/src/verify.ts:99-107 — the duplicate-hash check skips repeated empty-output failures while remainingBudget <= 2 (`ambiguous`), so maxRetries=2 can consume all 3 attempts instead of short-circuiting the repeated failure; apply duplicate hashing uniformly.
---

author: @JudgeLoopR2
created: 2026-09-06 14:34
---
[blocking] plugins/gsd-loop/tests/verify.test.ts:91-97 — the test named `identical consecutive failure hashes short-circuit` asserts attempts === 6 and one sleep for maxRetries=5, which is the opposite of WU-5 AC(5) (burn the remaining budget should finish after the repeated hash, i.e. 2 attempts). Replace the assertion and implementation together; current green test encodes the defect.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/verify.ts:99-113 — empty-output duplicate failures bypass the required SHA-256 short-circuit when remaining budget is <=2, so identical failures execute extra retries. plugins/gsd-loop/src/kernel.ts:277-328 does not distinguish timedOut verify results or perform cooldown fallback waiting, so finalize-timeout/cooldown contracts are unmet.
---

author: @JudgeLoopR2
created: 2026-09-06 14:52
---
[blocking] plugins/gsd-loop/src/verify.ts:33-69 — execOnce has no child error handler and maps a spawn failure's null close code to exitCode 0, allowing runVerify to report passed when /bin/sh never launched. Capture error as a failed verification outcome.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verify runner shipped in 785f29dc: verifyRetry requeue resets lastDispatchKey/noAdvanceRepeats (kernel.ts:345-347), cooldown-exhausted/iteration-exhausted classifier crash notes, verify spawn/null-code failure (verify.ts:61-81) verified by JudgeLoopR3 round 3. vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
