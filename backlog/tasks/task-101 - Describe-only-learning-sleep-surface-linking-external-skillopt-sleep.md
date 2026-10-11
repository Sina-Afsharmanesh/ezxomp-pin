---
id: TASK-101
title: Describe-only /learning sleep surface linking external skillopt-sleep
status: Done
assignee: []
created_date: '2026-09-06 05:24'
updated_date: '2026-09-06 08:57'
labels:
  - feature
  - docs
dependencies:
  - TASK-99
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/docs/sleep/README.md'
documentation:
  - doc-23
priority: low
type: enhancement
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a /learning sleep subcommand that renders the nightly-cycle description (harvest → mine → replay → consolidate → gate → stage → adopt) plus a status view of any staged proposals from TASK-99 and instructions for the external skillopt-sleep CLI (mock dry-run, real-backend data boundary warnings). The plugin never executes the cycle; execution stays an explicit external user action per doc-23.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /learning sleep shows cycle description and staged-proposal status without executing anything
- [x] #2 Data-boundary warning for real backends is included verbatim from doc-23
- [x] #3 No network calls, no subprocess execution of skillopt
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
W101 landed: formatSleepSurface in learning-command.ts + test/agent-learning-sleep.test.ts. 4/4 sleep + 26/26 suite green, tsc/prettier clean, no network/subprocess. Bookmark al-sleep @ 1c755440.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-101: describe-only /learning sleep surface (cycle description, staged-proposal count, verbatim data-boundary sentence, external CLI pointer + warning). Verified 4/4 + 26/26. al-sleep @ 1c755440.
<!-- SECTION:FINAL_SUMMARY:END -->
