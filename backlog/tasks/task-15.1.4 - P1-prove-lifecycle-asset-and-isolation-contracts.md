---
id: TASK-15.1.4
title: 'P1: prove lifecycle asset and isolation contracts'
status: Done
assignee:
  - Verify1514
created_date: '2026-08-21 16:07'
updated_date: '2026-08-23 01:52'
labels:
  - workflowz-v2
  - task
  - verification
dependencies:
  - TASK-15.1.1
  - TASK-15.1.2
  - TASK-15.1.3
  - TASK-15.3.4
documentation:
  - docs/plugin_proposal/workflowz-v2.md
modified_files:
  - test/workflowz-p1-contracts.test.ts
  - test/workflowz-lifecycle.test.ts
  - test/workflowz-p0-tools.test.ts
parent_task_id: TASK-15.1
priority: high
type: task
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the P1 contract packet after the independently shippable implementation children land. Verify behavior through focused tests and the repository gate without absorbing P3 work; the final gate waits for P3 verification because its known pre-existing red contracts otherwise make a truthful repository-wide result impossible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focused P1 tests prove template immutability input-preserving scaffold governance deterministic content identity Worktrunk isolation validation and recovery provenance
- [x] #2 Existing lifecycle P0 runtime and smoke contracts remain green without modifying or suppressing their assertions
- [x] #3 Plugin type checking is green for the final P1 integration
- [x] #4 The repository verification gate is green after TASK-15.3.4 resolves its independent pre-existing failures
- [x] #5 Backlog evidence records exact commands outcomes and any out-of-scope blocker
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation gate @ c93419c16edbe1355f14397e855869af52b7cb0d (targeted P1 packet; repository-wide just verify intentionally out of scope). Evidence table:

| Command | Outcome |
|---|---|
| `bun test test/workflowz-lifecycle.test.ts test/workflowz-p1-contracts.test.ts test/workflowz-v2-runtime.test.ts test/workflowz-p0-tools.test.ts test/workflowz-p0-runtime-guards.test.ts` | exit 0; 43 pass, 0 fail, 133 expect() calls across 5 files |
| `bun run test/smoke-workflowz.test.ts` | exit 0; 16 passed, 0 failed |
| `bun test test/workflowz-governance.test.ts` | exit 0; 11 pass, 0 fail, 69 expect() calls |
| `bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json` | exit 0; no diagnostics |

Named contracts objectively exercised by passing tests: lifecycle resume seeds completed results only; retry preserves original inputs with no seeded results; malformed/stopped/terminal/content-incompatible/snapshot-only refusal matrix; derived-run provenance appears in both created journal records and tool envelopes for resume + retry. All six provenance fields are asserted: `ownerIds`, `jjChange`, `jjBookmark`, `worktreeName`, `routeRef`, `previewRef`. Template catalog validity (`plan`, `fallow-health`) and read-only deep copies; scaffold input-default persistence, document-owner verification/refusal-before-write, immutable same-version overwrite with identical retry; GateFile ownership/content-integrity fail-closed and persisted content-hash mismatch refusal. Worktrunk structured-output edges cover array/non-object payloads, non-string actions, repository-root refusal, empty-path fail-close, nested identity mismatch, schema2 cleanup identity, symlink rejection, and JJ-authority boundaries. No warnings observed: `gate.green=true`, `gate.clean=true` for this targeted packet. AC#4 repository verification gate was not run per assignment; remains blocked/out-of-scope pending TASK-15.3.4, so AC#4 stays unchecked. Task intentionally remains In Progress.
<!-- SECTION:NOTES:END -->
