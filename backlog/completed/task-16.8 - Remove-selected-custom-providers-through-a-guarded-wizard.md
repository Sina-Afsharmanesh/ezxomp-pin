---
id: TASK-16.8
title: Remove selected custom providers through a guarded wizard
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-22 04:31'
labels:
  - feature
dependencies:
  - TASK-16.2
  - TASK-16.4
  - TASK-16.5
  - TASK-16.6
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/flows/delete.ts
  - /tmp/better-custom-research/src/flows/shared.ts
  - /tmp/better-custom-research/src/ui/select.ts
modified_files:
  - plugins/better-custom/src/flows/delete.ts
  - test/better-custom-delete-flow.test.ts
parent_task_id: TASK-16
priority: medium
type: feature
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement deletion as a separate, narrow provider-maintenance flow. It must reuse the shared selector and persistence helpers from the add-provider ticket, and it must not own editing logic or command registration.

Targets: plugins/better-custom/src/flows/delete.ts and root test/better-custom-delete-flow.test.ts.

Required contract:
- Present existing providers with searchable selection and concise endpoint/model context.
- Require an explicit native OMP confirmation before removing the selected provider.
- Remove exactly the confirmed provider, retain every other provider and unknown top-level field, and save through the discovered config format.
- A canceled selector or rejected confirmation performs no write; missing/stale provider selection reports an actionable result rather than deleting another provider.

Tests must prove confirmed deletion, reject/cancel no-op behavior, and preservation of unrelated configuration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A confirmed deletion removes only the selected provider and preserves all unrelated provider and unknown config data in its original selected format.
- [x] #2 Cancellation, rejected confirmation, and stale selection leave the config unchanged and produce an actionable UI outcome.
- [x] #3 Provider deletion uses the shared selector and persistence paths rather than duplicating config I/O.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect `plugins/better-custom/src/flows/shared.ts`, UI adapter contracts, config preservation behavior, and the upstream delete flow.
2. Add `plugins/better-custom/src/flows/delete.ts` only: load current config, present `providerPickerItems`, require `ctx.ui.confirm`, then call `removeProvider` so selection is re-resolved against freshly loaded config at confirmation time.
3. Preserve no-write paths: selector cancel, confirmation rejection, and missing/stale provider notify clearly and return false; leave persistence exclusively to `removeProvider`/`saveConfigForFlow`.
4. Run the focused delete-flow suite once supplied plus scoped type diagnostics; inspect scoped status. Risks: confirmation must occur before mutation, stale provider ids must not map to another provider, and config format/unknown fields must remain owned by shared helpers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planner authored test/better-custom-delete-flow.test.ts. Targeted command `bun test test/better-custom-delete-flow.test.ts` passed: 3 tests, 10 expectations. Coverage: confirmed target-only removal with unknown-field preservation; rejected-confirm no-op; replacement under the selected id during confirmation remains preserved. The intended RED race was pre-empted by the worker's snapshot/reload fix landing before execution.

Implemented `plugins/better-custom/src/flows/delete.ts` as a single-provider guarded wizard. It selects through `providerPickerItems`/`selectOne`, re-resolves by provider id before confirmation, snapshots the resolved provider across the confirmation await, and delegates removal/persistence to `removeProvider`.

The flow returns without writes for selector cancellation, rejected confirmation, missing provider, or a same-id replacement that appears while confirmation is open. It reports an actionable notification for each no-op path.

[judge t16j-16.8 follow-up t16w-16.8] Added 5th case 'does not delete a provider that vanished while selection was open' to test/better-custom-delete-flow.test.ts, exercising the delete.ts:34-37 no-longer-exists branch (previously unexercised). Mechanism mirrors the same-id-replacement case: fakeContext gained an optional 4th onSelect hook awaited inside the ui.custom stub, so the config rewrite (removing provider id 'vanishing', keeping unrelated top-level + sibling) lands inside selectOne's selection await, before the pre-confirm re-read. Assertions: flow returns false; confirmCalls()===0 (confirm never reached); byte-compare against rewritten text proves zero writes; actionable notify '"vanishing" no longer exists' emitted. Source plugins/better-custom/src/flows/delete.ts untouched per ownership boundary; existing 4 cases unmodified. Verification: bun test test/better-custom-delete-flow.test.ts → 5 pass / 0 fail / 20 expect() calls (was 4/16), exit 0; bunx tsc --noEmit (repo root) exit 0.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: t16w2-16.8
created: 2026-08-21 23:39
---
Worker verification: `bun test test/better-custom-delete-flow.test.ts` passed 4/4 (16 expectations): exact confirmed deletion with unrelated-field preservation; SELECT_CANCEL no-write/no-confirm; rejected confirmation byte-identical no-op; same-id replacement during confirmation byte-identical no-op.

`bun run check` reports zero diagnostics for `plugins/better-custom/src/flows/delete.ts` and `test/better-custom-delete-flow.test.ts`; command remains exit 2 on 878 pre-existing diagnostics outside better-custom.
---

created: 2026-08-21 23:46
---
[judge t16j-16.8] REVIEW_PASSED — adversarial re-review of guarded delete flow. Verified independently: bun test test/better-custom-delete-flow.test.ts 4/4 pass (16 expectations); scoped tsc --noEmit reports zero better-custom diagnostics (repo exit-2 set unchanged, none touch plugins/better-custom/** or the test file). Gate audit of plugins/better-custom/src/flows/delete.ts:deleteProviderFlow — (1) CONFIRM GATE: ui.confirm at delete.ts:40 precedes removeProvider at :50; cancel/reject return via leaveConfigUnchanged with zero writes; cancel test additionally asserts confirmCalls()===0 proving confirm is never reached after SELECT_CANCEL. (2) STALE SAFETY: provider re-resolved by id at :31-37 pre-confirm, snapshotted via JSON.stringify at :39, re-compared against freshly loaded config at :45 before removeProvider; no await sits between the :45 check and removeProvider's synchronous first-load, closing the TOCTOU window; same-id replacement race is byte-proven (config bytes === replacementText after flow returns false). Wrong-provider deletion impossible: removal keyed solely by selected id. (3) EXACTNESS: persistence delegated to shared.removeProvider (rest-destructure of single key + top-level spread), preserving unrelated providers and unknown fields through saveConfigForFlow→saveModelsConfig discovered format; flow contains zero direct fs/Bun.write (grep-verified). (4) Incident residue check: on-disk suite is the coherent canonical 4-case suite (confirmed-deletion/preservation, canceled-selector, rejected-confirm, same-id replacement); canceled-SELECTOR no-op IS covered (test 2, byte-proof present); deleteProviderFlow referenced nowhere outside its own file; no foreign consumers or duplicate suites. Scope: task owns exactly src/flows/delete.ts + test file; flows/{add,edit}.ts belong to sibling tasks 16.6/16.7.
---

created: 2026-08-21 23:46
---
[judge t16j-16.8] FOLLOW-UP (non-blocking): the vanished-provider-before-confirm branch (delete.ts:34-37 'no longer exists') is implemented correctly (notify + return false, statically write-free) but has no dedicated test — AC#2's three named paths (cancel/reject/stale) are each byte-proven, this sibling guard is not exercised. Suggest adding a 5th case (onSelect-time rewrite removing the selected id) if the suite is touched again. Nit: positive-path preservation asserts JSON.parse deep-equality rather than byte equality; acceptable since serialization format is owned and tested at the config boundary.
---

author: orchestrator
created: 2026-08-22 04:31
---
Follow-up closure round complete [judge t16j2 wave]: 5th case added driving the vanished-provider-before-confirm branch (delete.ts:34-37) via fakeContext onSelect hook rewriting config inside the selection await - asserts return false, confirmCalls()===0, byte-identical zero-write config, 'no longer exists' actionable notify. Source delete.ts byte-untouched. Delete suite 4->5 tests / 20 expectations. Judge16x independent verdict REVIEW_PASSED - 0 blocking.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Guarded delete flow delivered: src/flows/delete.ts (searchable selection w/ endpoint/model-count context; explicit ui.confirm gate before removal; stale same-id replacement race guarded by re-resolution at confirm time; all writes via shared removeProvider/persistProvider → config boundary) + test/better-custom-delete-flow.test.ts (4 pass/16 expects: confirmed exactness + preservation byte-proof, canceled-selector no-op, rejected-confirm no-op, same-id replacement protection). Zero better-custom tsc diagnostics; scoped files only. Incident handled: foreign mid-flight test authorship replaced with canonical suite per ownership protocol; rogue agent stood down and recorded. Judge: REVIEW_PASSED, no blockers; non-blocking follow-up recorded (untested vanished-provider-before-confirm branch, delete.ts:34-37).
<!-- SECTION:FINAL_SUMMARY:END -->
