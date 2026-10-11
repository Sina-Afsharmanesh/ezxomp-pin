---
id: TASK-52
title: Enhance cook dagr producer to author-intent freshness and lifecycle projection
status: In Progress
assignee: []
created_date: '2026-08-29 01:56'
updated_date: '2026-08-29 06:34'
labels:
  - feature
  - architecture
dependencies: []
priority: high
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Align the cook plugin's dagr producer (plugins/cook/extensions/dagr.ts + pushDagr in cook-tools.ts) with the dagr-producer author contract (herdr-dagr upstream SKILL.md): projection freshness on every store mutation, real attempt/event lifecycle from journal, evidence tiers with verified mechanical receipts, locator/liveness/orchestrator from herdr, kind/project mapping. Parent TASK-51 exercises this as part of the end-to-end workflow run; the enhancement plan is recorded on TASK-51 notes (G1-G7 / E1-E6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Projection fires after every store-mutating cook tool commit (claim, release, next-claim, dispatch record, validate gate, journal record), not only claim/release
- [ ] #2 Attempts and events project real lifecycle data: agentLog entries are appended at dispatch and settle points, working tasks have working attempts, terminal attempts carry outcome with evidence tier
- [ ] #3 Journal gate receipts map to dagr attempt_settled events with evidence tier verified and receipt quoting the journal note
- [ ] #4 Working attempts carry locator (pane or agent) and liveness.last_output_at when known; orchestrator derives from $HERDR_PANE_ID when present
- [ ] #5 `cd plugins/cook && bunx vitest run` passes the full cook suite including new producer-contract tests; dagr check --strict on a live projection returns zero findings
- [ ] #6 Pane remains view-only: no gate coupling; projection failures stay silent
- [ ] #7 A deterministic tool-level demo proves a typed validator or judge failure is recorded as an error and routes a fresh-model workflow to the declared plan or implement stage while the strict-clean dagr projection remains view-only and non-gating.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: complex

1. Keep the completed RED guardrail in `plugins/cook/tests/dagr-projection.test.ts` and `plugins/cook/tests/dagr-push-triggers.test.ts`; implement only against its named failures. Risk: tests must remain deterministic without HERDR/network/real dagr. Check: targeted suite is red before source changes and green only after all observable contracts exist.
2. In `plugins/cook/extensions/dagr.ts`, extend the pure projection contract around `DagrTaskInput`, `DagrAttemptInput`, and `buildRunDoc` (:28, :86) and add an exported pure `buildDagrProjectionInput` seam. It receives already-read task, claim, agent-log, and journal facts; derives stable per-task attempts/events/evidence receipts; preserves E150 synthetic settled-unverified history; emits working locator/liveness and projects minimal kind/projects. Risk: repeated journal pairs must settle—not multiply—one ordered dispatch attempt. Check: lifecycle, dedupe, kind, project, and outcome receipt assertions pass without a dagr binary.
3. In `plugins/cook/extensions/cook-tools.ts`, make successful `dispatchPayload` consumers append `AgentLogEntry` dispatch facts and their matching journal intent only after a valid task payload exists; extend `cook_journal` (:1557) to persist explicit record/gate entries through `appendRecord`/`appendGate` (`journal.ts`:86-97). Feed `pushDagr` (:119) the new pure builder with `readJournal` facts, claims, and heartbeat/journal timestamps. Risk: a missing/inactive native task tool must leave no false attempt or projection. Check: dispatch and gate-receipt harness expectations pass.
4. Make every relevant lifecycle commit request a post-commit, fire-and-forget projection: `cook_next`, `cook_decompose`, successful planner/scout/researcher/worker/validator/judge/refute/audit dispatch recording, journal/result recording, claim/release, and typed recovery. Serialize/coalesce same-cwd publish work if needed so `.dagr/run.json.tmp` cannot race; retain `publishRunDoc` tmp→strict-check→atomic-rename and swallow pane-only failures. Do not add projection to config/watch/widget mutations. Check: the `cook_next` freshness test observes `run.json`, and an invalid dagr publish never changes workflow success/failure.
5. Add a `cook_record_result` boundary in `cook-tools.ts` for returned specialist envelopes. Validate typed validator/judge findings and supported `kickTo` values, append durable record/gate/error facts, update state/gate evidence, project the settlement, and return an explicit `Next: <plan|implement|verify>` route. Reject malformed/unsupported input atomically with no state/journal/log mutation. Risk: a textual dispatch payload is not proof that a native task ran; only an explicitly recorded result may settle an attempt. Check: tool-level negative-path demo routes to plan/implement and preserves view-only projection semantics.
6. Complete child tickets in dependency order `TASK-52.5 → TASK-52.1 → TASK-52.2 → TASK-52.3 → TASK-52.4 → TASK-52.6`; each worker records its own plan, targeted green evidence, and AC proof. Final verification: `cd plugins/cook && bunx vitest run`; exercise a generated live projection with the available strict dagr validator; then run root `just verify`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Decomposed into 5 sub-tickets
- TASK-52.1: Lifecycle projection core: journal+agentLog derived attempts/events with evidence tiers (E2+E3)
- TASK-52.2: Locator, liveness.last_output_at, and HERDR_PANE_ID orchestrator projection (E4+E5)
- TASK-52.3: Fire pushDagr on every store-mutating commit site (E1)
- TASK-52.4: Kind mapping + projects hierarchy emission (E6)
- TASK-52.5: RED producer-contract test suite for E1/E2/E3/E4/E5/E6 observable contracts

User-directed demo quality bar (2026-08-28): treat any failed workflow/DAG behavior as an error. The cook workflow must be self-explanatory to a fresh model from capture through plan, implementation, validation, review, and completion; validator or judge failures must route visibly and correctly back to implementation or planning. Exercise DAG projection end to end without weakening existing acceptance criteria.

## Decomposed into 1 sub-tickets
- TASK-52.6: Record typed validation and review kickbacks end to end
Dependencies:
- TASK-52.6 ← TASK-52.4

Plan-split escalation: user-expanded demo requirement exposed a hidden recovery edge not covered by TASK-52.1–.5. Added TASK-52.6 for typed validator/judge kickback recording and an end-to-end negative-path demo. It depends on TASK-52.4 because recovery must project the completed lifecycle, locator/liveness, freshness, and hierarchy shape.

## Context Packet (facts only)
- `plugins/cook/extensions/dagr.ts` — pure dagr v3 document builder; `DagrAttemptInput` at :28, `buildRunDoc` at :86, `projectDagr` at :188.
- `plugins/cook/extensions/cook-tools.ts` — cook tool registration; `dispatchPayload` at :36, best-effort `pushDagr` at :119, `cook_advance` at :515, `cook_next` at :1001, `cook_validate` at :1036, `cook_journal` at :1557.
- `plugins/cook/extensions/journal.ts` — durable journal reader/writers; `readJournal` at :56 and `appendGate` at :91.
- `plugins/cook/extensions/types.ts` — `AgentLogEntry` at :15 and persisted `CookState.agentLog`.
- `plugins/cook/tests/dagr-projection.test.ts` — pure projection + fake-DAGR_BIN transaction tests; suite begins at :36.
- `plugins/cook/tests/cook-dispatch.test.ts` — mock ExtensionAPI dispatch harness; `runDispatch` at :55.
- `plugins/cook/tests/claims.test.ts` — temporary git-initialized Backlog repo harness; `makeRealPi` at :27.
- Observed command targets: `cd plugins/cook && bunx vitest run tests/dagr-projection.test.ts`; `cd plugins/cook && bunx vitest run`; repository gate `just verify`.
- Mechanical constraints: dagr projection is best-effort/view-only; test paths must run without network, HERDR, or a real dagr binary; existing TASK-52 child criteria prohibit changes to `plugins/cook/extensions/agents.ts` and `plugins/cook/agents/*`.
- Subtask ordering: `TASK-52.5 → TASK-52.1 → TASK-52.2 → TASK-52.3 → TASK-52.4 → TASK-52.6`.

Planning result — complexity: complex. Fake-edge analysis found that `.1`, `.2`, `.3`, and `.4` all touch the same `dagr.ts`/`cook-tools.ts` lifecycle boundary, so concurrent delivery would create merge and semantic-order hazards; dependencies now serialize the chain after the RED suite. Independent scouts verified that `agentLog` has no production writer, `pushDagr` only runs for claim/release before journal/status commits, `appendGate` has no caller, dispatch tools emit payload prose but persist no returned result, and `kickTo` is prompt/type-only with no routing path. The plan therefore adds `TASK-52.6` and the explicit result-recording boundary. Projection errors remain non-gating; workflow/validator/judge failures become durable error/finding facts.

## Context Packet (facts only) — refreshed
- `plugins/cook/extensions/cook-tools.ts:119-145` currently maps every `agentLog` entry to a globally numbered initial/done/reported attempt and only `attempt_started` events; it receives no journal, claims, or heartbeat inputs.
- `plugins/cook/extensions/cook-tools.ts:1457,1487` are current `void pushDagr(ctx)` call sites.
- `plugins/cook/extensions/journal.ts:17-34,86-97` defines `intent|record|gate|external` entries and append helpers; `appendGate` exists at :91.
- `plugins/cook/extensions/types.ts:40-46` defines `WorkerHeartbeat`; `CookState` stores `heartbeats`, `claims`, `gateResults`, and `agentLog`.
- `plugins/cook/extensions/index.ts:131,224` has tool-call/tool-result hooks; inspected state writes there are heartbeat/watch-list related.
- `plugins/cook/tests/dagr-push-triggers.test.ts` is the deterministic temporary-Backlog/fake-DAGR_BIN demo harness authored for this task.
- Targeted RED proof currently reports 8 named unsatisfied contracts and 6 retained baseline tests passing.

Dependency correction from TASK-52.2 validation: its AC6 requires the shared `dagr-projection.test.ts` suite green, but the only red is TASK-52.4 kind/projects. To avoid a false `.2` closure and unblock real verification, TASK-52.4 now runs after lifecycle core; TASK-52.3 waits for both locator and hierarchy slices. This is a discovered test-contract edge, not scope expansion.

## Decomposed into 1 sub-tickets
- TASK-52.7: Reconcile cook widget and dagr projection at turn boundaries
Dependencies:
- TASK-52.7 ← TASK-52.3

User-observed sync evidence confirmed in Herdr: left pane `w3:p6` title and `cook_status` show TASK-52.2/implement; `cook_snapshot` also shows TASK-52.4 In Progress without a stage pointer. Right pane `w3:p1C` runs `dagr view` and renders TASK-50; root `.dagr/run.json` is generated at 2026-08-29T01:10 with run title `cook: TASK-50`. `turn_start` currently calls `syncFromBacklog` + `refreshWidget` but the reconciler only advances when `currentTaskId` is terminal and does not invoke a dagr refresh. Added TASK-52.7 for turn-boundary reconciliation; it follows trigger work TASK-52.3.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1247 — cook_validate searches the entire task journal for the latest record containing any modifiedFiles array, without binding it to the current repair/finding (or requiring non-empty string paths). A prior successful stage's modifiedFiles can therefore prove a later missing-evidence repair as scoped and let retention pass. Bind proof to the current repair record/attempt and fail closed when that record lacks valid evidence → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1844 — cook_record_result mirrors a result onto the most recent dispatch for the task, regardless of stage/source. With validator and judge dispatched concurrently, a validator result can settle the judge's dispatch (and leave the validator attempt working), producing false DAGR attempt_settled pairing and corrupting recovery freshness. Correlate the returned result to its matching stage/source dispatch identity; never use task-wide latest dispatch → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1904 — post-bonus cap escalation only appends prose and returns an error; it never dispatches the three mutually-blind cook-council inquiries or cook-council-synthesis, records their host ids/votes, or applies the single typed recovery route. The declared council contract is therefore unreachable, and the later council-pending check (lines 318-321) cannot observe a real episode → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1863 — resolveCapEscalation is called with only the newly returned finding, so allConfined and shrinking are evaluated against that singleton rather than the surviving finding union. A retained sibling blocker (including an unconfined kickTo) can be ignored and incorrectly earn the one bonus cycle instead of forcing council → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:1587 — cook_ready treats an unknown dependency as satisfied (`: true`), contradicting its all-dependencies-satisfied contract and cook_next's fail-closed behavior. A stale/corrupt Backlog dependency can be presented as ready and claimed, bypassing the DAG gate → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/cook/extensions/cook-tools.ts:172 — pushDagr uses getAllTasks, whose CLI/JSON failures collapse to an empty array, then publishes that empty task projection over the last good pane state. A transient strict Backlog error can erase all task nodes while lifecycle events remain, so recovery freshness is false and the view loses authoritative context. Use a strict task read and skip publication on read failure (without gating cook) → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:04
---
[blocking] plugins/evo/extensions/evo/evoMain.ts:77 — an explicitly empty pre-evo active-tool snapshot is treated as if no snapshot existed, so /evo off restores every registered tool instead of the exact empty set; activation rollback at :62 likewise skips restoring an empty snapshot after config-write failure. This violates the documented exact rollback contract → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:05
---
[blocking] plugins/cook/extensions/cook-tools.ts:224 — checkAcIntegrity swallows a Backlog read/JSON failure and returns success (`let the verdict stand`), so cook_validate can return `All pass.` without proving the task or its ACs. This violates strict error handling and permits an unverifiable workflow to pass; propagate a validation error/fail closed while keeping DAGR failures view-only → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:05
---
[blocking] plugins/cook/extensions/watch.ts:118 — pollWatchedTasks converts every Backlog CLI/JSON failure into `[]`, then classifies every watched task as missing and deletes it. A transient strict Backlog error permanently loses watch state and emits false disappearance alerts; distinguish unreadable reads from a successful empty task list and preserve entries on error → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:05
---
[blocking] plugins/cook/extensions/cook-tools.ts:169 — pushDagr has no per-cwd serialization/coalescing around the shared `.dagr/run.json.tmp` transaction. Overlapping lifecycle commits can interleave writes/checks/renames, allowing an older snapshot to win (or a rename to fail after checking another candidate), so the required post-mutation freshness is nondeterministic → implement.
---

author: @CookReleaseJudge
created: 2026-08-29 06:05
---
[blocking] plugins/cook/extensions/cook-tools.ts:1026 — cook_decompose commits taskIds to the store after creating/wiring children but never calls pushDagr, despite E1 requiring projection after every relevant store-mutating commit (and the plan explicitly names decompose). The pane stays stale until an unrelated later mutation → implement.
---

author: @CookSecondJudge
created: 2026-08-29 06:21
---
[blocking] plugins/cook/extensions/cook-tools.ts:1257 — cook_validate still takes the latest successful implement record anywhere in the task journal as modified-file proof, without tying it to the active repair finding/attempt. An older in-scope modifiedFiles entry can falsely justify retaining a later judgment; bind evidence to the latest implement repair that follows the current finding and fail closed otherwise.
---

author: @CookSecondJudge
created: 2026-08-29 06:21
---
[blocking] plugins/cook/extensions/cook-tools.ts:1855 — the runtime validation dereferences params.finding.source before proving finding is a non-null object. A direct/untrusted null finding throws instead of returning an error, violating malformed-result fail-closed semantics and leaving callers without a typed rejection; guard the object shape before field access.
---

author: @CookSecondJudge
created: 2026-08-29 06:22
---
[blocking] plugins/cook/extensions/cook-tools.ts:956 — cook_decompose enters Pass 1 and creates children without first validating that parent_task_id resolves to an existing readable parent and that the submitted subtasks/dependency references are well-formed. Invalid parent/input can leave orphan children after a supposedly rejected decomposition; perform all reads/shape checks before any create mutation.
---

author: @CookSecondJudge
created: 2026-08-29 06:22
---
[blocking] plugins/cook/extensions/cook-tools.ts:992 — dependency wiring still accepts an out-of-range numeric index (falls back to the literal number) and arbitrary unknown task IDs, then mutates the backlog. Unknown dependencies must be rejected before Pass 1 so cook_decompose cannot create a DAG that cook_ready/cook_next will permanently block.
---

author: @CookSecondJudge
created: 2026-08-29 06:22
---
[blocking] plugins/cook/extensions/cook-tools.ts:1645 — cook_claim checks existence/status/claims but never verifies every dependency resolves to a terminal task. A caller can bypass cook_ready/cook_next and claim a task with unmet or unknown deps, violating the fail-closed DAG gate; reject before journal/status mutation.
---

author: @CookSecondJudge
created: 2026-08-29 06:22
---
[blocking] plugins/cook/extensions/cook-tools.ts:2254 — all three council inquiry intents are appended before the three dispatch:council vote records. dagr.ts pairing requires a terminal before the next same-stage intent, so the first two inquiry attempts remain working and only the last settles; the full council episode is not honestly projected. Emit per-inquiry terminal pairing or fix the projection correlation to settle all three identities.
---

author: @CookSecondJudge
created: 2026-08-29 06:22
---
[blocking] plugins/cook/extensions/cook-tools.ts:2277 — the synthesis brief supplies only the three vote strings and says “exact finding union” without including episode.finding. The fresh synthesis specialist has no durable/contextual access to the typed finding it must route, so its recovery recommendation cannot be source-bound; include the exact finding union in the payload.
---

author: @CookSecondJudge
created: 2026-08-29 06:23
---
[blocking] plugins/cook/extensions/cook-tools.ts:1888 — result pairing derives the dispatch role solely from the caller-supplied stage and never enforces source/stage identity (validator must be verify, judge must be review) or an allowed active stage. A typed validator finding submitted with stage=review can therefore settle the judge dispatch; bind the result to its declared source and reject mismatches before append.
---

author: @CookThirdJudge
created: 2026-08-29 06:33
---
[blocking] plugins/cook/extensions/cook-tools.ts:1349 — current `cook_validate` finds the latest failure and a later implement record, but passes that repair's `modifiedFiles` to `resolveRepairScope` together with the entire accumulated `lastFindings` union. A repair can therefore touch a file from an older sibling finding and be accepted as scoped for the latest failure, retaining a stale judgment without proving the current blocker was fixed. Scope the evidence to the latest failure's typed finding (while separately retaining sibling findings) and fail closed when that exact repair lacks valid modified_files → implement.
---

author: @CookThirdJudge
created: 2026-08-29 06:33
---
[blocking] plugins/cook/extensions/cook-tools.ts:175 — the new process-wide per-cwd queue serializes publishes, but `publishDagr(ctx)` reads `sc.getStore()` from the mutable current context while loading `ctx.cwd`. If another project binds the shared StoreContext before the queued job runs, the projection for cwd A is built from cwd B's state and can overwrite A's run.json with foreign lifecycle data. Bind the state snapshot/store lookup to the queued cwd (`getStoreFor(ctx.cwd)`) and preserve that context through publication → implement.
---

author: @CookThirdJudge
created: 2026-08-29 06:33
---
[blocking] plugins/cook/extensions/cook-tools.ts:2008 — result-state maps are keyed by `taskId` after trim only, while other writers (claims/watch/DAGR) canonicalize IDs differently and `cook_start` stores the caller's spelling. A failure recorded as `task-1` followed by an implement success for `TASK-1` reads a different `lastFindings` entry, bypassing the repair/reset path and leaving convergence/gate state split; council episode lookups have the same case-sensitive split. Normalize task IDs once (trim + uppercase) at every state/journal/dispatch boundary → implement.
---

author: @CookThirdJudge
created: 2026-08-29 06:33
---
[blocking] plugins/cook/extensions/cook-tools.ts:912-913,1987 — complex review dispatches two judge attempts with the same `dispatch:judge` stage, then result recording selects only the latest matching judge log. The combined dual-review result settles the second attempt while the first remains working; later same-role results can be misattributed, and DAGR cannot pair identities by stage. Give each dispatch a unique identity/stage and record settlements against that identity (or emit one terminal for each judge) → implement.
---

author: @CookThirdJudge
created: 2026-08-29 06:34
---
[blocking] plugins/cook/agents/cook-audit.md:26-27 — audit instructs blockers to use `{source: "audit", ...}`, but `cook_record_result` accepts only `judge|validator` findings (schema/runtime at ~1875/1934). A real audit blocker therefore cannot be recorded or routed, so the newly documented audit route is unusable. Align the audit profile with the supported typed-finding vocabulary or add a fully supported audit source/stage path (including routing) → implement.
---
<!-- COMMENTS:END -->
