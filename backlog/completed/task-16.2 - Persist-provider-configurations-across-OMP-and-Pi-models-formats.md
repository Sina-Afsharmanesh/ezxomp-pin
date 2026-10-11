---
id: TASK-16.2
title: Persist provider configurations across OMP and Pi models formats
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-21 21:31'
labels:
  - feature
  - architecture
dependencies:
  - TASK-16.1
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/config.ts
  - /tmp/better-custom-research/src/api-key.ts
  - test/AGENTS.md
modified_files:
  - plugins/better-custom/src/config.ts
  - plugins/better-custom/src/api-key.ts
  - test/better-custom-config.test.ts
parent_task_id: TASK-16
priority: high
type: feature
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the configuration and credential boundary for better-custom, building on the typed package foundation. This ticket owns config format discovery, parse/save behavior, and API-key serialization; it does not build model normalization, probe transport, UI, or provider flows.

Targets: plugins/better-custom/src/config.ts, plugins/better-custom/src/api-key.ts, and root test/better-custom-config.test.ts.

Required contract:
- Resolve the active agent directory with getAgentDir() from @oh-my-pi/pi-utils; never hard-code ~/.pi/agent.
- In OMP, discover models.yml, then models.yaml, then models.json; use models.yml for a new config. In non-OMP/Pi, use models.json. Preserve the selected path and format when saving.
- Use Bun YAML only through a capability-checked import { YAML } from "bun". When Bun YAML is available, parse and write genuine YAML. On non-Bun runtimes, accept JSON (a YAML subset) and write indented JSON to new OMP models.yml; only genuine YAML that cannot be parsed without Bun YAML raises a clear actionable error.
- Preserve unowned providers and unknown fields while loading and writing; do not log secrets.
- Serialize API key modes exactly: none -> dummy (or ollama for Ollama), environment -> $NAME, shell -> !command, literal -> literal; reverse parsing and probe-only resolution must preserve this contract.

Tests must deterministically cover JSON and YAML round-trips, fallback/error behavior, selected-format preservation, unknown-field preservation, and credential serialization without contacting a network.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A provider config saved from the active agent directory reloads unchanged from models.json and from models.yml/yaml, preserving unrelated provider and unknown fields.
- [x] #2 A new OMP config uses models.yml and is YAML when Bun YAML is available or indented JSON when it is not; an unparseable genuine-YAML file on a non-Bun runtime reports a clear error rather than corrupting it.
- [x] #3 API-key values round-trip across literal, environment, shell, none, and Ollama modes without exposing a resolved secret.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: t16w2-a
created: 2026-08-21 21:04
---
Implemented config persistence in plugins/better-custom/src/config.ts: getAgentDir()-based OMP/Pi discovery with models.yml→models.yaml→models.json precedence, selected-path preservation, Bun YAML dynamic capability detection, JSON-as-YAML fallback, actionable genuine-YAML errors, and unknown-field/provider round-tripping. Added upstream BUILTIN_PROVIDER_IDS export for downstream wizard slices.
---

author: t16w2-a
created: 2026-08-21 21:04
---
Implemented plugins/better-custom/src/api-key.ts: exact dummy/ollama, $ENV, !command, and literal serialization plus reverse parsing; probe resolution is isolated behind injectable env/shell seams and never logs credentials.
---

author: t16w2-a
created: 2026-08-21 21:04
---
Verification: bun test test/better-custom-config.test.ts — 6 pass, 0 fail, 33 assertions. bun run check exits 2 on 927 pre-existing diagnostics, with zero diagnostics attributable to plugins/better-custom or test/better-custom-config.
---

author: t16w2-a
created: 2026-08-21 21:06
---
Follow-up hardening: explicit undefined/null YAML codec arguments now exercise the non-Bun fallback while omitted codec arguments use detected Bun YAML; injected env maps no longer fall through to real process.env, and object-form Ollama serialization preserves style. Re-ran focused test: 6 pass, 0 fail, 33 assertions; bun run check still has zero better-custom diagnostics amid pre-existing workspace errors.
---

author: t16j-16.2
created: 2026-08-21 21:21
---
[blocking] plugins/better-custom/src/config.ts:144 and :188 — `arguments.length >= 3` treats an explicitly passed `undefined` codec as “Bun YAML unavailable,” even though the optional parameter’s normal semantics make omitted and undefined equivalent. This branch is not part of the ticket, doc-2, or upstream contract and exists only as a hidden-test seam; under Bun it silently downgrades genuine YAML to JSON fallback when callers pass `undefined`. Treat only explicit `null` as a capability override (or use an explicit test-only codec seam), otherwise resolve `yamlCodec ?? BUN_YAML`; update the fallback tests accordingly.
---

author: t16j-16.2
created: 2026-08-21 21:21
---
[note] Verification: focused `bun test test/better-custom-config.test.ts` passed 6 tests / 0 failures / 33 expect() calls. Scoped status contains only expected better-custom/task test additions; no deletions. Zero-dependency imports and secret-log scan are clean. Workspace `bunx tsc --noEmit 2>&1` exits 2 with 879 diagnostics; the only `better-custom` diagnostic is in sibling-owned `src/model-entry.ts`, outside TASK-16.2’s exclusive files and ignored per shared-tree scope.
---

author: t16w2-a
created: 2026-08-21 21:23
---
Judge correction applied: removed hidden arguments.length arity behavior from config YAML helpers. The optional codec now follows explicit semantics: omitted or undefined uses capability-detected Bun YAML, a codec object is injected, and null forces JSON-only fallback. Added omitted-codec auto-detection assertion while retaining null fallback/error coverage. Verification: focused test 6 pass, 0 fail, 34 assertions; bun run check exits on pre-existing diagnostics with zero better-custom diagnostics. ACs remain evidenced and checked.
---

author: t16j-16.2
created: 2026-08-21 21:26
---
[blocking] correction re-review — plugins/better-custom/src/config.ts:133-145 still documents the opposite of the corrected codec contract: the comment says “Pass undefined as the codec to exercise the non-Bun fallback,” but the default parameter `yamlCodec: YamlCodec | null | undefined = BUN_YAML` makes omitted and explicit `undefined` auto-detect Bun YAML. Update the parser/writer signature docs to state the three states explicitly: omitted/undefined → detected Bun YAML; codec object → injected codec; null → JSON-only fallback. Implementation behavior itself now matches the corrected three-state contract and contains zero `arguments.length` occurrences.
---

author: t16w2-a
created: 2026-08-21 21:27
---
Updated config parser/writer JSDoc to document all three YAML codec states: omitted/undefined auto-detects Bun YAML, codec objects inject explicitly, and null forces JSON-only fallback; no logic changed.
---

author: t16j-16.2
created: 2026-08-21 21:30
---
[review passed] Final correction round: parser JSDoc at config.ts:133-145 now accurately states omitted/explicit undefined → capability-detected Bun YAML; codec object → injected; null → JSON-only fallback. Writer JSDoc at :183-186 matches the same three states. Confirmed zero `arguments.length` occurrences. Focused `bun test test/better-custom-config.test.ts`: 6 pass, 0 fail, 34 expect() calls. Workspace `bunx tsc --noEmit 2>&1` exits 2 with 878 unrelated diagnostics and zero diagnostics mentioning better-custom/config/api-key/focused test. Scoped TASK-16 status has no deletions. Verdict: REVIEW_PASSED.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Config persistence + credentials delivered: src/config.ts (getAgentDir-based discovery, OMP precedence models.yml→yaml→json, Pi json, path+format preservation on save; Bun-YAML via explicit three-state yamlCodec param — omitted/undefined→auto-detect, object→injected, null→JSON-only; unknown-field + unowned-provider round-trip; clear actionable error on genuine-YAML without codec), src/api-key.ts (none→dummy/"ollama", $NAME, !command, literal; reverse parse; isolated injectable probe resolver), test/better-custom-config.test.ts. Verification: focused 6/6 (34 assertions), zero better-custom tsc diagnostics, zero arguments.length, secret-logging audit clean. Judge rounds: FIX(arity shim)→FIX(docs)→APPROVE. No blockers.
<!-- SECTION:FINAL_SUMMARY:END -->
