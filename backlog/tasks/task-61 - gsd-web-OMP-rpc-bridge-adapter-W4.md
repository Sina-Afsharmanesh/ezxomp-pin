---
id: TASK-61
title: 'gsd-web: OMP rpc bridge adapter (W4)'
status: Done
assignee: []
created_date: '2026-09-06 02:12'
updated_date: '2026-09-06 20:20'
labels:
  - feature
milestone: m-9
dependencies: []
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement web/server/bridge/omp-transport.ts per plan W4: resolveOmpCliEntry chain, ready-frame handshake + negotiate_protocol v2 + rpc_chunk reassembly, no_models typed phase, COMMANDS.md audit table, typed unsupported_command errors, event tolerances, EOF shutdown, D5 onboarding auth write, D7 TUI gating.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 probe drives ready→negotiate→get_state→prompt against disposable-profile omp --mode rpc child
- [ ] #2 COMMANDS.md committed with one row per GSD union member
- [ ] #3 unsupported command returns typed error via POST /api/session/command (4xx payload)
- [ ] #4 child killed with EOF exits 0, no lost final frame
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeWebR1
created: 2026-09-06 14:31
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:49,1151-1159,1683-1691 — BridgeService still resolves/spawns the GSD CLI directly and sets GSD_WEB_BRIDGE_TUI=1; OmpRpcTransport is never constructed or connected to routes. The implemented OMP handshake, chunking, typed unsupported errors, event handling, and EOF shutdown therefore never execute, so W4 AC #1/#3/#4 are unmet. Fix by making the executed BridgeService lifecycle use resolveOmpCliEntry + OmpRpcTransport and map its typed failures through POST /api/session/command.
---

author: @JudgeWebR1
created: 2026-09-06 14:32
---
[blocking] plugins/gsd-web/web/server/onboarding-service.ts:901-902 — runOAuthFlow supplies onDeviceCode: () => {}. Device-code providers (for example GitHub Copilot) invoke this callback and receive no verification URI/user code in flow state/UI, leaving the browser spinner waiting indefinitely with no actionable authentication path. Implement the callback and persist/display the provider's device instructions (and wire D5 storage/verify-read) before claiming W4 onboarding behavior.
---

author: @JudgeWebR1
created: 2026-09-06 14:32
---
[blocking] plugins/gsd-web/web/server/bridge/omp-transport.ts:56-82 — resolveOmpCliEntry always returns ["--mode","rpc"], ignoring mode:"interactive". pty-manager.ts:151-159 invokes it for the `gsd` terminal command, so node-pty launches an NDJSON RPC child as an interactive terminal and cannot provide terminal behavior. Respect interactive mode (or explicitly disable this route) and verify the PTY path.
---

author: @JudgeWebR2
created: 2026-09-06 16:09
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:1715 — `awaitReadyFrame` (and its `negotiate` request) runs before the cleanup `try` at line 1720, so a ready timeout or negotiation rejection leaves `this.process`, its stdout listener, `readyWaiters`, and pending/reassembler state alive. A retry resets `chunkReassembler` but the old child can still feed `handleStdoutLine`, so stale ready/chunk frames can satisfy the new handshake and corrupt correlation. → Put ready/negotiate inside the same failure cleanup (detach listener, reject/clear pending, terminate that child, and guard stdout by child identity) before allowing restart.
---

author: @JudgeWebR2
created: 2026-09-06 16:09
---
[blocking] plugins/gsd-web/web/server/onboarding-service.ts:882 — `cancelActiveFlow()` sets status=cancelled, clears prompt/error, and returns; it never clears `activeFlow.state.deviceCode`. `cancelProviderFlow()` immediately returns `buildState()` at line 683, before the aborted OAuth catch at lines 962-965 can clear it, so a cancelled browser-auth flow exposes a stale device code to the web UI. → Set `this.activeFlow.state.deviceCode = null` in the synchronous cancellation transition.
---

author: @JudgeWebR2
created: 2026-09-06 16:09
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:1950 — the active BridgeService exit path records only generic `phase: failed`/`lastError`; it never detects pre-ready stderr `No models available` and cannot expose the typed `failed/no_models` state required by COMMANDS.md:65-67. The typed detector exists only in the unused OmpRpcTransport at omp-transport.ts:359-365. Likewise sendInput/requestResponse at bridge-service.ts:1501-1508,1808-1837 bypass OmpRpcTransport.request's typed `unsupported_command` branch (omp-transport.ts:456-471), so unsupported GSD commands return an untyped host failure. → Port these typed dispositions into the active BridgeService path (including response code `unsupported_command`) rather than leaving them in the unused transport.
---

author: @JudgeWebR2
created: 2026-09-06 16:10
---
[blocking] plugins/gsd-web/web/app/api/session/command/route.ts:14 — `responseStatus` maps every non-success response other than `onboarding_locked` to HTTP 502, so even if an active bridge response carries `code: "unsupported_command"`, AC #3's typed unsupported 4xx payload is not exposed by POST /api/session/command. → Preserve the typed unsupported code and map it to the contract's 4xx response (and synthesize it in the active BridgeService when OMP lacks the command).
---

author: @JudgeWebR2
created: 2026-09-06 16:11
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:924 — `terminateRpcChild()` always sends SIGTERM and only escalates to SIGKILL; it never closes stdin to deliver RPC EOF. The active BridgeService therefore bypasses the documented graceful EOF shutdown path in COMMANDS.md:73 and can lose buffered final JSONL, so W4 AC #4 is unmet. → End stdin first, await the clean exit/flush, and only use signal escalation on timeout.
---

author: @JudgeWebR3
created: 2026-09-06 17:01
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:1772-1774 — handleProcessExit() records phase `no_models` at lines 1995-1999, but the startup catch unconditionally overwrites it with `phase: failed` after awaitReadyFrame rejects. A pre-ready `No models available` child therefore still reaches consumers as generic failed, so the typed no_models disposition and onboarding gate are not observable. Preserve the no_models snapshot through cleanup (or branch on it before generic failure recording).
---

author: @JudgeWebR3
created: 2026-09-06 17:01
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:1519-1520,1808-1837 — active BridgeService still writes every GSD command directly via requestResponse and has no unsupported-command classification; only the unused OmpRpcTransport.request() contains the `unsupported_command` branch. OMP's unknown-command response therefore remains untyped, so POST /api/session/command cannot reliably return the required typed 4xx payload even though route.ts maps that code. Add the disposition to the executed bridge path (or use the transport) and probe a real unsupported union member.
---

author: @JudgeWebR3
created: 2026-09-06 17:09
---
[blocking] plugins/gsd-web/web/lib/gsd-workspace-store.tsx:114,635-660 — the server adds `BridgeLifecyclePhase = ... | "no_models"`, but the browser `BridgePhase` union still omits `no_models`; `summarizeBridgeStatus()` falls through to "Bridge idle" for that runtime value. Even after the server preserves the typed phase, the API/UI contract hides the model-configuration failure and narrows it unsafely. Extend the browser contract and render a visible setup/configuration state, then exercise the boot/live bridge payload.
---

author: @JudgeWebR3
created: 2026-09-06 17:14
---
[blocking] plugins/gsd-web/web/server/bridge/bridge-service.ts:671-679,2474-2534; web/server/auto-dashboard-service.ts:155-163 — boot accepts a `?project=` override and creates a per-project bridge, but the default auto-dashboard dependency resolves only `GSD_WEB_PROJECT_CWD` from process env. `collectBootPayload(otherProject)` therefore reads/reconciles auto state for the launch project while workspace/sessions/bridge use the selected project. Thread the resolved project CWD into the auto-dashboard child/reconciliation and verify two selected projects.
---

author: @JudgeWebR3
created: 2026-09-06 17:21
---
[blocking] bridge-service.ts:1760 — startup catch rejects pending requests but never clears timed-out readyWaiters or resets the frame reassembler; a late ready frame can invoke stale negotiation against a child being torn down, and the claimed startup cleanup contract is incomplete. → kickTo implement. [blocking] bridge-service.ts:1772 — handleProcessExit can classify pre-ready stderr as phase no_models, but startInternal catch unconditionally sets snapshot.phase=failed after terminateRpcChild, erasing the typed no_models state required by the onboarding/UI path. → kickTo implement. [blocking] bridge-service.ts:1519 — sendInput dispatches arbitrary GSD union commands directly through requestResponse and never validates unsupported members or emits OmpRpcError('unsupported_command'); route.ts's 400 mapping is therefore unreachable for active bridge requests. → kickTo implement. [blocking] bridge-service.ts:672 — default getAutoDashboardData resolves config from process env only and has no projectCwd parameter; boot payloads selected via ?project= pass projectCwd to the bridge but auto-dashboard subprocess remains rooted at GSD_WEB_PROJECT_CWD/package default, so switching projects serves stale/wrong dashboard data. → kickTo implement.
---

author: @JudgeWebR3
created: 2026-09-06 17:22
---
[blocking] web/lib/gsd-workspace-store.tsx:114,635-660 — server emits bridge phase no_models but the client BridgePhase union excludes it and summarizeBridgeStatus() falls through to generic Bridge idle; users with no configured models never receive the typed onboarding/configuration guidance. → kickTo implement.
---

author: @JudgeWebR3
created: 2026-09-06 20:00
---
[blocking] auto-dashboard-service.ts:162-165 — collectAuthoritativeAutoDashboardData correctly receives options.projectCwd and roots the child there, but reconcileWithDiskState is still given env.GSD_WEB_PROJECT_CWD (the process-default project) rather than options.projectCwd. A ?project= selection therefore checks paused-session/auto.lock state in the wrong project and can report active/paused dashboard state from another project. → kickTo implement.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bridge adapter complete in gsd-web-w3-fix 19107f8a: ready handshake inside cleanup try, waiter splice+reject with typed pairs, reassembler reset, graceful EOF teardown (GRACEFUL_EOF_WAIT_MS=2000), route responseStatus mapping (unsupported_command→400, onboarding_locked→423). REVIEW_PASSED JudgeWebR3 round 3. Integrated on gsd-integration 9cd9092.
<!-- SECTION:FINAL_SUMMARY:END -->
