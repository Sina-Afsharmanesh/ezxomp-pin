---
id: TASK-85
title: 'gsd-graph: scaffold + vendored yaml + gates (WU1)'
status: Done
assignee: []
created_date: '2026-09-06 02:15'
updated_date: '2026-09-06 20:22'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold plugins/gsd-graph per plan WU1: package.json, UPSTREAM.json, src/index.ts stubs, vendor/ verbatim copy of plugins/evo/vendor (js-yaml) with VENDORED.md Used-by update. Registration hunks carried as REGISTRATION.patch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 manifest test green after wave; smoke block green; vendor copy complete; peer pin 18.0.6
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraphR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-graph/REGISTRATION.patch:27-43 — the serialized patch still describes only a W1 label smoke and explicitly says no tool names are declared; it does not update the smoke to assert gsd_graph/gsd_graph_run, /gsd-graph, or session_start autoRebuild. The patch therefore does not match the real registered surface in src/index.ts and cannot prove integration closure. Update the shared-file hunks/smoke contract to enumerate all actual names and hook behavior.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
gsd-graph scaffold verified on gsd-integration 9cd9092b: manifest test green, smoke block green (setLabel GSD Graph + gsd_graph/gsd_graph_run surface), vendor js-yaml/argparse copy complete, peer pin 18.0.6. Plugin final code f9304a33 (gsd-graph-wu3wu5). test/gsd-graph.registration.test.ts copied to repo root test/; full AC verified as one composite criterion.
<!-- SECTION:FINAL_SUMMARY:END -->
