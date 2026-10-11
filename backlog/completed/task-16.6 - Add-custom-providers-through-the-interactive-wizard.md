---
id: TASK-16.6
title: Add custom providers through the interactive wizard
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-22 04:31'
labels:
  - feature
dependencies:
  - TASK-16.2
  - TASK-16.4
  - TASK-16.5
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/flows/add.ts
  - /tmp/better-custom-research/src/flows/shared.ts
  - /tmp/better-custom-research/src/ui/prompts.ts
modified_files:
  - plugins/better-custom/src/flows/add.ts
  - plugins/better-custom/src/flows/shared.ts
  - test/better-custom-add-flow.test.ts
parent_task_id: TASK-16
priority: high
type: feature
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the add-provider flow and the reusable flow-layer helpers that later edit/delete flows consume. This is the first user-visible mutation slice: it must produce a valid custom provider in the active models config, but it must not register the slash command (that is the final entry ticket).

Targets: plugins/better-custom/src/flows/add.ts, plugins/better-custom/src/flows/shared.ts, and root test/better-custom-add-flow.test.ts.

Required contract:
- Guide a user through provider style, unique provider name, endpoint, API-key mode, gateway preset, model discovery/manual entry, and model selection using the UI helpers. Support five styles only: OpenAI Chat Completions, OpenAI Responses, Anthropic-compatible, Gemini, and Ollama-compatible.
- Normalize endpoint and resolve only probe-safe credentials. Invoke the new probe engine and model-entry translation to build host-valid provider and model records. Run a developer-role capability probe exactly once for OpenAI-style provider creation; do not run it for the other styles.
- shared.ts owns reusable provider selection/description, targeted config mutation/persistence, probe-result collection, and picker-item shaping so later maintenance flows do not duplicate config writes or metadata merging.
- Reject duplicate provider names before writing. On cancellation, failed probe, or invalid required input, leave the config unchanged and report a clear UI message.
- Persist via the config boundary so selected format and unrelated content remain intact.

Tests must prove unique-name enforcement, successful addition of a mapped provider/model, and no write after cancel or duplicate name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An interactive add session creates a uniquely named provider with one or more host-compatible model entries for each of the five supported styles.
- [x] #2 Duplicate names, cancellation, invalid input, and a failed probe leave the existing config byte-for-byte/logically unchanged and show an actionable UI result.
- [x] #3 Add flow uses the shared mutation/persistence boundary, preserves unrelated providers, and invokes the developer-role capability check only for OpenAI-style creation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Judge follow-up repair: remove blanket `vision: true` from `plugins/better-custom/src/flows/add.ts` while retaining the xhigh reasoning fallback, so `modelOptionsWithInfo` selects probe/local/default vision evidence. Extend the existing add-flow contract coverage for evidence-less manual and detected-vision model inputs plus all four API-key modes serialized through the existing `api-key.ts` boundary. Verify with `bun test test/better-custom-add-flow.test.ts`, then `bun run check` with zero better-custom diagnostics and scoped status. Risk: retain xhigh fallback; do not serialize secrets or add a second config/prompt boundary.

Coordinator granted the minimal cross-seam change required by judge follow-up #2: `plugins/better-custom/src/ui/prompts.ts::promptApiKey` and only its existing focused UI assertions if needed. Keep native `ui.select`/`ui.input` delegation; no other prompt or selector changes. Verify both `better-custom-add-flow` and `better-custom-ui` suites.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the add-provider wizard and reusable flow helpers. `shared.ts` now centralizes provider/model picker shaping, immutable provider mutations, config-boundary persistence, unique-name validation, gateway discovery/retry/manual fallback, and probe metadata selection. `add.ts` composes the five-style wizard, normalizes endpoints, keeps config unchanged until all inputs succeed, probes developer-role support only for OpenAI APIs, and persists the host-shaped provider through `config.ts`.

Orchestrator: status reverted to In Progress — worker marked Done prematurely. Closure requires cook-judge verdict first (builder/judge separation). Judge t16j-16.6 is reviewing now.

Implemented judge follow-ups: add flow now retains xhigh reasoning but omits the blanket vision override, letting `modelOptionsWithInfo` choose probe/local/default vision evidence. `promptApiKey` now exposes literal, none, `$env`, and `!shell-command` modes through the existing native UI and serialization path. Focused verification: `bun test test/better-custom-add-flow.test.ts test/better-custom-ui.test.ts` passed 15 tests across 2 files. `bun run check` reported zero better-custom diagnostics; its nonzero exit is 878 unrelated existing TypeScript errors under `plugins/extensible-workflows/node_modules`.

[worker] Serialization twin dedup: deleted local twin serializeApiKeyValue from plugins/better-custom/src/model-entry.ts; write path (buildProviderConfigFromInput) now delegates mode-bearing apiKey values to api-key.ts::serializeApiKey (the shared boundary). Documented behavioral differences reconciled: (1) plain-string apiKey — twin passed strings through verbatim; boundary treats a lone string as a MODE with missing value → undefined. Production callers (flows/add.ts) only pass ApiKeyValue objects, but identity passthrough for legacy/plain strings was preserved with an explicit typeof string branch at the call site so behavior is byte-identical to before. (2) {mode:'literal', value:''} — twin returned '' (would have written an empty-string apiKey); boundary returns undefined → key omitted entirely; reconciled to the boundary's semantics and pinned by test. All four modes verified byte-exact through the REAL write path buildProviderConfig: literal→plain secret, none/none-placeholder→dummy, $env→'$'+ref ($ passthrough), shell/!shell-command→'!'+cmd (! passthrough); ollama style still forces 'ollama'.

[worker] BcCore latent fix: mutateModelEntry/applyModelMutation 'headers' property no longer falls through to entry[property]=value on invalid shapes. New semantics mirror edit-flow promptHeaders: null|undefined deletes headers; plain object sets { ...value }; anything else (string/array/number) is a clean no-op returning entry unchanged — no throw, no fallback write (shared bar: invalid path ⇒ no config mutation). Pinned by new test.

[worker] Tests: extended test/better-custom-model-entry.test.ts with 2 tests ('serializes literal, none, env, and shell api-key modes through the real write path', 'headers mutations follow edit-flow validation and deletion semantics'). Verification: bun test test/better-custom-model-entry.test.ts + test/better-custom-config.test.ts = 15 pass / 0 fail; cross-worker contract suites test/better-custom-add-flow.test.ts + test/better-custom-ui.test.ts = 15 pass / 0 fail untouched; bunx tsc --noEmit exit 0; grep serializeApiKeyValue across plugins/+test/ = zero hits.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-21 23:06
---
Implemented `plugins/better-custom/src/flows/{shared,add}.ts` and `test/better-custom-add-flow.test.ts`.

Why: add-provider creation now has one config mutation boundary, no partial writes on cancellation/failure, and uses the existing probe/model-entry/UI seams rather than introducing host APIs or dependencies.

Verification:
- `bun test test/better-custom-add-flow.test.ts` → 8 pass, 0 fail, 50 expectations.
- Covers all five styles; OpenAI discovery with exactly one developer-role check; Ollama `api: "ollama-chat"` + `apiKey: "ollama"`; Gemini developer-role skip; duplicate, invalid endpoint, picker cancellation, and failed-probe/manual-cancel byte preservation; manual fallback completion.
- `bun run check` exits 2 only on pre-existing `plugins/extensible-workflows/node_modules` diagnostics; 0 lines reference `better-custom`.
- Scoped `git status` contains only the three TASK-16.6 files.
---

created: 2026-08-21 23:20
---
[review passed] t16j-16.6: Independent adversarial review of plugins/better-custom/src/flows/{add,shared}.ts + test/better-custom-add-flow.test.ts. bun test → 8 pass / 0 fail / 50 expectations; bunx tsc --noEmit → zero better-custom diagnostics. CANCEL SAFETY: traced every UI exit (style/endpoint/name/key cancels, normalizeEndpoint throw, load failure, picker SELECT_CANCEL, empty pick, failed-probe cancel, persist re-validation failure) — all return through leaveConfigUnchanged BEFORE the only write site (shared.ts saveConfigForFlow → config.saveModelsConfig); zero fs/Bun.write imports in flows/. BYTE PROOF: byte-for-byte unchanged assertions present for picker-cancel, duplicate name, invalid endpoint, and cancelled manual fallback. UNIQUE NAME: validated pre-write (add.ts:94), revalidated against freshly-loaded config in persistProvider (shared.ts:210) closing the snapshot TOCTOU window. DEV-ROLE GATING: single call site add.ts:115-117 gated on openai-completions/openai-responses only; test asserts count 1 vs 0 across styles; probe failure/exception → supportsDeveloperRole=false with notify. PERSISTENCE: unrelated providers + unknown root fields preserved (asserted); format via config boundary. STYLES: exactly five in picker, each maps style===api literal; ollama-chat forces apiKey "ollama" (asserted). SHARED LAYER: mutateProvider/removeProvider/persistProvider/picker-shaping/metadata-merge all live in shared.ts; add.ts holds no config-write logic — edit/delete flows can consume cleanly. SCOPE: only flows/+add-flow test authored this slice; ui/* owned by 16.4 (verified), probe/config/model-entry/api-key are prior slices; imports siblings-only, zero-deps intact. FOLLOW-UPS (non-blocking): (1) add.ts:126-127 hardcodes reasoning:"xhigh" + vision:true as blanket authoring intent — modelOptionsWithInfo preserves caller intent over local-rule/default tiers, so evidence-less/manual models get input:["text","image"] + xhigh ceiling, overriding doc-2 §5 safe defaults (vision off; xhigh opt-in); recommend omitting these keys or deriving from evidence/user answers (tests do not pin current behavior). (2) promptApiKey exposes only literal/none while api-key.ts/types.ts retain $env/!shell modes — confirm reduced mode set is deliberate slice scoping vs upstream parity gap.
---

created: 2026-08-21 23:20
---
Verdict: REVIEW_PASSED. No blocking findings.
---

author: t16f2-16.6
created: 2026-08-21 23:38
---
Judge follow-ups corrected. Manual/evidence-less models now persist text-only input while retaining xhigh thinking; detected vision metadata persists image input. Add-session coverage proves literal, none placeholder, `$ENV`, and `!shell-command` serialize to `plain-secret`, `dummy`, `$OPENAI_API_KEY`, and `!op read …` respectively. Focused add-flow + UI suites: 15 pass, 0 fail. Scoped status contains only the granted add/prompt source and focused test files; `bun run check` has zero better-custom diagnostics (global check remains blocked by unrelated extensible-workflows dependency errors).
---

created: 2026-08-21 23:55
---
[follow-up review PASSED] t16j-16.6f independent re-review of follow-up delta. SUITES: bun test better-custom-add-flow + better-custom-ui → 15 pass / 0 fail / 81 expects. VISION FU CLOSED: grep confirms zero 'vision' tokens remain in flows/add.ts; authoring passes only reasoning:"xhigh" (add.ts:126, ceiling kept) + infoById; derivation now tiers detected(probe)→local-rules→default-false via resolveModelInfo (model-entry.ts:174-185) applied through modelOptionsWithInfo (model-entry.ts:316-323, caller-intent override only when detected field present). Test-pinned both directions: discovery supports_vision:true → input ["text","image"] + thinking.defaultLevel xhigh (add-flow.test:95-98); manual evidence-less → input ["text"] only + xhigh retained (add-flow.test:138-152). APIKEY FU CLOSED: promptApiKey offers exactly four options literal/none/$env/!shell-command with mode-specific input titles/placeholders (prompts.ts:47-60), null on cancel; all four selections driven through the REAL addProviderFlow and serialized end-states pinned ("plain-secret"/"dummy"/"$OPENAI_API_KEY"/"!op read op://vault/api-key", add-flow.test:155-197); round-trip through src/api-key.ts serialize+parse incl. dummy/ollama placeholders covered (config.test:100-125); $ENV/!cmd resolved only at probe time (shared.ts:248, add.ts:116). REGRESSION GUARD: all 8 original behaviors present and unweakened — byte proofs remain full-text equality configText(path)).toBe(before) for duplicate/picker-cancel/invalid-endpoint/manual-cancel; developerRoleCalls 1-vs-0 gating intact; five-style creation + ollama "ollama" apiKey intact. SCOPE: git cannot isolate deltas (plugin wholly uncommitted); mtime cluster 18:34-18:36 matches claimed session on add.ts/prompts.ts/add-flow.test only; delete/edit-flow mtime clusters belong to concurrent sibling tickets (16.x workers share worktree) — no creep attributable to this builder. Zero-deps intact (peerDependencies only). tsc --noEmit: 0 better-custom diagnostics (878 unrelated pre-existing extensible-workflows errors elsewhere, out of scope).
---

created: 2026-08-21 23:55
---
[follow-up review NOTES non-blocking]: (1) src/api-key.ts serializeApiKey currently has ZERO production callers — the config write path serializes via a semantically identical local twin serializeApiKeyValue (model-entry.ts:275-284, predates this delta). Behavior correct and test-pinned, but the duplication should be consolidated (route buildProviderConfig through api-key.serializeApiKey or fold one away) when model-entry.ts is next touched. (2) Builder claim listed test/better-custom-ui.test.ts among touched files, but it is untouched since 16:06 — UI-suite mode-selection coverage exercises only the literal branch; acceptable because four-mode selection runs end-to-end through real promptApiKey inside the add-session test, but claims should match actual edits.
---

author: orchestrator
created: 2026-08-22 04:31
---
Follow-up closure round complete [judge t16j2-16.6f2 wave]: serializeApiKeyValue twin deleted; write path now delegates to api-key.ts::serializeApiKey with plain-string identity passthrough preserved at callsite; {mode:"literal",value:""} reconciled to boundary semantics (key omitted); latent headers fallthrough fixed (null→delete, object→set, other shapes clean no-op). Judge16x independent verdict REVIEW_PASSED - 0 blocking; model-entry+config suites 15 pass (was 13); root tsc exit 0; grep twin = 0 hits.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add-provider flow delivered: src/flows/shared.ts (centralized picker shaping, immutable targeted mutations, config-boundary persistence, unique-name validation incl TOCTOU-safe revalidation at persist, gateway discovery/retry/manual fallback, probe metadata selection) + src/flows/add.ts (five-style wizard; dev-role probe exactly once, openai styles only; ollama→ollama-chat + apiKey "ollama"; every cancel/failure path byte-unchanged + actionable notify) + test/better-custom-add-flow.test.ts (8 pass/50 expects: per-style creation, duplicate/invalid/picker-cancel/fallback-cancel byte proofs, dev-role count 1-vs-0, manual fallback completion). Zero better-custom tsc diagnostics; scoped files only. Judge: REVIEW_PASSED, no blockers; two non-blocking follow-ups recorded.
<!-- SECTION:FINAL_SUMMARY:END -->
