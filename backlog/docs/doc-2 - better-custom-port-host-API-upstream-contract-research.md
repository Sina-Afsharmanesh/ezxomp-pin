---
id: doc-2
title: 'better-custom port: host API + upstream contract research'
type: other
created_date: '2026-08-21 20:06'
tags:
  - research
  - better-custom
---
# better-custom port: host API + upstream contract research

Scope: evidence packet for porting `/tmp/better-custom-research` into this OMP host. Citations use absolute source paths and 1-based line ranges.

## 1. Extension entry contract

**Host contract — GO.** `ExtensionAPI` is the object passed to a factory (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:1169-1171`). The factory type is `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>` (`types.ts:1554-1555`). The loader accepts either a module whose value is the factory or a module with `default?: ExtensionFactory` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/loader.ts:55-60`), then rejects a module without a function (`loader.ts:371-385`). Therefore an `omp` `"extensions": ["src/index.ts"]` entry should export `default function (pi: ExtensionAPI): void|Promise<void>`; a named-only export is not sufficient. The extension index re-exports the loader and extension types (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/index.ts:5-16`).

`registerCommand` takes `name: string` and an options object with optional `description`, optional `getArgumentCompletions`, and required `handler: RegisteredCommand["handler"]` (`types.ts:1321-1329`). `RegisteredCommand.handler` is `(args: string, ctx: ExtensionCommandContext) => Promise<void>` (`types.ts:1147-1152`). The upstream entry already follows the default-factory/registration shape (`/tmp/better-custom-research/index.ts:7-23`), but its imports and command description still name the old Pi package/path.

## 2. `ctx.ui` surface and reuse verdict

`ExtensionContext` exposes `ui: ExtensionUIContext`, and `mode`/`hasUI` for guarding interactive-only work (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:441-455`).

| Primitive | Native? | Evidence / port consequence |
|---|---|---|
| Text input | **YES** | `ui.input(title, placeholder?, dialogOptions?) -> Promise<string | undefined>` (`types.ts:267-268`). Upstream `promptApiKey` calls it (`/tmp/better-custom-research/src/ui/prompts.ts:9-23`). |
| Single select | **YES** | `ui.select(title, options, dialogOptions?) -> Promise<string | undefined>` (`types.ts:257-262`). |
| Multi-select | **NO** | No `multiselect` member exists on `ExtensionUIContext`; the interface's selector surface is `select`, while upstream `pickMany` is a hand-built `ctx.ui.custom` component (`/tmp/better-custom-research/src/ui/select.ts:131-145`). Preserve/build that helper. |
| Confirm | **YES** | `ui.confirm(title, message, dialogOptions?) -> Promise<boolean>` (`types.ts:264-265`). |
| Notify | **YES** | `ui.notify(message, type?)` (`types.ts:276-277`). |
| Spinner | **NO native primitive** | No spinner method/member exists. `setWorkingMessage(message?)` only sets loading text (`types.ts:282-286`); `ToolRenderResultOptions.spinnerFrame` is render metadata, not a dialog (`types.ts:556-563`). |
| Custom overlay | **YES** | `ui.custom<T>(factory, options?) -> Promise<T>` with TUI/theme/keybindings/done (`types.ts:300-309`). Upstream `selectOne` also uses this custom path (`/tmp/better-custom-research/src/ui/select.ts:8-18`). |

**UI verdict:** reuse native input/select/confirm/notify. Hand-build or retain `select.ts` for filtering/multi-select and any spinner/overlay UX; do not invent a native multiselect or spinner API.

## 3. Agent-directory discovery

**GO — use `getAgentDir()`, never `~/.pi/agent`.** The canonical utility is `getAgentDir(): string`, returning the resolver's active agent directory (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:495-498`). The resolver honors profiles and `PI_CODING_AGENT_DIR`; it derives the default as `<configRoot>/agent` and resolves an override (`dirs.ts:243-250`, `dirs.ts:351-364`). `@oh-my-pi/pi-coding-agent` re-exports the same function (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/index.ts:8-10`), so either `@oh-my-pi/pi-utils` or coding-agent root is valid. `ConfigFile` itself defaults paths through `getAgentDir()` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/config/config-file.ts:137-149`). Use this for `models.*` and any global extension state.

## 4. Models config schema and YAML verdict

### Host type names and fields

`@oh-my-pi/pi-coding-agent/config/models-config-schema` exports `ModelOverride`, `ProviderAuthMode`, `ProviderDiscovery`, and `ModelsConfig` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/config/models-config-schema.ts:3-14`). `ProviderValidationModel` includes `id`, optional `api`, `contextWindow`, `supportsTools`, `maxTokens`; `ProviderValidationConfig` includes optional `baseUrl`, `headers`, `apiKey`, `api`, `auth`, `discovery`, `compat`, `modelOverrides`, and required `models` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/config/models-config.ts:12-33`).

The schema's API literal union is `openai-completions | openai-responses | openai-codex-responses | azure-openai-responses | anthropic-messages | bedrock-converse-stream | google-generative-ai | google-gemini-cli | google-vertex` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/config/models-config-schema-bundle.ts:82-84`). The provider schema has optional `baseUrl`, `apiKey`, `api`, `headers`, `compat`, `remoteCompaction`, `authHeader`, `auth`, `discovery`, `models`, `modelOverrides`, `disableStrictTools`, and `transport: "pi-native"` (`models-config-schema-bundle.ts:271-293`); `ModelsConfig` is `{ providers?: { [string]: ProviderConfigSchema } }` (`models-config-schema-bundle.ts:304-315`).

Each model entry (`ModelDefinitionSchema`) has required `id`; optional `name`, `api`, per-model `baseUrl`, `reasoning`, `thinking`, `input: ("text"|"image")[]`, `supportsTools`, cost, `contextWindow`, `maxTokens`, `headers`, `compat`, and compaction fields (`models-config-schema-bundle.ts:162-186`). `ModelThinkingSchema` has required `mode` plus `efforts`, `defaultLevel`, `effortMap`, `supportsDisplay`, and legacy `minLevel`/`maxLevel`/`levels` (`models-config-schema-bundle.ts:100-110`). `ReasoningEffortMapSchema` maps `minimal/low/medium/high/xhigh/max` to strings (`models-config-schema-bundle.ts:15-22`). OpenAI compat includes `supportsDeveloperRole`, `supportsMultipleSystemMessages`, reasoning-effort support/map, headers/extra body, thinking format, strict/tool flags, and streaming/timeouts (`models-config-schema-bundle.ts:24-62`).

`@oh-my-pi/pi-ai/types` re-exports catalog types (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-ai/src/types.ts:1-2,36-38`). The catalog's `KnownApi` includes `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, and **`ollama-chat`**; `Api` also admits arbitrary strings (`/home/egsox/repo/ezxomp/node_modules/.bun/node_modules/@oh-my-pi/pi-catalog/src/types.ts:8-23`). This is an important mapping risk: upstream uses `ProviderStyle = "ollama"` and writes `api` from its four-value `ProviderApi` (`/tmp/better-custom-research/src/types.ts:3-5`, `model-entry.ts:132-147`), while the host schema literal list does not include `"ollama"`; the runtime catalog spelling is `"ollama-chat"`.

The host `Model<TApi>` contract includes `id`, optional `requestModelId`, `name`, `api`, `provider`, `baseUrl`, `reasoning`, `input`, optional image/tool flags, `cost`, nullable `contextWindow` and `maxTokens`, headers, transport, `thinking`, and resolved `compat` (`pi-catalog/src/types.ts:863-924,939-960`). `ModelSpec<TApi>` is the authoring form that extends `Model` while making sparse `compat?: CompatConfigOf<TApi>` (`pi-catalog/src/types.ts:979-986`). `ThinkingConfig` uses ordered `efforts`, optional `defaultLevel`, and `effortMap` whose unmapped levels retain identity (`pi-catalog/src/types.ts:33-50`).

### HOST-YAML verdict

**HOST-YAML = NO (no direct `@oh-my-pi/*` YAML parse/dump export).** An exhaustive eval scan of installed `@oh-my-pi/*/src` and package export maps found no exported `parseYaml`/`dump`/`YAML` helper. The host's only relevant implementation is private Bun usage inside `ConfigFile`: `import { JSONC, YAML } from "bun"` (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/src/config/config-file.ts:1-5`) and extension-based private parsing (`config-file.ts:242-251`). The coding-agent export map exposes config source modules (`/home/egsox/repo/ezxomp/node_modules/@oh-my-pi/pi-coding-agent/package.json:215-217`), not a YAML utility. A plugin may call Bun's runtime `YAML` directly, but that is not a reusable `@oh-my-pi/*` package export; treat it as an explicit runtime dependency rather than a host API.

Therefore the zero-dependency fallback remains required if the port must survive a manually copied extension: lazy-load `yaml`; JSON is accepted as a valid YAML subset; genuine YAML without the package throws a clear error (`/tmp/better-custom-research/src/config.ts:7-17,25-30,82-96`). New writes preserve the discovered path/format: YAML uses `yaml.stringify` when available, otherwise writes indented JSON (still valid YAML); non-YAML also writes JSON (`config.ts:98-110`).

## 5. Upstream behavior contracts

### Config discovery / format preservation

`AGENT_DIR` is captured from the old coding-agent `getAgentDir`; OMP detection is by logger or `.omp` path (`/tmp/better-custom-research/src/config.ts:32-34`). In OMP, discovery precedence is `models.yml`, then `models.yaml`, then legacy `models.json`; non-OMP checks only `models.json`; absent files default to OMP `models.yml` or Pi `models.json` (`config.ts:34-38`). The provider preset/id table is independent of file format and includes anthropic, openai, azure-openai, google, vertex, bedrock, mistral, groq, cerebras, xai, openrouter, vercel-ai-gateway, zai, huggingface, kimi-for-coding, minimax, ollama (`config.ts:39-57`).

### API-key serialization

`serializeApiKey` writes `dummy` (or `ollama`) for `none`, prefixes shell values with `!`, prefixes env values with `$`, and leaves literals untouched (`/tmp/better-custom-research/src/api-key.ts:21-29`). Reverse parsing recognizes `dummy`/`ollama` as none, `!` as shell, `$` as env, otherwise literal (`api-key.ts:31-38`). Probe resolution executes shell commands, reads env variables, or returns literals; failures resolve to undefined (`api-key.ts:4-18`). Never log resolved secrets.

### Gateway presets

`GatewayPresetId` is `auto | litellm | oneapi | newapi | openrouter | generic`; probe flags cover LiteLLM `/model/info`, `/model_group/info`, public catalog, per-model `/models/{id}`, and models.dev (`/tmp/better-custom-research/src/presets.ts:7-15`). `FULL` enables all flags and `NONE` disables all (`presets.ts:28-29`). Rows are: auto = FULL/ensureV1 false; litellm = FULL except per-model and models.dev/ensureV1 false; oneapi = NONE/ensureV1 true; newapi = NONE/ensureV1 true; openrouter = per-model + models.dev/ensureV1 false; generic = per-model + models.dev/ensureV1 false (`presets.ts:31-74`). Unknown ids fall back to the first (auto) preset (`presets.ts:76-78`).

### Metadata tiers and known-model rule families

`resolveModelInfo` is the central tier merge: detected probe metadata first, local rules next, then built-in defaults (vision off, reasoning on), including manually entered models (`/tmp/better-custom-research/src/model-entry.ts:49-57,148-154`). Probe values override fallback vision/context; `reasoning=false` disables reasoning, `reasoning=true + alwaysThinking` forces minimal and `{off:null}`, and effort options become a complete thinking map and inferred ceiling (`model-entry.ts:54-74`). The known-provider rule family is keyed by provider id/base URL: pi auto-detects developer-role support only for a handful of known providers; unknown OpenAI-style endpoints use the one-shot probe result and default false when inconclusive (`model-entry.ts:163-169`). Ollama is an explicit special family: `apiKey="ollama"`, `supportsDeveloperRole=false`, and `supportsReasoningEffort=false` (`model-entry.ts:157-162`). The actual `model-probe` package is not present in `/tmp/better-custom-research` or resolvable from its entrypoint; the clone therefore proves the merge/call contracts but not the external package's full known-model rule table (port risk).

### thinkingLevelMap semantics

Upstream authoring accepts `thinkingLevelMap?: Record<string,string|null>` (`/tmp/better-custom-research/src/types.ts:12-20`). Provider effort aliases map `none/minimal/low/medium/high/xhigh/max/extended` to Pi levels; unknown levels are ignored (`model-entry.ts:13-23`). The map contains every Pi level with the provider wire option or `null` for unsupported levels (`model-entry.ts:25-39`); the ceiling is the highest non-null level excluding `off` (`model-entry.ts:41-46`). A ceiling writes `reasoning=true`; xhigh/max are opt-in only, ordinary levels above the ceiling become null, and an all-empty map is removed (`model-entry.ts:77-103`). If the probe supplied an exact map, it is written verbatim instead of deriving one (`model-entry.ts:121-128`). On read, max then xhigh then the highest non-null ordinary level determines the ceiling (`model-entry.ts:174-198`). Host translation should map this to `thinking.mode`, ordered `thinking.efforts`, `defaultLevel`, and `effortMap`; do not write an unknown host `thinkingLevelMap` field.

### Developer-role probe and URL variants

For OpenAI/OpenAI-Responses styles, add flow probes once using `probeDeveloperRole(probeBase, resolvedApiKey, firstModel)`; the call is made only for those styles and `probeBase` is the collected base URL (`/tmp/better-custom-research/src/flows/add.ts:207-218`). A false result stores `supportsDeveloperRole=false`; an inconclusive result also defaults false in the provider builder (`model-entry.ts:163-169`). The HTTP body/headers are owned by the absent external `model-probe` package, so that exact wire request is an integration risk and must be confirmed before implementing a replacement.

URL logic preserves explicit schemes; otherwise local host/private ranges receive `http` and other hosts `https` (`/tmp/better-custom-research/src/url.ts:3-5,7-34`). `normalizeEndpoint` strips `/chat/completions`, `/responses`, `/completions`, and `/models` for OpenAI APIs; strips `/models` for Gemini; strips `/messages` for Anthropic; then removes a root slash and preserves protocol/host/port/path (`url.ts:40-58`).

## 6. Repository conventions and verification

Plugins are standalone Bun workspace packages; each must expose extension points through `package.json`'s `omp` field, and cross-plugin imports use `@ezxomp/*` (`/home/egsox/repo/ezxomp/plugins/AGENTS.md:5-16`). Plugin guidance asks for `just check`, a plugin-specific `bun test test/<plugin>.test.ts`, and at least one smoke test in `test/`; `just verify` is the full gate (`plugins/AGENTS.md:18-27`).

`@ezxomp/pix-skills` uses `omp.extensions: ["src/index.ts"]` (`/home/egsox/repo/ezxomp/plugins/pix-skills/package.json:16-20`), imports host `ExtensionAPI`/TUI/utils (`plugins/pix-skills/src/index.ts:19-21`), and exports a default `(pi: ExtensionAPI): void` factory (`pix-skills/src/index.ts:649-654`). Its peer pins are all exactly `17.3.8` for `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`, and `@oh-my-pi/pi-utils` (`pix-skills/package.json:40-45`). `@ezxomp/ultra-compact` uses `omp.extensions: ["extensions/index.ts"]` plus skills and pins `@oh-my-pi/pi-agent-core` and `@oh-my-pi/pi-coding-agent` to `17.3.8` (`/home/egsox/repo/ezxomp/plugins/ultra-compact/package.json:20-27`).

Tests use Bun's runner, `<name>.test.ts`, deterministic isolation, and `smoke-*.test.ts` for loading/basic integration (`/home/egsox/repo/ezxomp/test/AGENTS.md:11-16`). Current root test files include `manifest.test.ts`, `scaffold-plugin.test.ts`, `smoke-plugins.test.ts`, `workflowz-*`, `overlay-host.test.ts`, and related smoke/integration files under `test/`; add a focused `test/better-custom*.test.ts` rather than a plugin-local test directory. `just test` runs `bun test test/`; `just smoke` runs `bun test test/smoke-plugins.test.ts` (`test/AGENTS.md:18-27`). Root `just verify` is exactly `check` followed by `test`, with `check = bun run check` and `test = bun test test/` (`/home/egsox/repo/ezxomp/justfile:8-18`).

## Decision summary

- **GO:** default factory + `registerCommand`; native input/select/confirm/notify; `getAgentDir`; host `ModelsConfig`/`ModelSpec` with explicit API spelling and thinking translation; JSON persistence.
- **GO with hand-built UI:** retain custom searchable single-select and multi-select; use `ui.custom` and `setWorkingMessage` rather than pretending host has multiselect/spinner.
- **NO-GO without a deliberate fallback:** importing a YAML helper from `@oh-my-pi/*`; no direct export exists. Use Bun `YAML` explicitly or upstream's lazy `yaml`/JSON fallback, and always preserve JSON compatibility.
- **BLOCKING RISKS:** absent `model-probe` wire implementation; host schema/runtime spelling mismatch for Ollama (`ollama` vs `ollama-chat`); profile/XDG-aware agent directory; command handler type requires `(args, ctx)` and `Promise<void>`; provider API/compat fields must be validated against host schema rather than upstream `any`.
