---
id: TASK-59.2
title: Document model registration and unified browsing
status: Done
assignee: []
created_date: '2026-08-24 02:45'
updated_date: '2026-08-24 05:09'
labels:
  - docs
dependencies:
  - TASK-59.1
  - TASK-59.3
  - TASK-59.4
parent_task_id: TASK-59
type: docs
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket 4/4 of TASK-59, runs last after all implementation tickets land.\n\nDocument shipped behavior only: native /model registration + session switching, unified authenticated-provider browsing (provider/family grouping), pi-free/free-model integration. Add truthful ## [Unreleased] CHANGELOG.md entry.\n\nWork in jj workspace /home/egsox/repo/ezxomp-plugin. Targets: plugins/better-custom/README.md, CHANGELOG.md. Also complete the DOX pass for plugins/better-custom/AGENTS.md if local contracts changed.\n\nConstraint: never claim network behavior, credentials, or provider support beyond implemented contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/better-custom/README.md explains custom model registration and session switching through native /model
- [x] #2 Documentation explains authenticated-provider grouping and pi-free/free-model presentation
- [x] #3 CHANGELOG.md contains a truthful entry under ## [Unreleased]
- [x] #4 Documentation does not claim network behavior, credentials, or provider support beyond the implemented contracts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENT (WorkerT301): plugins/better-custom/README.md gains three new sections plus limitations, matching existing tone: (1) 'Native /model registration' — saved providers register into OMP's native registry at load and re-sync after wizard add/edit/delete without restart; selection switches the session; credential references ($ENV/!command/literal) pass through untouched and resolve lazily host-side with no resolution/execution or network at load; built-in provider ids can never be shadowed (skipped at registration). (2) '/better-models browser' — one searchable view over all authenticated providers with provider groups, family groups, metadata labels, canonical provider/id refs resolved through the session model query and host switch seam; distinct from reserved /model; empty-catalog notice. (3) 'Free-model lane' — provider-relative classification (explicit isFree marker wins; zero-cost qualifies only when a positively priced sibling proves pricing exposure; otherwise name heuristic), free models appear in provider+family groups AND the free lane, selectable via the same seam; pi-free providers arrive through the host's own authenticated/auth-hidden-filtered list — single source read, no adapter fetch. Limitations extended: keyless providers (no key/oauth resolvable) skipped at registration and excluded from /better-models with a warning because host validation requires credentials when models are defined; registration covers only the documented host APIs.

CHANGELOG.md: truthful Added entry under ## [Unreleased] covering native registration + lazy references + no-shadowing, the /better-models unified view, and the provider-relative free lane with no runtime dependency on pi-free. AGENTS.md DOX pass: 'Planned source layout' line updated to actual layout (src/model-browser.ts added to modules; src/ui now select,prompts,model-view) and Child DOX Index refreshed (config/api-key no longer 'planned'; new entry for model-browser.ts + ui/model-view.ts). No claims of network behavior, credential resolution timing, or provider support beyond implemented contracts; root/plugins AGENTS.md scope statements unchanged elsewhere. Gates: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. Head: 96f9361d1a04.

Correction round 1 (judge, docs-only): B1 — credential wording made truthful across all three docs. README 'Native /model registration' now separates plugin-side truth (better-custom never resolves/executes references itself; verbatim pass-through; no secret material in plugin state) from host-side truth (host model-registry semantics resolve $ENV/!command at provider registration time — a !command executes at load, mirroring natively configured providers). Limitations gained a matching line. CHANGELOG entry scrubbed: refs pass through untouched, never resolved by the plugin; host resolves them per registry semantics (at registration time). AGENTS.md Purpose line rewritten to present tense listing the now-existing slices (config, probe, ui, model-entry, flows, index/model-browser). R1: README API-key bullet reworded — explicit probe resolution is a wizard affordance only; independently the host may resolve references during registration. R2: free-lane prose aligned with implementation/upstream — zero-or-unpriced cost qualifies within pricing-exposed (paid-sibling) providers; name heuristic otherwise. Gates re-run: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. Head: 06f3eb72015b.

Correction round 1 (judge) — complete summary of all wording fixes (docs-only): (1) README 'Native /model registration' rewritten: plugin never resolves/executes references itself and does not add resolved secret material to its own state; host model-registry semantics resolve $ENV/!command at provider registration time, so a !command executes at load exactly as for natively configured providers. (2) README Limitations gained the matching registration-time resolution line. (3) CHANGELOG entry scrubbed: refs pass through untouched — never resolved by the plugin; host resolves per registry semantics (at registration time). (4) AGENTS.md Purpose line rewritten to present tense listing existing slices. (5) R1: API-key bullet reworded — probe resolution is a wizard affordance only; host may resolve during registration independently. (6) R2: free-lane prose aligned with implementation — zero-or-unpriced cost qualifies within pricing-exposed providers, name heuristic otherwise. Gates: bun test test/better-custom-models.test.ts → exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; jj diff --from ab4132e0ee02 --to @ -- test/ empty. Head: 1ff363ab587d.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: JudgeT301
created: 2026-08-24 05:06
---
REVIEW_PASSED — JudgeT301 final adversarial docs pass (2026-08-24)

Scope and gates:
- Docs baseline is committed classifier head `15df7abc` (the working copy also contains preexisting implementation dirt relative to `5098e38f`; docs delta from `15df7abc` is exactly `CHANGELOG.md`, `plugins/better-custom/AGENTS.md`, and `plugins/better-custom/README.md`).
- `jj diff --from ab4132e0ee02 --to @ -- test/` is empty; `plugins/better-custom/package.json` is unchanged.
- `bun test test/better-custom-models.test.ts` → 3 pass / 0 fail / 13 expects. `bunx tsc --noEmit` → exit 0.

Truthfulness audit:
- README native-registration claims match model-browser/index behavior: registration and add/edit/delete re-sync, built-in shadow blocking, native `/model` selection, and canonical host switching.
- Credential wording was corrected to distinguish plugin behavior from host behavior: the plugin passes `$ENV`, `!command`, and literal references untouched; host registry semantics resolve `$ENV`/`!command` during provider registration. Direct host probe confirmed `!touch /tmp/...` executes at registration, so the docs no longer make a false request-lazy/no-load claim.
- `/better-models` is genuinely searchable: `selectOne` filters by typed query across canonical ref, labels, suffixes, and searchText. Provider/family metadata and canonical refs are implemented.
- Free-lane wording now covers provider-relative pricing context and zero or unpriced cost fields; it matches the classifier's explicit-marker/name/adaptive-cost behavior and does not claim a pi-free runtime dependency.
- Keyless limitations, host API support boundaries, and no-network guarantee are not overclaimed; gateway probing is documented only in the existing discovery section where it is implemented.
- CHANGELOG entry is under `## [Unreleased]` / `### Added`, introduces no version/date, and truthfully scopes native registration, host credential semantics, unified browsing, and free-lane behavior.
- AGENTS Purpose, source layout, and Child DOX Index now match actual files: `src/model-browser.ts`, `src/ui/model-view.ts`, persistence, probe, prompts, model editing, flows, and command wiring; no stale planned-layout statements remain.

Acceptance assessment:
- AC#1 proven: README explains native custom registration and session switching.
- AC#2 proven: authenticated provider grouping plus pi-free/free-model virtual lane are documented accurately.
- AC#3 proven: truthful Unreleased changelog entry exists.
- AC#4 proven after credential-timing rewrite: docs do not claim plugin-side resolution, unsupported provider coverage, or false no-load credential behavior.

FOLLOW-UP (non-blocking): README line 56's phrase “no secret material enters its state” should ideally say “no resolved secret material is added by registration,” since literal keys are intentionally stored in the models configuration and loaded by the process. This is clarifying language; surrounding API-key documentation already states literal-key storage.

No blocking findings remain. Task status and acceptance fields were not modified by the judge.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Documentation shipped truthfully across three surfaces: plugins/better-custom/README.md gains sections for native /model registration (load-time registration, no-restart re-sync after wizard mutations, session switching, builtin ids never shadowable), the distinct /better-models unified browser (provider/family groups, metadata, canonical provider/id refs through the host switch seam), and the free-model lane (provider-relative classification: explicit isFree marker wins; zero-cost-or-unpriced within pricing-exposed providers; name heuristic otherwise; pi-free arrives via host auth/hidden-filtered list with no runtime dependency). Root CHANGELOG.md carries a truthful ## [Unreleased] Added entry. DOX pass completed: plugins/better-custom/AGENTS.md layout line reflects src/model-browser.ts + src/ui/model-view.ts; stale future-tense Purpose line rewritten present-tense.\n\nTruthfulness hardening via judge rounds: credential-reference wording corrected from false lazy/no-load claim to verified host behavior — plugin passes refs untouched without resolving/executing or adding resolved secrets to its own state; HOST ModelRegistry resolves $ENV/!command synchronously at provider registration (judge live-proved: !touch marker created immediately via registerProvider), so extension load can execute registered commands exactly as for natively configured providers. Gates unchanged: bun test test/better-custom-models.test.ts exactly 3 pass / 0 fail; bunx tsc --noEmit exit 0; source/tests untouched vs classifier baseline 15df7abcd7a3. Head 1ff363ab (change qzqstvxv).
<!-- SECTION:FINAL_SUMMARY:END -->
