---
id: TASK-16.5
title: Discover gateway model metadata without external probe dependencies
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-21 22:46'
labels:
  - feature
  - architecture
dependencies:
  - TASK-16.3
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/presets.ts
  - /tmp/better-custom-research/src/url.ts
  - /tmp/better-custom-research/src/model-entry.ts
  - 'https://github.com/real-wudaoshi/better-custom'
modified_files:
  - plugins/better-custom/src/probe/
  - plugins/better-custom/src/presets.ts
  - plugins/better-custom/src/url.ts
  - test/better-custom-probe.test.ts
parent_task_id: TASK-16
priority: high
type: feature
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a fresh, fetch-based probe engine for better-custom. The upstream model-probe package is absent and MUST NOT become a dependency. This layer consumes typed model metadata contracts from the model-entry ticket but does not implement any interactive provider flow.

Targets: plugins/better-custom/src/probe/*.ts, plugins/better-custom/src/presets.ts, plugins/better-custom/src/url.ts, and root test/better-custom-probe.test.ts.

Required contract:
- Implement gateway presets auto, litellm, oneapi, newapi, openrouter, and generic with the upstream flags: auto=FULL; LiteLLM=FULL except per-model/models.dev; One API/New API=NONE plus ensureV1; OpenRouter/generic=per-model plus models.dev. Unknown preset falls back to auto.
- Normalize endpoints while preserving explicit schemes; choose http for local/private endpoints and https otherwise. Probe path-adaptive /models variants by adding/removing /v1 and use a non-local http-to-https fallback.
- Merge metadata from GET /models/{id}, inline model-list fields, LiteLLM /model/info and /model_group/info and /api/models/public, One/New API meta and supported_endpoint_types, Gemini /v1beta/models inputTokenLimit, and Ollama /api/tags plus /api/show. Return typed evidence/absence, never secrets.
- Implement one developer-role capability probe for OpenAI-style endpoints: POST the normalized /chat/completions URL with { model, stream: false, max_tokens: 1, messages: [{ role: "developer", content: "Reply with OK" }] }. The compatible control role is system; a developer-role rejection, malformed response, or ambiguous result means unsupported. Record this wire shape in a source comment or test fixture.
- Keep known-model local-rule decisions in model-entry; this layer only returns observed metadata.

Tests must mock fetch and prove URL candidate order/fallback, preset flag selection, endpoint-specific parsing, and developer-role request shape without network access.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Mocked gateway responses yield typed model metadata through the correct preset and provider-specific endpoint paths without importing or installing model-probe.
- [x] #2 Model URL probing attempts the documented /v1 and scheme variants in deterministic order while never downgrading non-local endpoints.
- [x] #3 The developer-role probe sends the documented minimal OpenAI-compatible request, treats inconclusive results as unsupported, and never logs an API key.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: TASK-16.5 worker
created: 2026-08-21 22:09
---
Implemented zero-dependency gateway metadata probing in `src/presets.ts`, `src/url.ts`, and `src/probe/`. Presets now select documented sources and V1 behavior; URL helpers normalize copied API paths and produce deterministic safe candidate order; probe modules return observed `ModelProbeMetadata`-compatible evidence only, including LiteLLM, One/New API, Gemini, Ollama, per-model, and developer-role/system-control paths. Added injected-fetch coverage in `test/better-custom-probe.test.ts`.

Verification: `bun test test/better-custom-probe.test.ts` passed (8 tests, 40 assertions). Focused strict TypeScript check of all changed probe files and test passed. `bun run check` exited 2 on pre-existing `plugins/extensible-workflows/node_modules` missing-module/ambient-enum diagnostics; it reported zero diagnostics under `plugins/better-custom` or `test/better-custom-probe.test.ts`.
---

author: TASK-16.5 worker
created: 2026-08-21 22:12
---
Follow-up hardening: public-catalog requests now intentionally omit the resolved API key, preventing credential forwarding when `{api.→site}` changes hosts. Added an assertion for that boundary. Re-ran `bun test test/better-custom-probe.test.ts`: 8 passing tests, 41 assertions. Focused strict TypeScript check passed. Root `bun run check` remains exit 2 solely from unrelated extensible-workflows vendored diagnostics; zero better-custom/test diagnostics were emitted.
---

author: TASK-16.5 worker
created: 2026-08-21 22:12
---
Correction to global-check provenance: `bun run check` also reports unrelated diagnostics in `test/workflowz-observability.test.ts`, alongside 277 paths under `plugins/extensible-workflows`. The scoped result is unchanged: zero diagnostics reference better-custom or `test/better-custom-probe.test.ts`.
---

created: 2026-08-21 22:33
---
[judge-16.5] Verified: bun test test/better-custom-probe.test.ts 8 pass/41 asserts; tsc --noEmit 927 diagnostics, zero reference better-custom; zero runtime deps, probe imports are sibling/type-only; secrets confined to probeHeaders (never returned/logged; public-catalog requests omit Authorization, test-pinned); timeout/non-2xx/malformed all collapse to typed absence via requestJson, single-attempt bounded probing (no retry storms); preset table flag-exact vs upstream incl unknown→auto; developer-role wire body exactly {model,stream:false,max_tokens:1,messages:[{role,content:"Reply with OK"}]}, system control required, ambiguity⇒unsupported, source comment + fixture pin present.
---

created: 2026-08-21 22:33
---
[blocking][judge-16.5] plugins/better-custom/src/probe/index.ts:~74 publicCatalogRoots — site-catalog host rewrite strips `api.` to the bare domain (api.example.com → example.com); upstream contract (real-wudaoshi/better-custom README, Auto-detected metadata table: 'USTC-style sites; api. → llm. host fallback') requires rewriting `api.` → `llm.`. Consequence: GET {site}/api/models/public misses the catalog entirely on exactly the USTC-style deployments this source exists for, and probes hit unintended bare apex hosts. Fix: `site.hostname = site.hostname.replace(/^api\./i, "llm.")`, keeping the api-origin candidate first; extend test/better-custom-probe.test.ts LiteLLM/public-catalog case with an api.-host endpoint asserting the llm.-host URL is attempted and no bare-domain request is made.
---

created: 2026-08-21 22:33
---
[blocking][judge-16.5] plugins/better-custom/src/probe/index.ts:~176 probeGateway per-model merge — `mergeMap(metadataById, await fetchPerModelDetails(...), true)` runs unconditionally and overwrites all prior tiers with the least-authoritative source. Upstream sequence: /model/info → /model_group/info → site catalog ('authoritative context_window ... overrides LiteLLM-reported values') → per-model GET /models/{id} 'only falls back ... when none of those are available'. Under preset=auto, per-model details clobber authoritative catalog/LiteLLM contextWindow/vision/reasoning. Fix: merge per-model with overwrite=false (fill-gaps) and/or skip ids that already have evidence, preserving catalog > LiteLLM/group > inline > per-model authority; add a conflict-fixture test proving the catalog value survives a differing per-model response.
---

created: 2026-08-21 22:33
---
[follow-up][judge-16.5] presets.ts:86 getGatewayPreset alias has zero consumers repo-wide — remove until a caller exists (weightless surface).
---

created: 2026-08-21 22:33
---
[follow-up][judge-16.5] presets.ts:14 modelsDev profile flag is inert (probe/index.ts never reads it; task source list intentionally omits models.dev). Add a one-line comment marking it not-yet-wired so TASK-16.6 does not assume models.dev probing happens.
---

created: 2026-08-21 22:33
---
[follow-up][judge-16.5] metadata.ts parsePublicModelCatalog draft/archived/is_visible filtering has no test coverage; add a fixture case alongside the blocker fixes. Optional: explicit negative assertion that https endpoints never gain http candidates (currently only implied by exact-call-list assertions).
---

author: TASK-16.5 worker
created: 2026-08-21 22:41
---
Addressed judge round 1 blockers and follow-ups: public catalog fallback now rewrites `api.` to `llm.` without trying a bare apex; per-model evidence fills gaps without overwriting LiteLLM/public-catalog fields; removed the unused preset alias; marked `modelsDev` as not yet wired. Added direct filtering coverage for draft, archived, and hidden public-catalog entries, an llm-host/no-apex fixture, a conflicting per-model fixture preserving catalog authority, and an explicit HTTPS no-downgrade assertion.

Verification: `bun test test/better-custom-probe.test.ts` passed (10 tests, 50 assertions). Focused strict TypeScript check passed. Root `bun run check` remains exit 2 on unrelated diagnostics, with zero diagnostics under better-custom or the focused test. Scoped git status contains only the assigned files.
---

created: 2026-08-21 22:43
---
[judge-16.5][round-1] RE-VERIFIED (fresh reads + runs, delta scope): (1) index.ts:~80 publicCatalogRoots now rewrites `api.` → `llm.` (site.hostname.replace(/^api\./i, "llm.")) with api-origin kept first and https siblings appended — semantically correct, not textual; dedupe collapses when origin is already llm.-prefixed. (2) index.ts:~175 publicCatalog mergeMap overwrite=true preserved; :~178 per-model mergeMap overwrite=false → existing fields win per-field, giving catalog > LiteLLM > inline > per-model authority exactly as upstream documents. (3) bun test test/better-custom-probe.test.ts: 10 pass / 0 fail / 50 assertions, exit 0. (4) bunx tsc --noEmit: zero diagnostics referencing better-custom. (5) New tests non-tautological: llm-fallback fixture asserts host identity + order (api-origin catalog attempted first, llm.-host after, bare apex never requested via not.toContain) and the authority-conflict fixture (per-model contextWindow 4096/vision false vs catalog 131072/true → expects {contextWindow:131072, vision:true, reasoning:false}) which fails under the previous overwrite=true code; https-no-downgrade uses exact-array equality; catalog filter test uses exact map equality. Follow-ups from round 0 confirmed addressed: getGatewayPreset alias removed, modelsDev not-yet-wired comment present (presets.ts), filter + downgrade tests added. VERDICT: approve — REVIEW_PASSED, no blocking findings.
---

created: 2026-08-21 22:46
---
Judge review (probe-judge via orchestrator, 2026-08-21) of uncommitted worker output — **REVIEW_PASSED, 0 blocking, 6 follow-ups**.

Orchestrator gates (independent): `bun test test/better-custom-probe.test.ts` => 8 pass / 0 fail / 40 expect; workspace `bunx tsc --noEmit` => 0 diagnostics mentioning better-custom; grep confirms zero upstream model-probe imports/references in plugin sources and tests.

Per-item verdicts (all CONFIRMED): (1) preset matrix exact incl unknown->auto fallback presets.ts:36-78,:82-84; (2) URL candidate order deterministic, local never upgraded, https never downgraded url.ts:105-110; (3) all six documented metadata sources implemented with typed absence, merge precedence explicit index.ts:38-47,168-179; public-catalog requests drop Authorization (index.ts:91-94,:175, asserted test:154); (4) developer-role wire shape exact developer-role.ts:26-56 with doc-comment AND deep-equality fixtures test:256-267; truthiness audit clean — reject/malformed/ambiguous all resolve unsupported; boolean-only surface, key-leak absence asserted test:268; (5) deps clean: dependencies {}, type-only ModelProbeMetadata reuse, relative sibling imports, injectable fetch; (6) layer boundary holds — zero hardcoded model names under src/probe/, no UI imports; (7) tests assert candidate ORDER via exact toEqual arrays + end-to-end call sequences per gateway; no network possible (unrouted fetch stubbed 404, timeout never-resolving); (8) JSON guards everywhere, AbortController timeout bounds hung body reads, malformed shapes fail typed-absent.

FOLLOW-UPS (non-gating): F1 presets.ts:9,68-76 — modelsDev flag inert (declared/set/tested, consumed nowhere); wire or mark reserved. F2 test:216-235 — add dynamic candidate-advance case (first URL fails, second succeeds, assert order). F3 url.ts:84-93 — alternateV1Path yields oddball '/v1beta/v1' candidate for versioned bases; skip when pathname versioned. F4 index.ts:129+types.ts:21 — baseUrl returned even when no candidate answered though doc says 'accepted, if any'; align doc or make optional. F5 index.ts:182 — infoById aliases same Map instance as metadataById; document or copy. F6 url.ts:9-14 — IPv4-mapped IPv6 loopback (::ffff:127.0.0.1) treated non-local; benign extra https candidate.

Remaining to closure: scoped commit of probe/, presets.ts, url.ts, test/better-custom-probe.test.ts (blocked only on target-changeset decision — repo is multi-head: detached workflowz tip 8fa1c71c vs separate changeset line carrying better-custom commits), then AC #1-#3 checkbox with this evidence.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Zero-dep fetch-based probe engine delivered: src/presets.ts (flag-exact upstream table, unknown→auto), src/url.ts (per-flavor normalization, deterministic /v1 add-remove candidates, http-for-local/https-otherwise, https-never-downgrade), src/probe/{types,request,metadata,developer-role,ollama,index}.ts (six metadata sources parsed defensively to typed evidence-or-absence; LiteLLM origin-first → model_group → site catalog api.→llm. override chain; per-model fill-only; developer-role wire probe with system control, inconclusive⇒unsupported; secrets never in results/errors/logs; bounded single-attempt probing). test/better-custom-probe.test.ts: 10 pass/50 assertions incl order assertions, authority-conflict regression (fails under old overwrite=true), llm-host fixture, filter coverage, secret-non-leak. Verification: zero better-custom tsc diagnostics; scoped files only. Judge: FIX(2 blockers: apex-host fallback, per-model clobber)→REVIEW_PASSED round 1.
<!-- SECTION:FINAL_SUMMARY:END -->
