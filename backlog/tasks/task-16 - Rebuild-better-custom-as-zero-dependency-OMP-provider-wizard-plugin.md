---
id: TASK-16
title: Rebuild better-custom as zero-dependency OMP provider-wizard plugin
status: Done
assignee: []
created_date: '2026-08-21 19:04'
updated_date: '2026-08-23 02:42'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/real-wudaoshi/better-custom'
priority: high
type: feature
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port https://github.com/real-wudaoshi/better-custom (pi extension `/custom-provider`: interactive wizard adding/editing/deleting custom LLM providers in models.json/models.yml) into this monorepo as an OMP-native plugin under plugins/, following the existing plugin schema used by sibling plugins (@ezxomp/* naming, package.json "omp" manifest field with extensions array, @oh-my-pi/* peers at 17.3.8, files/keywords conventions).\n\nHard constraint: NO external dependencies. Upstream depends on the `yaml` package for OMP models.yml handling and on its separate model-probe package; the rebuild must achieve equivalent behavior with only @oh-my-pi/* peer imports and stdlib (upstream's own no-yaml fallback path — JSON configs fully working, clear error on genuine YAML, new OMP configs written as JSON — defines the acceptable contract).\n\nFeature surface to port (from upstream README): add/edit/delete provider flows, five provider styles (openai-completions, openai-responses, anthropic, google-generative-ai, ollama), API key modes incl $ENV/!command passthrough, auto-probe /models with path-adaptive variants, gateway presets (LiteLLM, One API, New API, OpenRouter, generic), metadata auto-detection tiers (gateway > known-model local rules > defaults), multi-select model picker with inline metadata, per-model edit menu (reasoning ceiling, vision, context window, max tokens, headers/baseUrl override, delete), rename/delete provider, developer-role probe, thinkingLevelMap writing.\n\nUpstream source layout for porting reference: index.ts (entry), src/{types,config,url,api-key,presets,model-entry}.ts, src/ui/{select,prompts}.ts, src/flows/{add,edit,delete,shared}.ts.\n\nType: feature. Labels: feature, architecture. Priority: High (operator order).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New plugin directory plugins/better-custom exists with package.json following the ezxomp omp manifest schema ("omp": {"extensions": [...]}, peer deps limited to @oh-my-pi/* packages, no runtime dependencies)
- [x] #2 Plugin registers a slash command that interactively adds, edits, and deletes custom LLM providers in the running host's agent-directory models config (models.json for Pi, models.yml/yaml/json for OMP) without hand-editing
- [x] #3 Provider styles supported: OpenAI Chat Completions, OpenAI Responses, Anthropic-compatible, Gemini, Ollama-compatible
- [x] #4 Zero external runtime dependencies: all functionality works using only @oh-my-pi/* peer packages and Node/Bun built-ins; genuine-YAML configs that cannot be parsed without a yaml lib produce a clear error and JSON fallback behavior matches upstream
- [x] #5 Model entries carry contextWindow/maxTokens/vision/reasoning/thinkingLevelMap fields consistent with upstream output format
- [x] #6 bun test suite covers config load/save round-trip, model entry mutation preserving untouched fields, and unique-name enforcement
- [x] #7 just verify passes at project root
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach
Port better-custom as a dependency-free, layered OMP extension. Establish the package/types boundary first, complete config/model/UI in parallel, then add a fresh probe engine, provider flows, and only then wire the command and root verification gate.

## Steps
1. TASK-16.1 — targets: plugins/better-custom/package.json, src/types.ts, AGENTS.md | risk: an invalid OMP manifest or an upstream-only type leaks into every later slice | verify: inspect package metadata and compile shared type imports without external dependencies.
2. TASK-16.2, TASK-16.3, TASK-16.4 in parallel — targets: src/config.ts + src/api-key.ts; src/model-entry.ts; src/ui/{select,prompts}.ts | risk: format loss, incorrect host API/thinking fields, or unsupported UI calls | verify: focused root tests for persistence/model mapping and UI helper seams.
3. TASK-16.5 after TASK-16.3 — targets: src/probe/*, src/presets.ts, src/url.ts | risk: absent upstream model-probe behavior, unsafe endpoint fallback, or secret disclosure | verify: mocked-fetch tests for preset routing, metadata parsing, URL candidate order, and developer-role wire shape.
4. TASK-16.6 after config/UI/probe — targets: src/flows/{add,shared}.ts | risk: duplicate names, cancellation writes, or bypassed config serialization | verify: add-flow tests prove one mapped provider/model is saved only after valid completion.
5. TASK-16.7 and TASK-16.8 after TASK-16.6 — targets: src/flows/edit.ts and src/flows/delete.ts | risk: collateral mutation/deletion or inconsistent persistence | verify: targeted edit/delete tests preserve unowned fields and prove all cancel/confirmation no-op paths.
6. TASK-16.9 after all flows — targets: src/index.ts, README.md, CHANGELOG.md, test/better-custom*.test.ts, test/smoke-plugins.test.ts | risk: loader/handler mismatch or a passing focused suite that fails the repository gate | verify: extension smoke/command-routing tests, focused better-custom suite, then just verify.

## Risks
- Bun YAML is runtime-specific: capability-check it and preserve JSON-only fallback behavior.
- Upstream model-probe is absent: define and test only the documented fetch contract locally.
- Host and upstream Ollama spellings differ: write ollama-chat and apiKey ollama consistently.
- Shared model/config mutations can damage user config: use targeted immutable-preserving updates and tests.
- Custom UI has no native multiselect/spinner: use ui.custom and setWorkingMessage only.

## Verification
- [ ] Every child ticket has its stated focused root test evidence.
- [ ] Command loading/routing is smoke-tested without network access.
- [ ] just verify passes after the final integration ticket.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planning evidence: read TASK-16 and doc-2 in full; inspected upstream layer boundaries and local plugin/test conventions. Created TASK-16.1, TASK-16.2, TASK-16.3, TASK-16.4, TASK-16.5, TASK-16.6, TASK-16.7, TASK-16.8, TASK-16.9 with direct dependency edges so config, model-entry, and UI can proceed in parallel after the package boundary. Fixed decisions retained: Bun-YAML capability fallback, host API spellings, host thinking translation, native/custom UI split, fresh fetch probe, and root-level test coverage.
<!-- SECTION:NOTES:END -->
