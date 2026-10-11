---
id: TASK-38.6
title: Normalize repository dependency graph and restore typecheck
status: Done
assignee:
  - '@Task386Deps'
created_date: '2026-08-28 02:15'
updated_date: '2026-08-28 04:43'
labels:
  - bug
  - architecture
dependencies: []
parent_task_id: TASK-38
priority: high
type: bug
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repair repository-local dependency resolution so root typecheck and package imports use one compatible @oh-my-pi version graph after the ignored lockfile refresh. Preserve package declarations, tests, and plugin behavior; document any unavoidable runtime/tooling boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run check passes with one compatible repository dependency graph and no mixed @oh-my-pi 17.3.8/18.0.6 type identities.
- [x] #2 Affected augment and Cook tests pass after dependency normalization without weakened assertions or skipped contracts.
- [x] #3 The resolution is reproducible from repository-local manifests and lockfile/install instructions, with no external global-state dependency.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In WT branch `task-38-deps`, inspect root and plugin manifests, lockfile, installed graph, and Bun workspace resolution.
2. Normalize one compatible @oh-my-pi version graph without sudo/global-state mutation; preserve declarations and test contracts.
3. Verify `bun run check`, augment tests, Cook tests, and reproducible repository-local install/lockfile behavior.
4. Record exact files, commands, and residual risks; leave ticket open for independent validator/judge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WT assignment: branch `task-38-deps`, path `../ezxomp.task-38-deps`, created with WT CLI from main commit 7194001. This worktree owns dependency graph normalization and root typecheck repair. No agent dispatched yet; dependency install must remain repository-local and reproducible, with no sudo/global-state mutation.

Agent assignment: @Task386Deps will work only in WT branch `task-38-deps` at `../ezxomp.task-38-deps` (created from main commit 7194001 via WT CLI). Integration target is the main checkout; no direct shared-checkout edits are authorized.

Worker attempt on WT branch `task-38-deps` at `../ezxomp.task-38-deps` could not begin: every lean-ctx repository operation was rejected before execution because agent-bus capacity remained 15/15 for `/home/eag1/repo/ezxomp`. No files, tests, commit, or Backlog updates were produced. Safe next action: release/reap only verified stale registrations through the supported infrastructure boundary, then retry this same WT assignment; do not mutate shared checkout.

Worker — dependency normalization complete. Root cause: stale bun.lock pinned @ezxomp/cook and @ezxomp/lean-ctx '*' devDeps to @oh-my-pi/pi-coding-agent@17.3.8 (and its 17.3.8 pi-ai/omptype subtree), while every manifest and the root graph are 18.0.6 — mixed type identities broke cook-tools.ts (34 TSchema IR_BRAND + ExtensionAPI.registerComposerShape errors). Fix: deleted stale bun.lock, bun install regenerated it — all workspaces now resolve @oh-my-pi/* at 18.0.6 exclusively (0 references to 17.3.8 remain). bun.lock is gitignored so reproducibility = manifests + bun install --frozen-lockfile (verified: 'Checked 418 installs, no changes'). Separate latent strict-null errors in test/fixtures/agent-learning-procedures-e2e.ts (guard-narrowed env vars used after fail() exit) fixed with non-null assertions; no behavior change (fail() process.exits). Verification: bunx tsc --noEmit exit 0 (was 77 errors); full bun test test/ 378 pass / 0 fail / 18 skip.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dependency graph normalized to @oh-my-pi 18.0.6 (stale bun.lock regenerated; manifests unchanged; reproducible via bun install --frozen-lockfile). Verified: bun run check exit 0 (was 77 errors); augment 7/7; cook suites green; just verify passed on merged main @ dd7c6e70.
<!-- SECTION:FINAL_SUMMARY:END -->
