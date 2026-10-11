---
id: doc-24
title: OmniRoute gateway capability mapping for better-custom
type: specification
created_date: '2026-09-10 14:20'
updated_date: '2026-09-10 17:02'
tags:
  - omniroute
  - better-custom
  - spec
  - council-corrected
---
# OmniRoute Gateway Capability Mapping for better-custom (doc-24)

**Type:** specification
**Gateway studied:** github.com/diegosouzapw/OmniRoute @ v3.8.51 (cloned to /tmp/omniroute)
**Target plugin:** plugins/better-custom (@ezxomp/better-custom 0.1.2-ezxomp.0)

## Problem

OmniRoute is a second gateway (after 9router) that better-custom users point
`/custom-provider` at. It exposes a strictly richer endpoint surface than 9router
and than the generic OpenAI-compatible presets the wizard probes today. The
wizard maps every gateway capability for which OMP exposes a model-config sink,
preserves gateway-declared reasoning tier spellings on the wire, and uses
remaining catalog fields only as probe evidence. tool_calling, attachment,
structured_output, and temperature are not persisted until the host model
contract exposes consumers for them (council-resolved, doc-24 correction).

## OmniRoute endpoint surface (verified against source)

| Endpoint | Shape | Notes |
| --- | --- | --- |
| `GET /v1` / `GET /v1/models` | `{object:"list", data:[…]}` | Unified catalog; entries carry `id`, `owned_by`, `context_length`, `max_input_tokens`, `max_output_tokens`, `input_modalities`, `output_modalities`, `capabilities` |
| `GET /v1/models/{provider}/{model}` | single entry | catch-all route, same shape |
| `GET /v1/models` headers | `X-Model-Catalog-Version`, `X-Request-Id` | diagnostics |
| `GET /v1/combos` | `{data:[combo]}` | API-key auth, resolves capabilities; combos are virtual model entries with `owned_by:"combo"` |
| `GET /v1beta/models` | Gemini format | `inputTokenLimit`/`outputTokenLimit`, `thinking: true` marker |
| `GET /api/health` | `{status, timestamp}` | liveness, no auth |
| `GET /api/tags` | static Ollama catalog | placeholder like 9router's |
| `GET /api/free-models` | `{models:[{provider, modelId, monthlyTokens, …}]}` | management-auth gated |
| `POST /v1/chat/completions` | OpenAI | `reasoning_effort`, canonical `effort`, boolean `thinking` all accepted |
| `POST /v1/responses` | Responses API | detected by path + body |
| `POST /v1/messages` | Claude format | path-based detection |
| `GET /api/pricing` | merged user+defaults | management-auth gated |

### Catalog entry capability vocabulary (per entry)

```
capabilities: {
  tool_calling?, reasoning?, vision?, attachment?, structured_output?, temperature?,
  thinking?, supportsThinking?,
  effort_tiers?: string[] // ordered, open wire vocabulary; baseline none|low|medium|high|xhigh|max,
                          // provider-native values (ultra) and aliases (extra→xhigh) appear verbatim
}
input_modalities / output_modalities: string[]   // "text","image",...
context_length / max_input_tokens / max_output_tokens: number
supported_endpoints: ["chat","embeddings","rerank","images",…]  // synced/custom rows
root / parent / owned_by: string
```

### Reasoning-effort contract (canonical)

- `CANONICAL_EFFORT_VALUES = ["none","low","medium","high","xhigh","max"]`.
- Request body accepts canonical top-level `effort`, `reasoning_effort`,
  `reasoning.effort`, boolean `thinking` — normalized server-side.
- Catalog advertises `capabilities.effort_tiers` and synthesizes
  `<provider>/<model>-<tier>` catalog variants (skipped for codex/glm/kimi-owned
  providers which own their own suffix mechanisms).
- Per-provider effort sanitation: ollama-cloud rejects `xhigh` (maps → `max`);
  GLM-5.3 maps none/minimal/low→low, medium/high→high, xhigh/max→max.

### Request headers honored per-request

- `x-omniroute-compression: off|default|engine:<id>|<combo>` (echoed back on response)
- `x-omniroute-no-memory: true|1|yes`
- `x-omniroute-no-cache` convention
- `x-omniroute-strip-reasoning: true|1|yes`

### Provider registry model metadata (ollama-cloud example)

`supportsReasoning`, `supportedThinkingEfforts`, `supportsXHighEffort: false`
(→ sanitizer maps xhigh→max), `contextLength`, `supportsVision`, `passthroughModels`.

## Capability map → better-custom work items (council-corrected)

| # | OmniRoute capability | better-custom mapping | Status today |
| --- | --- | --- | --- |
| 1 | `/v1/models` catalog with capabilities/limits/modalities | extend `metadataFromModelListItem` + detail for `effort_tiers`, `supportsThinking`, `input_modalities`/`output_modalities` as vision evidence; read tool_calling/attachment/structured_output/temperature only as catalog-shape evidence — **no host sink, not persisted** | partial (vision only) |
| 2 | `capabilities.effort_tiers` (open vocabulary) | parse into ordered `effortOptions` WITHOUT canonical filtering; ordered monotonic projection onto host selectors with verbatim `effortMap` values; `none` omitted (disable sentinel); >6 positive tiers → explicit unsupported result, never silent truncation | missing |
| 3 | Per-request headers (`x-omniroute-compression`, `-no-memory`, `-no-cache`, `-strip-reasoning`) | user-configured provider-level passthrough only; preset injects no x-omniroute-* defaults; no secrets in policy headers | exists (passthrough) |
| 4 | Gateway detection (`/api/health` `{status,timestamp}`) | ollama-chat probe checks strict `/api/health` marker BEFORE `/api/tags`, without API key; match prefers real `/v1/models`. OpenAI-style paths parse capability shape generically without brand inference. Markers route catalog source only — never credential trust | missing |
| 5 | `GET /api/free-models` budgets | optional enrichment — NOT 1:1 (management-auth gated; skip in probe, note in spec) | out of scope |
| 6 | Model ids with effort suffix (`<model>-<tier>`) | confirm suffix ids pass unchanged; ordered tier projection assigned to TASK-113.3 | partial |
| 7 | `/v1beta/models` Gemini shape | existing `inputTokenLimit`/`outputTokenLimit` parse already covers it | exists |
| 8 | Top-level v1beta `thinking: true` | parse as `reasoning` evidence only; never derive `thinkingFormat`. v1 `capabilities.thinking` already parsed | missing (cheap) |
| 9 | 9router parity carry-over | static-tags bypass already shipped (0.1.2) | exists |

## Constraints

- No runtime dependencies (plugin contract).
- Probe must stay side-effect free and evidence-only (never log key material).
- Host APIs remain the five supported styles; OmniRoute speaks OpenAI
  chat-completions + Responses + Claude + Gemini natively, so all four relevant
  styles benefit from the same parsers.
- Non-goals: MCP/A2A/skills/monitoring endpoints (management-auth gated, not
  model-capability concerns); RTK compression is server-side and transparent.
- Gateway markers choose response-source ordering only; never credential trust.
- Re-probe remains authoritative and may replace a previously probed thinking
  map with newly observed effort_tiers (existing edit-flow precedence).
- No response headers are persisted; URL-userinfo sanitization is a separate
  pre-existing security follow-up outside this task.

## Acceptance criteria for the feature

1. Probing an OmniRoute catalog yields per-model `contextWindow`, `maxTokens`,
   `vision`, `reasoning`, and ordered `effortOptions` when present; top-level
   v1beta `thinking` is reasoning evidence.
2. For each advertised positive effort tier, the stored per-model mapping
   preserves the exact raw gateway spelling and the host emits that spelling as
   `reasoning_effort`; unknown tiers are never silently nulled. `none` is a
   disable sentinel, excluded from positive `thinking.efforts`/`effortMap`.
3. On ollama-chat, a strict OmniRoute `/api/health` marker is checked BEFORE
   tags and selects the real `/v1/models` catalog; genuine Ollama does not take
   that branch. OpenAI-style probing consumes compatible capability fields
   without brand detection.
4. Focused tests in `test/better-custom*.test.ts` cover: unknown-tier
   pass-through (`ultra`, `extra`), `none` omission, v1beta thinking marker,
   marker-before-tags ordering, genuine-Ollama negative control, preset scope,
   suffix model ids, and Fallow new-only gate.
