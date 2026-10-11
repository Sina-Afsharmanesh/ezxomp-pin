# better-custom

## Purpose

Defines the durable, typed boundary for the custom-provider wizard extension. Persistence (src/config.ts), endpoint discovery (src/probe/), prompts and selection UI (src/ui/), model editing (src/model-entry.ts), provider workflows (src/flows/), and command wiring including native registration and the /better-models browser (src/index.ts, src/model-browser.ts) live behind these contracts.

## Ownership

This subtree owns the @ezxomp/better-custom package, its host-neutral types, and its local package guidance. Keep changes scoped to this plugin unless a root workspace or verification rule must change.

## Local Contracts

- The package has no runtime dependencies. Do not add external packages; use the pinned @oh-my-pi/* peers and Bun/TypeScript built-ins.
- The host API field must use exactly one of: openai-completions, openai-responses, anthropic-messages, google-generative-ai, or ollama-chat.
- Keep peer versions pinned to 17.3.8, keep dependencies exactly empty, and preserve the omp extension manifest.
- Shared contracts in src/types.ts stay free of host-package imports so config, probe, UI, and flow modules can consume them without pulling implementation details across boundaries.
- Source layout: src/{types,config,url,api-key,presets,model-entry,model-browser}.ts, src/ui/{select,prompts,model-view}.ts, src/probe/, src/flows/, and src/index.ts.

## Work Guidance

Prefer the smallest existing OMP primitive at each integration edge. Preserve unknown provider/model fields during edits, avoid logging credential values, and keep interactive behavior behind the command/UI context seams.

Provider renames persist before live registry synchronization and success notice. Probe reasoning evidence preserves `false` through parsing, model construction, and refresh; refreshed `false` clears stale host/legacy thinking fields and persists `reasoning: false` to block host reference defaults. Without fresh tier evidence, refresh preserves custom wire effort overrides. Ollama's placeholder applies only when no credential was supplied; literal, `$ENV`, and `!command` references remain unchanged.

Gateway detection (src/probe/ollama.ts) is strictly ordered: OmniRoute's `/api/health` marker (`status: "ok"` + non-empty timestamp, no API key) before the 9router `/api/version` shape, before native `/api/tags`; a confirmed marker selects the real `/v1/models` catalog even when empty. Effort tiers are open-vocabulary — raw gateway spellings persist as `effortMap` values (`none` is a disable sentinel; provider-native values like `ultra` project monotonically onto the six positive host selectors; more than six positive tiers leave the map unset). `tool_calling`, `attachment`, `structured_output`, and `temperature` are catalog-shape evidence only: no host sink, never persisted. The `omniroute` gateway preset applies to OpenAI-style flows only; `ollama-chat` auto-detects via the health marker.

## Verification

Focused coverage belongs in test/better-custom*.test.ts. Run the relevant focused test first, then run the root just verify gate before claiming the plugin boundary is ready.

## Child DOX Index

- src/types.ts — host-neutral provider, credential, probe, model-edit, and command/UI contracts.
- src/config.ts and src/api-key.ts — persistence and credential serialization seams.
- src/model-browser.ts — native provider registration, unified view building, and the free-model classifier; src/ui/model-view.ts — the /better-models picker surface.
- src/probe/ and src/flows/ — discovery and provider workflows. The Ollama probe additionally detects 9router gateways (`/api/version` marker carrying `currentVersion` without Ollama's `version` field) and prefers their real `/v1/models` catalog over the static placeholder `/api/tags`; probed gateway `thinkingFormat` evidence enables `supportsReasoningEffort` on `ollama-chat` compat, while genuine Ollama stays effort-disabled.
- test/better-custom*.test.ts — focused root tests for each slice.
