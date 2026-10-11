---
id: TASK-55.6
title: Document and execute EVO isolation E2E protocol
status: Done
assignee: []
created_date: '2026-08-29 14:28'
updated_date: '2026-08-29 20:37'
labels: []
dependencies:
  - TASK-55.2
  - TASK-55.4
  - TASK-55.5
parent_task_id: TASK-55
priority: high
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update durable EVO contracts and release notes, then run the repository's required direct-source, local-link, and marketplace fresh-agent E2E sequence after implementation integration. Production/docs boundary: plugins/evo/AGENTS.md and root CHANGELOG.md; test evidence only outside those files. Do not change parallel-agent protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/evo/AGENTS.md documents the versioned generation, exact restoration, derived sub policy, conflict behavior, stable hooks, xd:// reads, and dispatch preflight
- [x] #2 CHANGELOG.md records the user-visible transactional EVO behavior under Unreleased
- [x] #3 Targeted EVO tests pass after implementation
- [x] #4 Direct-source isolation, local-link fresh-agent, and marketplace fresh-agent checks pass with exact commands and observed results recorded
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped @ezxomp/evo 0.1.7-ezxomp.5 (transactional EVO policy) to marketplace install state. plugins/evo/AGENTS.md documents the versioned generation, exact restoration, derived sub policy, conflict behavior, stable hooks, xd:// reads, and dispatch preflight (AC1 verified by topic scan); CHANGELOG.md [Unreleased] records the user-visible behavior (AC2); 382/0 repo gate + 46/46 evo suite (AC3); full E2E — direct-source isolation, local-link fresh-agent (verdict=OK), commit+push b931bb7, marketplace fresh-agent (verdict=OK, 0 load errors, /evo debug live) (AC4). Evidence in implementation notes; install left as marketplace per protocol.
<!-- SECTION:FINAL_SUMMARY:END -->
