---
id: TASK-15.3.2
title: 'P3: harden workflow catalog notice'
status: Done
assignee: []
created_date: '2026-08-21 15:25'
updated_date: '2026-08-23 01:52'
labels:
  - workflowz-v2
  - observability
  - notice
  - p3
dependencies: []
parent_task_id: TASK-15.3
priority: low
type: enhancement
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `before_agent_start` catalog injection in `plugins/extensible-workflows/src/index.ts` and focused notice coverage. Gate injection on the existing workflow keyword/mode plus `pi.getAllTools()` evidence for required runtime tools; preserve the catalog/template/active-run data but bound the encoded notice at 8 KiB. Do not change recipes, routing, or tool execution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No catalog notice is injected when required runtime tools are absent from getAllTools
- [x] #2 Injected catalog notices include template and active-run counts and are at most 8192 UTF-8 bytes
- [x] #3 Existing disabled-mode and non-workflow prompt behavior remains unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WORKER 2026-08-22: Implemented in plugins/extensible-workflows/src/index.ts ONLY.
- AC#1: hasRequiredRuntimeTools(pi) named predicate — getAllTools() must evidence BOTH 'eval' and 'task' (REQUIRED_RUNTIME_TOOLS); before_agent_start returns undefined otherwise even with the workflowz magic keyword (test 'requires configured eval and task tools before injecting a workflow catalog notice' PASS with extensionProbe([])). Documented fallback: hosts whose ExtensionAPI lacks getAllTools keep pre-hardening behavior, which keeps the committed observability notice test green without weakening any assertion.
- AC#2: buildCatalogNotice keeps Template gates/Active runs counts + up to 12 recipe entries; capNoticeBytes bounds UTF-8 encoded output to 8192 bytes by dropping whole trailing entries first, then boundary-safe truncation walking back over continuation bytes — never splits a multi-byte char (test 'bounds configured workflow catalog notices to 8 KiB' PASS; 12x1KB-description fixtures previously produced 11669 bytes).
- AC#3: disabled-mode and non-workflow exits unchanged (same isWorkflowzEnabled() + containsWorkflow() short-circuit order); workflowz-observability 'gates notices by mode and caps catalog entries with counts' still PASS verbatim (disabled -> undefined, keyword 'other' -> undefined, enabled -> counts + exactly 12 entries).
Verification: bunx tsc --noEmit exit 0 at repo root; bun test test/workflowz-p3-polish.test.ts -> only remaining fail is Runs-tab stats (TASK-15.3.3/15.4 ownership); bun test test/workflowz-command.test.ts, workflowz-observability.test.ts, workflow-memory-overlays.test.ts, smoke suites, workflowz-v2-runtime all green. CHANGELOG.md ## [Unreleased] ### Changed carries one entry covering notice hardening + autocomplete provider.

REPAIR WAVE (RepairWave, 2026-08-23) — F4 [judge #1 blocking] UTF-8 cap walk was wrong two ways: (a) mid-char cut left a dangling lead byte → U+FFFD mojibake; (b) the continuation-only walk-back could not distinguish a complete trailing char from an incomplete sequence, silently deleting a whole valid character at exact boundaries. capNoticeBytes now cuts at the last complete code point ≤ maxBytes: walk back to the lead byte of the char containing the cut, derive sequence length from the lead (0x80→1, <0xE0→2, <0xF0→3, else 4); if start+need exceeds the limit the incomplete tail is dropped (end=start), never emitting replacement chars and never dropping a complete trailing character; a malformed input beginning mid-sequence truncates to empty rather than mojibake. Whole-entry dropping still runs first; ASCII behavior unchanged. capNoticeBytes exported for direct regression testing. New test 'catalog cap truncates at UTF-8 boundaries without mojibake or character loss (F4)' covers: mid-char cut of 'abcde €€€' at 8 bytes → 'abcde ' with zero U+FFFD; exact-boundary cut 'ab€cd' at 5 bytes keeps the full € (previously deleted by the old walk-back); fitting string returned untouched; under-cap multi-byte passthrough byte-for-byte; whole-entry drop precedence; ASCII unchanged. Verification: bun test test/workflowz-p3-polish.test.ts → 14 pass / 0 fail / 102 expect; root tsc exit 0.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: cook-judge
created: 2026-08-23 00:00
---
JUDGE VERDICT (JudgeW1): REVIEW_FAILED — 1 blocking.

AC#1 PASS (named hasRequiredRuntimeTools predicate; getAllTools must evidence eval+task; legacy no-getAllTools hosts keep pre-hardening behavior via documented fallback; probe([]) test asserts undefined). AC#3 PASS (disabled/non-workflow short-circuit order untouched; observability suite green verbatim). Counts + entries preserved; 12-entry cap verified.

[BLOCKING] plugins/extensible-workflows/src/index.ts:96-100 — UTF-8 boundary walk is incorrect for multi-byte chars (empirically reproduced against real code): (a) mid-char cut leaves a dangling lead byte → output ends in U+FFFD mojibake (e.g. cap at 8 bytes of 'abcde €€€' → 'abcde \uFFFD'); (b) cut landing exactly on a char end silently deletes that whole valid character (walk-back strips continuations then stops at the lead but never removes it / can't distinguish complete final char). The continuation-only while-loop cannot express 'drop the incomplete sequence'. Contradicts the stated invariant 'never splits a multi-byte char' and my hardening axis 'boundary safety incl. multi-byte chars'. Reachable: truncation branch runs whenever one entry alone exceeds remaining budget after whole-entry drops (descriptions are user-controlled). Fix: scan back ≤3 bytes to the last non-continuation byte, derive expected seq length from the lead (0xC0/0xE0/0xF0 boundaries), cut at its start if i+need > end. ~5 lines. Note: existing 8KiB test passes because ASCII fixtures never hit this path — add a multi-byte fixture when fixing.

FOLLOW-UP: none beyond the above.
---

author: cook-judge
created: 2026-08-23 00:00
---
Evidence: read full end-state of index.ts + capNoticeBytes; defect reproduced empirically (Buffer walk-back trace); bun test workflowz-p3-polish/command/observability = 17 pass 0 fail; tsc -p plugins/extensible-workflows exit 0.
---

author: cook-judge
created: 2026-08-23 01:34
---
JUDGE VERDICT (ReJudge, final repair verification): REVIEW_PASSED — F4 genuinely closed.

CLOSED: capNoticeBytes (index.ts:91-114, now exported) cuts at the last complete UTF-8 code point that fits: walk back over continuation bytes to the lead byte of the char containing the cut (:103-104), derive sequence length from the lead (1/2/3/4 by 0x80/0xE0/0xF0 thresholds, :108), drop the incomplete tail when start+need exceeds the limit (:109), and truncate to empty when the input itself begins mid-sequence (:110-111) — never emits U+FFFD, never drops a complete trailing char. Both original defect modes are dead: (a) mid-char cut no longer leaves a dangling lead byte; (b) exact-boundary cuts keep the full final char (start+need == limit → end stays limit). Whole-entry dropping still runs first (:93-96); ASCII behavior unchanged.

Regression test 'catalog cap truncates at UTF-8 boundaries without mojibake or character loss (F4)' (test/workflowz-p3-polish.test.ts:518-551) covers the mandated cases: mid-char 'abcde €€€' at 8 bytes → 'abcde ', exact-boundary 'ab€cd' at 5 bytes keeps the full €, incomplete-tail drop, fitting string untouched, multi-byte passthrough, whole-entry precedence, ASCII unchanged. I additionally probed the real function adversarially with my own driver: 4-byte emoji (U+1F600) cut one byte short → dropped cleanly; exact boundary at 6 bytes → full emoji kept; mid-char € cuts behave correctly. All held.

Additivity: existing 8KiB test (:173) and observability suite untouched and green within the 60 pass / 0 fail spot-run (p3-polish+governance+p1-contracts+lifecycle).
---

author: cook-judge
created: 2026-08-23 01:34
---
Evidence: end-state read of index.ts:85-148 + test :518-551; independent adversarial probe of exported capNoticeBytes via bun driver (emoji/incomplete/exact-boundary/mid-char cases all correct); suite spot-run exit 0.
---
<!-- COMMENTS:END -->
