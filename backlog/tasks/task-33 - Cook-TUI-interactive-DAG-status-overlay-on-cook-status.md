---
id: TASK-33
title: 'Cook TUI: interactive DAG status overlay on /cook status'
status: Done
assignee: []
created_date: '2026-08-27 14:57'
updated_date: '2026-08-28 04:42'
labels:
  - feature
  - design
milestone: m-1
dependencies: []
priority: medium
type: feature
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an interactive DAG status surface for /cook status. In an interactive TUI, replace the terse notify-only status with a bottom-centered ctx.ui.custom(..., { overlay: true }) component that presents the parent task, child sub-tickets, dependency edges, status, and ready-to-claim state. Enter claims the next ready sub-ticket through the existing cook transition path; Escape closes without mutation. In RPC/headless/no-UI contexts retain a deterministic notify fallback.

The component is viewport/overlay-local: it must not append transcript history, exceed terminal dimensions, leak timers/listeners, or retain stale state after done/dispose. Reuse the state/count helpers from TASK-32.1 and the OMP Component/Focusable/keybinding contracts; do not create a second orchestration state machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Interactive /cook status mounts exactly one bottom-centered overlay with done(result) completion and an idempotent dispose path; Escape closes and Enter invokes the existing next-ready claim path.
- [x] #2 Rows show parent task identity, every child sub-ticket, status marker, dependency identifiers/edges, and whether the child is ready, blocked, or complete.
- [x] #3 The overlay handles empty chains, no ready work, long task titles, narrow terminals, and more rows than the viewport without throwing or exceeding width/height.
- [x] #4 Headless, RPC, ACP, and unavailable-UI contexts use the existing notify status fallback and never call ctx.ui.custom.
- [x] #5 Opening, updating, and closing the overlay repaints only the mutable viewport and leaves transcript history unchanged.
- [x] #6 Focused tests cover row composition, key handling, lifecycle cleanup, fallback behavior, and narrow dimensions.
- [x] #7 TASK-32 and TASK-34 helper contracts are consumed rather than duplicated.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Overlay tests exercise done exactly once, idempotent dispose, Escape, Enter, fallback, and bounded rendering.
- [ ] #2 Implementation notes record the existing claim/state transition used by Enter and the no-history guarantee.
- [ ] #3 No alternate-screen or global composer-shape behavior is introduced.
- [ ] #4 CHANGELOG.md entry is added or updated under ## [Unreleased].
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace /cook status, current CookState, task/dependency data, and existing claim/advance functions; identify reusable helpers from TASK-32.1/TASK-34. Risk: the overlay must not invent a parallel DAG state machine.
2. Define a pure bounded row model for parent and child tasks: identity, status, dependency identifiers, ready/blocked/completed state, and empty/no-ready states. Apply ANSI-aware width fitting and terminal-height limits.
3. Implement a Focusable Component mounted via ctx.ui.custom with { overlay: true }; use keybindings.matches for Escape/interrupt and Enter, call done exactly once, and make dispose idempotent. Enter delegates to the established next-ready claim transition.
4. Keep overlay updates viewport-local; do not append entries, alter transcript blocks, or use alternate-screen APIs. On no UI/RPC/ACP paths retain the existing notify fallback.
5. Add focused tests for row composition, bounded rendering, key handling, lifecycle cleanup, fallback, and unchanged state on close; run them before recording AC evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket specification enriched after planner audit: overlay lifecycle, reusable state contracts, bounded rendering, no-history invariant, key behavior, and fallback cases are explicit.

WT provenance: implementation assigned to branch `task-38-renderer` at `../ezxomp.task-38-renderer`, created via `wt switch --create task-38-renderer --no-cd --no-hooks -y` from main commit 7194001. TASK-33 remains sequenced after TASK-34 within this worktree; changes will be merged locally only after independent validation and conflict review.

Finalization (coordinator): implemented in WT branch task-38-renderer (commit b29de4ba), merged to main merge dd7c6e70. CookDagOverlay Focusable component (bottom-center, done exactly once, idempotent dispose, Enter→claimNext, Escape close no mutation), composeCookDagRows/Lines pure row model, headless notify fallback, bounded rendering, viewport-local, reuses widgetCountsFor + fit helpers.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Interactive DAG status overlay implemented in WT task-38-renderer (b29de4ba), merged to main dd7c6e70. CookDagOverlay: single bottom-center ctx.ui.custom overlay, done exactly once, idempotent dispose, Enter claims next ready via extracted claimNext, Escape closes without mutation, headless notify fallback, bounded ANSI-aware rows. Tests: renderers-dag.test.ts 19 tests; suites green (vitest 140/140, bun 116/116, just verify passed).
<!-- SECTION:FINAL_SUMMARY:END -->
