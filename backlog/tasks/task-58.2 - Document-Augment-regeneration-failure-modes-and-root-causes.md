---
id: TASK-58.2
title: Document Augment regeneration failure modes and root causes
status: Done
assignee: []
created_date: '2026-08-31 01:00'
updated_date: '2026-08-31 01:43'
labels: []
dependencies: []
parent_task_id: TASK-58
priority: high
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Trace the current prompt-regeneration path from command through model resolution, authentication, completion, timeout, retry, and parsing; reproduce concrete failure modes where possible; record evidence and a ranked durability ledger on TASK-58. This spike changes no production behavior and can ship as durable investigation evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TASK-58 notes identify each confirmed root cause or failure surface with exact file:line code-path evidence and observed reproduction output
- [x] #2 Investigation distinguishes operator-observed failures, reproduced failures, code-proven behavior, and hypotheses
- [x] #3 A ranked ledger records evidence-backed durability enhancements, rationale, and disposition without silently expanding implementation scope
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Researcher envelope recorded (cook-researcher, 2026-08-31). Deliverables: doc-21 (failure-mode/root-cause investigation; stored type=specification with intended-research top line due to CLI type-surface gap), 12 evidence surfaces with file:line + observed output, evidence classes (operator-observed/reproduced/code-proven/hypothesis), ranked 11-item durability ledger with dispositions. Key results: (1) critical reproduced root cause — auth+completion bound to active ctx.model, @smol never consulted (enhance.ts:17,23,37); (2) unavailable @smol does not fail closed (reproduced); (3) high: provider error/stop reasons misclassified as format failures (enhance.ts:126,192-197 + pi-ai event-stream.ts:169-179,191); (4) high: per-call 45s timeout, correction path lacks total deadline; (5) medium: parser copy/behavior mismatch (parser.ts:18-45); (6) missing /aug (reproduced). Dispositions: 58.5 covers ranks 1; 58.6 covers rank 2; ranks 3-8 recorded as recommend-follow-up; 9-11 no-action. Stale packet: parser throw at line 34 (minor). No production code changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root-cause investigation complete: doc-21 with 12 evidence-classified failure surfaces (file:line + observed output), ranked 11-item durability ledger with dispositions; reproduced critical routing root cause (active model used, @smol never consulted) and non-fail-closed unavailable-SMOL behavior; follow-ups durably recorded for provider-error classification, total deadline, parser strictness, and context minimization. Verified: doc-21 view + TASK-58 notes ledger.
<!-- SECTION:FINAL_SUMMARY:END -->
