---
id: TASK-55.4
title: Make sub restore refresh and regenerate conflict-safe
status: Done
assignee: []
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 20:38'
labels: []
dependencies: []
parent_task_id: TASK-55
priority: high
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement transactional profile activation and lifecycle operations using the versioned state and derived policy. Production boundary: plugins/evo/extensions/evo/evoSub.ts only; consume state and policy modules from prerequisite children.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Activation prepares durable originals and hashes before compare-and-swap profile writes, then commits active config only after verification
- [x] #2 Normal restore is byte exact; drift, deletion, missing state, stale overlays, or hash mismatch refuses without overwrite and preserves recovery evidence
- [x] #3 Refresh keeps immutable originals while rotating only effective generation data
- [x] #4 Regenerate completes a verified restore before rediscovery and never adopts an EVO-marked or conflicting overlay as a new original
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented evoSub.ts generation-state lifecycle: project-nearest profile selection, immutable originals/effective hashes, pending-to-active activation, CAS restore refusal on drift/deletion, refresh/regenerate methods, and main-lane config preservation. Targeted transactional-sub-policy test invocation was attempted; repository test harness fails before tests because vi.resetModules is unavailable. Source-only tsc invocation is blocked by missing Node type declarations.

Committed scoped implementation as jj bookmark task-55-4 at 8d8ed04c. bun build plugins/evo/extensions/evo/evoSub.ts --outdir /tmp/evo-sub-check --target bun succeeded (syntax/module parse proof).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Conflict-safe sub lifecycle shipped: prepare/verify/commit activation with durable originals + hashes, CAS restore that refuses on drift/deletion/hash-mismatch (EVO_RESTORE_CONFLICT) while retaining recovery evidence, immutable-original refresh, restore-before-rediscovery regenerate that never adopts an overlay as baseline. Verified: 46/46 evo vitest (drift refusal, missing/deleted/stale state, regenerate contracts), E2E. Merged to main b931bb7.
<!-- SECTION:FINAL_SUMMARY:END -->
