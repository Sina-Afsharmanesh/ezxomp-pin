---
id: doc-21
title: Augment regeneration failure modes and root causes for TASK-58.2
type: guide
created_date: '2026-08-31 01:37'
updated_date: '2026-08-31 01:45'
tags:
  - research
---
**Intended type:** research (CLI limitation)

# Augment regeneration failure modes and root causes for TASK-58.2

**Scope:** read-only failure-path investigation of `plugins/augment`; no production or test changes. This is distinct from doc-20, **Durable interactive prompt rewriting for TASK-58**, which contains external precedents and the broader durability design. This document traces current runtime failures and implementation dispositions.

## Evidence policy and conclusion

The only operator-observed fact is that prompt regeneration ‘fails often’ (TASK-58 description). There are no live logs or content-free outcome counters establishing the incidence of an individual surface, so this investigation does **not** assign one root cause to the reported frequency.

One routing defect is directly reproduced: active-session model authentication and completion are used instead of configured `@smol`. `/aug` absence and non-fail-closed missing-SMOL behavior are also reproduced. A separate, non-obvious code-proven surface is potentially more damaging to diagnostics: OMP completion errors can resolve as `AssistantMessage` values with `stopReason: "error"`, but Augment checks only `"aborted"`, drops `errorMessage`, parses the text, and may spend a second full call before reporting a misleading sentinel error.

Evidence classes: **operator-observed** = symptom only; **reproduced** = existing RED output; **code-proven** = established control flow without measured live incidence; **hypothesis** = plausible trigger/frequency explanation not demonstrated here. Severity is impact if encountered, not observed frequency.

## Full enhance path

1. `/augment` trims the draft; empty input returns `Usage: /augment <your prompt>` (`plugins/augment/src/index.ts:10-14`). The rewrite command starts at `index.ts:7`; `index.ts:45` registers only `augment-settings`. `/aug` is absent.
2. The handler imports and calls `enhance` (`index.ts:18-19`). Escaping `Error.message` is shown verbatim; non-`Error` becomes `Enhancement failed.` (`index.ts:38-40`).
3. `enhance` binds inference to `const model = ctx.model`, rejects absence with `No active model. Select a model first.`, loads settings, and resolves auth for that same model (`plugins/augment/src/enhance.ts:17-23`). No `ctx.models.resolve("@smol")` exists; `plugins/augment/src/model-routing.ts:4-14` only detects output family.
4. Settings-read failure becomes `{}` and defaults (`enhance.ts:63-66`). Auth uses `getApiKeyAndHeaders` or legacy `getApiKey`; failures use `auth.error`, `No API key for provider/id`, or the unsupported-runtime upgrade message (`enhance.ts:69-104`). Auth/context construction precede the cancellable loader.
5. Output style follows the active destination model (`plugins/augment/src/context.ts:16-18`). Context uses an approximate 800-token history budget and default depth four (`context.ts:8,21-24,48-71`) and serializes active model, absolute cwd, branch, recent text, and unbounded draft (`context.ts:29-42`; `plugins/augment/src/strategies/shared.ts:57-86`).
6. At most two calls run sequentially (`enhance.ts:32-45`). Attempt two uses the original request plus a generic sentinel reminder (`enhance.ts:33-35,181-189`); it does not include the prior response or specific failure.
7. Each call creates a fresh timeout (`enhance.ts:115-117`), calls `complete` with `maxTokens = min(model.maxTokens, configured maxOutputTokens)` (`enhance.ts:120-124`), and treats only caller abort or `stopReason === "aborted"` as null (`enhance.ts:126`). Local timeout gets fixed copy; other thrown errors escape (`enhance.ts:128-133`).
8. `extractText` concatenates text blocks and ignores `errorMessage` (`enhance.ts:192-197`). Parser precedence is first sentinel block, wrapped `<execution_contract>`, then raw contract with wrapped `task` and `context`; otherwise throw (`plugins/augment/src/parser.ts:18-34,37-45,96-110`).
9. Null becomes `Enhancement cancelled.` (`index.ts:20-22`). Valid output triggers a second settings read for editor review versus immediate send (`index.ts:25-35,52-56`). Review defaults on (`plugins/augment/src/settings.ts:12-18`).

## Failure-surface matrix

| Surface | Exact code-path evidence | Failure behavior | Class | Severity | TASK-58.5 coverage |
|---|---|---|---|---|---|
| **A1 Wrong inference/auth model** | `enhance.ts:17,23,37`: `const model = ctx.model`; `resolveModelAuth(ctx, model)`; `callLLM(model, ...)`. `model-routing.ts:4-14` only has `detectFamily`. | Active provider credentials/latency/cost/output govern regeneration; configured SMOL is ignored. | **Reproduced + code-proven** | Critical | **Yes**, TASK-58.5 AC1. |
| **A2 Missing/misconfigured SMOL is irrelevant today** | No alias lookup. RED `test/augment-routing.test.ts:120-130` expects zero calls and `Augment requires a configured @smol model.` | Current code calls active model when SMOL is absent. This is not a fallback branch; alias resolution is absent. | **Reproduced** | High | **Yes**, TASK-58.5 AC3. |
| **A3 SMOL authentication** | Selected-model auth errors are at `enhance.ts:84-103`. | Unauthenticated SMOL cannot cause current failure because it is never selected. After 58.5 it can fail explicitly before completion. | **Code-proven future surface** | High | **Partial**: correct target yes; credential repair/typed UX no. |
| **B1 Selected-model auth resolution** | `enhance.ts:84-89`: `if (!auth.ok) throw new Error(auth.error ?? ...)`; missing key at 88-89; runtime compatibility at 102-104. | No completion. Registry error passes through; missing-key/runtime messages identify provider or next step. | **Code-proven** | High | No, except selected model changes. |
| **C1 Local timeout** | Default `timeoutMs: 45_000` (`settings.ts:15`); fresh timer `enhance.ts:115-117`; mapped at 130-132. | Timed-out call throws clear error and is not retried because only parser errors are caught. | **Code-proven** | High | No. |
| **C2 Provider error mistaken for invalid output** | Event stream resolves `event.error` (`node_modules/@oh-my-pi/pi-ai/src/utils/event-stream.ts:169-179,191`); `complete` returns genuine non-thinking-loop errors (`node_modules/@oh-my-pi/pi-ai/src/stream.ts:1054-1076,1079-1084`). Augment checks only aborted (`enhance.ts:126`) and extracts only text (`enhance.ts:192-197`). | Resolved `stopReason: "error"` with empty content becomes parser failure, can trigger a second full call, and can finish as sentinel error while losing provider `errorMessage`. Thrown provider errors instead surface verbatim. | **Code-proven** | High | No. |
| **C3 Retry category is response shape** | `enhance.ts:32-45` retries only after parser throw. | Thrown timeout/provider/auth/config errors get no plugin retry; resolved errors/empty output may accidentally get a parse retry. | **Code-proven** | High | No. |
| **D1 Non-success terminal stops are not rejected** | OMP stop reasons are `stop|length|toolUse|error|aborted` (`node_modules/@oh-my-pi/pi-ai/src/types.ts:852`); Augment rejects only aborted (`enhance.ts:126`). | `length`, `toolUse`, or `error` content is parsed. Parseable wrapper can be accepted; otherwise correction call is consumed. | **Code-proven** | High | No. |
| **D2 Empty/wrong-shape success costs a second call** | `enhance.ts:37-45` extracts, catches parser error, and continues once. Attempt two repeats `complete` with same model/token setting plus reminder (`enhance.ts:33-37,181-189`). | Unwrapped/empty/missing-close output spends another request. Fresh timers mean default nominal call budgets can approach 90 seconds, excluding pre-call work. | **Code-proven** | High | No. |
| **D3 Parser contract disagrees with behavior** | Copy says `ENTIRE response` and `exactly one` (`parser.ts:121-136`); unanchored non-global regex returns first match (`parser.ts:40-45`); alternate wrappers accepted (`parser.ts:24-32`). | Preamble, trailing text, or multiple sentinel blocks can be accepted; first wins. Plain unwrapped rewrite fails. Error omits accepted fallback forms. | **Code-proven** | Medium | No. |
| **E1 User cancellation** | Loader abort calls `done(null)` (`enhance.ts:152-170`); signal abort returns null (`enhance.ts:126,129`); null notice at `index.ts:20-22`. | Expected UI cancellation is non-error. Non-UI creates a private controller with no external cancel hook (`enhance.ts:144-147`). | **Code-proven** | Low | No; normal UI path needs no action. |
| **E2 Provider abort labeled user cancellation** | Provider `stopReason === "aborted"` returns same null (`enhance.ts:126`); handler always says cancelled (`index.ts:20-22`). | Provider/runtime abort can look user-initiated. | **Code-proven** | Medium | No. |
| **F1 Error notices vary** | Raw message/fallback at `index.ts:38-40`; timeout copy `enhance.ts:131`; auth `enhance.ts:86-103`; parser `parser.ts:34`. | Timeout/key messages partly actionable. Resolved provider error can collapse to misleading parser notice; thrown messages unclassified; non-Errors lose detail. | **Code-proven** | High | Only missing-SMOL notice by 58.5. |
| **G1 Partial context bounds, no total budget** | History constant 800 and `Math.ceil(text.length / 4)` (`context.ts:8,65-71`); draft verbatim (`context.ts:37`; `strategies/shared.ts:86`); no context preflight before completion. | History is approximately bounded, but total prompt is not checked against model context. Overflow is plausible, not reproduced; C2 can obscure/repeat it. | **Code-proven structure + hypothesis trigger** | Medium | No. |
| **G2 Context/provider boundary changes** | Conversation, cwd, branch, active model, draft serialized (`context.ts:29-42`; `strategies/shared.ts:57-86`). | SMOL may be a different provider. No plugin filtering/disclosure. Privacy impact is not a proven frequency cause. | **Code-proven flow + hypothesis impact** | Medium | No. |
| **G3 Git metadata precedes loader** | Awaited `exec("git", ["branch", "--show-current"])` (`context.ts:27-34`) before loader (`enhance.ts:25-28`). | Slow exec has no loader feedback/Augment deadline; failure itself safely falls back. Live stall not reproduced. | **Code-proven ordering + hypothesis latency** | Low | No. |
| **H1 Settings read silently defaults** | `.catch(() => ({}))` at `enhance.ts:63-66` and `index.ts:52-56`; defaults `settings.ts:12-18`. | Read failure silently changes generation/review. Review is reread after completion, so one command can observe different snapshots. | **Code-proven** | Medium | No. |
| **H2 Hazardous numeric extremes accepted** | Integers only require `>=1`/`>=0` (`settings.ts:28-33,46-54`); overlay has same minima/no maxima (`settings-overlay.ts:81-92`). | One token or one millisecond is accepted and passed through. Live failure at extremes not run. | **Code-proven acceptance + hypothesis outcome** | Medium | No. |
| **H3 Overlay optimistic on save failure** | Local state changes before persistence (`settings-overlay.ts:166-171`); warning at 172-176. | UI shows new value even if later enhancement reloads prior/default. | **Code-proven** | Medium | No. |
| **I1 `/aug` absent** | Only `EXTENSION_COMMAND` and `augment-settings` registered (`index.ts:7,45`). | Short entry point never reaches regeneration. | **Reproduced + code-proven** | High | **TASK-58.6**, not 58.5. |

## Observed reproduction

Existing targeted command `bun test test/augment-routing.test.ts` produced **0 pass / 3 fail** (`artifact://6`); this spike did not rerun user-reported proof.

1. Wrong model: expected `openai/gpt-5.6-mini`; received active `anthropic/claude-opus` at `test/augment-routing.test.ts:98`.
2. Missing command: `error: expected /aug to register` at `test/augment-routing.test.ts:108`.
3. Unavailable SMOL: expected `completedWith` `[]`; received active `anthropic/claude-opus` at `test/augment-routing.test.ts:127`.

No auth, timeout, provider-error, cancellation, truncation, overflow, or save failure was reproduced. Those remain code-proven/hypothesis as labeled. Routing RED does not explain reported frequency by itself.

## ADHD divergence

### Economic
- Wrong routing can spend the active model rather than selected SMOL; price impact depends on provider and is not asserted.
- Wrong-shape success/resolved provider error can spend a second call (`enhance.ts:32-45`).
- Correction gets a fresh timer; there is no total 45-second command deadline.

### Security
- SMOL routing changes processor/provider for draft, history, cwd, branch (`context.ts:29-42`; `strategies/shared.ts:57-86`). Minimize/disclose rather than duplicate host credential validation.
- Raw thrown provider messages surface (`index.ts:38-40`); actual sensitive content is a hypothesis.
- Review-on is a human gate (`settings.ts:18`; `index.ts:25-29`); review-off sends any parser-accepted first block (`index.ts:31-35`).

### Performance
- History is approximately bounded; draft/total prompt are not budgeted against selected context window.
- Correction duplicates the full request sequentially; defaults permit two fresh 45-second timers.
- Output cap is applied (`enhance.ts:124`), but `length` is not validated.
- Auth/settings/git work precedes cancellable loader.

### UX
- No-model, missing-key, runtime, local-timeout copy is relatively clear; failure categories are not uniform.
- Provider error can become sentinel error; provider abort can be called cancelled.
- Parser says exactly one while accepting first match and fallback shapes.
- Review-on mitigates syntactically accepted but semantically bad output.

## Focus: critic scoring, clusters, pruning

Scores 1–5 for novelty (N), viability (V), fit; total is sum. Score does not authorize implementation.

| Candidate | N | V | Fit | Total | Critic disposition |
|---|---:|---:|---:|---:|---|
| Validate terminal stop/non-empty text and preserve provider diagnostic before parser | 4 | 5 | 5 | **14** | **Top non-obvious pick:** fixes resolved-error/parse category error without broad retry. |
| Exact SMOL + fail closed + preserve destination family | 2 | 5 | 5 | 12 | TASK-58.5. |
| Typed content-free outcomes and actionable notices | 3 | 4 | 5 | 12 | Follow-up; measure frequency without prompt logging. |
| One total deadline/remaining budget | 3 | 4 | 4 | 11 | Follow-up. |
| Minimize/disclose optimizer context | 3 | 4 | 4 | 11 | Follow-up after provider boundary change. |
| Align parser/reminder/fallbacks/copy | 2 | 4 | 4 | 10 | Follow-up after strict-vs-tolerant decision. |
| Snapshot settings and report fallback | 2 | 4 | 3 | 9 | Follow-up. |
| Bounds/preflight for timeout/output/total prompt | 2 | 3 | 4 | 9 | Follow-up; avoid false positives. |
| Shared `/aug` | 1 | 5 | 5 | 11 | TASK-58.6. |
| Retry every auth/provider/timeout | 2 | 2 | 1 | 5 | **Pruned:** costly/deterministic/conflicts with host recovery. |
| Silent active fallback | 1 | 5 | 0 | 6 | **Pruned:** violates model contract. |
| Provider-specific credential checks in Augment | 2 | 2 | 1 | 5 | **Pruned:** duplicates host auth. |
| Raw prompt/response logging | 1 | 3 | 0 | 4 | **Pruned:** content-free outcomes suffice. |

## Ranked durability ledger: severity × confidence

Severity S4 critical/S3 high/S2 medium/S1 low; confidence C4 reproduced/C3 code-proven/C2 mixed/C1 hypothesis. Score = S×C. This spike implements nothing.

| Rank | Enhancement | Score | Rationale | Disposition |
|---:|---|---:|---|---|
| 1 | Exact SMOL resolution/auth/completion; no active fallback | 16 | Direct RED. | **addressed-by-TASK-58.5** |
| 2 | Shared `/aug` | 12 | Direct RED. | **addressed-by-TASK-58.6** |
| 3 | Reject error/length/toolUse, reject empty, preserve errorMessage | 9 | Prevent false success/retry/lost provider cause. | **recommend-follow-up** |
| 4 | Typed notices + content-free outcome/attempt/stop/timing | 9 | Needed to measure incidence. | **recommend-follow-up** |
| 5 | Total deadline across correction attempts | 9 | Fresh timers permit two budgets. | **recommend-follow-up** |
| 6 | Align parser strictness/fallback/first-block/copy | 6 | Exactly-one wording not enforced. | **recommend-follow-up** |
| 7 | Snapshot settings; explicit read/save fallback | 6 | Two reads + optimistic save can appear inconsistent. | **recommend-follow-up** |
| 8 | Minimize/disclose context; size preflight | 4 | Flow proven, impact not reproduced. | **recommend-follow-up** |
| 9 | Preserve normal UI cancellation | 3 | Correct non-error path. | **no-action** |
| 10 | Preserve destination family and review-on | 3 | Correct safeguards. | **no-action** |
| 11 | Keep no-active-model/unsupported-runtime failures | 3 | Actionable pre-inference failures. | **no-action** |

## Context-packet freshness

All relied-on facts match current code except a citation-boundary nit: parser acceptance is `plugins/augment/src/parser.ts:18-32`, while invalid-output throw is **line 34**; packet wording `parser.ts:18-33 ... otherwise throws` omits the throw line. Underlying behavior is correct. `artifact://6` matches.

## Recommendation

Land TASK-58.5 and TASK-58.6 as scoped, without broad retries. Then prioritize a separate terminal-response validation/diagnostic-preservation follow-up: accept only successful terminal stop, require non-empty text, distinguish user cancellation from provider abort/error, preserve provider diagnostic, and keep at most one format correction under a total deadline. Add content-free outcome evidence before claiming the reported frequency is resolved. See doc-20 for external precedents, privacy principles, and longer-term feedback-guided regeneration.
