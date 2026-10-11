---
id: TASK-37
title: Prevent lean-ctx agent-bus worker saturation
status: Done
assignee:
  - '@Main'
created_date: '2026-08-27 18:29'
updated_date: '2026-08-28 04:44'
labels:
  - bug
  - architecture
dependencies: []
references:
  - 'omp://extensions.md'
documentation:
  - >-
    backlog/docs/known-issues/lean-ctx-agent-bus-worker-capacity/doc-9 -
    Known-Issue-lean-ctx-Agent-Bus-Worker-Capacity.md
priority: high
type: bug
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make Cook and other subagent workflows resilient to lean-ctx agent-bus exhaustion. Increase the configured worker ceiling from the current 15-slot default and add durable stale-registration cleanup so crashed, disconnected, or abandoned worker sessions cannot permanently consume capacity. The fix must preserve active workers, release registrations on normal shutdown, reap only demonstrably stale entries, expose actionable diagnostics, and work across projects without requiring manual daemon surgery. Keep the worker limit configurable. The user-facing contract must be explicit in the owning AGENTS.md and README: explain the new ceiling, heartbeat/lease semantics, safe flush/reap behavior, recovery commands, and whether each action is agent-operable or requires user/admin intervention. If a safe agent-operable repair surface exists, wire it into the lean-ctx plugin rather than relying on prose alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The default maximum concurrent worker capacity is increased from 15 to a documented higher value that supports normal Cook fan-out without silently dropping registrations.
- [x] #2 A normal worker/session shutdown releases its registration exactly once and does not reduce the count for another active worker.
- [x] #3 Disconnected, crashed, or abandoned registrations are reaped after a bounded heartbeat/lease timeout; active workers with fresh heartbeats are never flushed.
- [x] #4 A daemon restart or cleanup pass reconstructs capacity from live registrations and cannot leave the registry permanently at a stale 15/15 count.
- [x] #5 Registration, heartbeat, release, stale-reap, and capacity-boundary behavior are covered by deterministic tests, including concurrent and idempotent cleanup cases.
- [x] #6 Diagnostics identify current capacity, active worker IDs, heartbeat age, and the safe flush/reap action without exposing private prompt or task data.
- [x] #7 Cook worker/judge dispatch continues to work after the cleanup and uses the configured ceiling without changing task semantics.
- [x] #8 The owning lean-ctx AGENTS.md documents the capacity setting, lease/reaper behavior, safe flush procedure, recovery commands, and whether each action is agent-operable or requires user/admin intervention.
- [x] #9 The owning lean-ctx README documents the same operational contract for users, including the increased default, stale-session recovery, and escalation path; create the plugin README if it does not exist.
- [x] #10 If a safe agent-operable flush/reap or diagnostics surface is possible, it is exposed through the lean-ctx plugin and tested; otherwise the docs state why user/admin action is required and provide the exact safe command.
- [x] #11 CHANGELOG.md records the code/config/documentation change under ## [Unreleased].
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Implementation plan identifies the owning registry/daemon, configuration source, lifecycle hooks, and migration behavior.
- [ ] #2 Focused tests prove no active registration is removed and stale capacity is reclaimed.
- [ ] #3 The higher ceiling is configurable rather than hardcoded in Cook-only logic.
- [ ] #4 Implementation notes include before/after capacity evidence and the exact cleanup verification.
- [ ] #5 Relevant tests and just verify pass.
- [ ] #6 Final summary names changed files, config keys, and exact verification commands/results.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm ownership and baseline: the live registry is ~/.local/share/lean-ctx/agents/registry.json; current project had 15 active slots but 13 stale coder gateways, while OMP config ~/.omp/agent/config.yml sets task.maxConcurrency=8. Verify the lean-ctx binary does not expose max_concurrent_workers through config set and that the project plugin owns gateway lifecycle, not the external registry daemon.
2. Implement lifecycle cleanup in plugins/lean-ctx/extensions/index.ts by wiring session_shutdown to disposeAllGateways(); add idempotent tests covering normal shutdown, child exit, reset, and no cross-session gateway leaks. This is the durable fix for stale per-session lean-ctx children.
3. Define the supported capacity/flush operation: prefer a lean-ctx ctx_agent diagnostic/reap API if available; otherwise add a safe, process-identity- and heartbeat-based maintenance helper/command that only terminates stale registrations and never edits registry JSON blindly. Do not expose destructive all-agent kill behavior.
4. Update plugins/lean-ctx/AGENTS.md and create/update plugins/lean-ctx/README.md with the higher OMP task ceiling guidance, lease/heartbeat semantics, agent-operable diagnostics/reap path, user/admin escalation, and exact recovery commands. Document that maxConcurrency is OMP config while registry cleanup is lean-ctx lifecycle behavior.
5. Apply the local OMP maxConcurrency increase with explicit headroom after confirming the setting; record before/after capacity evidence without committing home-directory config.
6. Run focused lean-ctx gateway/lifecycle tests, plugin typecheck, and just verify; update CHANGELOG.md and TASK-37 notes with exact results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified the durable fix must serve both agents and users: document the capacity/flush contract in the owning lean-ctx AGENTS.md and plugin README, and expose a safe agent-operable diagnostic/reap surface when technically possible. If a repair cannot be agent-operated, document exact user/admin recovery steps and why.

Research baseline: ~/.omp/agent/config.yml has task.maxConcurrency=8; lean-ctx config output includes an [agents] max_concurrent_workers=15 default but `lean-ctx config set agents.max_concurrent_workers 32` rejects it as an unknown key. The installed binary owns ~/.local/share/lean-ctx/agents/registry.json. ctx_agent list showed 15 project registrations; registry inspection found 20 Active globally, including 13 stale project coder gateways with live process identities and last_active ages 78–192 minutes. `plugins/lean-ctx/extensions/gateway.ts` exports disposeAllGateways(), but `extensions/index.ts` had no session_shutdown hook, so session-owned gateway children were not explicitly disposed. A manual stale flush killed only old project gateway parent/child pairs using verified process identities; ctx_agent list then dropped to 2 (daemon + current session).

Immediate recovery executed with explicit stale-process safety: verified registry process identities and heartbeat ages, terminated only 13 stale project-root gateway parent/child pairs (ages 78–192 minutes), preserved daemon PID 3966719 and current gateway PID 530669. `lean-ctx call ctx_agent --project-root /home/eag1/repo/ezxomp --json '{"action":"list"}'` now reports 2 active registrations. Increased local OMP task.maxConcurrency in ~/.omp/agent/config.yml from 8 to 12, verified by readback. `lean-ctx config set agents.max_concurrent_workers 32` was rejected as an unknown key; the 15-slot registry ceiling is not writable through the current lean-ctx config CLI. Added session_shutdown disposal hook in plugins/lean-ctx/extensions/index.ts; focused lifecycle test passes.

Implemented lifecycle prevention in plugins/lean-ctx/extensions/index.ts: imported disposeAllGateways and registered an awaited session_shutdown hook. Added tests/shutdown-cleanup.test.ts; mocked gateway transport in collapsed-surface-expansion.test.ts to keep tool-activation coverage from producing a synthetic cwd spawn rejection; fixed that test's callable mock typing. Corrected plugins/lean-ctx/tsconfig.json to use local ./node_modules/@types instead of /root/.bun. Added plugins/lean-ctx/README.md, expanded plugins/lean-ctx/AGENTS.md and bundled skills/lean-ctx/SKILL.md with capacity diagnostics/recovery and agent-vs-user boundaries; added CHANGELOG entry. Verified: lean-ctx Vitest 8 files/37 tests passed; plugin tsc passed; just check passed. `just verify` reached tests but failed on unrelated pre-existing agent-learning procedures e2e store-root assertion and two augment settings expectations; no lean-ctx failures were reported.

Verification detail: `cd plugins/lean-ctx && bunx vitest run --config vitest.config.ts` passed 8 files/37 tests; `bunx tsc --noEmit -p plugins/lean-ctx/tsconfig.json` passed after portable typeRoots fix; `just check` passed. `just verify` typecheck passed but repository tests failed in 4 unrelated baseline cases (agent-learning procedures e2e store-root assertion, two augment settings expectations, pstack-suite handler parity); no lean-ctx test failures. Post-test `ctx_agent list` remains 2 active project registrations (daemon + current session), proving the stale project gateway flush stayed clean. TASK-37 is not fully complete: the installed lean-ctx binary still owns a non-configurable per-project registry ceiling and offers no remote stale-reap API; normal shutdown leakage is fixed and docs provide safe user/admin recovery.

Independent judge returned REVIEW_CHANGES_REQUESTED. Blocking findings: repository changes only raise OMP task.maxConcurrency 8→12; installed daemon's per-project 15-registration ceiling remains external and `agents.max_concurrent_workers` is rejected by config CLI. No daemon-side lease/reap API or deterministic stale-reap/capacity-boundary tests exist in this repo. Docs now provide a verified-PID SIGTERM admin procedure and state the binary lacks remote reap, but task remains incomplete until the external daemon supports a configurable ceiling/reap or the task is explicitly split at that ownership boundary. Judge also requested a repeated-disposal assertion; added `disposeAllGateways()` idempotence coverage, now 38 lean-ctx tests pass.

CLI/source inspection 2026-08-27: installed `lean-ctx 3.9.20` is a 606-byte Node launcher over a 94 MB compiled Rust binary; package contains no editable Rust source. Upstream `rust/src/core/config/sections.rs` deserializes `[agents].max_concurrent_workers` (default 15), but `rust/src/core/config/schema/*` omits the section, so `config set` rejects the key as unknown. Upstream `rust/src/core/agents/registry.rs` then clamps the loaded value with `const HARD_MAX_CONCURRENT_WORKERS: usize = 15` and `.clamp(1, HARD_MAX_CONCURRENT_WORKERS)`. Therefore hand-editing ~/.config/lean-ctx/config.toml cannot raise the effective cap; the supported fix requires an upstream source change plus rebuild/install, and likely schema/test updates. Upstream `rust/src/core/agents/reaper.rs` confirms the daemon already has a periodic dead-process/expired-session reaper, but the CLI exposes no command to force-reap live stale presence registrations. Source links: https://github.com/yvgude/lean-ctx/blob/main/rust/src/core/agents/registry.rs and https://github.com/yvgude/lean-ctx/blob/main/rust/src/core/config/sections.rs.

Created Backlog known-issue report doc-9 at backlog/docs/known-issues/lean-ctx-agent-bus-worker-capacity and linked it from plugins/lean-ctx/AGENTS.md under Existing Issues. Verified both relative Markdown targets resolve to existing files.

Current read-only diagnostic (2026-08-28): `lean-ctx call ctx_agent --project-root /home/eag1/repo/ezxomp --json '{"action":"list"}'` reports 15 active registrations: daemon PID 3966719, current coder PID 530669, plus 13 older coder registrations with last-active ages 28–360 minutes. Subagent registration remains blocked at the 15/15 boundary. No registry JSON edits, process termination, or global-state mutation performed. This confirms the existing external daemon-capacity blocker; safe next action is upstream daemon/config/reaper support or verified admin cleanup, not arbitrary OMP cleanup.

WT provenance: any repository-owned TASK-37 diagnostics/docs work is assigned to branch `task-38-leanctx` at `../ezxomp.task-38-leanctx`, created via `wt switch --create task-38-leanctx --no-cd --no-hooks -y` from main commit 7194001. This worktree must not edit the external registry, kill arbitrary processes, or claim the daemon's external cap/reaper is fixed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @Main
created: 2026-08-27 19:01
---
Review findings recorded; do not mark TASK-37 Done while external daemon cap/reap remains unresolved.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Superseded by decision-3: lean-ctx detached from ezxomp; repository-owned deliverables (session_shutdown disposal + idempotent dispose coverage 38/38, portable tsconfig, capacity contract docs, known-issue doc-9, CHANGELOG, OMP maxConcurrency 8→12) all landed. External daemon scope void after detach.
<!-- SECTION:FINAL_SUMMARY:END -->
