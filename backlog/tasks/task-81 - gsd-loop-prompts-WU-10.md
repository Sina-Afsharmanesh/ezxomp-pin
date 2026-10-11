---
id: TASK-81
title: 'gsd-loop: prompts (WU-10)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/prompts.ts auto-mode operating instruction + unit brief/result envelope templates used by before_agent_start and advance responses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates render deterministically; instruction includes the 3-step turn contract
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/prompts.ts:36 — unitExecutionEnvelope substitutes '(loaded from briefFile — see facade renderBrief)' instead of embedding the actual briefFile contents verbatim. The advance text therefore violates the required brief envelope for file-backed units; supply the rendered brief to the template.
---

author: @JudgeLoopR2
created: 2026-09-06 14:25
---
[blocking] plugins/gsd-loop/src/prompts.ts:30-36 — unitExecutionEnvelope always inserts unit.brief and substitutes `(loaded from briefFile — see facade renderBrief)` for file-backed units; core computes the actual file contents separately but never passes them to the envelope, so the model does not receive the requested verbatim brief. Build the envelope from the rendered brief.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/prompts.ts:26-31 and core.ts:251-258 — unitExecutionEnvelope prints `(loaded from briefFile — see facade renderBrief)` instead of the rendered brief, so file-backed units do not receive exact execution instructions. Render once and pass the content into the envelope.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prompts shipped in 785f29dc: step-mode paused envelope "Recorded... Run is paused (...) - /gsd-loop resume to continue."; explicit rendered brief XOR; prompts.ts:30-42 verified by JudgeLoopR3 round 3. vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
