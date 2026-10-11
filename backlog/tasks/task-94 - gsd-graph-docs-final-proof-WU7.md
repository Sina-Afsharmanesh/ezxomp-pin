---
id: TASK-94
title: 'gsd-graph: docs + final proof (WU7)'
status: Done
assignee: []
created_date: '2026-09-06 02:16'
updated_date: '2026-09-06 20:25'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AGENTS.md (2 ported + 4 excluded subsystems with reasons, .gsd persistence, schema rule, concurrency policy, one shipped setting, naming guard), README (command/tool reference, .gsd layout, VCS recommendation, degradation list, settings table).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 six required doc blocks present, no TBDs
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraph
created: 2026-09-06 07:18
---
[blocking] plugins/gsd-graph/README.md:16-17 — README explicitly says this is a W1 registration stub and defers the command/tools to later work units; it does not document the shipped graph workflow/knowledge operations, persistence, lock/interop/degradation cut-lines, or complete tool/command usage. Replace the stub README with the complete operator/developer documentation required by the AC and keep it consistent with the final session_start autoRebuild behavior.
---

author: @JudgeGraphR2
created: 2026-09-06 14:22
---
[blocking] plugins/gsd-graph/README.md:16-17 — README remains a W1 registration stub and does not document the shipped .gsd graph/run command and tool surfaces, persistence/lock behavior, settings, or degradation boundaries required by WU7. Replace it with the final operator/developer reference and align AGENTS.md/package metadata with the actual session_start behavior.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Docs + final proof complete: plugin AGENTS.md/README/UPSTREAM.json committed in f9304a33; test/gsd-graph.registration.test.ts (7 tests incl. milestone lifecycle + command lifecycle) copied to repo root test/ on gsd-integration 9cd9092b (434/0). Follow-ups (non-blocking, JudgeGraphR4): package.json:4 + tools description say .planning while runtime uses .gsd; tool snapshot param doc vs commands pre-build ordering.
<!-- SECTION:FINAL_SUMMARY:END -->
