---
id: TASK-40.6
title: Resolve fallow duplicate export definitions
status: Done
assignee:
  - '@PregnantSparrow'
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
priority: medium
type: chore
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Triage and resolve the confirmed duplicate exports that make barrel/module resolution ambiguous. Choose one canonical definition or an explicit shared implementation/re-export without changing public APIs. Fallow evidence: plugins/extensible-workflows/src/library.ts:58:17 ↔ runtime.ts:95:17 (WorkflowDiagnostic); library.ts:84:17 ↔ runtime.ts:107:17 (WorkflowError); plugins/codesight/src/codesight.ts:157:16 ↔ tools.ts:37:16 (setCodesightRunnerForTest); plugins/better-custom/src/ui/prompts.ts:318:16 ↔ url.ts:155:16 (slugify); plugins/experiences/extensions/agent-experience/src/storage/schema.ts:316:16 ↔ sqlite.ts:306:16 (supportsProceduresPartition); plannotator cluster, plugins/plannotator/plannotator-browser.ts ↔ plannotator-events.ts: stopAllBrowserSessions 90:16 ↔ 19:16, openPlanReviewBrowser 252 ↔ 32, startPlanReviewBrowserSession 219 ↔ 25, openCodeReview 264 ↔ 46, startCodeReviewBrowserSession 272 ↔ 39, openMarkdownAnnotation 548 ↔ 60, startMarkdownAnnotationSession 571 ↔ 53, openLastMessageAnnotation 631 ↔ 74, startLastMessageAnnotationSession 641 ↔ 67, openMarkdownAnnotation open variant 548 ↔ 60, openArchiveBrowserAction 663 ↔ 81. Milestone: m-3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The five cross-plugin duplicate export pairs have one unambiguous canonical definition or explicit shared implementation, with public imports preserved.
- [ ] #2 The plannotator browser/events duplicate-export cluster is resolved consistently across every listed export and its callers.
- [ ] #3 A duplicate-export scan confirms the recorded pairs no longer produce ambiguous duplicate definitions.
- [ ] #4 Targeted tests or smoke checks covering affected modules pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect both better-custom slugify definitions and all plugin consumers; preserve url.ts slugify as the provider-id canonical helper because it supplies the provider fallback. 2. Rename only ui/prompts.ts slugify to promptSlugify and update its local prompt-gate callers; no external imports were found. 3. Run the better-custom targeted test files and verify the identifier scan leaves one slugify definition.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from TASK-40.3 fallow dupes scan; includes the five named pairs plus the plannotator browser/events cluster; milestone m-3.

Renamed plugins/better-custom/src/ui/prompts.ts:318 export and its two local callers at :348 and :364 from slugify to promptSlugify. Kept plugins/better-custom/src/url.ts:155 slugify canonical because it provides the provider fallback. AST identifier scan under plugins/better-custom now finds slugify only at url.ts:155 and :162, and promptSlugify only at prompts.ts:318, :348, :364. Targeted better-custom tests passed: 26 pass, 0 fail across test/better-custom-command.test.ts, test/better-custom-config.test.ts, test/better-custom-delete-flow.test.ts, and test/better-custom-probe.test.ts.

Plannotator duplicate-export cluster: all listed browser.ts ↔ events.ts pairs are intentional namespaced twins, not duplicates to dedupe. browser.ts owns eager actual implementations (stopAllBrowserSessions, open/start plan/code/markdown/last-message flows, openArchiveBrowserAction); events.ts owns the lazy event-facing wrappers that call loadPlannotatorBrowser() and preserve the startup boundary. Dedupe/re-export would either defeat lazy loading or remove the actual implementation surface. Coordinator should add this exact JSON to .fallowrc.json top-level ignoreExports: {"ignoreExports":[{"file":"plugins/plannotator/plannotator-browser.ts","exports":["stopAllBrowserSessions","openPlanReviewBrowser","startPlanReviewBrowserSession","openCodeReview","startCodeReviewBrowserSession","openMarkdownAnnotation","startMarkdownAnnotationSession","openLastMessageAnnotation","startLastMessageAnnotationSession","openArchiveBrowserAction"]},{"file":"plugins/plannotator/plannotator-events.ts","exports":["stopAllBrowserSessions","openPlanReviewBrowser","startPlanReviewBrowserSession","openCodeReview","startCodeReviewBrowserSession","openMarkdownAnnotation","startMarkdownAnnotationSession","openLastMessageAnnotation","startLastMessageAnnotationSession","openArchiveBrowserAction"]}]}. The user listed nine pairs; startLastMessageAnnotationSession is also explicitly present in TASK-40.6 scan and is included, making ten unique intentional twins.

Scoped verification: `bun test plugins/plannotator/startup.test.ts plugins/plannotator/plannotator-browser.test.ts` passed 6/6; no root-level test filenames matched `ls test/ | grep -i plannotator` (grep exit 1, empty output).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
5 dup-export pairs resolved: WorkflowDiagnostic/WorkflowError deduped (runtime re-exports from library); setCodesightRunnerForTest wrapper deleted (delegated to shared seam, zero consumers); slugify renamed promptSlugify in ui/prompts.ts (url.ts canonical); supportsProceduresPartition deduped (sqlite re-exports from schema); 9 plannotator browser/events pairs confirmed intentional lazy-wrapper twins → fallow ignoreExports config (coordinator-applied). Verified: fallow dup pairs 5→0; just check exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
