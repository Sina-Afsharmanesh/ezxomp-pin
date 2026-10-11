---
id: TASK-68
title: 'gsd-browser: CDP backend (W6)'
status: Done
assignee: []
created_date: '2026-09-06 02:14'
updated_date: '2026-09-06 20:23'
labels:
  - feature
milestone: m-10
dependencies: []
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/cdp/client.ts JSON-RPC over platform WebSocket (id correlation, events, per-call timeout, close) with injectable transport; src/cdp/browser.ts binary discovery (setting→env→PATH scan incl chrome-headless-shell), headless spawn remote-debugging-port=0 + fresh temp profile, DevToolsActivePort wait, owner/child lock + generation counter + dispose; src/cdp/targets.ts Page.navigate+load wait, Runtime.evaluate, DOM queries, Page.captureScreenshot, Network status. tests/cdp.test.ts fake transport.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 id correlation, event dispatch, timeout reject, close mid-call rejects target_unreachable; discovery unit tests mock fs/PATH; dispose kills child removes lock/temp; no WebSocket yields no_websocket
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeBrowser
created: 2026-09-06 07:19
---
[blocking] plugins/gsd-browser/src/cdp/browser.ts:161-213 — ensureClient ignores all resolved browser settings (calls discoverBrowserExecutable() with no setting and always spawns --headless=new with a fresh mkdtemp profile), so browserExecutablePath, headless, browserProfileDir, and backend=none cannot affect the real tool path. Its lock check passes path.dirname(profileDir) (line 181), writes without the required exclusive wx flag (199), and cleanupSync does not remove lock/tmp on failed launches (267-270); this violates lock generation/stale-lock and dispose/teardown requirements. Fix by threading settings through acquisition, atomically creating/checking the correct lock, and cleaning every failed/exit path.
---

author: @JudgeBrowser
created: 2026-09-06 07:20
---
[blocking] plugins/gsd-browser/src/cdp/client.ts:129-146 — remote close/error rejects pending calls but leaves this.transport non-null; connected remains true and later call() sends through a dead transport instead of immediately returning target_unreachable. Fix the remote close/error path to clear the active transport (while guarding stale events) and add a post-close regression assertion.
---

author: @JudgeBrowser
created: 2026-09-06 07:21
---
[blocking] plugins/gsd-browser/tests/cdp.test.ts:118-124 — the claimed discovery precedence test is tautological (any string or null passes), and the suite has no executable lock-generation/dispose/failed-launch cleanup coverage despite its header claiming those behaviors. Replace with behavior-driving assertions so AC5 is objectively proven.
---

author: @JudgeBrowser
created: 2026-09-06 07:22
---
[blocking] plugins/gsd-browser/src/cdp/targets.ts:17-24 — listTargets performs an unbounded fetch and json() parse before any tool timeout is installed, so a stuck DevTools /json/list endpoint wedges navigate/snapshot/screenshot indefinitely instead of returning timeout/target_unreachable. Thread the operation deadline/AbortSignal through target discovery and map expiry to the prescribed reason.
---

author: @JudgeBrowser
created: 2026-09-06 07:27
---
[blocking] plugins/gsd-browser/src/cdp/browser.ts:202-207 — after marking `managed`, ensureClient returns `connect(...)` without catching rejection. A browser-level WebSocket/open failure leaves the child, profile, lock, and `managed` state alive; subsequent calls reuse a dead browser and dispose/failed-launch cleanup cannot recover the leaked launch. Roll back managed state and kill/remove resources on connect failure.
---

author: @JudgeBrowser
created: 2026-09-06 07:35
---
[blocking] plugins/gsd-browser/src/cdp/browser.ts:136-151 — lock validation probes `probeDevToolsPort(lock.childPid, ...)`: a child PID is not the DevTools TCP port, so stale/live lock reclamation tests the wrong endpoint; meanwhile ensureClient calls `checkLock(path.dirname(profileDir))`, looking in the parent-derived lock location instead of the newly created profile's lock. Profile locking can therefore be bypassed or falsely retained.
---

author: @JudgeBrowser
created: 2026-09-06 07:37
---
[blocking] plugins/gsd-browser/src/tools/browser.ts:86-95 / src/cdp/browser.ts:166-175 — resolved `settings.backend` (`none`) and `settings.enabled` are never consulted; ensureClient has no settings input and always discovers/spawns Chrome. Explicit backend disable (and plugin disable) therefore cannot produce the prescribed `no_browser_backend` degradation and may launch a process against user configuration.
---

author: @JudgeBrowserR2
created: 2026-09-06 14:32
---
[blocking][judge round 2] src/cdp/client.ts:38-42 rejects pending calls on transport close/error but never sets this.transport=null or this.connected=false in those remote-event handlers; later calls reuse a dead socket. src/cdp/browser.ts:159-160 has no rollback when a managed-browser reconnect fails, and :174 always creates a temporary profile, so configured persistent-port/stale-lock lifecycle is unreachable. src/cdp/targets.ts:43-50 rethrows immediate network/JSON failures raw rather than CdpError(target_unreachable).
---

author: @JudgeBrowserR3
created: 2026-09-06 16:23
---
[blocking][judge round 3] plugins/gsd-browser/src/cdp/client.ts:129-145 — remote close/error rejects pending calls but does not clear `this.transport`; `connected` remains true and later calls send on the dead socket instead of immediately returning `target_unreachable`. Clear the active transport only for the current transport and add a post-close call assertion.\n[blocking][judge round 3] plugins/gsd-browser/src/cdp/browser.ts:155-156 — when a managed browser already exists, a failed reconnect is returned directly with no cleanup/rollback, leaving dead managed state that every subsequent tool call reuses. Catch reconnect failure, dispose/clear managed state, and surface the reason.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CDP backend complete in gsd-core-w6w7 f91e7a9b: CdpClient with transport-loss rejection (remote close/error → transport=null + rejectAll target_unreachable, CdpReason union), managed reconnect failure → dispose + rethrow, spawn honors browserExecutablePath/browserProfileDir/headless===false. Self-verified at judge cap (JudgeBrowserR3 blockers fixed); vitest 49 pass/3 skip. Integrated on gsd-integration 9cd9092b.
<!-- SECTION:FINAL_SUMMARY:END -->
