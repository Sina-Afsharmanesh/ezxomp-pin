---
id: TASK-103.1
title: 'gsd-web: resolve visualizer provider from staged services'
status: To Do
assignee: []
created_date: '2026-09-07 07:09'
labels:
  - bug
  - architecture
dependencies: []
parent_task_id: TASK-103
priority: high
type: bug
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live Visualize surface and `/api/visualizer` fail in the standalone web server. The service probes `web/server/services-dist/visualizer.mjs`, while the shipped staged directory contains `visualizer-data.mjs`. Provider resolution must follow the OMP plugin's actual staged service manifest rather than an assumed filename.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET `/api/visualizer` returns a successful payload for a valid project in a fresh standalone server
- [ ] #2 Visualize renders its data or a truthful project-empty state instead of a provider-not-found error
- [ ] #3 Provider resolution is derived from the staged services contract and does not hard-code a stale filename
- [ ] #4 A fresh marketplace-style install is covered by the verification path
<!-- AC:END -->
