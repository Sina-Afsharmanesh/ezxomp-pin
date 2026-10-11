---
id: TASK-52.6
title: Record typed validation and review kickbacks end to end
status: To Do
assignee: []
created_date: '2026-08-29 02:40'
updated_date: '2026-08-29 06:04'
labels: []
dependencies: []
parent_task_id: TASK-52
priority: high
type: task
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Demo-path recovery slice required by the user clarification. Make the cook tool surface record a returned validator/judge result as a durable lifecycle fact and route a typed failure to its declared existing chain stage so a fresh model sees the next action. This must integrate with TASK-52 projection without turning dagr into a gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A typed validator or judge failure with kickTo 'implement' or 'plan' records an error/finding in the durable workflow trail, settles or updates the corresponding attempt with an honest evidence tier, and moves the active chain to that named existing stage with an explicit next-action message.
- [ ] #2 A malformed result or an unsupported kickTo returns an error and leaves chain state, agent log, and journal unchanged.
- [ ] #3 A tool-level end-to-end test drives a deterministic negative validator or judge result through the recovery path using the existing mock ExtensionAPI, a temporary Backlog repo, and a fake dagr validator; it proves the view-only projection remains strict-clean without HERDR or a real subagent.
- [ ] #4 The recovery path never treats dagr publish/check failure as a task gate or hides a workflow failure as success.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1822 — cook_record_result only checks presence of finding for non-success and chain membership of kickTo; it does not runtime-validate finding.source/file/line/what, outcome/evidence enums, or modified_files contents before appendRecord. Direct or untrusted malformed payloads can be journaled and mutate convergence, violating AC2's unchanged-on-malformed contract → implement.
---
<!-- COMMENTS:END -->
