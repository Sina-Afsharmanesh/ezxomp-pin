---
id: TASK-58.6
title: Add the /aug prompt-rewrite command
status: Done
assignee:
  - '@cook'
created_date: '2026-08-31 01:01'
updated_date: '2026-08-31 03:15'
labels:
  - feature
dependencies: []
parent_task_id: TASK-58
priority: high
type: feature
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Register /aug as a short entry point to the same rewrite behavior as /augment, sharing one handler so usage, review-before-send, cancellation, and error semantics cannot drift. This command surface can ship independently of model routing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /aug is registered with a concise description and accepts the same prompt arguments as /augment
- [x] #2 /aug and /augment execute the same shared handler path without duplicated command logic
- [x] #3 Targeted test exercises /aug through registration to editor delivery
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in workspace task-58.6 (commit 2196be05, bookmark task-58.6). index.ts now builds the /augment command object once and registers it under both "augment" (EXTENSION_COMMAND) and "aug" — one shared handler object, no duplicated command logic, so usage validation, review-before-send, cancellation, and error semantics are identical by construction. /aug description is "Short alias for /augment"; arguments pass through unchanged. Validation: routing test "registers /aug as the same prompt-rewrite entry point" goes registration -> handler invocation -> complete() on the resolved SMOL model -> editor delivery ("Rewritten prompt") and passes; combined targeted gate 10 pass / 0 fail. Also made settings-overlay.ts resolve hostCenteredOverlay via a per-call dynamic import (commented): the routing test file imports the augment entry first, and a static binding captured at module load ignored the overlay-host mock registered later by test/augment.test.ts, making "opens six settings in the centered host" fail only in combined runs (baseline combined run failed 5 tests; with all changes it fails none).

Rework after validator gate (commit 938df125): index.ts command object typed as `Omit<RegisteredCommand, "name">` (type-only import from @oh-my-pi/pi-coding-agent), eliminating the implicit-any args/ctx findings while keeping the single shared handler for /augment and /aug. Post-rework verification: bunx tsc --noEmit -p tsconfig.json = 0 errors; targeted gate 10 pass / 0 fail.

Round-2 gate + dual review passed on final commit 82e7f5e8 (kzkyvxtl); all 3 ACs re-verified by validator IntermediateFlea against the repaired state.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/aug is registered in index.ts as a concise alias ("Short alias for /augment") pointing at the exact same shared command object as /augment — one typed handler (Omit<RegisteredCommand, "name">), zero duplicated logic — so usage, review-before-send, cancellation, and error semantics match by construction. Verified: test/augment-routing.test.ts "registers /aug as the same prompt-rewrite entry point" (registration -> SMOL-routed completion -> editor delivery) + combined gate test/augment.test.ts & test/augment-routing.test.ts = 10 pass / 0 fail, bunx tsc --noEmit clean, at final deliverable 82e7f5e8 (bookmark task-58.6); dual review round 2 (DecentMole + ConservationRooster) REVIEW_PASSED with 0 blocking; validator verified all 3 ACs with objective evidence.
<!-- SECTION:FINAL_SUMMARY:END -->
