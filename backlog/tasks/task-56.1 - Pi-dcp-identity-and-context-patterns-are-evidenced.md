---
id: TASK-56.1
title: Pi-dcp identity and context patterns are evidenced
status: Done
assignee: []
created_date: '2026-08-30 00:13'
updated_date: '2026-08-30 00:59'
labels:
  - research
  - investigation
dependencies: []
parent_task_id: TASK-56
priority: high
type: spike
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Research the operator-named “Pi-dcp” before any compact-eng design. The name is unverified and has no local repository match. Identify the actual primary project/repository if evidence is decisive; otherwise document all plausible candidates, citations, distinguishing facts, and the exact unresolved ambiguity without selecting one. Publish a Backlog research document; do not edit production files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Backlog document of type research cites primary sources for every identified Pi-dcp candidate and records the lookup method/date.
- [x] #2 The document either identifies one actual project with direct evidence or presents evidence-distinguished candidates and an explicit disambiguation requirement; it does not guess.
- [x] #3 Context-management, compaction, recovery, and extension patterns relevant to compact-eng are extracted with source links and clearly separated from interpretation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify local and primary-source references for exact and adjacent Pi-dcp names using repository search, GitHub repository/code search, badlogic organization/repository indexes, and web search; record lookup date and query methods.
2. Evidence-distinguish every plausible candidate by ownership, purpose, Pi integration, and documented context behavior; identify one only if a primary source directly resolves the operator name, otherwise preserve ambiguity and state the exact disambiguation question.
3. Inspect primary-source documentation and code for context management, compaction/summarization, recovery/refetch, and extension/hook patterns; separate quoted facts from compact-eng interpretation.
4. Run isolated ADHD frames (economic, security, performance, UX), focus-score and cluster the resulting design ideas against verified evidence, and retain only source-compatible patterns.
5. Publish a cited Backlog research document, re-open it as objective verification, then record task notes, check only evidenced ACs, and add a final summary.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-researcher", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-researcher's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
RESEARCHER → TASK-56.1
Problem: Identify the actual project/repo behind the operator-named 'Pi-dcp' (context-engineering for the Pi coding agent; no local repo match) and extract context-management/compaction/recovery/extension patterns relevant to building an OMP plugin (compact-eng) that keeps per-turn context low via native Shake (artifact:// output shaking) and snapcompact (bitmap-frame compression).
ADHD: economic, security, performance, ux
1. Diverge: isolated frames
2. Focus: score, cluster, prune
3. Record findings: backlog_doc_create with type="research" (REQUIRED)
Return ResearcherEnvelope.

Record all results on task TASK-56.1 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-researcher", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-researcher's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
RESEARCHER → TASK-56.2
Problem: Extract context-management/compaction patterns from https://github.com/agenticoding/pi-agenticoding relevant to an OMP plugin (compact-eng) that keeps per-turn context low via native Shake + snapcompact, without overwriting native behavior.
ADHD: economic, security, performance, ux
1. Diverge: isolated frames
2. Focus: score, cluster, prune
3. Record findings: backlog_doc_create with type="research" (REQUIRED)
Return ResearcherEnvelope.

Record all results on task TASK-56.2 via backlog_task_edit.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-researcher", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-researcher's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
RESEARCHER → TASK-56.3
Problem: Evidence the OMP-native extension contracts: how a plugin can hook into and extend OMP-native Shake (output shaking to artifact://) and @oh-my-pi/snapcompact 18.0.6 (bitmap-frame compression) plus before_compact / session_before_compact hooks and ExtensionContext compact()/getContextUsage(), without overwriting native behavior.
ADHD: economic, security, performance, ux
1. Diverge: isolated frames
2. Focus: score, cluster, prune
3. Record findings: backlog_doc_create with type="research" (REQUIRED)
Return ResearcherEnvelope.

Record all results on task TASK-56.3 via backlog_task_edit.

Published doc-16 at `backlog/docs/research/pi-dcp-identity-context-patterns/` using `backlog_doc_create` with requested type `research`; tagged `TASK-56.1,research,pi-dcp,context-management,compaction,recovery,compact-eng`. Objective verification: `backlog_doc_view doc-16` shows the complete lookup method/date, 12 evidence-distinguished candidate groups with primary-source URLs, explicit unresolved-identity question, four fact-only pattern sections (context, compaction, recovery, hooks), a separately labelled compact-eng interpretation, and economic/security/performance/UX ADHD divergence plus scored focus. Identity remains unresolved: public evidence does not select an owner. Compatibility note: installed Backlog CLI persists requested research docs under legacy metadata `type: other`; `backlog_doc_update` rejects `research` and only accepts readme/guide/specification/other. The document therefore carries `research` in its tag and docs path; the tool-schema/CLI mismatch was reported via `xd://report_issue`, and no Backlog file was hand-edited.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @eag1
created: 2026-08-30 00:59
---
OPERATOR DISAMBIGUATION (2026-08-30): the intended Pi-dcp pattern source is pi-vault/pi-dcp — npm package pi-dcp@0.6.0 (context pipeline: compression, persistence, decompress recovery, thresholds/protection). Downstream synthesis (TASK-56.4) and spec (TASK-56.5) treat pi-vault/pi-dcp as the primary Pi-dcp source; other candidates in doc-16 remain recorded as evidence but are not the operator's intent.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published cited Pi-dcp identity/pattern research as doc-16. GitHub/API/Pi-registry lookup found multiple viable identities, so the document preserves ambiguity and asks for owner/repo disambiguation instead of guessing. It extracts source facts for request-only context projection, protected/pair-safe compaction, stable reversible recovery, lifecycle/tool hooks, native-compaction composition, cache economics, and bounded refetch; compact-eng interpretations are explicitly separated. Verified by reopening `backlog_doc_view doc-16`; all three AC content requirements are present. Research-type compatibility normalization is recorded in notes.
<!-- SECTION:FINAL_SUMMARY:END -->
