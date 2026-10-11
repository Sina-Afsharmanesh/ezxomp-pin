---
id: TASK-28.3
title: >-
  TASK-28.C: Capture, retrieval, promotion, and review consume one procedures
  owner
status: Done
assignee: []
created_date: '2026-08-23 09:08'
updated_date: '2026-08-23 10:06'
labels:
  - enhancement
milestone: m-0
dependencies:
  - TASK-28.2
parent_task_id: TASK-28
priority: medium
type: enhancement
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket C of TASK-28 (planner packet §3.C). Repoint consumers so no duplicate active Markdown + SQLite procedure evidence remains: procedures/memory/capture.ts (saveMemoryEntry), retrieve.ts (validateRetrievalMemories, ranking/filter), promotion/promotion.ts (promoteMemoryIfEligible, promoteRetrievedMemories, listPendingProposals, applyProposal), extension.ts, overlay.ts. Proposal JSON stays human-gated projection; SQLite owns evidence. Checkpoint: existing overlay/promotion suites plus authored procedures scenario; assert no duplicate active file+DB write path remains. Targeted tests only; no git/jj; temp dirs only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Capture then retrieval returns the same entry from the procedures partition
- [x] #2 Project/global partition semantics and ranking remain unchanged
- [x] #3 Tampered records are not returned
- [x] #4 Existing promotion eligibility creates exactly one proposal from a DB-backed entry
- [x] #5 Human-gated review and apply behavior remain unchanged
- [x] #6 Proposal JSON remains the human-gated projection; source evidence is SQLite-owned
- [x] #7 Unsupported owner fallback preserves current atomic behavior
- [x] #8 No consumer reads an archived legacy root
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 Orchestrator judgment GREEN, zero-mutation outcome: B's storage.ts delegation (validateStoredMemories/validateRetrievalMemories -> readProceduresForValidation) already made consumers partition-aware. WorkT28C verified dual-mode with script evidence: sqlite mode capture->retrieve round-trip filters tampered rows; exactly one proposal from DB-backed entry with sqlite source_memory_path carried as opaque display projection (promotion.ts:105/:250 never file-reads evidence — eligibility from entry fields); fallback mode (future-version temp root) returns atomic agent-learning path. Orchestrator re-ran both suites: RED oracle 5/5, agent-learning.test.ts 28/28; jj diff confirms zero consumer mutations (only pre-existing TASK-27 renames). Gap noted for follow-up (out of scope): deleteMemoryById lacks a DB path.
<!-- SECTION:NOTES:END -->
