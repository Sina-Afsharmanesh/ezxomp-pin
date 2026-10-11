---
id: doc-20
title: Durable interactive prompt rewriting for TASK-58
type: guide
created_date: '2026-08-31 01:12'
updated_date: '2026-08-31 01:45'
tags:
  - research
---
# Durable Interactive Prompt Rewriting for TASK-58

**Dated scope:** 2026-08-30. Research on prompt-rewriting precedents, optimization methods, model routing, reliability, validation, review UX, observability, and privacy for `plugins/augment`.

## Executive recommendation

Separate the two meanings of model. OMP's configured `@smol` model should be the **optimizer execution model**; the active conversation model remains the **rewrite target model** whose family/style the result targets. Current inference/auth use `ctx.model` (`plugins/augment/src/enhance.ts:17-25,120-125`), while target-family detection independently uses the active model (`plugins/augment/src/context.ts:16-18,37-40`). Change the former without changing the latter.

Ship a narrow durable pipeline: resolve/auth/call the exact `@smol` model without fallback; validate successful stop, non-empty text, and envelope; keep one bounded format-correction retry; preserve editor-first review; add `/aug` through the same handler; classify failures without recording prompt content. Consider feedback-guided regeneration and an offline regression corpus only after the core is reliable. Do not add online candidate search.

## Repository baseline

### Source facts
- Regeneration selects `ctx.model`, resolves auth for it, and passes it to `complete` (`enhance.ts:17-25,120-125`).
- Output family is separately derived from the active model (`context.ts:16-18,37-40`).
- The two-attempt loop retries only after parser failure (`enhance.ts:31-46`).
- Review is default-on and a valid result goes to the editor (`settings.ts:12-18`; `index.ts:25-34`).
- The parser error says exactly one sentinel block, but extraction returns the first matching block (`parser.ts:21-22,34,40-42`).
- Requests can include conversation history, absolute `cwd`, and branch (`context.ts:8,21-33`; `strategies/shared.ts:63-80`).

### Design implications
- Auth/completion use optimizer=`@smol`; target family remains destination=`ctx.model`.
- Reject truncated/error stops and empty output before parsing.
- Align parser behavior, prompt contract, error copy, and tests.
- Routing to `@smol` may change which provider receives history and metadata; disclose and minimize that context.

## ADHD Frame A — UX/tool precedents
OpenAI requires viewing/testing, iteration with annotations/graders, manual review, and warns optimized prompts can worsen some inputs ([official docs](https://developers.openai.com/api/docs/guides/prompt-optimizer)). Anthropic's improver rewrites prompts/examples and accepts failure feedback for another iteration ([official announcement](https://claude.com/blog/prompt-improver)).

- Preserve editor-first review: strongest fit; already present.
- Feedback-guided regeneration: useful after core reliability.
- Multiple candidates or dataset UI: reject for `/aug` due to latency and TUI complexity.

## ADHD Frame B — Algorithmic optimization
Google separates zero-shot, failure-feedback few-shot, and iterative data-driven optimization ([overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer); [data-driven docs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/data-driven-optimizer)). APO turns failures into natural-language gradients with beam/bandit search ([Pryzant et al.](https://arxiv.org/abs/2305.03495)). Smaller-model OPRO research found limited effectiveness and recommends clear direct instructions as robust baselines ([Zhang et al.](https://arxiv.org/abs/2405.10276)).

- Strong direct rewrite contract: ship.
- One format-correction retry and offline corpus: ship/plan.
- Online N-candidate search: reject; no reliable user metric and poor latency fit.

## ADHD Frame C — Reliability and routing
Anthropic distinguishes permanent config/auth/permission failures from transient rate-limit/server/overload errors and uses bounded retry ([official errors](https://platform.claude.com/docs/en/api/errors)); this is provider precedent, not a universal OMP contract. RouteLLM makes routing an explicit learned quality/cost problem requiring preference data ([Ong et al.](https://arxiv.org/abs/2406.18665)).

- Exact `@smol`, fail clearly: ship.
- Selective same-model retry: only if `pi-ai` exposes typed retryability and does not already retry.
- Silent fallback and learned routing: reject; both violate configured selector semantics.

Potential content-free outcomes: `success`, `cancelled`, `smol_unconfigured`, `auth`, `permission`, `rate_limited`, `provider_transient`, `timeout`, `truncated`, `empty`, `invalid_envelope`, `unknown`.

## ADHD Frame D — Validation, safety, privacy
OWASP recommends zero-trust output validation and monitoring ([LLM05](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/)), plus minimization, transparency, and redaction ([LLM02](https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/)). Augment sends history and project metadata; editor review supplies a human semantic gate.

- Portable deterministic validation and human review: ship.
- Content-free diagnostics and context minimization: record as P1.
- Provider-native schemas, second-model judge, raw-content logging: reject.

## Enhancement dependency map
| Enhancement | Priority | Independent? | Requires core? |
|---|---:|---:|---:|
| `/aug` same handler | P0 | Yes | No |
| Resolve/auth/call `@smol` | P0 | Core | Yes |
| Preserve active-model target family | P0 | Part of routing | Yes |
| Reject bad stop/empty output | P0 | Technically | Land with core |
| Typed failure notices | P0 | Yes | Integrate with core |
| Content-free diagnostics | P1 | Yes | No |
| Minimize/disclose context boundary | P1 | Yes | No |
| Regenerate with feedback | P2 | No | Yes |
| Offline fixed corpus | P2 | Harness can start | Stable core needed |
| Candidate search/learned routing | Reject | No | Not planned |

## Minimum acceptance contract
A rewrite is usable only when the optimizer equals resolved `@smol`; auth belongs to it; response stop succeeds; text is non-empty; envelope passes; original draft remains untouched until checks pass; review edits the editor; direct send occurs only after persisted opt-out. Invalid format gets exactly one corrective attempt on the same model. Do not retry cancellation, missing selector, auth/permission, or deterministic config.

## Non-goals
No dashboard, dataset editor, learned router, strong-model escalation, silent fallback, online beam search, provider-specific schema dependency, automatic execution during review, or raw-content/path telemetry. Syntax does not prove intent preservation; human review remains required.

## Open questions
1. Does `pi-ai` already retry transient failures?
2. Which stop reasons are cross-provider successes?
3. Strict whole-response envelope or tolerant extraction?
4. Keep context depth 4 after routing to `@smol`, or default zero with disclosure?
5. Can absolute `cwd` be removed?
6. Is there an existing content-free event surface?
7. Should feedback re-anchor on the untouched original?

## Sources
1. https://developers.openai.com/api/docs/guides/prompt-optimizer
2. https://claude.com/blog/prompt-improver
3. https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/prompt-optimizer
4. https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/data-driven-optimizer
5. https://arxiv.org/abs/2305.03495
6. https://arxiv.org/abs/2405.10276
7. https://arxiv.org/abs/2406.18665
8. https://platform.claude.com/docs/en/api/errors
9. https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
10. https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
11. Repository sources cited above.
