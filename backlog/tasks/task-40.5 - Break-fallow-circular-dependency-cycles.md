---
id: TASK-40.5
title: Break fallow circular dependency cycles
status: Done
assignee:
  - '@MarxistParakeet'
created_date: '2026-08-28 17:05'
updated_date: '2026-08-28 17:52'
labels:
  - refactor
  - architecture
milestone: m-3
dependencies: []
references:
  - TASK-40.3
parent_task_id: TASK-40
priority: high
type: chore
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refactor the four confirmed import cycles that can create initialization-order and tree-shaking risk. Preserve public behavior while extracting or relocating shared dependencies so each cycle is broken. Fallow evidence: plugins/code-nav/src/symbol-backends.ts:2:9 → symbol-fallback.ts:6:9 → symbol-backends.ts; plugins/experiences/extensions/agent-experience/src/storage/backup.ts:8:9 ↔ sqlite.ts:6:9; plugins/extensible-workflows/src/runtime.ts:25:9 ↔ templates.ts:5:9; plugins/plannotator/plannotator-browser-runtime.ts:71:25 ↔ plannotator-browser.ts:42:1. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The symbol-backends.ts:2:9 ↔ symbol-fallback.ts:6:9 cycle is eliminated without changing the code-nav public contract.
- [x] #2 The storage/backup.ts:8:9 ↔ storage/sqlite.ts:6:9 cycle is eliminated without changing agent-experience storage behavior.
- [x] #3 The extensible-workflows runtime.ts:25:9 ↔ templates.ts:5:9 cycle is eliminated without changing workflow runtime/template behavior.
- [x] #4 The plannotator-browser-runtime.ts:71:25 ↔ plannotator-browser.ts:42:1 cycle is eliminated without changing browser behavior.
- [x] #5 A dependency scan confirms no listed cycle remains and targeted tests or smoke checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Break code-nav cycle by moving the shared extension-to-AST language map and detectLangFromPath helper to symbol-fallback.ts, while keeping symbol-backends.ts public exports via imports/re-exports; remove the unused reverse MatchKind type edge. 2. Break extensible-workflows cycle by relocating gate file shared types/helpers/resolution into library.ts, re-exporting the same public template symbols from templates.ts, and switching runtime.ts to library imports while preserving runtime type re-exports. 3. Inspect targeted tests, run only code-nav/extensible-workflows tests if present, and ask Main to run just check for compile proof.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow dead-code circular-dependency scan; milestone m-3.

Milestone assignment requested: m-3.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-40
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-40 via backlog_task_edit.

W2 storage slice: broke backup.ts ↔ sqlite.ts by extracting loadSqlite, SqliteDbHandle, bunSqliteBackup, and isBunSqliteRuntime into storage/shared.ts. backup.ts now imports runtime helpers from shared.ts; sqlite.ts imports loadSqlite from shared.ts, re-exports all runtime helpers/types for its existing public surface, and retains recovery integration without importing backup transitively through runtime helpers. Verified targeted test test/agent-learning-procedures-sqlite.test.ts: 5 pass / 0 fail (2.35s); fallow scan no longer reports the backup↔sqlite cycle.

Plannotator finding (plannotator-browser-runtime.ts:71:25 ↔ plannotator-browser.ts:42:1): cycle is real but behavior-preserving extraction is straightforward. Move the five asset/startup helpers and state (moduleDirectory, planHtmlPath/reviewHtmlPath, planHtmlContent/reviewHtmlContent, hasReadableAsset, readBrowserAsset, plus getStartupErrorMessage) into new plannotator-browser-shared.ts. browser.ts imports shared directly; runtime.ts re-exports the five helpers from shared while retaining its dynamic import('./plannotator-browser.ts') loader. This preserves runtime/events public imports and lazy browser startup while removing browser.ts → runtime.ts edge. Exact edit specs sent to Main; coordinator applies due evo write block.

Scoped verification: `bun test plugins/plannotator/startup.test.ts plugins/plannotator/plannotator-browser.test.ts` passed 6/6 (startup graph boundary, coalesced loader, browser behavior). `ls test/ | grep -i plannotator` found no matching root-level test files.

Worker W1 completed both assigned cycle slices in the shared copy. Code-nav: moved extToAstGrepLang and detectLangFromPath ownership into symbol-fallback.ts; symbol-backends.ts imports internal helpers and re-exports detectLangFromPath, while MatchKind moved to the symbol-normalization.ts leaf and remains re-exported from symbol-backends.ts. This removes the fallback→backends edge and preserves the public API. Extensible-workflows: extracted gate persistence/types/helpers (including resolveGateFile) into the new gates.ts leaf, with SLUG_RE shared from library.ts; templates.ts re-exports the existing gate symbols and keeps its runtime validation/template behavior, while runtime.ts imports resolveGateFile/GateFileV1 from gates.ts. Resulting direction is runtime→gates→library and templates→runtime/library/gates, with no runtime↔templates cycle. Coordinator verification: just check exited 0; targeted workflowz suites (v2-runtime, p1-contracts, governance, p0-runtime-guards, p0-tools, lifecycle, observability, p3-polish, smoke-workflowz) reported 124 tests passing; Fallow scan reported 0 circular dependencies (down from 4). No direct code-nav-specific test file was found under test/.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All 4 cycles eliminated (W1/W2/W3 coordination, coordinator-applied edits): code-nav backends↔fallback broken via detectLangFromPath/extToAstGrepLang moved to fallback + MatchKind moved to symbol-normalization leaf (public re-exports preserved); experiences storage backup↔sqlite broken via storage/shared.ts (loadSqlite, SqliteDbHandle, bunSqliteBackup, isBunSqliteRuntime); extensible-workflows runtime↔templates broken via gates.ts (pure gate domain: schema, validation, drafting, resolveGateFile/saveGateFile/resolveGateReference — no runtime deps; scaffold stayed in templates); plannotator browser-runtime↔browser broken via plannotator-browser-shared.ts (asset/startup helpers). Verification: just check exit 0; fallow scan 0 circular deps; workflowz 91 tests 0 fail; codesight-runner 5 pass; agent-learning-procedures-sqlite 5 pass.
<!-- SECTION:FINAL_SUMMARY:END -->
