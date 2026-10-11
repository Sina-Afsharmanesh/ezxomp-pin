---
id: TASK-16.9
title: Expose and verify the completed custom-provider OMP command
status: Done
assignee: []
created_date: '2026-08-21 20:16'
updated_date: '2026-08-22 04:32'
labels:
  - feature
  - architecture
dependencies:
  - TASK-16.6
  - TASK-16.7
  - TASK-16.8
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/index.ts
  - plugins/pix-skills/src/index.ts
  - plugins/pix-skills/package.json
  - test/AGENTS.md
  - CHANGELOG.md
modified_files:
  - plugins/better-custom/src/index.ts
  - plugins/better-custom/README.md
  - CHANGELOG.md
  - test/better-custom-command.test.ts
  - test/smoke-plugins.test.ts
parent_task_id: TASK-16
priority: high
type: task
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the completed layers into the loadable OMP extension and finish the user-facing release record. This ticket is intentionally last: all add/edit/delete behavior must already be implemented and tested before the command dispatch and root verification gate are finalized.

Targets: plugins/better-custom/src/index.ts, plugins/better-custom/README.md, CHANGELOG.md, root command/smoke coverage under test/better-custom*.test.ts and/or test/smoke-plugins.test.ts.

Required contract:
- Default-export an ExtensionFactory that calls pi.registerCommand("custom-provider", { description, handler(args, ctx) }). The handler has the host-required (args, ctx) => Promise<void> signature.
- In interactive UI mode, offer add, edit, and delete routes and invoke the completed flows. In non-interactive/canceled/error cases, exit safely with native notification/message behavior and no config mutation.
- Do not use a named-only export, old @mariozechner imports, hard-coded agent dirs, external dependencies, or a fake UI API.
- Write README installation/use/limitations guidance that truthfully describes the five styles, YAML capability fallback, and security behavior. Add one factual CHANGELOG.md Unreleased entry.
- Consolidate root-level test/better-custom*.test.ts coverage required by the parent: config JSON/YAML round-trip, untouched-field mutation preservation, unique names, thinking translation, probe URL variants with mocked fetch, and extension command loading/routing.

Run the focused better-custom tests, then run just verify at the project root; fix only failures caused by this plugin slice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OMP extension loader accepts the package's default export and /custom-provider safely routes an interactive user to add, edit, or delete behavior.
- [x] #2 Root-level better-custom tests cover the required config, mutation, uniqueness, thinking, probe-URL, and command-loading contracts without real network calls.
- [ ] #3 README and CHANGELOG accurately describe the released capability, and just verify exits successfully at the project root.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `plugins/better-custom/src/index.ts` as the default OMP extension factory. It registers `/custom-provider`, guards for `ctx.hasUI && ctx.mode === "tui"`, routes add/edit/delete through the completed flows, normalizes picker cancellation, and emits a short native error notification for unexpected failures without adding a config-write path.

Added deterministic command coverage through an injected handler seam and one manifest-driven smoke case. Updated the provider README, Unreleased changelog, and root Monorepo package index.

Objective verification: `bun test test/better-custom-command.test.ts test/smoke-plugins.test.ts` passed 13/13. The seven focused provider suites passed 52/52 with 297 expectations. `git diff --check` passed for all TASK-16.9 targets.

Independent TASK-16.9 security review: PASS, no blocking findings. It confirmed the TUI guard executes before picker/flow work, dispatch is a closed three-action route with no argument interpolation, notices are static and do not expose credentials, and this integration introduces neither `exec` nor dependencies.

Two non-blocking follow-ups were identified: static catch copy lacks an action label, and the host-to-local UI boundary uses a TypeScript adapter cast. Kept the static error copy because raw flow errors may contain configuration/credential context and the required behavior is a short safe notice; the cast is constrained to OMP's typed registered-command boundary and avoids duplicating host UI validation at runtime.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-22 00:15
---
TASK-16.9 verification provenance

Changed: default `@ezxomp/better-custom` extension factory and `/custom-provider` router; focused command and loader coverage; truthful install/use/security documentation; one Unreleased entry; root workspace index.

Why: expose the completed add/edit/delete flows through the OMP loader while preserving interactive-only and no-extra-write behavior.

Passed: `bun test test/better-custom-command.test.ts test/smoke-plugins.test.ts` → 13 pass, 0 fail. `bun test test/better-custom-config.test.ts test/better-custom-model-entry.test.ts test/better-custom-ui.test.ts test/better-custom-probe.test.ts test/better-custom-add-flow.test.ts test/better-custom-edit-flow.test.ts test/better-custom-delete-flow.test.ts` → 52 pass, 0 fail, 297 expectations.

`just verify` ran and exited 2 during `bun run check`, before its test phase. Exact combined output was retained at `/tmp/ezxomp-task-16.9-just-verify.log` (175808 bytes; SHA-256 `e854444ff64dc01954fe2ea028c73063e94d3832d39b14df12b7bbbc029d3526`). It contains 878 TypeScript diagnostics: 874 under `plugins/extensible-workflows/node_modules/**`; 4 only in `test/workflowz-observability.test.ts` at lines 86, 87, 92 (`WorkflowActivityState` missing `observedTitle`/`observedMessage`) and 119 (string passed to boolean `expect`). Diagnostic paths outside those two pre-existing locations: none. Occurrences of `better-custom` in the complete output: 0. This slice therefore caused zero residual failures; AC #3 remains unchecked because the required root gate did not exit 0.

Scope check: new TASK-16.9 files are `plugins/better-custom/src/index.ts` and `test/better-custom-command.test.ts`; target edits are `plugins/better-custom/README.md`, `CHANGELOG.md`, `test/smoke-plugins.test.ts`, and root `AGENTS.md`. `git diff --check` for these targets exited 0.
---

created: 2026-08-22 00:32
---
[judge] TASK-16.9 independent adversarial review — VERDICT: PASS, no blockers.

Contract (plugins/better-custom/src/index.ts): default-export factory `customProviderWizard(pi: ExtensionAPI)` at L69 registers `custom-provider` with `{description, handler}` (L70-73); handler is `(args, ctx) => Promise<void>` via createCustomProviderHandler (L42-44, L52). Interactive guard `ctx.hasUI && ctx.mode === "tui"` executes before picker/flows (L53-56); non-interactive ⇒ info notify + return, zero flow calls/writes (test-asserted). Picker cancel maps selectOne null → clean return (L36-39, L61). Flow exceptions caught top-level with non-empty error catch → static notify, no config writes (L58-65; discarding the error object is deliberate credential-context safety, not silent swallow). Imports: @oh-my-pi/pi-coding-agent types only + sibling flows/ui/types; no @mariozechner, no bare "pi", no hardcoded ~/.pi, pkg.dependencies = {}.
---

created: 2026-08-22 00:32
---
[judge] Tests: independently ran all 9 suites — command 5, smoke 8, config 6, model-entry 7, ui 5, probe 10, add 10, edit 10, delete 4 = 65 pass / 0 fail (matches reported 13 + 52/297 expectations). test/better-custom-command.test.ts asserts registration, description, async handler, closed three-action dispatch, cancel cleanliness, non-interactive zero-mutation with exact notice copy, and throw-path error notice with zero writes. test/smoke-plugins.test.ts diff is pure insertion (manifest-driven load of omp.extensions[0] + default-factory registration probe); no existing case weakened. AC#2 coverage grounded: duplicate-name rejection without byte changes (add-flow L199, edit-flow L269/L291), normalizeEndpoint URL variants for /chat/completions|/responses|/messages|/models with injected fetch (probe suite L58-61, L228, L246), config round-trip/mutation/thinking suites all green.
---

created: 2026-08-22 00:32
---
[judge] README truthfulness audit: five styles match types.ts ProviderStyle exactly incl host spelling `ollama-chat` (doc-2 Ollama mismatch risk resolved in code, ui/prompts.ts L213). YAML paragraph matches config.ts behavior precisely: capability-detected Bun YAML via dynamic import (L30-46), injectable codec, null ⇒ JSON-only parse accepting JSON-as-YAML and rejecting genuine YAML with actionable error without rewrite (L135-166), stringify null ⇒ indented JSON valid as YAML (L187-205). API-key modes $ENV/!shell/literal/none match api-key.ts serializeApiKey; resolution only via resolveApiKeyForProbe called solely from the probe runner (flows/shared.ts L248); grep across all plugin sources found zero console/logger — "never logged" claim holds. Delete re-read claim understated if anything: delete.ts re-reads after selection AND after confirmation with JSON snapshot compare (L30-48). Install cmd `omp plugin link <path> --scope user` matches precedent (plugins/skills & pix-skills READMEs). No overclaims (no models.dev catalog assertion).
---

created: 2026-08-22 00:32
---
[judge] CHANGELOG: exactly one new factual Unreleased entry (L11, @ezxomp/better-custom zero-dependency /custom-provider wizard add/edit/delete) — every claim verified against package.json/src; style consistent with neighboring entries. Root AGENTS.md Monorepo list correctly appends @ezxomp/better-custom; NOTE: working-tree diff carries a second unrelated hunk (global system-prompt overrides line ~L144) attributable to the separate system-prompt work stream (root SYSTEM.md/APPEND_SYSTEM.md deletions + docs/omp-agent-v1 doc + CHANGELOG L17-20 corroborate) — pre-existing dirty-tree state, not scope creep by this slice.
---

created: 2026-08-22 00:32
---
[judge] AC#3 provenance: `just verify` independently reproduced — exit 2 during bun run check with 878 TS diagnostics: 874 under plugins/extensible-workflows/node_modules/**, 4 in test/workflowz-observability.test.ts; occurrences of better-custom in full output: 0. Zero failures caused by this slice exist to fix; ticket restricts fixes to slice-caused failures. Leaving AC#3 unchecked because the root gate does not exit 0 is honest and sound. Follow-ups (non-blocking): index.ts:29 double cast at host→local UI boundary (runtime-safe today, documented); index.ts:53-55 guard-branch notify outside try (safe under typed contract that ExtensionCommandContext.ui is always present).
---

author: orchestrator
created: 2026-08-22 04:32
---
AC#3 provenance update (2026-08-22 04:31): the original blocker is resolved - root-wide `bunx tsc --noEmit` now exits 0 (verified repeatedly after TASK-16.10 tsconfig excludes + extensible-workflows @ezxomp/skills repoint fix; `just check` passes inside just verify). Current `just verify` test-phase failures are exclusively: (a) five documented intentional-RED driver tests in test/workflowz-p3-polish.test.ts belonging to OPEN tasks TASK-15.3.2/15.3.5 (workflowz family, not this slice), and (b) a vitest-style importOriginal usage in committed plugins/pstack-suite/test/parity-foundation.test.ts:10 that bun:test does not provide (portability bug, pre-existing, not better-custom). Zero better-custom-related failures exist in the full output. AC#3 remains unchecked honestly until the workflowz P3 tasks land or the shared-gate scope question is settled; every condition owned by this ticket is met and judged.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Final integration delivered: src/index.ts (default-export ExtensionFactory; registerCommand("custom-provider", {description, handler(args,ctx)}); interactive-mode guard before flows; add/edit/delete routing; picker-cancel clean exit; flow exceptions caught → notify without writes), test/better-custom-command.test.ts (5 tests: registration shape, dispatch routing, cancel, non-interactive guard, throw-safety), smoke-plugins.test.ts new case (real loader registers /custom-provider), truthful README (five styles/host spellings, YAML capability fallback, four API-key modes, security behavior, zero-dep statement), CHANGELOG [Unreleased] entry, root AGENTS.md workspace line updated. Verification: command+smoke 13/13; all seven focused suites 52/52 (297 expectations); just verify residual = 878 diagnostics exclusively pre-existing unrelated (874 vendored extensible-workflows + 4 workflowz-observability; hash-pinned log), zero better-custom mentions; AC#1/#2 checked, AC#3 honestly unchecked pending repo-wide green. Judge: APPROVE, no blockers; README/security claims audited against source.
<!-- SECTION:FINAL_SUMMARY:END -->
<!-- BLOCKER-MARKER: AC #3 (just verify root gate) is blocked-by-upstream -->
<!-- AC #3 remains unchecked because `just verify` test-phase fails on: -->
<!-- (a) 5 intentional-RED driver tests in test/workflowz-p3-polish.test.ts (owned by OPEN TASK-15.3.2/15.3.5) -- STILL ACTIVE -->
<!-- (b) RESOLVED (commit e121ab4, 2026-08-22 11:56 UTC): parity-foundation.test.ts:10 importOriginal portability bug fixed via dual-runtime mock (vitest + bun); tests pass 2/2 under bun today. Plugins suites are outside `just verify` scope (`bun test test/`). -->
<!-- Zero better-custom-related failures; root-wide `bunx tsc --noEmit` exits 0 after TASK-16.10 tsconfig fix. -->
<!-- This task's slice is complete; move to completed/ once TASK-15.3.2/15.3.5 is resolved. -->
