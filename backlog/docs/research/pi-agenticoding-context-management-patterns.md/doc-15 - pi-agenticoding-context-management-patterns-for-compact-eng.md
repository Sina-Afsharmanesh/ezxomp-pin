---
id: doc-15
title: pi-agenticoding context-management patterns for compact-eng
type: other
created_date: '2026-08-30 00:35'
updated_date: '2026-08-30 00:35'
---
# pi-agenticoding context-management patterns for compact-eng

## Scope and source pin

This record covers only `agenticoding/pi-agenticoding`; Pi-dcp and OMP-native Shake/snapcompact contracts belong to TASK-56.1 and TASK-56.3. Compact-eng must extend OMP-native Shake and snapcompact without replacing native behavior.

Inspected repository: `https://github.com/agenticoding/pi-agenticoding` at immutable commit [`de9717e633d7713fc7f9de19796d6749cf2794f3`](https://github.com/agenticoding/pi-agenticoding/commit/de9717e633d7713fc7f9de19796d6749cf2794f3), inspected 2026-08-29. At that revision, `package.json` identifies version `0.4.0`, MIT, and this repository ([`package.json` L2-L12](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/package.json#L2-L12)).

Method: four mutually isolated evidence frames (economic, security, performance, UX), then a critic pass scoring novelty/viability/compact-eng fit 1–5. Scout claims were leads; every citation below was re-read at the pin. **Facts** report source behavior. **Interpretation** reports compact-eng relevance, not OMP-native internals; TASK-56.3 supplies those contracts.

## ADHD divergence and focus

| Frame | Grounded candidates | Principal trap |
|---|---|---|
| Economic | Reference bodies by name; isolate noisy work; pressure bands/minimum useful cuts; task/session memory. | Post-execution truncation does not reduce child spend; fixed 30,000-token thresholds are not portable. |
| Security | Stage then commit pruning; version/epoch/branch validation; distinguish user history from agent recovery. | A notebook clone would compete with Shake artifacts; readonly shell policy is unrelated. |
| Performance | Band-throttle nudges; one in-flight cut with generation + settled callback; retain recovery on failure. | A custom `session_before_compact` result replaces rather than composes. |
| UX | Expose pressure/status; validate destructive cuts; explicit retry/retention reports. | Topic features and Pi TUI widgets are separate product scope. |

Focused shortlist (`novelty + viability + fit`, max 15): names/preview index + on-demand fetch **14**; user history versus agent raw recovery **14**; staged/committed generations **13**; band throttling **13**; in-flight generation/settled guard **13**; transactional cleanup **13**; cut preconditions/retry **13**; useful-cut threshold **12**.

Pruned: readonly sandboxing; semantic-topic feature; child registry; verbatim handoff summary/impossible kept ID; direct copying of the fixed 30,000-token threshold.

**Non-obvious pick:** the highest-value recovery pattern is not the handoff summary. It is a tiny index with on-demand reads, explicit separation of user history from agent-addressable recovery, and transactional state changes. That can complement Shake; the source's custom compaction result cannot.

## Facts and interpretations

### 1. Context management

**Fact 1.1 — isolate noise.** Spawn uses a clean child context and Notebook pages are task-scoped ([`README.md` L22-L27](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/README.md#L22-L27)). The parent orchestrates parallel children; children cannot spawn grandchildren or handoff ([`README.md` L79-L81](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/README.md#L79-L81)). The primer says `You receive only condensed results; overlong child output is truncated` ([`system-prompt.ts` L25-L29](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/system-prompt.ts#L25-L29)).

**Interpretation:** reuse the externalization principle, not spawn orchestration. Shake already supplies the raw-output boundary.

**Fact 1.2 — reference, do not inline.** `before_agent_start` injects only page names and first-line previews capped at 80 characters and says `Reference pages by name — never paste bodies into prompts` ([`index.ts` L731-L777](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/index.ts#L731-L777)). `notebook_read` fetches a body by name and says `Open only relevant pages on demand; verify stale notes` ([`notebook/tools.ts` L141-L150](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/tools.ts#L141-L150)). Writes are compact, stable-name, serialized, and exclude transcripts/logs/large tool output ([`notebook/tools.ts` L26-L28](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/tools.ts#L26-L28), [`L69-L82`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/tools.ts#L69-L82)).

**Interpretation:** compact-eng recurrent context should contain bounded native recovery references/previews, not copied bodies.

**Fact 1.3 — task/session lifetime.** Pages are `a cache for this stream, not an archive`, split re-derivable facts from non-recoverable guidance, and fetch on demand ([`system-prompt.ts` L31-L43](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/system-prompt.ts#L31-L43)). Notebook is conversation/task-coupled and clears on `/new` ([`README.md` L79-L81](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/README.md#L79-L81)); reset clears pages, epoch, watermark, pending handoff and pressure-band state ([`state.ts` L194-L237](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/state.ts#L194-L237)).

**Interpretation:** governor/index state should be branch/session-scoped, not forever memory.

**Fact 1.4 — banded and throttled.** The rationale names advisory 30/50/70% bands and says they `do not force action` ([`docs/why.md` L42-L44](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/docs/why.md#L42-L44)). Implementation skips ordinary watchdog text below 30%, tracks 30–49/50–69/70+, and does not repeat within a band ([`index.ts` L862-L893](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/index.ts#L862-L893)).

**Interpretation:** reuse hysteresis/throttling, not advisory-only policy; automatic measurement/reporting must not add duplicate per-turn context.

### 2. Compaction and summarization

**Fact 2.1 — deliberate replacement.** The hook says it `Replaces the active context with the queued handoff task and keeps no pre-handoff messages` ([`handoff/compact.ts` L2-L5](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/compact.ts#L2-L5)). It returns `summary: task`, impossible `firstKeptEntryId`, pre-cut token count, and details ([`handoff/compact.ts` L17-L40](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/compact.ts#L17-L40)); continuation uses named pages and distilled task ([`handoff/format.ts` L10-L23](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/format.ts#L10-L23)).

**Interpretation:** separation of reusable state from next-task direction is useful; the custom result is not.

**Fact 2.2 — ownership, not coexistence.** Installation says `Disable pi's built-in compaction so handoff owns deliberate restarts` ([`README.md` L38-L46](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/README.md#L38-L46)). The architecture says `session_before_compact` sets the summary ([`docs/architecture.md` L9-L17](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/docs/architecture.md#L9-L17)).

**Interpretation/exclusion:** this repo does not evidence composition with an active native compactor. Never reuse its disable-native/custom-result design. An isolated performance-frame hypothesis that the hook extended rather than overwrote was refuted by these sources.

**Fact 2.3 — useful-cut guards.** Handoff has a 30,000-token minimum, exact-or-estimated valid usage, and rejects unavailable/malformed usage ([`handoff/eligibility.ts` L1-L38](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/eligibility.ts#L1-L38)). It rejects empty task, unavailable usage, or too-small context with continue/retry guidance ([`handoff/tool.ts` L31-L54](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/tool.ts#L31-L54)).

**Interpretation:** reuse the categories—valid measurement, worthwhile progress, valid continuation—not the fixed threshold.

### 3. Recovery after compressed/dropped context

**Fact 3.1 — selective memory is agent-addressable.** `notebook_read` recovers one named page and reports not-found/current pages ([`notebook/tools.ts` L141-L150](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/tools.ts#L141-L150), [`L174-L195`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/tools.ts#L174-L195)). Rehydration accepts current/legacy versions and safe epochs, reconstructs only latest committed generation, scans newest-to-oldest, and ignores newer staged entries ([`notebook/rehydration.ts` L43-L59](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/rehydration.ts#L43-L59), [`L61-L106`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/rehydration.ts#L61-L106)); read/index tools are re-enabled ([`L109-L132`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/rehydration.ts#L109-L132)).

**Interpretation:** borrow versioned branch-scoped reference reconstruction if needed; compact notes are not raw recovery.

**Fact 3.2 — two-phase pruning.** Discard stages survivors at a fresh invisible epoch; successful commit appends the generation marker ([`notebook/store.ts` L108-L140](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/store.ts#L108-L140)). Commit advances epoch/deletes pages only for matching generation ([`L142-L153`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/notebook/store.ts#L142-L153)). A high-water mark survives failure/restart so retry cannot reuse a staged epoch and resurrect orphans ([`state.ts` L45-L54](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/state.ts#L45-L54)).

**Interpretation:** commit auxiliary pruning only after native success; retain recovery state on failure.

**Fact 3.3 — user history is not artifact-addressed agent recovery.** The primer says `Full history remains in the session file for the user` ([`system-prompt.ts` L54-L66](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/system-prompt.ts#L54-L66)). The compaction object contains only summary, kept ID, token count and details—no archive/artifact identifier ([`handoff/compact.ts` L36-L40](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/compact.ts#L36-L40)); the agent uses notebook + prompt ([`handoff/format.ts` L18-L23](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/format.ts#L18-L23)).

**Interpretation:** this is not Shake-equivalent raw recovery. Preserve native `artifact://` as canonical raw recovery; a bounded index may point to artifacts but not replace them.

### 4. Hooks and composition points

**Fact 4.1 — narrow lifecycle split.** The architecture enumerates `before_agent_start` (primer/index), `context` (reminders), `session_start`/`session_tree` (reconstruction), `turn_end` (indicators), `agent_end` (usage/cleanup), and `session_before_compact` (custom summary) ([`docs/architecture.md` L9-L17](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/docs/architecture.md#L9-L17)).

**Interpretation:** the non-compaction hooks evidence cohesive separation of measurement/state, minimal guidance, rehydration and visibility. Exact OMP hooks/order remain TASK-56.3.

**Fact 4.2 — trigger/overlap/completion/error phases.** The tool rejects overlap, records monotonic generation, prepares optional discard, then calls `ctx.compact(callbacks)` ([`handoff/tool.ts` L247-L288](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/tool.ts#L247-L288)). Callbacks use `settled`, clear only matching generation, commit on success, retain pages on persistence failure, and restore retry on error ([`L134-L196`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/tool.ts#L134-L196)). Failure says `The handoff can be retried` ([`L80-L97`](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/handoff/tool.ts#L80-L97)).

**Interpretation:** reuse the single-flight state-machine shape around the TASK-56.3-verified native trigger; never reuse the custom hook result.

**Fact 4.3 — status without repeated prompt cost.** TUI context tones change at 30/50/70%, displays state, and warns only at 70%+ ([`tui.ts` L33-L84](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/tui.ts#L33-L84)); prompt nudges are separately band-throttled.

**Interpretation:** operator UI may update per turn while agent-facing text changes only on transitions/failures.

## Reusable/non-reusable matrix

| Pattern | Disposition |
|---|---|
| Reference, do not inline | **Reuse:** recurrent context contains native recovery references/previews. |
| Task-scoped cache lifetime | **Reuse lifetime**, not notebook surface. |
| Pressure bands/throttle | **Reuse hysteresis** around measurement. |
| Preconditions | **Reuse categories**, choose native thresholds independently. |
| In-flight generation/settled guard | **Reuse** around native delegation. |
| Two-phase pruning | **Reuse transaction semantics** for auxiliary metadata. |
| Explicit missing/failure/retry | **Reuse** visible recovery behavior. |
| Custom handoff summary/impossible kept ID | **Do not reuse:** replaces compaction result. |
| Disable native compaction | **Do not reuse:** violates extend-not-overwrite. |
| Notebook as raw recovery | **Do not replace Shake:** preserve artifact recovery. |
| Spawn/readonly/topic | **Out of scope** for compact-eng. |

## Recommendation for TASK-56.4

1. Carry forward **reference-not-body**: preserve Shake `artifact://`; bounded metadata has references/previews only.
2. Use a **hysteretic governor**: cheap measurement, transition-only agent messaging, separate operator visibility. Thresholds/order come from TASK-56.3/spec, not 30,000.
3. Use a **single-flight native-delegation state machine**: monotonic identity, stale/duplicate suppression, explicit no-progress/native-failure, retry without deleting recovery state.
4. Clean auxiliary state only after native success; version/rehydrate branch/session state and clear on new session.
5. Never disable native compaction or return a competing summary/kept-entry result.
6. Keep user-retained history, Shake artifact recovery, and snapcompact-compressed context as distinct channels; TASK-56.3 defines exact contracts.

## License/provenance

The package declares MIT ([`package.json` L2-L12](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/package.json#L2-L12)). `LICENSE` is MIT, copyright 2026 Agentic Coding, grants use/copy/modify/distribute, and requires copyright/permission notice in copies or substantial portions ([`LICENSE` L1-L15](https://github.com/agenticoding/pi-agenticoding/blob/de9717e633d7713fc7f9de19796d6749cf2794f3/LICENSE#L1-L15)). If substantial code/text is copied, preserve the notice and record source/commit. This record does not assert code was copied.

## Constraints

Strong reusable patterns: bounded references, session state, band throttling, transactional cleanup, concurrency guards, visible recovery failures. Non-reusable: source disables built-in compaction and supplies the result. It has no artifact-addressed raw recovery for dropped transcript/tool content. Exact Shake/snapcompact hooks, budgets, fallback, `preserveData`, vision/text and error contracts remain TASK-56.3.
