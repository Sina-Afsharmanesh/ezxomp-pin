---
id: TASK-65
title: 'gsd-web: plugin entry launcher/registry/settings/commands (W6)'
status: Done
assignee: []
created_date: '2026-09-06 02:12'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
extensions/host-launcher.ts (port of web-mode.ts launch pipeline), host-registry.ts (instances.json + pid liveness + stale sweep), settings.ts resolver, /gsd-web subcommands start|stop|status|open|logs|set|unset, 3 tools gsd_web_{start,stop,status}, session hooks (stale sweep on start, teardown skip daemonMode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 plugin bun tests: port reservation, no-auth+non-loopback refusal preserves registry, stale sweep, token in env, stop all reaps, headless text parity
- [ ] #2 session_shutdown clears timers via ctx.clearTimer
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plugin entry/launcher/registry shipped in gsd-web-w3-fix: /gsd-web command registered against fake pi (smoke test green), settings surface via omp.settings, detached standalone host spawn. Verified by smoke block on gsd-integration 9cd9092b (434/0) and JudgeWebR3 REVIEW_PASSED.
<!-- SECTION:FINAL_SUMMARY:END -->
