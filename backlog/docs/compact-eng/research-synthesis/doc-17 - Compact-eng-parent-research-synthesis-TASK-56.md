---
id: doc-17
title: 'Compact-eng parent research synthesis [TASK-56]'
type: other
created_date: '2026-08-30 01:15'
updated_date: '2026-08-30 01:18'
tags:
  - research
  - TASK-56
  - TASK-56.4
  - compact-eng
---
# Compact-eng parent research synthesis

**Parent:** TASK-56
**Task:** TASK-56.4
**Classification:** research
**Non-goal:** This synthesis constrains TASK-56.5; it does not select an architecture, thresholds, state machine, persistence model, or UI.

## Sources and resolved Pi-dcp identity

This record synthesizes full reads of **doc-14** (OMP 18.0.6 Shake/snapcompact contracts, `backlog/docs/compact-eng/omp-native-extension-contracts/`), **doc-15** (commit-pinned pi-agenticoding patterns, `backlog/docs/research/pi-agenticoding-context-management-patterns.md/`), and **doc-16** (Pi-dcp candidate research, `backlog/docs/research/pi-dcp-identity-context-patterns/`).

Doc-16 first established that Pi-dcp was ambiguous and correctly did not guess. TASK-56.1 comment 1 then records the binding operator resolution dated 2026-08-30: the primary source is **`pi-vault/pi-dcp`, identified by the operator as npm `pi-dcp@0.6.0`**, covering compression, persistence, decompression recovery, thresholds, and protection. The Pi-dcp row uses doc-16 evidence for commit `479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7`. Other doc-16 candidates remain evidence only and are not merged into pi-vault.

## Pattern matrix

Every cell cites its source record. Extension describes observed source behavior, not permission for compact-eng to copy it.

| Target | Trigger | Transformation | Persistence / recovery | Budget | Fallback | Extension |
|---|---|---|---|---|---|---|
| **OMP-native Shake** | Native auto-maintenance chooses configured `shake`; extensions can observe lifecycle events but cannot call Shake directly. **[doc-14 §§1,3; `shared-events.ts:223-241`; `session-maintenance.ts:3838-3905`; `extensions/types.ts:455-535`]** | Replaces eligible textual tool results and large fenced/XML regions while protecting recent/protected content; tool-call blocks remain intact. **[doc-14 §3; `shake.ts:285-361`]** | Persists originals to session artifacts and emits `artifact://ID (region M)` markers; failed artifact writes leave bare markers. **[doc-14 §3; `session-maintenance.ts:560-703`; `artifact-protocol.ts:1-49,100-128`]** | Auto defaults protect 16,000 recent tokens, require 4,000 savings, protect skill/artifact reads, and use a 400-token block floor. **[doc-14 §3; `shake.ts:26-76`]** | Native maintenance advances to the next configured method when Shake does not provide enough headroom. **[doc-14 §3; `session-maintenance.ts:2860-2910`]** | Supported composition is observation while native maintenance owns automatic Shake. Private `AgentSession.shake()` is absent from `ExtensionContext`. **[doc-14 §§1,3; `agent-session.ts:4907-4911`; `extensions/types.ts:455-535`]** |
| **OMP-native snapcompact 18.0.6** | Native maintenance may select it; explicit bitmap request is `ctx.compact({ mode: 'snapcompact' })`, subject to host preflight. **[doc-14 §§1,4; `compact-handler.ts:1-23`; `session-maintenance.ts:726-808,847-957`]** | Unfolds previous source, heals data URLs, renders coherent history into frames, and rebuilds text-head/image-middle/text-tail blocks. **[doc-14 §4; `snapcompact.ts:1-45,1766-1863,2032-2179`]** | Host-owned `preserveData.snapcompact` stores frames/source/edges/truncation; OMP reattaches reconstructed history blocks. **[doc-14 §4; `snapcompact.ts:527-575,1697-1863`; `session-context.ts:145-157,417-430`]** | 80-frame and 3 MB data caps, provider/live-context limits, and serialization defaults of 2,000 chars per result, 500 per argument value, 2,000 per argument list, 60% head retention. **[doc-14 §4; `snapcompact.ts:452-525,731-769`; `session-maintenance.ts:2280-2365`]** | Host checks vision, renderability, payload, provider/data limits, and projected context; hook-supplied `fromHook` output bypasses native preflight/fallback. **[doc-14 §§2,4; `session-maintenance.ts:844-975,2280-2427`]** | Compose through native `compact()`, optional explicit bitmap mode, and observational/additive events. A hook-returned library result is not native composition. **[doc-14 §§1,2,4; `extensions/types.ts:395-425,455-535`; `session-maintenance.ts:825-975`]** |
| **pi-agenticoding** | Transition-throttled 30/50/70 advisory bands; handoff additionally requires valid usage, a non-empty task, 30,000 tokens, and no overlap. Values are source-specific. **[doc-15 §§1.4,2.3,4.2; `index.ts:862-893`; `eligibility.ts:1-38`; `tool.ts:31-54,247-288`]** | Handoff replaces active context; a separate Notebook injects page names/tiny previews and reads bodies on demand. **[doc-15 §§1.2,2.1; `compact.ts:2-40`; `index.ts:731-777`; `notebook/tools.ts:141-150`]** | Task/session Notebook rehydrates only the latest committed generation, stages then commits pruning, and retains pages on failure. User history is not Shake-style agent recovery. **[doc-15 §§1.3,3.1-3.3,4.2; `rehydration.ts:43-132`; `store.ts:108-153`]** | 80-character previews, exclusion of transcripts/logs/large output, pressure bands, and a 30,000-token useful-cut floor; none is a portable default. **[doc-15 §§1.2,1.4,2.3]** | Generation/`settled` guards reject overlap/stale completion; cleanup commits only on success; failure retains state and restores retry. **[doc-15 §4.2; `handoff/tool.ts:80-97,134-196,247-288`]** | It deliberately disables built-in compaction and returns a custom `session_before_compact` result. Only its independent lifecycle/state patterns are optional here. **[doc-15 §§2.1-2.2,4.1-4.2; `README.md:38-46`; `architecture.md:9-17`]** |
| **Pi-dcp primary: pi-vault/pi-dcp 0.6.0** | Separates automatic dedup/error pruning from model-callable compression; refuses recent/overlapping ranges and throttles nudges/model limits. **[doc-16 Compaction/summarization; `README.md:39-43,193-210`; `handler.ts:56-135`]** | Ordered request projection strips old transforms, rebuilds stable refs, applies strategies/IDs/nudges, then prunes; compression leaves stable block anchors. **[doc-16 Context management and Recovery/refetch; `pipeline.ts:19-72`; `compress/state.ts:4-29`]** | Versioned facts, fingerprint, snapshot validation, and rebuildable caches persist state; decompression deactivates a block so originals return next pass. **[doc-16 Context management and Recovery/refetch; `persistence.ts:35-75,191-257`; `decompress.ts:4-21`]** | Protects recent user turns, complete tool pairs, mutation/subagent output, and verification/frontier; model/min/max limits and buffers constrain compression. Clean overhead can be net-negative. **[doc-16 Context management and Compaction/summarization; `README.md:176-228,193-210,255-280`]** | Primary-source recovery is reversible block decompression. Hypernewbie native fallback/bounded retrieval are other-candidate facts, not pi-vault capabilities. **[doc-16 Recovery/refetch and candidate table; `decompress.ts:4-21`]** | Uses a `context` projection, tools, permission/model gates, guidance, lifecycle reconciliation, trust-gated config, and live tool disablement. These are not OMP hook capabilities. **[doc-16 Extension/hook points; `src/index.ts:111-127,180-297,300-374,429-498`]** |

## Binding constraints for TASK-56.5

These are verified host constraints, not candidates:

1. **Never register `session_before_compact`.** Presence suppresses native speculation/deferral even when returning `undefined`. **[doc-14 §2; `session-maintenance.ts:1210-1218,1260-1276,1423-1434`]**
2. **Never return a hook compaction.** It becomes `fromHook` and bypasses native snapcompact selection, preflight, fallback, and method metadata. **[doc-14 §2; `session-maintenance.ts:825-885,958-975,1034-1055,2223-2278`]**
3. **Native auto-maintenance owns automatic Shake.** **[doc-14 §3; `session-maintenance.ts:2860-2910,3838-3905`]**
4. **`ExtensionContext` exposes `getContextUsage()` and `compact()`, but no direct Shake action.** Public modes are `soft | remote | snapcompact`; internal `AgentSession.shake()` is not public extension API. **[doc-14 §§1,3; `extensions/types.ts:455-535`; `compact-modes.ts:14-45`; `agent-session.ts:4907-4911`]**
5. **The explicit bitmap path is `ctx.compact({ mode: 'snapcompact' })`.** Direct library output returned from a hook is not equivalent. **[doc-14 §§1,2,4; `compact-handler.ts:1-23`; `session-maintenance.ts:726-975`]**
6. **`preserveData` is bounded additive metadata only.** `session.compacting` may add namespaced data; `CompactOptions` has no such field. Never use host-owned key `snapcompact`. **[doc-14 §§1,2,4; `shared-events.ts:383-390`; `extensions/types.ts:395-425`; `session-maintenance.ts:223-232,968-975`; `snapcompact.ts:1697-1740`]**
7. Preserve native artifact recovery and snapcompact vision/renderability/provider/data/context safeguards. **[doc-14 §§3-4; `artifact-protocol.ts:1-49,100-128`; `session-maintenance.ts:847-957,2280-2427`]**

`tool_result` and `context` replacement are not Shake/snapcompact callbacks. **[doc-14 §5; `extensions/types.ts:980-1034,1109-1111`; `wrapper.ts:369-410`; `runner.ts:1603-1652`]**

## Optional patterns the spec may adopt or reject

- Hysteresis/transition throttling without copying pi-agenticoding numeric bands. **[doc-15 §1.4]**
- Single-flight monotonic identity, stale completion suppression, retry, and no-progress handling around supported native requests. **[doc-15 §4.2]**
- Valid-usage/useful-action checks without copying the 30,000-token floor. **[doc-15 §2.3]**
- A no-op after native relief as a valid outcome when extra projection/metadata costs more than it saves. **[doc-16 `pi-vault README.md:255-280`; doc-14 §3]**
- Reference-not-body metadata and on-demand fetch while native `artifact://` remains raw-recovery authority. **[doc-15 §§1.2,3.3; doc-14 §3]**
- Stage auxiliary cleanup and commit only after native success; retain recovery state on failure. **[doc-15 §§3.2,4.2]**
- Versioned branch/session auxiliary state only if persistence is selected; stateless observation remains valid. **[doc-15 §§1.3,3.1; doc-16 persistence facts]**
- Bounded namespaced additive metadata that neither duplicates artifacts nor uses `snapcompact`. **[doc-14 §§2,4; doc-15 §1.2]**
- Optional protection classes for recent intent, complete tool pairs, mutation/verification, subagent conclusions, compaction metadata, and artifact pointers; native Shake protections remain controlling. **[doc-16 pi-vault protection evidence; doc-14 §3]**
- Honest observed receipts distinguishing Shake, requested native compaction, observed native bitmap/text outcome, fallback/skipped/error, and recovery. **[doc-14 §1; doc-16 Honest receipts interpretation]**
- Operator status separated from transition/failure-only agent guidance. **[doc-15 §§1.4,4.3]**
- Count stable-ID/preview/summary metadata overhead; trust/model gates remain optional only if those surfaces are selected. **[doc-16 `README.md:255-280`; `src/index.ts:111-127,180-297`]**

## Explicit conflicts

1. **pi-agenticoding ownership vs native composition:** it disables native compaction and returns a custom result, while OMP treats this as `fromHook`. Reject that mechanism; retain only independent state/recovery/UX patterns. **[doc-15 §§2.1-2.2; doc-14 §2]**
2. **pi-vault request projection vs Shake persistence:** projection is provider-bound; Shake persists session rewrites/artifacts. Do not call projection Shake or make it mandatory. **[doc-16 `pipeline.ts:19-72`, `index.ts:429-498`; doc-14 `session-maintenance.ts:560-703`]**
3. **Pi-dcp decompression vs Shake recovery:** block deactivation is not `artifact://` raw recovery. Never replace artifact pointers with DCP anchors. **[doc-16 `decompress.ts:4-21`; doc-14 §3]**
4. **User history vs agent recovery:** pi-agenticoding retains history for users but supplies no artifact ID. **[doc-15 §3.3]**
5. **Incomparable budgets:** third-party bands/limits are source-specific; native Shake/snapcompact budgets remain host-owned. **[doc-15 §§1.4,2.3; doc-16 compaction facts; doc-14 §§3-4]**
6. **Identity history:** doc-16 ambiguity was research-correct, then operator-resolved to pi-vault on 2026-08-30. Other candidates remain evidence only. **[doc-16 finding/candidate table; TASK-56.1 comment 1]**
7. **Public snapcompact library vs supported composition:** exported library code does not justify a hook-returned result that bypasses host guards. **[doc-14 §§2,4]**

## ADHD divergence and focus

Four isolated frames generated 16 candidates:

- **Economic:** no-op after native relief; transition throttling; cheap-vs-model sequencing; bounded references with overhead counted.
- **Security:** native artifacts/archive authority; tool-pair/working-set protection; staged cleanup; optional trust/model gates.
- **Performance:** single-flight native delegation; host-owned budgets/preflight; lifecycle observation instead of interception; persistent state only when justified.
- **UX:** honest receipts; operator status versus transition-only agent text; artifact-first recovery; distinct user-history/raw-artifact/bitmap/guidance channels.

Critic scoring used novelty, viability, and fit (15 maximum). Survivors: no-op/net-benefit accounting **15**; separate recovery channels **15**; reference-not-body metadata **14**; native recovery/archive authority **14**; single-flight shape **14**; lifecycle observation **14**; honest receipts **14**; operator/agent visibility split **14**.

Pruned: direct Shake invocation; any `session_before_compact` registration; hook-returned snapcompact; copied thresholds; unconditional per-turn projection; a second raw archive; attributing hypernewbie behavior to pi-vault; mandatory Notebook, persistence, trust gates, or UI.

### Non-obvious finding

**Native work already made this turn cheap; take no additional action is a valid successful result.** Pi-vault reports clean-workload overhead and doc-14 verifies native Shake protected recoverable elision. This is an optional policy insight, not an architecture selection or savings guarantee. **[doc-16 `pi-vault README.md:255-280`; doc-14 §3]**

## Handoff

TASK-56.5 must honor the binding constraints and identity/attribution distinctions above. It may select individual optional patterns with explicit interfaces/tests. This synthesis intentionally leaves watermark values, ordinary versus explicit bitmap requests, auxiliary persistence/indexing, request projection, cooldown/retry state, UI, and supplemental protections undecided.
