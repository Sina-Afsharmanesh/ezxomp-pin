---
id: TASK-16.3
title: Translate provider models into host-compatible model entries
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-21 21:37'
labels:
  - feature
  - architecture
dependencies:
  - TASK-16.1
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/model-entry.ts
  - /tmp/better-custom-research/src/types.ts
  - >-
    node_modules/@oh-my-pi/pi-coding-agent/src/config/models-config-schema-bundle.ts
modified_files:
  - plugins/better-custom/src/model-entry.ts
  - test/better-custom-model-entry.test.ts
parent_task_id: TASK-16
priority: high
type: feature
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the pure model-entry and local metadata layer for better-custom. It must be independently usable by the later probe and flow tickets and must not import the upstream model-probe package or UI modules.

Targets: plugins/better-custom/src/model-entry.ts and root test/better-custom-model-entry.test.ts.

Required contract:
- Build and read provider/model entries using the host schemas and exact APIs: openai-completions, openai-responses, anthropic-messages, google-generative-ai, and ollama-chat. For Ollama write apiKey: "ollama" and api: "ollama-chat".
- Preserve contextWindow, maxTokens, headers, per-model baseUrl overrides, input vision capability, and reasoning data while changing only the requested model property.
- Translate upstream thinkingLevelMap on write into host thinking { mode, efforts[], defaultLevel?, effortMap }, using the host ReasoningEffortMap levels. Never emit an unknown thinkingLevelMap property. On read, derive the reasoning ceiling by precedence max, then xhigh, then the highest non-null ordinary level.
- Implement local known-model fallback rules for OpenAI, Anthropic, DeepSeek, Qwen, Kimi, GLM, Gemini, Llama, Mistral, and GPT-OSS. Probe metadata wins over local rules, and local rules win over defaults.
- Keep the layer deterministic and dependency-free so probe adapters can pass metadata as typed input.

Tests must prove host API mapping, Ollama spelling/credential behavior, lossless targeted model mutation, and thinking translation/read-back precedence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each supported provider style produces a host-valid model entry with the correct API spelling and retains requested context, output, vision, headers, and per-model endpoint data.
- [x] #2 A targeted model edit preserves unrelated model and provider fields while changing only the selected property.
- [x] #3 Thinking maps are written as host thinking fields and read back with max > xhigh > highest-non-null ceiling precedence.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-21 21:09
---
Implemented plugins/better-custom/src/model-entry.ts and test/better-custom-model-entry.test.ts. Build/read/mutate helpers emit host API spellings, translate thinkingLevelMap into host thinking fields without legacy leakage, preserve targeted unknown/provider/model fields, and layer local known-model rules under detected metadata and defaults. Verification: `bun test test/better-custom-model-entry.test.ts` exited 0; `bun run check` exited 2 on pre-existing workspace diagnostics but emitted 0 diagnostics mentioning plugins/better-custom.
---

created: 2026-08-21 21:11
---
Final verification rerun after probe-id fallback refinement: `bun test test/better-custom-model-entry.test.ts` exited 0; `bun run check` exited 2 only for unrelated pre-existing workspace diagnostics and still emitted zero better-custom diagnostics.
---

created: 2026-08-21 21:15
---
Hardened probe metadata boundaries to accept structurally typed future probe results without requiring an index signature; final focused test passed and check still emitted zero better-custom diagnostics.
---

created: 2026-08-21 21:30
---
Applied judge corrections: every model now resolves detected metadata > exact local rules > defaults even when infoById has no entry; probe seams use typed ModelProbeMetadata aligned to src/types.ts; BuildProviderConfigInput now accepts only string model IDs and no longer advertises dropped object models. Added manual-model regression coverage for qwen3-vl local metadata and unknown-model defaults. Programmatic comparison of the 65 local rules against /tmp/model-probe/package/rules.json reports zero deltas (count and every pattern/value match). Verification: focused Bun test exited 0; bun run check emitted zero better-custom diagnostics (exit 2 only unrelated workspace diagnostics).
---

created: 2026-08-21 21:34
---
Documented and tested final precedence: detected probe metadata > caller-explicit options > local known-model rules > defaults. Focused tests now pin detected-over-caller, caller-over-local, local-over-default, and unknown-id defaults. Verification: 7 focused tests passed (77 assertions); bun run check emitted zero better-custom diagnostics.
---

created: 2026-08-21 21:37
---
REVIEW_PASSED — final adversarial review scoped to plugins/better-custom/src/model-entry.ts and test/better-custom-model-entry.test.ts. Verified focused suite: `bun test test/better-custom-model-entry.test.ts` → 7 pass, 77 assertions. Manual probes verified all five host API spellings, Ollama `apiKey: "ollama"`, provider baseUrl/headers isolation, deep targeted mutation preservation, host thinking translation/read-back precedence, and manual fallback outputs (qwen3-vl/gpt-4o/unknown). The four-level precedence is documented and pinned by non-tautological tests: detected > caller-explicit > local > defaults. Parsed 65-rule table has zero semantic deltas vs `/tmp/model-probe/package/rules.json`; source has no `any` and probe seams are typed `ModelProbeMetadata`. `bunx tsc --noEmit` exits 2 on unrelated workspace diagnostics but emits zero better-custom diagnostics. No blockers or follow-ups.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Model-entry translation layer delivered: src/model-entry.ts + test/better-custom-model-entry.test.ts. Five styles → host API literals incl ollama-chat (apiKey "ollama"); targeted mutation provably preserves unrelated fields; thinkingLevelMap → host thinking {mode,efforts,defaultLevel?,effortMap} with zero legacy emission; read-back ceiling max>xhigh>highest-non-null. Local-rules table: exact 65-rule port of upstream model-probe rules.json, programmatic zero-delta verified (gpt-4.1 1047576, exact qwen patterns). Four-level precedence documented + boundary-pinned: detected > caller-explicit > local > defaults. Probe seams typed ModelProbeMetadata, no any. Manual-entry regression: qwen3-vl/gpt-4o get local values, unknown ids get defaults. Verification: focused 7 pass/77 assertions; zero better-custom tsc diagnostics. Judge: FIX(tier-always-resolve + typing + input narrowing)→hardening(precedence docs/tests)→REVIEW_PASSED.
<!-- SECTION:FINAL_SUMMARY:END -->
