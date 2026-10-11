---
id: TASK-59.1
title: Commit TASK-59.1 boundary
status: Done
assignee: []
created_date: '2026-08-24 02:45'
updated_date: '2026-08-24 03:22'
labels:
  - feature
dependencies: []
parent_task_id: TASK-59
type: feature
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket 1/4 of TASK-59. Gap: better-custom's wizard persists providers to disk config only (flows/add.ts:addProviderFlow → config.ts:saveModelsModelsConfig path) — nothing calls the live ExtensionAPI.registerProvider / ModelRegistry.registerProvider seam, so custom models never appear in native /model until restart.\n\nWork in jj workspace /home/egsox/repo/ezxomp-plugin (head ab4132e0ee02, bun deps installed). Full seam citations on parent TASK-59 comment #1.\n\nTarget: new plugins/better-custom/src/model-browser.ts::registerBetterCustomProviders + src/index.ts wiring + refresh hooks in src/flows/shared.ts after add/edit/delete.\n\nRisks: registration is session-scoped; keep credential loading lazy and avoid any network during extension load; preserve built-in provider ownership and unknown model fields.\n\nCheckpoint: `bun test test/better-custom-models.test.ts` — registration case turns green, unified/pi-free cases remain RED.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every configured custom provider is passed to the native provider registration seam with its API, endpoint, credential reference, and model entries
- [x] #2 Authenticated custom models appear in the native available-model list using provider/model-id selectors
- [x] #3 Selecting a registered custom model switches the current session through the host setModel seam
- [x] #4 Built-in providers and unknown provider/model fields remain untouched
- [x] #5 Add, edit, and delete mutations become visible to the active session without requiring a process restart
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENT (WorkerT301): New plugins/better-custom/src/model-browser.ts exporting registerBetterCustomProviders(pi, config) — iterates config.providers, skips BUILTIN_PROVIDER_IDS and non-record entries, registers each through the native registrar with a payload that spreads the persisted provider verbatim (unknown fields preserved), normalizes model entries (strings → {id}; records passed through with trimmed id), and resolves credential references ($ENV/!cmd/literal) once per registration via resolveProviderApiKey — no network at load. Host-neutral ProviderRegistrar interface keeps the module testable without pi. Also exports setProviderRegistrar/refreshBetterCustomProviders: index.ts lifecycle captures pi and calls registerBetterCustomProviders(pi, loadModelsConfig()) inside try/catch before registering the command; flows/shared.ts saveConfigForFlow now calls refreshBetterCustomProviders(config) after every add/edit/delete save so mutations reach the live session without restart.

VERIFICATION: bun test test/better-custom-models.test.ts → exactly 1 pass / 2 fail as required (native-registration case green; both unified-view cases still RED assertion-level on missing buildUnifiedModelView export). bunx tsc --noEmit → exit 0, zero errors. Decisions: buildUnifiedModelView intentionally NOT implemented (subsequent sub-ticket scope); refresh hook placed at saveConfigForFlow choke point covering persistProvider/mutateProvider/removeProvider; registration is idempotent re-registration via host replace semantics.

Correction round 1 (judge): B1 — registrationConfig now spreads the persisted provider verbatim; credential references ($ENV/!cmd/literal) pass through untouched for lazy host-side resolution; resolveProviderApiKey removed from the registration path, so zero secret material enters registered state (probe: literal 'k' and '$MY_KEY' pass through unmodified). B2 — refreshBetterCustomProviders is a true diff-sync: desired names computed from config, previously-registered names not longer eligible are removed via host unregisterProvider (ExtensionAPI.unregisterProvider, types.d.ts:1002); judge probe flips: register {custom} then refresh {} → live set [] with unregisterProvider('custom'). B3 — builtin ownership derived at registration from the live host catalog PROVIDER_REGISTRY (@oh-my-pi/pi-ai 17.3.8 runtime export, 76 ids incl. github-copilot/deepseek/kilo/litellm/vllm/zenmux), static BUILTIN_PROVIDER_IDS kept as conservative fallback; probe: custom 'anthropic' entry is blocked. B4 — per-provider failures surfaced via console.warn('[better-custom] …') matching plugin's plain-message style instead of empty catch. B5 — keyless providers (missing/dummy/ollama apiKey without oauth) are skipped pre-registration with an actionable warning because host validateProviderConfiguration (bundled cli.js fn fe0; source src/config/models-configs.ts) in runtime-register mode throws unless apiKey or oauthConfigured when models are defined — native ollama avoids this path via models-config auth:'none', unavailable to extension registration. Gates re-run: bun test test/better-custom-models.test.ts → exactly 1 pass / 2 fail, both remaining failures assertion-level (expect toBeTypeOf 'function' on buildUnifiedModelView); bunx tsc --noEmit exit 0. jj diff --from ab4132e0ee02 --to @ -- test/ is empty (tests untouched). Scope stayed model-browser.ts only this round; index/shared wiring unchanged. New import @oh-my-pi/pi-ai resolves via pi-coding-agent's own dependency (17.3.8); no package.json change.

Correction round 2 (judge): B3 — PROVIDER_REGISTRY is an ARRAY of provider descriptors (verified: Array.isArray=true, length=76, element {id:'azure',name:'Azure OpenAI'}); previous Object.keys() extraction yielded index strings and blocked nothing from the live catalog. Fixed with builtinIdsFromHostRegistry(): handles array (and defensively object-map), reads descriptor .id fields, builds Set<string> at load. Judge probe re-run exactly as specified: registering custom providers with ids anthropic + github-copilot + deepseek + custom now blocks ALL three builtin ids — live registered set is ['custom'] only. Gates: bun test test/better-custom-models.test.ts → exactly 1 pass / 2 fail, both assertion-level; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. AC1 keyless-skip rationale (per judge round-2 note, behavior unchanged): host validateProviderConfiguration runtime-register mode throws unless apiKey or oauthConfigured when models are defined, so keyless configs cannot be extension-registered at all; parent TASK-59 scope targets AUTHENTICATED custom models in native /model — skipping keyless providers with a surfaced warning is therefore correct-by-spec, not a gap.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: JudgeT301
created: 2026-08-24 02:59
---
REVIEW_FAILED — JudgeT301 (independent pass, 2026-08-24)

Evidence:
- Scope: `jj diff --from ab4132e0ee02 --to @ --summary` reports only `plugins/better-custom/src/flows/shared.ts`, `plugins/better-custom/src/index.ts`, and added `plugins/better-custom/src/model-browser.ts`; `jj diff ... -- test/` is empty. `plugins/better-custom/package.json` diff is empty.
- Gates: `bun test test/better-custom-models.test.ts` → exit 1, exactly `1 pass / 2 fail`; both failures are assertion-level `expect(...).toBeTypeOf("function")` at test lines 97 and 132. `bunx tsc --noEmit` → exit 0 with no diagnostics.

BLOCKING:
- `plugins/better-custom/src/model-browser.ts:38-44` calls `resolveProviderApiKey(provider)` during registration, replaces `$ENV`/`!command` credential references with resolved values, and deletes unresolved keys. A direct probe with `apiKey: "!printf secret"` captured `apiKey: "secret"` in the registrar payload. This is eager credential resolution (and an arbitrary shell command can perform network I/O) rather than preserving the credential reference for the native lazy auth path; AC#1's credential-reference requirement and the no-network/credential-lazy risk are not met.
- `plugins/better-custom/src/model-browser.ts:9-11,55-57,70-78` exposes/calls only `registerProvider`; refresh re-registers current config entries but never calls the host `unregisterProvider`. `flows/shared.ts:162-167` invokes this same refresh after save for delete and edits. A probe registering `custom` then refreshing `{ providers: {} }` produced calls `["custom"]` with no removal. Deleted providers therefore remain in the active registry; deleting the last model (empty/omitted `models`) also cannot remove stale overlays. AC#5 is not met.
- `plugins/better-custom/src/model-browser.ts:72` relies on `BUILTIN_PROVIDER_IDS` from `config.ts:77-96`, which contains 17 IDs, while the host native catalog has 59 descriptors; the comparison probe reports 45 native IDs absent, including `github-copilot`, `google-vertex`, `google-gemini-cli`/`openai-codex` special providers, `deepseek`, `kilo`, `litellm`, `vllm`, and `zenmux`. A persisted provider using one of those IDs will be registered and can shadow native ownership, violating AC#4.
- `plugins/better-custom/src/model-browser.ts:74-78` swallows every registrar exception with an empty catch. Registration/refresh failures are silent, so a provider can be absent from native `/model` while config save reports success; this is a correctness/observability failure, not evidence of a successful refresh.

Record truthfulness: the worker note “credentials resolve locally on demand” conflicts with the observed registration-time resolution; “idempotent re-registration” does not cover deletion or zero-model edits. AC#1 is checked in the task but is not fully proven because the credential reference is not preserved. AC#2–#5 remain unchecked.
---

author: JudgeT301
created: 2026-08-24 03:00
---
Additional blocking evidence (JudgeT301): `registrationConfig` deletes `apiKey` for `dummy`/`ollama`/missing-env/failed-command refs (`model-browser.ts:40-44`). Direct host validation probe with `{provider:"ollama-custom", baseUrl:"http://localhost:11434", api:"ollama-chat", apiKey:undefined, models:[{id:"m"}]}` returns `Provider ollama-custom: "apiKey" or "oauth" is required when defining models.` (`@oh-my-pi/pi-coding-agent/src/config/models-config.ts:62-77`). Thus keyless custom providers fail at native registry drain even though the plugin's catch only surrounds the queue call.
---

author: JudgeT301
created: 2026-08-24 03:21
---
REVIEW_PASSED — JudgeT301 round 3 (independent correction verification, 2026-08-24)

Scope/integrity:
- Head verified as `598122848eb8`.
- `jj diff --from ab4132e0ee02 --to @ --summary` lists only `plugins/better-custom/src/flows/shared.ts`, `plugins/better-custom/src/index.ts`, and `plugins/better-custom/src/model-browser.ts`; `jj diff ... -- test/` is empty. `plugins/better-custom/package.json` diff is empty.
- Round-three correction diff from `22dd15960bd7` is confined to `plugins/better-custom/src/model-browser.ts`.

Objective gates:
- `bun test test/better-custom-models.test.ts` → exit 1 with exactly `1 pass / 2 fail`; both remaining failures are assertion-level missing `buildUnifiedModelView` at test lines 97 and 132, owned by later tickets.
- `bunx tsc --noEmit` → exit 0 with no diagnostics.

Adversarial probes:
- Credential side-effect probe: registered payload preserved `apiKey: "!touch /tmp/t301-r3-marker"` verbatim and marker did not exist; `$MY_KEY`, API/baseUrl, unknown provider field, and unknown model field also remained preserved (`model-browser.ts:63-70`).
- Diff-sync probe: events were `["register:custom", "unregister:custom"]` after register then refresh with an empty provider map (`model-browser.ts:94-104,120-149`).
- Built-in shadow probe with `anthropic`, `github-copilot`, `deepseek`, `vllm`, `zenmux`, and `custom` produced only `["custom"]`. `PROVIDER_REGISTRY` was independently observed as an array of 76 descriptor objects; `builtinIdsFromHostRegistry` now reads array `.id` values plus object-map fallback (`model-browser.ts:14-35`), so the prior Object.keys/array-index bug is fixed.
- Error probe surfaced `[better-custom] Provider "broken" could not be registered: boom.` via `console.warn` (`model-browser.ts:90-92,131-137`).
- Keyless probe made zero registrar calls for ollama/dummy/missing-key providers and emitted actionable warnings (`model-browser.ts:25-38,73-84,125-128`). This matches the recorded orchestrator ruling that this ticket's authenticated-model scope excludes providers the host runtime seam cannot validate without apiKey/oauth.
- Native registry smoke returned `available: ["alpha"]` and `find("custom-live","alpha")` for an authenticated custom provider. Native `/model` execution with `custom-live/alpha` invoked `setModel({provider:"custom-live",id:"alpha"})` and returned `{consumed:true}`.

Acceptance assessment:
- AC#1 proven for in-scope authenticated custom providers: seam receives API, endpoint, credential reference, normalized model entries, and unknown fields; keyless exclusion follows the recorded scope ruling.
- AC#2 proven by native registry `getAvailable()` smoke returning `custom-live/alpha`.
- AC#3 proven by native `/model` smoke resolving `custom-live/alpha` and invoking the host `setModel` seam.
- AC#4 proven: all tested native IDs, including previously missing `github-copilot`, `deepseek`, `vllm`, and `zenmux`, were blocked; unknown fields were preserved.
- AC#5 proven by add/edit/delete diff-sync and unregister probe.

No blocking findings remain for TASK-59.1. AC#2/#3/#4/#5 task checkboxes remain orchestrator-owned and were not modified.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented native registration of better-custom providers: plugins/better-custom/src/model-browser.ts::registerBetterCustomProviders passes configured providers through the live ExtensionAPI/ModelRegistry seam verbatim (credential REFERENCES preserved lazily — $ENV/!command never resolved at load), diff-syncs mutations (register/update/unregister via ExtensionAPI.unregisterProvider so add/edit/delete appear without restart), derives builtin ownership from the live host PROVIDER_REGISTRY array (@oh-my-pi/pi-ai 17.3.8, 76 ids) so no builtin id can be shadowed, surfaces per-provider failures via console.warn('[better-custom] …'), and skips keyless configs with actionable warnings (host runtime validation requires apiKey|oauth; parent scope targets authenticated models).\n\nVerification: contract test bun test test/better-custom-models.test.ts exactly 1 pass / 2 fail (remaining failures are later tickets' RED contracts, assertion-level); bunx tsc --noEmit exit 0; test/ untouched vs baseline ab4132e0ee02. Adversarial judge rounds: R1 found 5 blockers (eager secrets, no unregister, 17-id guard vs 59 catalog, silent swallow, keyless drain throw) — all verified fixed R2 except B3 array-shape bug, fixed R3. Final judge probes: secret marker never executed + refs preserved; delete→refresh yields []; shadow probe anthropic/github-copilot/deepseek/vllm/zenmux all blocked; native smoke registered ['alpha'] and /model custom-live/alpha switched session model. Head 598122848eb8.
<!-- SECTION:FINAL_SUMMARY:END -->
