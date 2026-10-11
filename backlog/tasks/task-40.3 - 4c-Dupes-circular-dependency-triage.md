---
id: TASK-40.3
title: '4c: Dupes + circular-dependency triage'
status: Done
assignee: []
created_date: '2026-08-28 16:50'
updated_date: '2026-08-28 17:08'
labels: []
milestone: m-3
dependencies: []
parent_task_id: TASK-40
priority: medium
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Triage duplication and circular-dependency findings (distinct from the dead-code triage in 4b — circular deps are part of `fallow dead-code`, dupes of `fallow dupes`). Scope: (1) Run `npx fallow dupes` (note the default mild mode) and `npx fallow dead-code --circular-deps` in the task workspace. (2) Triage EVERY finding: for dupes — decide per clone group whether to extract a shared helper (fix in place) or capture a Backlog task (often deliberate parallelism across plugins); for circular deps — either break the cycle in place (re-export reshuffle, extract common module) or capture a Backlog task with the exact cycle path (A -> B -> A with file:line for each edge). (3) Findings fixed in place should be followed by a final `just fallow-baseline` re-run (ratchet down) so committed baselines do not freeze known-fixed cycles/dupe groups. (4) Confirm `just fallow-audit` still exits 0 after any in-place fixes. Record the full triage table (finding -> fix or ticket-id) in task notes. Independent of 4b's dead-code triage (different finding types) but shares the config from 4a; if 4b re-captured baselines, re-verify against those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every circular-dependency finding from the initial scan is either broken in place or captured as a Backlog task with the full cycle path (file:line per edge)
- [ ] #2 Every dupes clone group is either extracted to a shared helper or captured as a Backlog task with the involved files
- [ ] #3 just fallow-audit exits 0 after all in-place fixes
- [ ] #4 Triage table (finding -> fixed-in-place|ticket-id) recorded in task notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator-authoritative fallow evidence triaged without source edits. Follow-ups: TASK-40.5 (A, circular deps, high): code-nav symbol-backends.ts:2:9 ↔ symbol-fallback.ts:6:9; experiences storage/backup.ts:8:9 ↔ sqlite.ts:6:9; extensible-workflows runtime.ts:25:9 ↔ templates.ts:5:9; plannotator plannotator-browser-runtime.ts:71:25 ↔ plannotator-browser.ts:42:1. TASK-40.6 (B, duplicate exports, medium): WorkflowDiagnostic library.ts:58:17 ↔ runtime.ts:95:17; WorkflowError library.ts:84:17 ↔ runtime.ts:107:17; setCodesightRunnerForTest codesight.ts:157:16 ↔ tools.ts:37:16; slugify better-custom ui/prompts.ts:318:16 ↔ url.ts:155:16; supportsProceduresPartition storage/schema.ts:316:16 ↔ sqlite.ts:306:16; plus plannotator browser.ts ↔ events.ts cluster (all reported locations). TASK-40.7 (C, unused deps, medium): plugins/plannotator/package.json:61, :65, :66, :67 (@joplin/turndown-plugin-gfm, diff, parse5, turndown; inspect :75 @types/turndown). TASK-40.8 (D, dependency hygiene, medium): agent-experience schedule/systemd.ts:86 unresolved dist/experience-consolidate.mjs import; unlisted @oh-my-pi/pi-agent-core, pi-ai, pi-tui. TASK-40.9 (E, unused files, low): ultra-compact extensions/utils.ts:1-125; agent-experience semantic/openai-compatible.ts:1 provenance-kept. TASK-40.10 (F, duplication hotspots, low): plannotator serverAnnotate.ts:620-838 ↔ serverReview.ts:2455-2745; backlog extensions/tools.ts:60-894 clone groups; better-custom ui/select.ts:85-108 ↔ :191-214; agent-experience index.ts:539-551, :597-612, :658-672. All six tickets assigned milestone m-3; this slice was triage-only and no source files changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Triage-only: 6 follow-up tickets created (TASK-40.5 circular deps high; 40.6 duplicate exports; 40.7 unused plannotator deps; 40.8 dep hygiene systemd.ts:86 + unlisted @oh-my-pi/*; 40.9 remaining unused files; 40.10 duplication hotspots), all on m-3 with file:line evidence. No source changes.
<!-- SECTION:FINAL_SUMMARY:END -->
