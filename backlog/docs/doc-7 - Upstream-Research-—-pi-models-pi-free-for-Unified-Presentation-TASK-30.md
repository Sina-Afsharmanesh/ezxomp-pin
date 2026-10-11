---
id: doc-7
title: Upstream Research — pi-models + pi-free for Unified Presentation (TASK-30)
type: other
created_date: '2026-08-24 02:36'
---
# Upstream Research — pi-models + pi-free for Unified Presentation (TASK-30)

**Date:** 2026-08-23
**Workspace:** ezxomp @ jj head a36db451
**Upstreams:** https://github.com/apmantza/pi-models (v0.2.9) and https://github.com/apmantza/pi-free (v2.6.0) — shallow clones to /tmp, read-only

## 1) pi-models presentation format

### Grouping: 3 browse modes + virtual Free
| Mode | Selector | Function | Description source |
|---|---|---|---|
| By Provider | 📦 By Provider | `pi-models.ts:473 getProviders` map provider→models, sorted α, freeCount | virtual __free first: `${free.length} models`, per-provider `${n} models (${k} free)` |
| By Lab | 🔬 By Lab | `pi-models.ts:1067 getLabs` map lab→{models,families} via resolveModelFamily().lab | `${n} models (${families.size} families)` |
| By Model Family | 🏷️ By Model Family | `pi-models.ts:1005 getModelFamilies` map familyId→models keyed by resolveModelFamily (version-aware) + normalizeModelName merge | multi-provider: `Available from P providers (M versions)` else `From X (M versions)` |

- Free invariants: always first (lines 1211,1275,1352), `free = all.filter(m=>m.isFree)`, free variants merged via `normalizeModelsDevFamilyId` stripping `-free` (192) — `deepseek-flash` + `deepseek-flash-free` collapse (test circa 120).
- 3-level flow documented `pi-models.ts:1-11` + README How to Use: 1) browse mode (`showModelsBrowser:1141` → `showSelect:1460`), 2) category list, 3) `showModelList:1587`. Family/lab show all providers directly (v0.2.2); family view lists all models for family.

### Columns & metadata
- **Level-1 showSelect:** `SelectList(items,maxVisible,theme,layout)` with `minPrimaryColumnWidth:20` and *no max* (1490) so label grows. Width `calculateSelectWidth:1408` = prefix2+maxLabel+gap2+maxDesc+box2+margin2 capped 120, help text `tab toggle view` when onToggle.
- **Level-2 showModelList:** custom not SelectList to avoid truncation. `calculateModelListWidth:1523` = prefix2+maxName+codingIndex8+active9+box2+margin2 capped 120. When `providers>1`, row = `[provider] name` deduplicated stripping provider prefix (1630-1641). Width reserves CI suffix ` (XX.X)` — cross-extension awareness (1533).
- **ModelInfo (27):** `{id,name?,provider,isFree,inputCost,outputCost,modelsDevFamily?:{familyId,familyName,lab}}` derived from `ctx.modelRegistry.getAvailable(): Model{id,name,provider,cost}` via `getAvailableModels:408` → `isModelFree:439` (pricing-exposed set {openrouter,opencode,kilo,cline} line 426: cost 0, else name includes free).
- **Enrichment:** `createModelsDevMetadata:254` builds `modelsByProviderAndId` + `modelsById` + `familyLabs` via `catalog.json` + majority vote fallback + LAB_ALIASES/FAMILY_WORD_ALIASES. Version extraction `extractFamilyVersion:144` family-specific (laguna m|xs, kimi kN, gpt/qwen/minimax N(.M) with 1–10 guard, deepseek-thinking pro→Pro:129).

### Interactions
- Entry `default:1125 pi.registerCommand("models", handler=>loadModelsDevMetadata().then(showModelsBrowser))`. `loadModelsDevMetadata:320` fetches `api.json`+`catalog.json` parallel, caches promise session, clears on failure, 2s abort per fetch (`fetchJson:306`).
- Navigation `↑/↓`|`k/j`, `Enter`, `Esc` back, `Tab` toggle view (`showSelect:1467 matchesKey(tab)→done(onToggle())`), each show*View while loop re-reads getAvailableModels.
- Active `isActive = model.id===ctx.model?.id` renders ` ● active` inline (1641) affecting width.
- Sorting: providers α, families displayName α, labs name α, models provider|id.

Test anchor: `tests/pi-models.test.ts` 81 tests — isModelFree, formatModelName, detectModelFamily, getProviders, getModelFamilies, getLabs, createModelsDevMetadata/enrichModelWithModelsDev; versioned families and free-variant merging.

## 2) pi-free integration surface

Source: `index.ts`, `provider-helper.ts`, `providers/model-fetcher.ts`, `lib/{registry,native-provider,built-in-toggle,provider-cache,probe-cache,provider-probe,model-metadata,types}`, `config.ts`, `constants.ts`

### Provider config
- **Persisted:** `~/.pi/free.json` (`config.ts: CONFIG_PATH`, `CONFIG_TEMPLATE:157`) keys `*_api_key` (18 providers), `hidden_models: string[]` (748 applyHidden), per-provider `*_show_paid` (default false except stepfun true), global `free_only:true`. Env wins (`PREFIX_API_KEY`, `PREFIX_SHOW_PAID` via PROVIDER_META table 110-157). `loadConfigFile` mtime-memoized, getters live, chmod 0600, backup on corrupt.
- **Auth:** `lib/native-provider.ts:74 createNativeApiKeyAuth({getApiKey,anonymousCatalog})` resolve returns `{auth:{apiKey},source}` or `anonymousCatalog`→`{auth:{},source:"public catalog"}` so refresh still populates discoverable without key (chat still requires key).
- **Identity:** `constants.ts: PROVIDER_*` (kilo, ollama-cloud, zenmux, crofai, llm7, deepinfra, sambanova, novita, routeway, opengateway, bai, tokenrouter, anyapi, stepfun, qoder, fastrouter, etc.) UNIQUE_PROVIDERS 18 + 3 built-in wrappers (opencode-free/go, openrouter) in built-in-toggle.

### Catalog records
- **Shape `lib/types.ts: ProviderModelConfig`:** `{id,name,reasoning,input:("text"|"image")[],cost:{input,output,cacheRead,cacheWrite},contextWindow,maxTokens}` + opt thinkingLevelMap, compat.supportsDeveloperRole, modelsDev. Same via provider-helper enhanceWithCI, native-provider withGatewayCompat forces supportsDeveloperRole:false.
- **Fetch:** `providers/model-fetcher.ts: fetchOpenRouterCompatibleModels` GET {baseUrl}/models Bearer, 3×1s, 10s timeout, parse {data:[]}, drop non-text output_modalities, freeOnly by isFree else pricing==0, mapOpenRouterModel→ProviderModelConfig→safeEnrichModelsWithModelsDev. Dedicated fetches for qoder/cline etc converge same type.
- **Two-ledger:** `lib/registry.ts:18 ProviderEntry {id,stored:{free,all},reRegister,hasKey,native?,invalidate?}`; registerWithGlobalToggle (155) logs free/total. `lib/native-provider.ts:210 createNativeOpenAIProvider` keeps stored.all/free: Model<"openai-completions">[], seed initialModels, refreshModels via refreshNativeProviderModels + enhanceWithCI map.
- **Disk cache:** `lib/provider-cache.ts: CACHE_FILE provider-cache.json, TTL 1h, load/isFresh/saveGuarded` guard refuses <0.5× shrink or empty. `provider-helper.ts:112 loadCachedOrFetchModels` contract: fresh non-empty cache → no network; else fetch with STARTUP_FETCH_DEADLINE_MS 8s → success persist guardedly, error serve stale else [].

### Discoverable vs selectable
- **Discoverable** = registered into Pi's native store, appears in `ctx.modelRegistry.getAll()`: unique via `registerNativeOpenAIProvider→registerNativeProvider` (291) getModels=>stored.all||stored.free; built-ins via `built-in-toggle: setupBuiltInProviderToggles` session_start detached capture into providerStates re-register distinct id (opencode-free vs opencode) so stream wrapper authoritative. Even on 8s deadline stale cache keeps discoverable non-empty.
- **Selectable** = discoverable passing 3 gates, returned by `ModelRegistry.getAvailable()` for /models:
  1) Global free gate `lib/registry.ts:254 applyGlobalFilter` getGlobalFreeOnly() (config.free_only||PI_FREE_ONLY). Native via invalidate+filterNativeModels (182) comparing Set(free ids). Global forced overrides per-provider.
  2) Per-provider paid gate config.getProviderShowPaid(id) (*_show_paid file||env). filterNativeModels({showPaid,freeModels,forceFree})→freeOnly=getGlobalFreeOnly&&(forceFree||!showPaid). showPaid true→stored.all selectable else free ids.
  3) Hidden gate `config.ts:748 applyHidden(models,providerId)` filter Set(hidden_models) where entry provider/model preferred or bare id legacy. Applied inside filterNativeModels after free, so hidden dominates. Probe auto-populates: `lib/provider-probe.ts: createProviderProbe({batch5,autoHide:true})` run POST {baseUrl}/chat/completions {model,hi,max1} 404|5xx→broken; on broken updateConfig hidden_models+=provider/id atomically. Probe-cache TTL skips fresh.

Free predicate mismatch: `lib/registry.ts:86 isFreeModel` adaptive detectPricingExposed (some cost>0 → route A isZeroCost||freeInName with _pricingKnown:false→name-only; else route B name-only). `pi-models:isModelFree:439` static set {openrouter,opencode,kilo,cline}→cost else name. Unified must reconcile with pi-free canonical.

### Catalog table & toggles
Providers: Kilo, Cline, LLM7, TokenRouter, Qoder basic, AnyAPI, Ollama Cloud, SambaNova (freemium), ZenMux, CrofAI, DeepInfra trial, Novita, Routeway, OpenGateway, B.AI, StepFun (paid, anthropic-messages too), FastRouter, Requesty. Toggles /toggle-{provider} (show_paid), /toggle-free (global), /free-providers, /free-startup, /pi-free-health (redacted wire-signature names-only).

## 3) Local manifests compatibility

| Manifest | Peers | Finding |
|---|---|---|
| ezxomp/package.json | devDeps @oh-my-pi 17.3.8, bun≥1.3.14, workspaces plugins/* | Vendor rebrand vs upstreams @earendil-works 0.81–0.84. pi-models imports @earendil-works/pi-* via types.d.ts. Need alias @earendil→@oh-my-pi or vendor re-write. 17.3.8 must still expose ExtensionAPI.registerCommand, ExtensionContext.modelRegistry:{getAvailable,find}, pi-tui Box/SelectList etc. |
| plugins/better-custom/package.json @0.1.0-ezxomp.0 | peer @oh-my-pi 17.3.8, deps {}, files src, omp.extensions src/index.ts | Strict pin zero runtime deps per AGENTS.md. Host-API enum openai-completions|responses|anthropic-messages|google-generative-ai|ollama-chat (src/types.ts PROVIDER_STYLES) — superset vs pi-free openai-completions|anthropic-messages. Map custom api→Pi Api union on save. |
| plugins/better-custom/src/config.ts:83 discoverModelsConfig | Omp→models.{yml,yaml,json}, Pi→models.json, getAgentDir~/.omp/agent regex /\.??omp/ | Distinct FS from pi-free free.json + ~/.pi/agent/models-store.json + provider-cache.json. No collision. Presentation must union OMP-custom providers (loadModelsConfig().providers Record api/baseUrl/apiKey/models) with Pi-native getAvailable. Two sources one UI. |
| src/model-entry.ts HostModelEntry | id,api,baseUrl,contextWindow,maxTokens,headers,input,reasoning,thinking + localModelInfo 30+ KNOWN_MODEL_RULES | Overlap models.dev supplement — better-custom presets keep modelsDev:false for oneapi/newapi (presets.ts GATEWAY_PRESETS NONE) but pi-free/pi-models synthesize thinkingLevelMap/compat/contextWindow. Triple-enrichment dedupe needed, last-write wins contextWindow risk. |
| src/probe/types.ts GatewayProbeOptions 4000ms | probeGateway LiteLLM /model/info /model_group/info public/api/models/public per-model | Narrower than pi-free availability probe POST /chat/completions 1 token with auto-hide hidden_models + probe-cache. Unified must surface discovery health vs selectable health separately. |

## 4) Actionable contracts for unified presentation tests (RED blueprint)

C-01 discoverable union: ~/.omp/models.yml my-gw/acme/model-a + GW_KEY present ⇒ ctx.modelRegistry.getAvailable includes my-gw/acme/model-a alongside kilo/* openrouter/* (count = pi-free stored.all + custom models - hidden). Cite better-custom config.ts loadModelsConfig + pi-models getAvailableModels:408.
C-02 auth gating: GW_KEY absent ⇒ discoverable but !selectable for chat; UI requires auth badge not hide; find returns model but pi.setModel → No API key.
C-03 session-cached enrichment: models.dev fetched once per session (pi-models 2s per URL promise cache + pi-free 5m TTL) second /models open no refetch.
C-04 hidden dominates: hidden_models ["my-gw/acme/model-a"] ⇒ applyHidden([model],"my-gw")==[] and filterNativeModels excludes from getProviders/getModelFamilies (both scoped and bare id).
C-05 paid gate propagation: stored free:[a] all:[a,b] show_paid false global free_only true ⇒ families only a; /toggle-my-gw true ⇒ b appears; global /toggle-free false ⇒ all visible even when per-provider false.
C-06 free predicate single source: isFree must equal lib/registry isFreeModel(providerConfig,all) not pi-models static set; gateway cost 0.01 name my-free-model ⇒ true under pi-free route A isZero||freeInName but false under pi-models pricing set — reconciliation seam.
C-07 provider row desc: getProviders row my-gw label my-gw description N models (K free) when K>0 else N models (1352).
C-08 tandem grouping for custom IDs: @cf/acme/model-a pro/acme/model-a → lab Acme not pro/@cf via NON_LAB_MODEL_PREFIXES 204 + getLabSlugFromModelId 212 + modelIdVariants 225 and familyLabs majority vote 297.
C-09 no truncation: 15+ custom longest 60 cols ⇒ width prefix2+60+8+active9+box2+margin2=83 via calculateModelListWidth 1523, truncateToWidth only fallback when visibleWidth>contentWidth-prefix-active-1 (1644) no ellipsis at 120.
C-10 active marker fidelity: isActive id===ctx.model.id only (1641) bleeds when kilo/foo vs my-gw/foo same bare id — unified must compare provider/id pair.
C-11 family/badge for hidden count: family whose every member hidden/unauth ⇒ absent; partially hidden ⇒ family.models=filtered subset not stored.all; lab counts drop.
C-12 Tab toggle preserves enrichments: Tab family→provider via __toggle 1211 carries same ModelsDevMetadata without refetch; target providerItems includes custom with same freeCount.

Seams table:
- Registry snapshot: merge piRegistry.getAvailable + custom normalized via localModelInfo before enrichModelWithModelsDev; stub getAvailable.
- Free predicate: inject pi-free isFreeModel with all context, fallback only when unavailable.
- Filter predicate: per-provider filterNativeModels + applyHidden before flatten.
- Enrichment: share fetchModelsDevMeta single promise, disable pi-models fetch when pi-free loaded; normalize :free/-free.
- Persistence toggle: keep writes on distinct files free.json vs models.yml no shared lock; hidden provider prefix validation via BUILTIN_PROVIDER_IDS.
- Width: preserve CI 8 reserve; auth badge either description column via SelectList or extend width.

## 5) Adaptation risks

| Risk | Detail | Mitigation |
|---|---|---|
| @earendil→@oh-my-pi drift | pi-models 0.84 vs local 17.3.8 scope rename, main pi-models.ts bundle path pi.extensions | alias paths @earendil→@oh-my-pi or vendor re-write; verify bun --check not full tsc |
| models.dev double fetch/timeout clash | pi-models 2s×2 session promise vs pi-free 10s retries TTL5m STARTUP 8s | share getModelsDevCatalogCache promise, disable second fetch; test C-03 |
| isFree semantic divergence static vs adaptive | pi-models static set vs pi-free detectPricingExposed adaptive route A|B | canonicalize to pi-free adaptive with stored.all; test C-06 |
| cache poisoning staleness | saveGuarded <0.5× guard vs better-custom empty ids wiping | reuse saveGuarded for custom cache or keep custom in models.yml no provider-cache |
| hidden scope collision | applyHidden bare legacy spills across ids; custom id colliding kilo | forbid BUILTIN_PROVIDER_IDS+PROVIDER_* collision on addProviderFlow |
| Tab toggle enrichment loss | showModelsBrowser metadata threaded, recompute loses labs | thread same metadata through __toggle |
| overlay width auth badges | calculateModelListWidth no desc, long badge overflow | extend to badgeWidth or keep in SelectList description |
| YAML vs JSON race | distinct files but naive writeFileSync vs config Lock | keep on distinct files, add fileLock if hidden routed to models.yml |
| Bun-only YAML | BUN_YAML undefined real YAML throws actionable error | guard yamlCodec null json fallback test |
| probe auto-hide UX gap | pi-free silent auto-hide, pi-models no hidden hint | unified family desc "(+K hidden)" from applyHidden delta C-11 |

## 6) Citations URL+file:symbol
pi-models https://github.com/apmantza/pi-models — README How to Use/BrowseMode/Supported Families; pi-models.ts:27 ModelInfo,59 ModelsDevMetadata,65 URLs/TIMEOUT,254 createModelsDevMetadata,320 loadModelsDevMetadata,408 getAvailableModels,426 PRICING_EXPOSED,439 isModelFree,462 formatModelName,473 getProviders,493 ModelFamily,500 Lab,507 isRouter,527 detectHeuristic,953 detectModelFamily,987 resolveModelFamily,1005 getModelFamilies,1067 getLabs,1098 applyModelSelection,1125 registerCommand models,1141 showModelsBrowser,1177 showFamilyView,1256 showLabView,1328 showProviderView,1408 calculateSelectWidth,1460 showSelect,1523 calculateModelListWidth,1587 showModelList, types.d.ts SelectItem/SelectList/Box/ModelRegistry, tests/pi-models.test.ts, package.json pi.extensions, docs/plans 2025-04-03
pi-free https://github.com/apmantza/pi-free — README What does do 1-7 Provider Catalog; docs/providers.md categories/storage; index.ts:54 UNIQUE_PROVIDERS setupGlobalCommands; lib/types.ts ProviderModelConfig; lib/registry.ts:18 ProviderEntry 33 registry 86 isFreeModel 155 registerWithGlobalToggle 176 getGlobalFreeOnly 254 applyGlobalFilter; lib/native-provider.ts:74 createNativeApiKeyAuth 182 filterNativeModels 210 createNativeOpenAIProvider; lib/provider-cache.ts provider-cache.json TTL1h load/isFresh/saveGuarded; lib/provider-probe.ts createProviderProbe run; lib/probe-cache getModelsDueForProbe; providers/model-fetcher fetchOpenRouterCompatibleModels; lib/model-metadata fetchModelsDevMeta; provider-helper loadCachedOrFetchModels; config.ts CONFIG_PATH CONFIG_TEMPLATE 748 applyHidden saveConfig PROVIDER_META; constants.ts PROVIDER_* BASE_URL_* STARTUP_FETCH_DEADLINE 8s; package.json peer @earendil >=0.81
local /home/egsox/repo/ezxomp/package.json devDeps @oh-my-pi 17.3.8; plugins/better-custom package.json 0.1.0-ezxomp.0 omp.extensions; src/types.ts ProviderConfig PROVIDER_STYLES; src/config.ts:23 detectBunYaml 83 discoverModelsConfig 16 BUILTIN_PROVIDER_IDS; src/model-entry.ts HostModelEntry localModelInfo KNOWN_MODEL_RULES; src/presets.ts GATEWAY_PRESETS NONE vs FULL; src/probe/types.ts GatewayProbeOptions Result src/probe/index.ts probeGateway; node_modules/@oh-my-pi/pi-coding-agent 17.3.8

No code/tests edited, no formatters/linters/project-wide suites run.
