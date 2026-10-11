---
id: TASK-86
title: 'gsd-loop: units/queue (WU-6)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:24'
labels:
  - feature
milestone: m-11
dependencies: []
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/units.ts Unit model, enqueue validation (unique id, brief XOR briefFile, briefFile inside project), listQueue, renderBrief. tests/units.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 duplicate id rejected; both brief forms rejected; missing briefFile error names path; FIFO pointer correct
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeLoop
created: 2026-09-06 07:41
---
[blocking] plugins/gsd-loop/src/units.ts:46-52 — briefFile confinement checks lexical path only, so a project-root symlink to an outside file is accepted and later read. Resolve real paths (and reject symlink escape) for the required project-root confinement. [blocking] plugins/gsd-loop/src/kernel.ts:211 — nextUnit calls renderBrief(unit) without cwd; every briefFile unit throws before core can render it with ctx.cwd, so the documented briefFile queue path cannot advance. Pass cwd/render the brief outside the pure kernel.
---

author: @JudgeLoopR2
created: 2026-09-06 14:24
---
[blocking] plugins/gsd-loop/src/units.ts:46-58 — briefFile confinement uses lexical path.relative only; a symlink inside cwd can resolve outside and renderBrief then reads it, violating path-confined project reads. Validate realpath (or reject symlink escapes) at enqueue/render. [blocking] plugins/gsd-loop/src/units.ts:42-44 — brief/briefFile XOR is truthiness-based, so `brief: ""` plus a briefFile bypasses mutual-exclusion validation; check property presence/null explicitly and enforce the documented contract.
---

author: @JudgeLoopR2
created: 2026-09-06 14:34
---
[blocking] plugins/gsd-loop/src/units.ts:72-84 — renderBrief resolves and reads briefFile without checking that the resolved/real target remains inside cwd; a file enqueued while regular can be swapped for an outside symlink before advance and leak arbitrary file content to the model. Revalidate confinement at render time.
---

author: @JudgeLoopR2
created: 2026-09-06 14:49
---
[blocking] plugins/gsd-loop/src/units.ts:35-84 and core.ts:405-417 — enqueue uses truthy brief/briefFile checks (accepts neither/empty sources) and lexical path containment; a symlink inside cwd can expose an outside file, including after swap before render. Enforce exactly-one source and realpath confinement at render time.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Units/queue shipped in 785f29dc: FIFO preflight in doRecordResult rejects non-pointer unit BEFORE journal/verify; units.ts:46-109 brief XOR + realpath checks verified. JudgeLoopR3 REVIEW_PASSED; vitest 87/87.
<!-- SECTION:FINAL_SUMMARY:END -->
