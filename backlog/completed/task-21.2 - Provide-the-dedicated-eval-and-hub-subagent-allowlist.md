---
id: TASK-21.2
title: Provide the dedicated eval-and-hub subagent allowlist
status: Done
assignee: []
created_date: '2026-08-22 13:07'
updated_date: '2026-08-22 14:00'
labels:
  - feature
  - refactor
dependencies:
  - TASK-21.1
parent_task_id: TASK-21
priority: high
type: feature
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Separate /evo-sub from the broad, live /evo main-agent allowlist. Child profiles need a stable minimal surface for survival and mandatory coordination, without changing any /evo main behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dedicated subagent allowlist builder returns exactly ["eval", "hub"] in that order with no native, lean-ctx, backlog, task, or web tool
- [x] #2 /evo-sub activation obtains its profile tools from the dedicated builder rather than the /evo main builder
- [x] #3 The persisted sub-state tool-list fingerprint represents the two-tool child surface without changing original-profile backups
- [x] #4 The broad /evo main allowlist builder and its behavior remain unchanged
- [x] #5 The focused plugin test command advances the allowlist contract from RED without weakening any test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker implementation (TASK-21.2): Added buildEvoSubTools() to ~/.omp/omp-evo-mode/extensions/evo/tools.ts as an append-only edit returning exactly ["eval", "hub"] with doc comment explaining hub is solely for reporting to Main. Byte-identity of the /evo boundary proven by hash: pre-edit SHA-256 7d8128bf65c80c3dac0082f418e1907e712963a3bd38e658a55eab407398ef3a equals post-edit hash of bytes 0-1941 (the entire original file).

Swapped evoSub.ts activation callsite from await buildEvoMainTools(this.piTools) to const evoTools = buildEvoSubTools() and updated the import; source guard (test 17) passes — evoSub.ts contains buildEvoSubTools and zero buildEvoMainTools references. writeSubState still persists the two-tool list so toolListHash fingerprints the child surface.

Backup manifest per parent plan procedure (tree not git-tracked): /home/egsox/.omp/agent/evo-mode/worker-backups/TASK-21.2/2026-08-22T13-27-07-Z/ holds tools.ts + evoSub.ts + manifest.txt with pre-edit SHA-256s (tools.ts 7d8128bf…398ef3a, evoSub.ts 817746a290490627300509a68f97c8cbc9f15e537d46332d45e439a283f65e9c).

Verification: bun run test -- tests/extension.test.ts -> exit 1, 20 tests, 16 passed / 4 failed (predicted end state). Contract tests for this slice GREEN: test 14 (buildEvoSubTools returns ["eval","hub"]) and test 17 (source guard + /evo boundary isolation). Remaining REDs are later seams, each assertion-confirmed: test 7 expects EVO_SUB_BRIEF_START marker (TASK-21.3 injection), test 16 six-cook-profile-only discovery (TASK-21.3), test 18 hydrated allowlistSize()==2 after restart (TASK-21.4). No previously-passing test regressed; typecheck remains a declared prerequisite gap (exit 127, typescript absent) outside this ticket's scope.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: orchestrator
created: 2026-08-22 13:31
---
Independent orchestrator verification matches worker exactly: scoped run 20 tests / 16 pass / 4 fail (tests 7,15,16,18 - all later-seam REDs mapped to TASK-21.3 x3 and TASK-21.4 x1), zero regressions among previously-green. Judge station for this ticket will be satisfied by a batched adversarial review covering TASK-21.2+21.3 together after the injection seam lands (budget-ceiling mitigation: one fresh judge context over both deltas instead of two micro-rounds on a 6-line builder); recorded here so the deferral is explicit and auditable.
---

created: 2026-08-22 14:00
---
[judge][FOLLOW-UP] extensions/index.ts + evoMain.ts + config.ts were declared 'read-only boundary witnesses to be hashed' in parent plan step 1, but no baseline sha256 for them exists in any surviving manifest (planner manifest covers only extension.test.ts; worker manifests cover tools.ts/evoSub.ts/frontmatter.ts). Boundary integrity was instead confirmed by direct inspection this round (zero subCtl/buildEvoSubTools refs in /evo block :70-131; evoMain keeps buildEvoMainTools). Fix: append current witness sha256s to the next backup manifest so future deltas are provable.
---

created: 2026-08-22 14:00
---
[judge] VERDICT REVIEW_PASSED for TASK-21.2: buildEvoSubTools appended byte-pure to tools.ts returning ["eval","hub"] (original bytes verbatim prefix, SHA-proven); evoSub callsite swapped with zero buildEvoMainTools refs; toolListHash fingerprints two-tool surface; focused suite 20 tests / 19 pass / 1 fail where the sole failure is the out-of-scope TASK-21.4 seam (seedProfiles ReferenceError at tests/extension.test.ts:525 — helper defined only inside the sibling describe at :251).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dedicated child allowlist delivered: buildEvoSubTools() -> ["eval","hub"] appended to extensions/evo/tools.ts (buildEvoMainTools byte-identical, SHA-proven); evoSub.ts activation callsite+import swapped with zero buildEvoMainTools refs (source guard test 17 green); sub-state fingerprint now reflects the two-tool surface with original-profile backups untouched (worker-backups/TASK-21.2 manifest + sha256s). Focused suite: 20 tests / 16 pass / 4 fail = exact predicted end state; contract tests 14+17 green; remaining REDs assertion-mapped to 21.3 (7,15,16) and 21.4 (18). Independent orchestrator re-run matched worker counts exactly. Batched judge round deferred to post-21.3 per recorded decision.
<!-- SECTION:FINAL_SUMMARY:END -->
