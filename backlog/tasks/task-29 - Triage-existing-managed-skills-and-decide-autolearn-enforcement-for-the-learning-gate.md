---
id: TASK-29
title: >-
  Triage existing managed skills and decide autolearn enforcement for the
  learning gate
status: Done
assignee: []
created_date: '2026-08-23 07:09'
updated_date: '2026-08-23 10:46'
labels:
  - chore
  - investigation
milestone: m-0
dependencies: []
priority: medium
type: task
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-27 (doc-5 edge case + AC5 remainder). The user's ~/.omp/agent/managed-skills holds ~33 auto-generated skills written by native autolearn (autolearn.enabled + autoContinue) with no review gate. TASK-27 shipped the advisory learning.review gate (env LEARNING_REVIEW=1 or <agentDir>/agent-learning.json {"review":true}) that routes future captures, but (a) the existing 33 entries are unclassified and (b) the gate cannot intercept the native learn/manage_skill tools by design.

Work: (1) hand-triage each managed skill — procedure (promote to a user skill or the agent-learning catalog with DO/DON'T guidance), habit (re-declare via /experience review flow), fact (fold into native memory), or delete; (2) decide the enforcement story for autolearn while the gate is on — recommend disabling autolearn.autoContinue in user config when learning.review is on (documented), or request an upstream hook; implement the chosen path.

References: doc-5 §Edge cases, §The unified review gate; TASK-27 notes (D3 non-goal).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AC1 — every one of the ~33 managed skills in ~/.omp/agent/managed-skills is classified (habit | procedure | fact | delete) with the decision recorded; procedures are promoted to reviewed user skills or the agent-learning catalog; habits enqueue into the experiences review pipeline.
- [x] #2 AC2 — a written recommendation lands for enforcing the learning.review gate against native autolearn (config guidance vs upstream request), with the chosen option implemented or explicitly deferred with rationale.
- [x] #3 AC3 — post-triage managed-skills dir contains no unclassified entries; doc-5 edge-case section updated with the outcome.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 Apply+verify complete. Orchestrator disk audit: managed-skills count 0; all 17 promoted names present with SKILL.md; zero deleted/fact-folded leaks; backup tarball verified containing 33 SKILL.md entries. cmp spot-check 3/3 identical (commit-scoped-verification 3491B, omp-cook-dispatch-playbook 3641B, vitest-bun-dual-mock 2471B). Fact-folds confirmed via ctx_knowledge search (both names). review-gate.ts carries LEARNING_GATE_CONFIG_NOTE w/o tool_call registration (test asserts events === ['before_agent_start']). Test repair deviation audited: async-syntax fix only, assertions strengthened not weakened.

First apply worker cancelled by operator mid-run after completing mutations; WorkT29v2 closed residual gaps (gate-test run, doc-5 append, learn() confirmation).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-23 10:46
---
TASK-29 shipped in consolidation commit `195713df24e8`, pushed to origin/main (tangled.org, fast-forward fcf8399→195713df). Enforcement = LEARNING_GATE_CONFIG_NOTE guidance appended in plugins/agent-learning/src/review-gate.ts; triage outcome: 17 promoted, 14 removed, 2 fact-folded. Operator recommendation autolearn.autoContinue:false remains advisory, not auto-applied.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Managed-skills triage executed under approved matrix (17 promoted byte-exact to ~/.omp/agent/skills, 14 removed incl. init-project after verifying ~/.agents/skills/init-project/SKILL.md exists, 2 fact-folded into durable memory); final managed-skills count 0; backup /home/egsox/managed-skills-backup-20260823.tar.gz holds all 33 SKILL.md entries (34480B). Enforcement = config guidance path: LEARNING_GATE_CONFIG_NOTE appended to registerReviewGate guidance (no tool_call handler), README 'Learning-review enforcement' section, CHANGELOG [Unreleased] line, doc-5 edge-case subsection added via MCP. Tests: bun test test/agent-learning-review-gate.test.ts test/agent-learning.test.ts -> 37 pass / 0 fail (163 expect). Upstream tool_call-block issue explicitly deferred with rationale (doc-6 §8; runner.ts:265/wrapper.ts:65/types.ts:930 seam proven but rejected for m-0). Operator recommendation surfaced at closeout: set autolearn.autoContinue:false in ~/.omp/agent/config.yml when gate ON (deliberately NOT auto-applied — live harness state).
<!-- SECTION:FINAL_SUMMARY:END -->
