---
id: TASK-16.11
title: >-
  Polish better-custom follow-up delta per standards review (dedupe confirm
  copy, drop dead aliases, tagged token result, extract merge helper)
status: Done
assignee: []
created_date: '2026-08-22 04:44'
updated_date: '2026-08-23 01:52'
labels:
  - refactor
dependencies: []
parent_task_id: TASK-16
priority: low
type: enhancement
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Standards-axis review of the 16.x follow-up delta (post Judge16x REVIEW_PASSED) recorded six judgement-call findings. No contract violations; pure maintainability polish on files that just cleared three correctness gates.

Findings (file:line at review time):
1. [DUPLICATE] prompts.ts:407 ↔ edit.ts:328 — built-in-id override confirm title+message verbatim in promptProviderId and renameProvider; extract shared constant/helper.
2. [SPECULATIVE] model-entry.ts:172-173,237-238,548-549,566 + prompts.ts:44 — eight zero-caller alias exports (knownModelInfo, getLocalModelInfo, translateThinkingLevelMap/Map, updateModelEntry, setModelProperty, SUPPORTED_PROVIDER_APIS, setProgressMessage); delete (index.ts does not re-export them).
3. [DUPLICATE+CONVENTION] edit.ts editSingleModel — parallel tri-state ternary chains for context/max-tokens differing only in property/messages → extract applyTokenResult. TokenPromptResult literal union is justified but is a third outcome convention beside value|null and kind-tagged unions; since updateModel's sink takes unknown, dropping the "invalid" check still compiles — a tagged union would make mishandling a type error.
4. [LONG METHOD] refreshProviderModels (~45 lines) — merge mechanics dense ({...model,...refreshed} depends on buildModelEntry omitting undefined; JSON.stringify change detection key-order-sensitive); authority-rule intent documented but buried → extract mergeProbedModels.
5. [FRAGILE] prompts.ts promptProviderId — notify severity chosen via gate.message.endsWith("required.") (message text as control flow); encode severity in ProviderIdGate. Rename path hardcodes "warning".
6. Nit — applyModelMutation headers branch mixes early-return if{} with dangling else-if chain (deliberate silent ignore is test-documented).

Constraints: zero dependencies; add/ui/delete/model-entry suites must stay green without weakening; byte-proof no-write assertions preserved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 Built-in-id override confirm title+message exists once (shared constant/helper consumed by both promptProviderId and renameProvider); both flows' suites stay green untouched.
- [x] #2 #2 Zero-caller alias exports removed from model-entry.ts and prompts.ts (grep proves no repo references); root tsc exit 0.
- [x] #3 #3 editSingleModel token handling uses one shared applier and a tagged TokenPromptResult whose 'invalid' state must be handled to compile; edit-flow suite green.
- [x] #4 #4 refreshProviderModels delegates to an extracted merge helper carrying the authority-rule intent; refresh tests unchanged and green.
- [x] #5 #5 ProviderIdGate carries notify severity; message-text control flow gone from promptProviderId.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
[worker 2026-08-22] All five findings + nit implemented; zero deps added; no test files touched.
1. DUPLICATE: new `builtinOverrideConfirm(id): {title,message}` exported from ui/prompts.ts; promptProviderId and renameProvider both consume it — verbatim title/message now exists once.
2. SPECULATIVE: removed all eight alias exports (knownModelInfo, getLocalModelInfo, translateThinkingLevelMap, translateThinkingMap, updateModelEntry, setModelProperty from model-entry.ts; setProgressMessage from prompts.ts) plus SUPPORTED_PROVIDER_APIS. Pre-edit repo-wide scan (.ts/.tsx/.js/.mjs/.md/.json/.toml/.yml across plugins/, test/, scripts/, docs/ minus archives/node_modules) found every name only at its own definition site and in this ticket's spec text; index.ts re-exports none of them. Post-edit code sweep: 0 references. Dropped the now-unused PROVIDER_APIS import from model-entry.ts.
3. TAGGED: TokenPromptResult is now a kind-tagged union ({cancel|keep|invalid{message}|set{tokens}}); promptContextWindow/promptMaxTokens delegate to one shared promptTokenCount (identical parse semantics); editSingleModel's two ternary chains replaced by applyTokenResult carrying only property/notices. Exhaustiveness proven by negative compile check: deleting the invalid branch yields TS2339 on .tokens (exit 1), restored byte-exact afterward (verified).
4. LONG METHOD: refreshProviderModels' mutate body reduced to style resolution + mergeProbedModels(modelsOf(latest), collected, currentStyle) + unchanged notice; helper carries the authority-rule doc comment (observed fields overwrite stale/local defaults; connection overrides and unknown keys persist). Change detection moved to sameSerializedModels comparing element-by-element at matching indexes (length guard first), so key insertion order within a single entry no longer matters while behavior stays identical for all suite fixtures.
5. FRAGILE: ProviderIdGate.invalid gains required notify: UiNoticeType (gateProviderId returns error for missing-name, warning for collisions); both promptProviderId and renameProvider notify via gate.notify — message.endsWith control flow deleted; rename no longer hardcodes "warning".
6. Nit: applyModelMutation tail normalized to early-return style; input branch wraps its documented silent-ignore with a comment.
Verification: bunx tsc --noEmit exit 0; bun test add/ui/delete/model-entry/edit suites = 50 pass / 0 fail across 5 files; byte-proof no-write assertions untouched (all cancel/collision tests still assert exact file bytes). CHANGELOG [Unreleased]/Changed entry added. Not committed.

Changed files: plugins/better-custom/src/ui/prompts.ts, plugins/better-custom/src/flows/edit.ts, plugins/better-custom/src/model-entry.ts, CHANGELOG.md.

Judge follow-ups (non-blocking) recorded for future touch: types.ts:28 PROVIDER_APIS zero-caller alias; sameSerializedModels note wording.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: cook-judge
created: 2026-08-22 23:18
---
[verdict] REVIEW_PASSED — 0 blocking, 2 follow-ups. Independently verified against end-state files (uncommitted delta): AC#1 builtinOverrideConfirm defined once prompts.ts:329-336, consumed by promptProviderId prompts.ts:416 and renameProvider edit.ts:350 (import edit.ts:25); confirm copy string repo-unique to prompts.ts:332. AC#2 all 8 aliases + SUPPORTED_PROVIDER_APIS gone (git grep excl. backlog: sole residual is types.ts:28, see follow-up 1); PROVIDER_APIS import absent from model-entry.ts; root tsc --noEmit re-run by judge: exit 0, 0 errors. AC#3 TokenPromptResult is 4-variant kind-tagged union (only 'set' carries tokens); shared parse promptTokenCount; applyTokenResult edit.ts:200-215 (invalid→false, cancel/keep→unchanged, fall-through narrowed to .tokens) consumed at edit.ts:262+274; negative-compile claim spot-checked structurally: deleting the invalid guard leaves 'invalid' in the narrowed union at edit.ts:214 where .tokens is accessed → TS2339, claim sound. AC#4 mergeProbedModels edit.ts:526-549 carries authority-rule JSDoc edit.ts:519-525, sole caller edit.ts:578; sameSerializedModels edit.ts:514-515 length-guard + per-index. AC#5 ProviderIdGate.invalid carries notify: UiNoticeType prompts.ts:325; gateProviderId error prompts.ts:349 / warning prompts.ts:353; both flows notify via gate.notify (prompts.ts:411, edit.ts:342); endsWith absent from prompts.ts/edit.ts (only legit URL parsing in probe/metadata.ts:162, probe/index.ts:114). Suites: recorded evidence 50 pass / 0 fail across 5 files, byte-proof assertions intact, no test files touched — accepted, nothing smelled wrong.
---

author: cook-judge
created: 2026-08-22 23:18
---
[follow-up] plugins/better-custom/src/types.ts:28 — `export const PROVIDER_APIS = PROVIDER_STYLES;` is now a zero-caller alias repo-wide (this delta removed its only importer), i.e. the same speculative-export class finding #2 targeted, just outside the ticket's named files. Fix: delete the line; zero references proven by git grep. Not an AC violation (AC#2 scope was model-entry.ts/prompts.ts).
---

author: cook-judge
created: 2026-08-22 23:18
---
[follow-up] plugins/better-custom/src/flows/edit.ts:514-515 + implementation notes — sameSerializedModels is predicate-identical to whole-array JSON.stringify equality (concatenated-string equality ⟺ length-equal AND per-index element equality) and therefore REMAINS intra-entry key-order sensitive; the note's claim that 'key insertion order within a single entry no longer matters' overstates the robustness gained (actual safety comes from deterministic construction upstream: buildModelEntry/modelOptionsFromProbe). Behavior correct, tests green. Fix: correct the note wording, or serialize with sorted keys if true order-insensitivity is wanted.
---
<!-- COMMENTS:END -->
