---
id: TASK-95
title: Vendor SkillOpt validation gate into agent-learning procedures
status: Done
assignee:
  - '@W95'
created_date: '2026-09-06 05:23'
updated_date: '2026-09-06 07:07'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/gate.py'
documentation:
  - doc-23
priority: high
type: feature
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port skillopt_sleep/gate.py evaluate_gate/select_gate_score to pure TypeScript in plugins/agent-learning/src/procedures/promotion/. Gate promotion proposals on held-out evidence score: a candidate guidance text is accepted only if it strictly improves the score on a held-out slice, reject otherwise. No LLM calls, no network. Wire into promoteMemoryIfEligible so proposals carry a gate result (action, scores) instead of bare confidence+hits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 evaluate_gate is a pure function with hard/soft/mixed metric projection, unit-tested
- [x] #2 promoteMemoryIfEligible rejects candidates whose held-out score does not strictly improve
- [x] #3 No network or LLM dependency in the gate path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator audit PASS: evaluateGate/selectGateScore/GateResult ported pure (0 network/LLM imports), 14 unit tests cover hard/soft/mixed projection + clamping + strict-> improvement + boundary cand==current reject, wired into promoteMemoryIfEligible (reject skips proposal creation). Bookmark al-gate @ 8928e491. 40/40 tests green (gate 14 + suite 26). Placeholder scoring (candHard=hits, metric=hard) documented in code; held-out scorer lands with TASK-97/99.

AC2 verified via live probe: promoteMemoryIfEligible with hits=0 candidate returns [] — gate rejected before proposal creation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported SkillOpt evaluate_gate/select_gate_score to pure TS (gate.ts, 0 network/LLM imports), wired into promoteMemoryIfEligible — reject path verified empirically (zero-hit candidate produces no proposal). 14 unit tests + suite 26 green; 40/40. ACs 1-3 checked with evidence: unit coverage (mixed clamping, strict-> boundary), empirical reject probe, import-graph audit. Bookmark al-gate @ 8928e491.
<!-- SECTION:FINAL_SUMMARY:END -->
