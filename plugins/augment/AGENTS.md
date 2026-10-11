# AGENTS.md — augment

## Purpose
Augment-style prompt rewriter for OMP. Rewrites user prompts into stronger, more structured versions before they reach the LLM, using intent detection and the Prompt Leverage framework (objective, context, constraints, verification, deliverable).

## Ownership
- Package: `@ezxomp/augment` (fork of `pi-augment`)
- Entry: `src/index.ts` — `augmentExtension(pi)` registers `/augment`, `/aug` (short alias, same handler), and `/augment-settings` commands
- Depends on `@ezxomp/experiences` (workspace) for the centered settings overlay

## Local Contracts
- Command: `/augment <prompt>` — rewrites the prompt; result goes to the editor for review unless `reviewBeforeSend` is off
- Command: `/aug <prompt>` — short alias sharing the exact `/augment` handler (usage, review-before-send, cancellation, error semantics identical by construction)
- Command: `/augment-settings` — centered overlay for the six persisted settings
- Optimizer model: the resolved `@smol` alias (auth + completion); fail-closed — a missing/unresolvable `@smol` throws "Augment requires a configured @smol model." before any model call, with no active-model fallback
- Target style family: derived from the active destination model (`context.ts` `detectFamily`) unless the `outputStyleFamily` setting overrides it
- Settings (declared in `package.json` `omp.settings`): `rewriteMode` (`auto|plain|execution-contract`), `maxOutputTokens` (default 1200), `timeoutMs` (default 45000), `conversationContextDepth` (default 4), `outputStyleFamily` (`auto|claude|gpt`), `reviewBeforeSend` (default true)
- Intent detection: 9 intents (implement, debug, refactor, review, research, docs, test-fix, explain, general); effort scaling Light/Standard/Deep
- Model-family aware output style (Claude XML vs GPT compact bullets)
- Provider errors fail immediately with a bounded diagnostic; partial error responses are never accepted or retried as malformed output. User cancellation remains distinct from timeout failure.

## Work Guidance
- Keep the rewrite contract grounded: `src/contracts.ts` and `src/prompt-leverage.ts` define the structured output blocks — do not drift from them.

## Verification
- Targeted suite: `bun test test/augment.test.ts test/augment-routing.test.ts` (the repo gate is `just verify`).

## Child DOX Index
No child AGENTS.md files needed.
