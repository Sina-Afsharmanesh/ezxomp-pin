---
id: doc-18
title: 'Compact-eng native-composition architecture [TASK-56]'
type: specification
created_date: '2026-08-30 01:27'
updated_date: '2026-08-30 01:30'
tags:
  - spec
  - TASK-56
  - TASK-56.5
  - compact-eng
  - architecture
---
# Compact-eng native-composition architecture

**Parent:** TASK-56
**Design ticket:** TASK-56.5
**Inputs:** doc-14, doc-15, doc-16, doc-17, `docs/authoring-extensions.md`, `plugins/ultra-compact/**`, `test/compact-eng.test.ts`.
**Boundary:** this specifies post-cutover behavior. TASK-56.6 decides package/slug/marketplace rename mechanics.

## 1. Boundary and hard rules

Compact-eng is a governor and observer, not a third compactor.

**Compact-eng owns:** pressure measurement; watermarks/hysteresis; single-flight, cooldown, no-progress and circuit state; explicit delegation; lifecycle receipts; operator command/status; bounded agent tools if the public tool contract is verified; and a recovery/usage skill.

**OMP-native owns:** automatic maintenance scheduling; Shake selection/transformation/artifacts; text and snapcompact transformations; native summaries/commits; vision/renderability/provider/context/data/frame-budget preflight; `preserveData.snapcompact`; aborts, budgets and fallbacks.

Verified public basis: `ExtensionContext` exposes `getContextUsage()` and `compact()` but no Shake action (`doc-14 §1,§3`; `extensions/types.ts:455-535`; `agent-session.ts:4907-4911`). Automatic Shake is host-owned (`session-maintenance.ts:2860-2910,3838-3905`). Explicit bitmap delegation is `ctx.compact({ mode: "snapcompact" })` (`doc-14 §1,§4`; `compact-handler.ts:1-23`; `session-maintenance.ts:726-975`).

Compact-eng MUST NOT:

1. register `session_before_compact`; presence alone suppresses native speculation/deferral (`doc-14 §2`; `session-maintenance.ts:1210-1218,1260-1276,1423-1434`);
2. return hook compaction; `fromHook` bypasses native snapcompact selection, preflight, fallback and method metadata (`session-maintenance.ts:825-885,958-975,1034-1055,2223-2278`);
3. register `tool_result` or `context` replacement for governance (`doc-14 §5`; `extensions/types.ts:980-1034,1109-1111`; `wrapper.ts:369-410`; `runner.ts:1603-1652`);
4. import private `AgentSession`/`SessionMaintenance`, call direct Shake, or return direct snapcompact library output;
5. write `preserveData.snapcompact`, duplicate Shake artifacts, or fabricate compaction entries.

## 2. Public surface

### Command

`/compact-eng` replaces `/ultracompact`; there is no alias.

- `/compact-eng` or `/compact-eng compact`: when idle with no pending messages, `await ctx.compact()`; otherwise receipt `deferred-pending`.
- `/compact-eng snapcompact`: when safe, `await ctx.compact({ mode: "snapcompact" })`; native preflight decides eligibility.
- `/compact-eng status`: usage, effective thresholds, phase/circuit/in-flight generation, configured mode and last receipt; status is non-mutating except refreshing usage.

The command never supplies a summary or replacement result. Manual actions use the same single-flight guard as automatic actions; they may make one safe half-open probe while the automatic circuit is open.

### Configuration

| Key | Type | Default | Contract |
|---|---|---:|---|
| `autoCompact` | boolean | `true` | Enables turn-boundary requests; observation/status remain active when false. |
| `watermark` | number `(0,1)` | `0.70` | Percentage trigger fixed by parent RED contract, not copied third-party bands. |
| `watermarkTokens` | positive integer or `null` | `null` | Optional absolute trigger; effective trigger is lower-of percent and absolute. |
| `releaseWatermark` | number `[0,watermark)` | `0.55` | Rearm threshold. |
| `outputHeadroomTokens` | non-negative integer | `4096` | Free space required below trigger after action. |
| `mode` | `"text" | "snapcompact"` | `"text"` | Automatic native request path. |
| `cooldownTurns` | non-negative integer | `2` | Safe boundaries suppressed after settlement/no-progress. |
| `maxConsecutiveFailures` | positive integer | `3` | Opens automatic circuit. |
| `circuitCooldownTurns` | positive integer | `5` | Boundaries before half-open probe. |
| `minProgressTokens` | non-negative integer | `4096` | Minimum observed token reduction. |

Validate once at registration and fail with the invalid key/range; never silently replace invalid values. Missing/invalid usage produces `usage-unavailable`, not a request. `watermarkTokens: null` means percentage-only; when set, either percentage or absolute pressure may trigger.

### LLM-facing tools and skill

Two bounded tools are warranted so an LLM can inspect pressure or explicitly choose the verified bitmap route:

- `compact_eng_context_status`: no parameters, read-only bounded status.
- `compact_eng_request`: `{ mode: "text" | "snapcompact", reason?: string }`; applies safe-boundary/circuit/single-flight guards, delegates to ordinary or explicit snapcompact native `compact`, and returns only accepted/deferred/error receipt.

**UNVERIFIED — TASK-56.7 checkpoint:** doc-14 does not file:line verify `ExtensionAPI.registerTool`, handler context, or schema registration. Before implementing either tool, TASK-56.7 MUST cite installed 18.0.6 public types/loader and add a targeted registration/invocation test. If handler context lacks the verified actions, omit both tools; never bridge private core. The command/governor/skill remain valid.

`skills/compact-eng/SKILL.md` teaches status-before-request, text by default, bitmap only when useful, narrow `artifact://` recovery, reference-not-body, and separation of user history, artifacts, bitmap context and guidance. Agent guidance appears only on transition, deferral/failure, open circuit or recovery need—not every turn.

## 3. Inputs, outputs and threshold math

Inputs are validated config; `ctx.getContextUsage()` (`doc-14 §1`; `extensions/types.ts:387-393,455-535`; `session-stats.ts:154-260`); `isIdle()`/`hasPendingMessages()` (`extensions/types.ts:455-535`); a turn boundary; `auto_compaction_start/end` and `session_compact` observations (`shared-events.ts:83-89,223-241`); and explicit operator/tool requests.

Let `P=floor(contextWindow*watermark)`, `A=watermarkTokens` or infinity, trigger `T=min(P,A)`, and release `R=floor(contextWindow*releaseWatermark)`. Pressure is `tokens>=T`. Settlement has headroom only when both `tokens<=R` and `tokens+outputHeadroomTokens<T`. Falling just below `T` is insufficient.

Outputs are only no-op/deferred/request decisions, public native calls, bounded receipts/status and transitions—never replacement messages, summaries, artifacts or host metadata.

## 4. State machine

Session state: `phase`, monotonic `generation`, optional `inFlight`, before/after usage, consecutive failure/no-progress counts, cooldown counters and last receipt.

`armed → requesting → compacting → settling → cooldown → armed`

1. **armed:** at each safe turn boundary, read one sample. Below `T` is successful no-op. At/above `T`, with auto enabled, idle and no pending messages, allocate generation and enter requesting. Otherwise stay armed with `deferred-pending`; no same-turn retry.
2. **requesting:** recheck idle/pending immediately before call. Text calls `ctx.compact()` with no argument; bitmap calls `{ mode: "snapcompact" }`. Store the promise before yielding. Concurrent turn/command/tool checks coalesce and never call twice.
3. **compacting:** lifecycle start may refine the receipt, including exact observed `action: "shake"`/`"snapcompact"`; it does not transfer ownership. Pending turns do not cause cancellation or a second call. Native abort is observed, not overridden.
4. **settling:** after promise settlement and/or matching native end/commit, read fresh usage. Only current generation can mutate state. Old completion is `stale-completion` and cannot update counters/UI or issue fallback. Compare delta and headroom.
5. **cooldown:** suppress automatic requests for configured safe boundaries. Rearm only after cooldown and when at/below `R` with headroom. If pressure remains, return to armed after cooldown and count no-progress; never loop in one turn.

Exactly one native request may be in flight per session. All triggers call the same `requestCompaction()`. Coalesced callers receive its bounded terminal receipt. Session reset invalidates prior generation. If observed native automatic maintenance starts before plugin delegation, native work gets first chance and suppresses the plugin call until settlement.

**No-progress:** missing after-usage, token delta below `minProgressTokens`, after not lower than before, or failed headroom. Record, cool down, never recurse immediately.

**Fallback order:**

- Snapcompact: native `ctx.compact({mode:"snapcompact"})` and native preflight/fallback/commit → remeasure → only if still pressured, current, safe, and no native compaction in flight, one ordinary `ctx.compact()` fallback as a new generation → stop on ordinary failure/no-progress and leave native auto-maintenance available.
- Text: ordinary `ctx.compact()` → settle → stop. No plugin-generated summary or lossy fallback.
- Native Shake is never invoked/reordered.

`auto_compaction_end` fields `aborted`, `skipped`, `retry`, `error` are recorded exactly (`shared-events.ts:223-241`). If a turn becomes pending during compaction, allow native settlement but suppress plugin fallback/retry until next safe boundary. Rejection increments failures; no-progress is separate but contributes to opening after the configured limit. Headroom success clears both. Open circuit suppresses only plugin automatic delegation; observation/native maintenance continue. One half-open probe follows cooldown; success closes, failure reopens. Failure never deletes artifacts/preserve data/recovery state.

### Text-only and bitmap paths

Text always uses ordinary `ctx.compact()`. Bitmap always uses `ctx.compact({mode:"snapcompact"})`; the plugin does not inspect private model internals. OMP owns vision, renderability, payload, projected context, provider/data caps, 80-frame archive cap and 3 MB cap (`doc-14 §4`; `snapcompact.ts:452-525,731-769,2032-2179`; `session-maintenance.ts:847-957,2280-2427`). Text-only models therefore follow native snapcompact rejection/skip, then the guarded ordinary fallback. The plugin reports no rejection reason unless native lifecycle exposes it.

## 5. Shake/snapcompact composition and preservation

Shake is observed through `auto_compaction_start/end` with exact `action="shake"`, then usage is remeasured. Compact-eng never calls/configures Shake, rewrites regions or creates markers. Native protects recent/protected content and artifact reads, keeps tool-call blocks intact, persists recoverable elisions and advances maintenance if headroom is insufficient (`doc-14 §3`; `shake.ts:26-76,285-361`; `session-maintenance.ts:560-703,2860-2910,3838-3905`).

Snapcompact is requested only through `ctx.compact({mode:"snapcompact"})`; native owns archive unfolding, healing/rendering/frames, `preserveData.snapcompact`, reconstruction and safeguards (`snapcompact.ts:527-575,1697-1863,2032-2179`; `session-context.ts:145-157,417-430`). Text uses only ordinary `ctx.compact()`.

Plugin-added behavior is non-lossy: before native delegation it never transforms recent user intent/ACs, complete tool pairs, mutation/verification output, subagent conclusions, compaction metadata, or literal `artifact://` pointers. These protection classes primarily derive from pi-vault/pi-dcp (`doc-16`; pi-vault `README.md:176-228`; `handler.ts:56-135`) and are not falsely attributed wholesale to OMP. Native Shake specifically protects recent/protected results/artifact reads and never touches tool-call blocks (`shake.ts:26-76,285-361`; `tool-protection.ts:31-64`). Doc-14 does not verify that every native text summary preserves mutation/subagent classes verbatim; compact-eng promises only that it adds no lossy pre-pass, preserves canonical pointers, and teaches recovery.

`artifact://<id>` is the sole raw Shake recovery authority. The skill teaches narrow referenced-region reads. Never replace pointers with DCP block IDs, inline recovered bodies recurrently, or create a second archive.

## 6. Honest observability

Receipts contain only source (`native-auto`/`compact-eng-request`), plugin generation, requested mode, exact observed native action/result, before/after usage, transition, pending/abort/skipped/error/no-progress/fallback, and turn/time identity. Savings are measured deltas, never causal claims.

Classes: `native-shake-observed`, `native-auto-observed`, `plugin-native-text-requested`, `plugin-native-snapcompact-requested`, `native-outcome`, `recovery-guidance`, `deferred`, `no-progress`, `circuit-open`, `stale-completion`. A recovery receipt points to an existing native artifact; it never claims a read occurred.

Operator status/notifications may refresh without entering model context. Agent tool results are request-scoped and bounded; skill/guidance is transition/failure/recovery-only. The plugin says it requested or observed native behavior, never that it performed compression.

## 7. Optional-pattern decisions

| doc-17 candidate | Decision and reason |
|---|---|
| Hysteresis/transition throttling | Adopt; prevents chatter without copied numeric bands. |
| Single-flight identity/stale suppression/retry/no-progress | Adopt; required for safe delegation. |
| Valid-usage/useful-action checks | Adopt categories; no 30k floor. |
| No-op after native relief | Adopt; Shake may already make more action uneconomic. |
| Reference-not-body/on-demand fetch | Adopt narrowly through existing `artifact://`; no notebook/archive clone. |
| Stage cleanup/commit on success | Reject initially; no auxiliary cleanup store selected. Current-generation state still commits transactionally. |
| Versioned persistent auxiliary state | Reject; session in-memory governor is sufficient. |
| Bounded namespaced preserveData | Reject; no persistence need, avoids overhead/key collision. |
| Extra protection classes | Adopt as plugin non-transformation/teaching invariants, not unsupported native promises. |
| Honest receipts | Adopt; distinguishes observation/request/outcome. |
| Operator/agent visibility split | Adopt; avoids recurring prompt cost. |
| Stable-ID overhead/trust/model gates | Reject initially; no projection/index/config-file/model transform. |

Also rejected: pi-agenticoding custom compaction, pi-vault request projection, DCP decompression as Shake recovery, copied thresholds, mandatory notebook/persistence, direct Shake/snapcompact library calls and second raw archive.

## 8. Post-rename file/symbol and verification map

| Outcome | `plugins/compact-eng/` file/symbol | Checkpoint |
|---|---|---|
| Registration/clean surface | `extensions/index.ts`: default `compactEng`, `__resetModuleState` | Existing `test/compact-eng.test.ts`: `compact-eng` exists; `ultracompact`, `session_before_compact`, `tool_result` absent. |
| Config/types | `extensions/types/index.ts`: `CompactEngConfig`, `ResolvedCompactEngConfig`, `GovernorPhase`, `CompactionReceipt`, `resolveConfig` | TASK-56.7 config tests: defaults, invalid ranges, lower-of math. |
| Governor | `extensions/governor.ts`: `CompactEngGovernor`, `observeTurnEnd`, `requestCompaction`, `observeAutoStart`, `observeAutoEnd`, `settle`, `reset` | Existing watermark/no-op/concurrency RED tests plus headroom, stale, pending, abort/failure/circuit tests. |
| Command/status | `extensions/index.ts`: `handleCompactEngCommand`; governor `status()` | Ordinary undefined-argument call, explicit snapcompact object, status no mutation, pending deferral. |
| Receipts | governor `recordReceipt` and lifecycle observers; registration in `index.ts` | Shake attribution and exact aborted/skipped/error tests. |
| Conditional tools | `extensions/index.ts`: `registerCompactEngTools` | TASK-56.7 public-type citation then registration/invocation test; omit if unsupported. |
| Teaching | `skills/compact-eng/SKILL.md` | Skill discovery, native attribution, narrow artifact recovery, no stale command. |
| Runtime identity | `package.json` | manifest, isolated direct import, local-link and marketplace gates. |
| Local contracts/docs | `AGENTS.md`, `README.md`, `CHANGELOG.md` | no-stale-identity scan/review. |

### Existing engine tiers

Remove `plugins/ultra-compact/extensions/engine.ts` and `UltraCompactEngine`, `CompactionTier`, `EvictionLevel`, custom result types, preemptive projection, micro 60–90%, full 90%+, tool pruning/dedup/importance scoring, graduated eviction levels, snapshot/rollback and lossy custom circuit behavior. They are replacement transforms/parallel budgets. Only threshold/circuit concepts survive, reimplemented in `CompactEngGovernor`; there is no `engine.ts` alias, export shim, micro/full tier or emergency truncation.

Parent AC2 maps to this spec/negative controls; AC4 to TASK-56.6 and these files; AC5 to governor tests; AC6 to `bun test test/compact-eng.test.ts test/manifest.test.ts test/smoke-plugins.test.ts`, `bunx tsc --noEmit`, `bun test test/`, `just verify`, then direct-source/local-link/marketplace fresh-agent checks. No mapped symbol accesses private core.

## 9. Marketplace, non-goals and migration

Per `docs/authoring-extensions.md:23-86,112-135`, marketplace install symlinks/copies and installs no dependencies. Host `@oh-my-pi/*` runtime imports use exact `18.0.6` peer dependencies. Keep `@oh-my-pi/pi-coding-agent` as peer. Add no direct snapcompact import/dependency and no third-party runtime package. A future third-party dependency must be vendored/bundled; `dependencies`/`devDependencies` metadata alone is insufficient. Package/marketplace/manifest versions remain byte-identical; declared paths must exist.

Non-goals: changing native method order/budgets/frame/artifact formats/fallback; replacing/wrapping transforms; custom projection/pruning/summaries/notebooks/DCP blocks/rerun; persistent state/telemetry/savings claims/model tables; guarantees beyond verified native contracts; private-core access; compatibility aliases.

TASK-56.6 owns package/path/slug/command/skill/marketplace/cache/version migration and exact clean-cutover inventory. This spec assumes the post-rename layout and does not decide ADR mechanics. TASK-56.7 implements and validates UNVERIFIED seams; TASK-56.8 runs repository/marketplace gates.

## 10. Required capability checkpoints

Doc-14 is authoritative for native claims. Two RED-required/design seams lack doc-14 file:line verification:

1. **UNVERIFIED `agent_end` registration/ordering:** TASK-56.7 must cite installed 18.0.6 public event types and exercise the handler. If unavailable, return to architecture; do not substitute interception.
2. **UNVERIFIED tool registration/handler context:** validate as §2 requires; omit tools if public context cannot expose verified actions.

No UNVERIFIED seam may become a private-core workaround.
