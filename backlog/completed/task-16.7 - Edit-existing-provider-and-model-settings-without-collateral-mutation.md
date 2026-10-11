---
id: TASK-16.7
title: Edit existing provider and model settings without collateral mutation
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
  - TASK-16.6
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/flows/edit.ts
  - /tmp/better-custom-research/src/flows/shared.ts
  - /tmp/better-custom-research/src/model-entry.ts
modified_files:
  - plugins/better-custom/src/flows/edit.ts
  - test/better-custom-edit-flow.test.ts
parent_task_id: TASK-16
priority: high
type: feature
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the provider-maintenance edit flow using the shared flow helpers created by the add-provider ticket. This ticket owns edit behavior only; provider deletion remains isolated in the delete-provider ticket and slash-command registration remains isolated in the entry ticket.

Targets: plugins/better-custom/src/flows/edit.ts and root test/better-custom-edit-flow.test.ts.

Required contract:
- Let a user select an existing custom provider and edit supported provider properties, including name, endpoint/base URL, API key mode, style-compatible settings, and headers where applicable. Renames must remain unique.
- Provide a per-model edit menu for reasoning ceiling, vision/input capability, context window, max tokens, headers, per-model base URL override, and selected model deletion. Apply the model-entry translation rather than writing legacy upstream thinkingLevelMap.
- Preserve every unrelated provider field, provider model, and unknown config field across a targeted edit. Use the config persistence boundary and return to menus cleanly after cancel/error.
- Re-probe only when the chosen edit explicitly needs refreshed metadata; do not resolve/log secrets unnecessarily.

Tests must prove a targeted provider/model mutation preserves untouched fields, reasoning changes write/read through host thinking, rename collision is rejected, and cancel performs no write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A user can update provider settings and each supported per-model setting through the wizard without changing unrelated provider, model, or unknown config data.
- [x] #2 Reasoning ceiling edits produce host thinking data that reads back at the intended ceiling, and provider renames cannot collide with another provider name.
- [x] #3 Canceled or invalid edits persist nothing and show an actionable result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `plugins/better-custom/src/flows/edit.ts` using existing `shared.ts` config/picker/mutation helpers and `model-entry.ts` mutation/reading helpers; keep deletion-provider behavior out of this flow.
2. Implement provider selection plus targeted rename, endpoint, API key, API style, headers, compatible developer-role, explicit metadata refresh, and per-model menus; revalidate rename against freshly loaded config immediately before boundary save.
3. Preserve unknown top-level/provider/model values by cloning only targeted provider/model paths; use host thinking mutation APIs, never author legacy `thinkingLevelMap`.
4. Add deterministic root edit-flow tests with fake UI, injected probe, and `.test-tmp` configs for preservation, host-thinking round trip, collision/cancel no-write, and explicit-only re-probe.
5. Run the focused Bun suite, `bun run check` and report only relevant diagnostic evidence; append implementation notes and mark evidenced ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `editProviderFlow` with searchable provider/model menus, targeted provider changes, host-thinking model mutation, explicit-only metadata refresh, model deletion confirmation, and fresh-config rename collision revalidation. Only `plugins/better-custom/src/flows/edit.ts` and `test/better-custom-edit-flow.test.ts` were added.

Verification: `bun test test/better-custom-edit-flow.test.ts` passed 9/9 (36 assertions), covering provider/per-model mutations, host-thinking xhigh read-back, exact deletion, collision and prompt-time TOCTOU collision no-write, cancellation/invalid headers no-write, and explicit-only probing. `bun run check` reports zero diagnostics for these two files; its exit remains 2 from unrelated existing `plugins/extensible-workflows` dependency/type errors and `test/workflowz-observability.test.ts` errors. Scoped status lists only the two assigned new files.

Final focused verification after endpoint validation hardening: `bun test test/better-custom-edit-flow.test.ts` passed 10/10 (39 assertions), now including invalid-endpoint no-write/actionable-notice coverage. `bun run check` again emitted zero diagnostics for `edit.ts` and `better-custom-edit-flow.test.ts`; unrelated repository diagnostics still make the global command exit 2.

[follow-ups W-E] All five judge/BcFlows findings fixed in edit.ts + ui/prompts.ts, pinned with 11 new tests (suite 10→21). (1) Rename gate: extracted shared gateProviderId() in prompts.ts (slugify + uniqueness + BUILTIN_PROVIDER_IDS confirm) from promptProviderId; renameProvider now loops on it — "Open AI"→"open-ai" slugified rename proven; declining the built-in override for "openai" reprompts and writes nothing until a safe name is accepted. Gate consumes a pre-prompt id snapshot so mid-prompt collisions stay handled by the existing fresh-load terminal revalidation (TOCTOU test still green). promptProviderId refactored onto the same gate — add-flow behavior byte-identical (add+ui suites green untouched). (2) Same-flavor guard: editProviderApi early-returns unchanged("Provider API is already ...") when choice === current flavor; zero writes (byte-compare test). (3) Blank-key downgrade: new promptApiKeyEdit() shares mode items/value prompts with promptApiKey but blank input returns {kind:"keep",mode:parseApiKey(stored).mode} instead of downgrading to placeholder; edit.ts notifies "API key kept as <mode> reference" and writes nothing — $OPENAI_API_KEY survives a blank key-edit byte-for-byte (test); explicit None still clears to dummy (test); literal/$env/!shell serialization exercised through the flow (3-case test); ADD-context promptApiKey untouched. (4) Refresh now refreshes: single collectProviderModels probe feeds both outcomes — fresh infoById merges into EXISTING object-model entries via modelOptionsFromProbe with current readModelOptions as fallback minus api (gateway-observed fields overwrite stale stored values per add-path authority rules; local headers/baseUrl/unknown keys persist via spread), unseen ids still appended via buildModelEntry; no-op detection returns undefined (no write + notice); failed/canceled probe = 1 call, bytes unchanged, actionable notice. Test: seeded stale contextWindow=1024 → refreshed 262144, headers kept, unknown fields kept, non-probed sibling exact-equal. (5) Copy accuracy: promptContextWindow/promptMaxTokens return TokenPromptResult (number|keep|invalid|null); edit.ts distinguishes "kept at current value" from canceled and lets invalid input surface the warning without a false cancel claim; blank-keep byte-compare test. Verification: bun test edit-flow 21 pass / 88 assertions; add-flow 10 pass + ui 5 pass UNTOUCHED files; all 8 better-custom suites green (71 tests total); bunx tsc --noEmit exit 0. Files touched: only the three owned ones (edit.ts, ui/prompts.ts, better-custom-edit-flow.test.ts). No seams reported: flows/shared.ts, add.ts, index.ts, api-key.ts, config.ts not needed nor modified.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: t16w2-16.7
created: 2026-08-21 23:44
---
Evidence: focused edit-flow suite passed 9/9 tests, including deep preservation, host-thinking round trip, collision/TOCTOU no-write, cancel/invalid no-write, confirmed single-model deletion, and explicit-only re-probe. `bun run check` has zero TASK-16.7 file diagnostics; repository-wide exit 2 is outside this slice (`plugins/extensible-workflows` and workflowz diagnostics).
---

author: t16w2-16.7
created: 2026-08-21 23:46
---
Correction: final focused suite is 10/10 (39 assertions), including invalid endpoint handling; no TASK-16.7 diagnostics from `bun run check`.
---

created: 2026-08-21 23:59
---
[judge] Independent adversarial review of TASK-16.7 (edit.ts + better-custom-edit-flow.test.ts). Verified: focused suite 10/10 (39 assertions) green; scoped tsc emits zero diagnostics for both files; scope clean (only flows/edit.ts + its test belong to this slice among untracked better-custom files).

Targeted-mutation audit (all ops traced): updateModel/deleteModel/editProvider* all route through mutateProvider fresh-load + shallow-copy replace of exactly one provider/model path; unknown root/provider/compat/model fields preserved (test asserts unknownRoot, compat.unknownCompat, unknownModel deep-retained; sibling provider/models compared with toEqual; no-write cases byte-compared). Model delete removes exactly the confirmed index, siblings exact-equal.

Thinking edits: ceiling mutations route through mutateModelEntry("reasoning") → applyReasoning, which deletes legacy thinkingLevelMap and writes host thinking {mode:effort, efforts, defaultLevel}; grep confirms edit.ts never authors thinkingLevelMap; tests prove pre-seeded legacy map is replaced and readModelOptions reads back xhigh/high ceilings. Read-back precedence (max>xhigh>highest-non-null) lives in model-entry highestEffort ordering — exercised at xhigh here, fully covered by model-entry suite.

Rename TOCTOU: collision rejected pre-write AND revalidated against fresh post-prompt load (test 6 mutates the file inside ui.input and proves the concurrent writer's bytes survive untouched). Probe gating: collectProviderModels invoked only from the explicit refresh menu item; call-count assertions prove 0 calls for ordinary edits, 1 for refresh; secrets never appear in any notify/working-message string; apiKeyFromProvider parses without resolving. Cancel/invalid paths all return without writing and notify actionably (byte-compare proven for cancel, invalid endpoint, invalid headers).
---

created: 2026-08-21 23:59
---
[judge] VERDICT: REVIEW_PASSED — no blockers. Follow-ups (non-blocking): (1) flows/edit.ts renameProvider (~L297-315): rename skips the slugify + BUILTIN_PROVIDER_IDS confirm that the add flow enforces (ui/prompts.ts:327-336), so renaming onto e.g. "openai" silently shadows a built-in provider id — reuse the prompts.ts gate. (2) flows/edit.ts editProviderApi (~L390-408): selecting the current flavor still performs a full config write (content byte-identical); upstream early-returns on choice===current — add the same guard. (3) Test gaps worth one case each eventually: model-delete confirm=false cancel path, '-' clear branches for model baseUrl/headers, env/shell api-key serialization through this flow.
---

author: Judge16x
created: 2026-08-22 04:24
---
Judge round (adversarial, independent): **REVIEW_PASSED** for W-E/W-D/W-M deltas.

Verified by exact-byte reads (eval kernel) + independent reruns. Evidence: `bun test test/better-custom-*.test.ts` = 71 pass / 0 fail across 8 files (add 10, ui 5 untouched+passing; edit 21/88 expects; delete 5/20; model-entry 9 + config 6 = 15; probe 10; command 5; 381 total asserts). Root `bunx tsc --noEmit` exit 0.

(1) Blank-key keep: promptApiKeyEdit referenced only in prompts.ts+edit.ts; add.ts still uses promptApiKey (blank→placeholder unchanged). Keep notice names mode ('kept as $env reference'), byte-identical file pinned by test.
(2) Refresh merge authority: refreshProviderModels feeds readModelOptions(model) (local baseUrl/headers) as fallback into modelOptionsWithInfo — same precedence engine as add path; detected field overwrites local only when the probe observed it. Test pins stale contextWindow overwritten, local headers kept, unknown fields survive, unseen ids added, absent models untouched, single probe call.
(3) Same-flavor guard: early return before save; byte-proof test asserts identical file text.
(4) Rename gate: gateProviderId rejects existing-id collisions pre-write; post-gate fresh-load revalidation intact; built-in shadow needs explicit confirm; both collision tests assert zero writes.
(5) Twin dedup: grep serializeApiKeyValue → zero hits repo-wide. String passthrough verbatim ('opaque-string'→'opaque-string'), {mode:"literal",value:""} omitted, no double-prefixing.
(6) Headers no-op: null/undefined→delete, object→copy-set, other→return entry unchanged, no fall-through; pinned at mutation layer and flow layer (invalid JSON rejected without write).

Non-blocking FOLLOW-UP (not a contract violation): metadata refresh rebuilds model thinking from the reduced ceiling only (readModelOptions drops custom effortMap wire aliases), so a locally customized effortMap provider string would be normalized on refresh. Contract named only headers/baseUrl overrides; suggest carrying readCeilingString-derived overrides into refresh if per-provider wire aliases become supported.
---

author: orchestrator
created: 2026-08-22 04:31
---
Follow-up closure round complete [judge t16j2 wave]: (1) rename now reuses the shared gateProviderId (slugify + uniqueness + BUILTIN_PROVIDER_IDS confirm) extracted from promptProviderId - pre-prompt id snapshot keeps TOCTOU revalidation authoritative; (2) same-flavor API edit early-returns unchanged with byte-proof zero-write test; (3) blank key-edit keeps stored reference via new promptApiKeyEdit (add-path promptApiKey untouched, byte-identical behavior), notice names retained mode, explicit None still clears; (4) metadata refresh now MERGES fresh probe data into existing models via add-path authority (modelOptionsFromProbe with readModelOptions fallback), one probe call, failed/cancel = bytes unchanged; (5) token-prompt copy tri-state distinguishes keep/invalid/cancel; (6) judge test gaps closed: '-' clear branches for baseUrl/headers, env/shell/literal serialization through the flow. Edit suite 10->21 tests / 88 assertions; add+ui suites untouched and green (15 pass); all 8 better-custom suites 71 pass. Judge16x independent verdict REVIEW_PASSED - 0 blocking. New non-blocking follow-up recorded: refresh rebuilds model thinking from reduced ceiling, dropping custom thinking.effortMap provider wire aliases (outside recorded contract).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Edit flow delivered: src/flows/edit.ts (provider edit menu: TOCTOU-safe rename w/ fresh-load collision revalidation, endpoint/api-key/headers/style-compatible settings; per-model menu: reasoning ceiling via host thinking translation round-trip max>xhigh>highest-non-null, vision, contextWindow, maxTokens, per-model headers/baseUrl override, exact model deletion; re-probe gated to explicit metadata-refresh edits only; every cancel/invalid path byte-unchanged + actionable notify) + test/better-custom-edit-flow.test.ts (10 pass/39 assertions incl deep preservation, thinking round-trip, probe-gating counts). Zero better-custom tsc diagnostics; scoped files only. Judge: REVIEW_PASSED, no blockers; 3 non-blocking follow-ups recorded (rename slugify/builtin-id gate; api-flavor same-choice rewrite; minor test gaps).
<!-- SECTION:FINAL_SUMMARY:END -->
