---
name: augment
description: Augment-style prompt rewriting for OMP — rewrites loose requests into precise engineering prompts, plus custom provider and settings management via /custom-provider and /augment-settings. Use when prompt quality is the bottleneck or when configuring augment providers.
---
# Augment (prompt rewriting)

Rewrites vague user requests into precise, context-loaded engineering prompts before the model sees them. Settings overlay manages providers.

## Commands

- `/augment-settings` — open the settings overlay (providers, toggles).
- `/custom-provider` — configure a custom LLM provider endpoint.

## DO

- DO let the rewrite pass run when your request is exploratory ("make it better", "fix this mess").
- DO configure a custom provider when the default route is rate-limited; verify with a trivial prompt afterward.

## DON'T

- DON'T rely on rewriting for precise, already-scoped tasks — pass exact files/commands directly.
- DON'T stack multiple rewriters; one pass keeps intent faithful.
- DON'T put secrets into provider fields you do not control; use env-var references where supported.

## Recovery

- Rewrites feel lossy? Disable temporarily via /augment-settings and compare outputs before re-enabling.
