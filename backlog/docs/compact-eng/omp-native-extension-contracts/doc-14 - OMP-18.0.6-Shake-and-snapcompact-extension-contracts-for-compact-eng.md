---
id: doc-14
title: OMP 18.0.6 Shake and snapcompact extension contracts for compact-eng
type: other
created_date: '2026-08-30 00:32'
updated_date: '2026-08-30 00:35'
tags:
  - research
  - TASK-56.3
  - compact-eng
  - omp
  - shake
  - snapcompact
---
# OMP 18.0.6 Shake and snapcompact extension contracts for compact-eng

## Scope and source status

This record answers TASK-56.3 from installed local source and shipped types, not README claims. The active repo resolves `@oh-my-pi/pi-coding-agent` to the `18.0.6+8543910243e3315e` Bun store instance. snapcompact is 18.0.6; its manifest maps runtime/types exports to `src`/`dist/types` (`node_modules/.bun/@oh-my-pi+snapcompact@18.0.6/node_modules/@oh-my-pi/snapcompact/package.json:20-48`), and `src/index.ts:1` exports all of `./snapcompact`. Facts and interpretations are separated below.

## Executive result

**Fact:** Extensions can observe usage/native maintenance through `getContextUsage()`, `auto_compaction_start/end`, and `session_compact`, and request native compaction with `compact()`, including one-off snapcompact. There is no public `ExtensionContext.shake()` and no `before_compact` event; the name is `session_before_compact`.

**Interpretation / recommendation:** compact-eng should govern native behavior, not provide compaction results. Do not register `session_before_compact`, return `compaction`, or pre-transform tool/message content for this feature. Let configured OMP auto-maintenance own Shake/snapcompact. Use usage/lifecycle events for hysteresis, coalescing, and reporting. Use `ctx.compact({ mode: "snapcompact" })` only for an explicit snapcompact request; no equivalent public Shake action exists.

## 1. Public event and context contracts

### Facts

- `session_before_compact` payload is `{ type, preparation, branchEntries, customInstructions?, signal }` (`node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+8543910243e3315e/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts:63-74`); result is `{ cancel?: boolean; compaction?: CompactionResult }` (`shared-events.ts:375-381`).
- `session.compacting` payload is `{ type, sessionId, messages }` (`shared-events.ts:76-81`); result supports additive `context?: string[]`, `prompt?: string`, and `preserveData?: Record<string, unknown>` (`shared-events.ts:383-390`). `session_compact` carries the committed entry and `fromExtension` (`shared-events.ts:83-89`).
- Public extension registrations include `session_before_compact`, `session.compacting`, `session_compact`, and `context` (`src/extensibility/extensions/types.ts:1240-1258`). Hook API uses the same compaction names (`src/extensibility/hooks/types.ts:480-500`). No `before_compact` registration appears in source or shipped types.
- `auto_compaction_start` exposes reason plus action, including `shake`/`snapcompact`; `auto_compaction_end` adds result, aborted, retry, error, and skipped state (`shared-events.ts:223-241`).
- `ContextUsage` is `{ tokens, contextWindow, percent }` (`extensions/types.ts:387-393`); runtime computes `percent = usedTokens / contextWindow * 100` (`src/session/session-stats.ts:252-260`) using provider anchors when available and estimates otherwise (`session-stats.ts:154-250`).
- `ExtensionContext` exposes `getContextUsage()`, `compact(string | CompactOptions)`, model/idle/pending-message queries, and managed timers (`extensions/types.ts:455-535`). Its adapter routes string to instructions and object to native options (`src/extensibility/extensions/compact-handler.ts:1-23`).
- `CompactOptions` has completion/error callbacks, `mode`, and `internalGuidance`; it has no `preserveData` (`extensions/types.ts:395-425`). Public modes are only `soft | remote | snapcompact` (`src/session/compact-modes.ts:14-45`).
- Hook-only context deliberately omits `compact` and `getContextUsage` (`src/extensibility/hooks/types.ts:170-214`). Binding fact (c) is confirmed for ExtensionContext, not HookContext.

### Interpretation

`session.compacting`/post/lifecycle events are additive or observational. `session_before_compact` is cancellation/replacement interception. `ctx.compact()` is native but cannot directly select Shake: manual selection only branches for remote, snapcompact, and soft (`src/session/session-maintenance.ts:726-808`).

## 2. Binding negative controls

### Registered handler suppresses speculation — confirmed

- Native speculation covers only LLM-backed remote/handoff/soft; Shake/snapcompact are local (`session-maintenance.ts:1196-1209`).
- Speculation start returns immediately when `extensionRunner.hasHandlers("session_before_compact")` (`session-maintenance.ts:1210-1218`). Threshold deferral also returns false (`session-maintenance.ts:1260-1276`), and claiming an armed result returns undefined (`session-maintenance.ts:1423-1434`).
- JS/TS hook factories bind through the extension runner (`src/extensibility/extensions/loader.ts:675-700`).

**Interpretation:** Binding fact (a) is confirmed. Presence is sufficient; a handler returning `undefined` still disables speculation/deferral.

### Hook result bypasses native snapcompact — confirmed

- A `session_before_compact` result containing `compaction` sets `fromExtension = true` (`session-maintenance.ts:825-842`).
- Preparation becomes `{ kind: "fromHook", ... }` (`session-maintenance.ts:2223-2278`).
- Native snapcompact is gated on `kind !== "fromHook"` (`session-maintenance.ts:844-885`); the `fromHook` branch wins before native snapcompact (`session-maintenance.ts:958-975`), and commit clears native method metadata for extension results (`session-maintenance.ts:1034-1055`).

**Interpretation:** Binding fact (b) is confirmed. Returning a library-generated bitmap result replaces/bypasses native selection, preflight, and fallback.

### Additive non-replacement seam

`session.compacting` is emitted only without a complete hook result and retains `kind: "needsLlm"` (`session-maintenance.ts:2243-2278`). Native snapcompact merges additive preserve data (`session-maintenance.ts:968-975`); LLM compaction uses prompt/context and merges result data (`session-maintenance.ts:988-1012`). Merge is shallow and removes only stale snapcompact archive state (`session-maintenance.ts:223-232`; snapcompact `src/snapcompact.ts:1730-1740`), not arbitrary plugin keys.

## 3. Native Shake contract

### Facts

- Agent-core Shake replaces whole tool results and large fenced/XML blocks with placeholders; artifact I/O/persistence/provider teardown belong to the session caller (`node_modules/.bun/@oh-my-pi+pi-agent-core@18.0.6/node_modules/@oh-my-pi/pi-agent-core/src/compaction/shake.ts:1-9`).
- Default auto config protects newest 16,000 tokens, needs 4,000 savings, protects skill outputs, `skill://` reads, and artifact recovery reads, and requires 400-token fenced/XML blocks (`shake.ts:26-54`). Manual config protects 4,000 recent tokens with no savings floor; rescue protects no tail but retains artifact-read protection (`shake.ts:56-76`).
- Eligibility includes whole textual tool results except protected/pruned/empty/pre-boundary/recent results, plus complete large fenced/XML spans in user/developer/assistant/custom messages. Tool-call blocks are never touched; useless non-error results may bypass recent protection (`shake.ts:285-361`). Artifact reads are recognized by paired `read artifact://...` or internal-source metadata (`src/compaction/tool-protection.ts:31-64`).
- Session modes: images drop images; thinking removes reasoning without replacement; elide writes one artifact, replaces regions, persists rewrites, rebuilds context, and resets provider sessions (`pi-coding-agent/src/session/session-maintenance.ts:560-683`).
- Exact recoverable placeholder: `[shaken ~N tokens — recover: artifact://ID (region M)]`; failed artifact persistence degrades to a bare shaken marker. Artifact text has numbered region headings and exact originals (`session-maintenance.ts:684-703`).
- `artifact://<id>` is numeric session-scoped raw text, pinned to caller session first, paginable/selectable; full inline reads over 8 MiB are blocked (`src/internal-urls/artifact-protocol.ts:1-49,100-128`).
- Native auto-maintenance runs Shake inline and advances to next configured method if headroom is insufficient (`session-maintenance.ts:2860-2910`); it emits lifecycle action `shake` and invokes `shake("elide", DEFAULT_SHAKE_CONFIG)` (`session-maintenance.ts:3838-3905`).
- Internal `AgentSession.shake()` exists (`src/session/agent-session.ts:4907-4911`), but ExtensionContext does not expose it (`extensions/types.ts:455-535`); compact modes exclude it (`compact-modes.ts:14-45`).

### Interpretation

An extension cannot directly invoke Shake through a supported public API. Reaching into AgentSession/SessionMaintenance is private-core coupling. Extend Shake operationally by leaving native auto-maintenance authoritative, observing `action: shake`, and preserving artifact recovery. A proactive Shake action requires an upstream API addition.

## 4. snapcompact 18.0.6 contract

### Exports and data contracts

- Public `compact(preparation, options)` uses preparation with kept-entry id, messages, split prefix, tokens, previous summary/preserve data, and file operations; result contains summary, ids/counts/details/preserve data (`snapcompact/src/snapcompact.ts:623-648`; shipped `dist/types/snapcompact.d.ts:420-454,587-594`).
- Options include message conversion, model, shape, frame size, max frames, and serialization options (`src/snapcompact.ts:585-596`; `dist/types/snapcompact.d.ts:394-409`).

### Budgets

- `MAX_FRAMES_DEFAULT=80`, `HQ_EDGE_FRAMES=3`, `FRAME_TOKEN_ESTIMATE=5024`, frame-data estimate `170000`, and standing frame-data budget `3000000` bytes (`src/snapcompact.ts:452-483`; `dist/types/snapcompact.d.ts:303-330`).
- `maxFramesForDataBudget()` is `max(1,floor(budget/estimate))`, so defaults imply 17 frames before tighter host limits (`src/snapcompact.ts:485-488`).
- Provider image budgets: Anthropic/Bedrock/OpenRouter 90, OpenAI/Google families 200, Umans 10, unknown 5; archive budget is capped at 80 (`src/snapcompact.ts:495-525`; d.ts:335-350).
- Serialization defaults: 2,000 chars per tool result, 500 per argument value, 2,000 per full argument list, with 60% head retention (`src/snapcompact.ts:731-769`; d.ts:457-486).
- `compact()` clamps max frames to 1..80, unfolds prior archive source, heals data URLs, resolves shape, re-renders coherent history, and persists `preserveData.snapcompact` (`src/snapcompact.ts:2032-2179`). The pass is local/deterministic and reattached on rebuild (`src/snapcompact.ts:1-45`).

### Archive and reconstruction

- `Archive` stores oldest-to-newest frames, total/truncated chars, full kept source, and text edges under key `snapcompact` (`src/snapcompact.ts:527-575`; d.ts:349-393).
- Helpers validate/extract, strip stale archive state, recover source text, and build renderability probe text (`src/snapcompact.ts:1697-1763`).
- `historyBlocks` rebuilds text-head/image-middle/text-tail runtime blocks; byte limits retain newest frames and add an omission notice (`src/snapcompact.ts:1766-1863`; d.ts:566-586). OMP session rebuild reattaches these blocks to the compaction summary (`pi-coding-agent/src/session/session-context.ts:145-157,417-430`).

### OMP host safeguards

OMP native path chooses max frames from live context capacity, 80, 3 MB data cap, and provider cap (`session-maintenance.ts:2280-2365`); it requires vision, checks renderability, actual frame payload, and projected rebuilt context (`session-maintenance.ts:847-957`), then projects with the same history blocks/3 MB cap (`session-maintenance.ts:2384-2427`).

**Interpretation:** snapcompact library export is public, but returning its result from a hook bypasses these host guards. Explicit bitmap requests should use `ctx.compact({mode:"snapcompact"})`.

## 5. Tool/message transforms

- `tool_result` can replace content, details, and error state (`extensions/types.ts:980-1034`; `shared-events.ts:337-345`); wrapper applies replacements after execution (`extensions/wrapper.ts:369-410`).
- `context` receives a deep copy of outbound messages and may replace only the provider-bound array, not persisted originals (`shared-events.ts:170-184`; `extensions/types.ts:1109-1111`; runner chaining at `extensions/runner.ts:1603-1652`).

**Interpretation / negative control:** These are replacement transforms, not Shake/snapcompact callbacks. Do not return replacements for compact-eng governance: tool-result replacement changes what is persisted/archived; context replacement changes the next request.

## 6. Current ultra-compact baseline

- Command calls `ctx.compact("ultracompact")` specifically for its `session_before_compact` interception (`plugins/ultra-compact/extensions/index.ts:62-82`).
- Handler runs custom threshold/tier logic and returns complete compaction results, including lossy emergency output (`extensions/index.ts:85-213,240-279`); registration is `extensions/index.ts:319-320`.
- Engine owns separate threshold, 60/90% micro/full tiers, micro tool pruning, and summary generation (`plugins/ultra-compact/extensions/engine.ts:110-169,289-299,353-428,431-501`).

**Interpretation:** This proves the replacement contract, not desired composition. Undefined returns retain speculation suppression; complete results bypass native snapcompact. The cutover should remove interception rather than add another governor.

## 7. Marketplace/dependency position

- Marketplace caches/symlinks source and runs no dependency install (`docs/authoring-extensions.md:23-42`). Resolution reaches host Bun-global deps; non-host third-party deps need bundling/vendor (`docs/authoring-extensions.md:44-86,112-135`).
- Installed pi-coding-agent directly depends on pi-agent-core and snapcompact 18.0.6 (`pi-coding-agent/package.json:53-63`); agent-core also directly depends on snapcompact 18.0.6 (`pi-agent-core/package.json:36-44`; `bun.lock:485`). Current ultra-compact peers only core/coding-agent (`plugins/ultra-compact/package.json:24-27`).

**Interpretation:** snapcompact is host-installed, but native delegation avoids a new runtime import and preserves marketplace/no-install compatibility plus host orchestration.

## 8. ADHD analysis

Four isolated frames (economic/security/performance/UX) generated 12 candidates; critic focus selected:

1. Performance (26): OMP owns Shake/snapcompact; plugin adds hysteretic governance/lifecycle observation. Trap: proactive compact cannot invoke Shake (`session-maintenance.ts:772-808,2860-2910`).
2. Security (25): native artifacts/preserveData remain host-owned; no tool/context rewrite.
3. Security (25): optional bounded `session.compacting.preserveData`. Trap: prompt/context affects LLM summary, not bitmap rendering (`shared-events.ts:383-390`; `session-maintenance.ts:2243-2278`).
4. UX (25): report usage plus auto/session lifecycle transitions (`shared-events.ts:223-241`; `extensions/types.ts:455-465`).
5. Economic (24): coalesced boundary governor calls native compact without replacement hook. Trap: no direct Shake action (`compact-handler.ts:10-23`; `session-maintenance.ts:772-808`).

Pruned: direct snapcompact import+hook result; undefined `session_before_compact`; tool/context pre-shrink; branded custom summaries; unconditional forced snapcompact.

### Non-obvious pick

Use two lanes: (1) native maintenance owns automatic Shake/snapcompact selection, artifacts, budgets, fallback, commit; plugin observes lifecycle/status. (2) explicit extension action reads usage and may call native compact; explicit bitmap requests may select snapcompact. Never return `session_before_compact.compaction` or claim direct Shake.

## 9. Extend-not-overwrite rules

1. Do not register `session_before_compact`; presence disables speculation/deferral.
2. Do not return hook compaction; `fromHook` bypasses native snapcompact.
3. Do not fabricate entries with direct snapcompact. Use native explicit snapcompact or ordinary compact.
4. Do not claim direct Shake. Observe configured native auto Shake and preserve `artifact://`.
5. Do not replace `tool_result.content` or `context.messages` for this feature.
6. If needed, use bounded namespaced `session.compacting.preserveData`; never duplicate key `snapcompact`.
7. Preserve vision/renderability/context/provider/data guards and 80-frame/3 MB/serialization budgets by staying native.

## AC evidence map

- AC1: Sections 1-4 cite OMP source/types and snapcompact src + dist/types for extension points/budgets.
- AC2: Sections 1,3,5 distinguish public extension/library surfaces, private AgentSession/SessionMaintenance, unavailable `before_compact`, and unavailable direct Shake.
- AC3: Section 2 proves handler suppression and fromHook bypass; Sections 8-9 give negative controls.
- AC4: Section 7 cites marketplace resolution and installed dependency position.
