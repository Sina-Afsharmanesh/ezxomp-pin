---
id: TASK-102
title: >-
  gsd-web: Power User Mode left pane shows dead terminal — replace
  bridge-terminal pane with live transcript
status: Done
assignee:
  - '@egsox'
created_date: '2026-09-07 06:23'
updated_date: '2026-09-07 06:36'
labels:
  - bug
  - frontend
dependencies: []
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OMP rpc mode has no terminal_* commands (COMMANDS.md D7), so the MainSessionTerminal xterm in Power User Mode can never render the main bridge session TUI. It mounts, opens /api/bridge-terminal/stream, and prints "Failed to attach to main bridge terminal: terminal_resize not supported" into a permanently dead pane. Replace the left pane with a bridge-event-driven main-session transcript view (same store-driven pattern as ChatPane) so the pane shows the actual main session, and delete the obsolete bridge-terminal API routes + bridge terminal plumbing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Power User Mode left pane renders live main-session content from bridge events (no xterm, no /api/bridge-terminal/stream call)
- [x] #2 No failed-to-attach red error text can appear (bridge-terminal routes and sendTerminalInput/resizeTerminal/redrawTerminal plumbing removed)
- [x] #3 bunx tsc --noEmit and gsd-web web node --test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add MainSessionTranscript component: store-driven timeline (completedTurns + current segments) like ChatPane but session-scoped to the main bridge session, read-only.
2. dual-terminal.tsx: swap MainSessionTerminal -> MainSessionTranscript; header label "Left: Main Session" updated.
3. Delete web/app/api/bridge-terminal/ (input/resize/stream routes) and main-session-terminal.tsx.
4. Remove bridge-service terminal plumbing: subscribeTerminal/sendTerminalInput/resizeTerminal/redrawTerminal/sendTerminalCommand/emitTerminal/terminalSubscribers/isBridgeTerminalOutputEvent/BridgeTerminalOutputEvent/BridgeTerminalCommand.
5. Update COMMANDS.md D7 note (bridge-terminal routes removed) + CHANGELOG.md Unreleased.
6. Verify: bunx tsc --noEmit, cd plugins/gsd-web/web && npm test, plugin bun test
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: root bunx tsc --noEmit clean; web npm test 82/82 pass excluding two pre-existing failures (browse-directories-symlink, preferences-route — ERR_MODULE_NOT_FOUND '@/server' under node --test, reproduced on stashed clean tree); repo bun test test/ 512 pass 0 fail; fallow new-only audit clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Power User Mode left pane now renders the live main-session transcript from the bridge event stream (store-driven ChatPane) instead of a dead xterm; removed web/app/api/bridge-terminal/* routes, MainSessionTerminal, and BridgeService terminal plumbing (subscribeTerminal/sendTerminalInput/resizeTerminal/redrawTerminal/sendTerminalCommand/emitTerminal/isBridgeTerminalOutputEvent); COMMANDS.md D7 updated; CHANGELOG entry added. Verified: root tsc clean, web node --test 82/82, repo bun test 512 pass / 0 fail, fallow audit clean. Net -575 lines.
<!-- SECTION:FINAL_SUMMARY:END -->
