---
name: better-custom
description: ezxomp better-custom plugin — /custom-provider wizard for adding, editing, and deleting custom model providers, native /model registry registration, and the /better-models unified authenticated browser. Use when a user asks about custom providers, provider setup, or model browsing.
---
# better-custom (ezxomp)

One plugin, three surfaces:

| Surface | Use |
|---|---|
| `/custom-provider` | Interactive TUI wizard to add, edit, or delete custom model providers |
| `/model` registry | Saved providers register natively at extension load and re-sync after wizard writes — no restart |
| `/better-models` | Unified authenticated model browser with provider/family groups and free-model classification |

## Behavior

- Interactive TUI only. Print, JSON, and RPC modes show a notice and mutate nothing.
- Five provider styles, writing the exact host `api` spelling: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `ollama-chat`.
- Probe-safe credentials: never logged or resolved by the plugin; `$ENV` / `!command` / literal references pass through untouched and the host resolves them per registry semantics.
- TOCTOU-safe rename/delete guards, byte-proof no-write cancellation paths, YAML-capability config boundary preserving unknown fields; built-in provider ids are never shadowed.
- Zero runtime dependencies; only pinned `@oh-my-pi/*` peer packages supplied by the host.

## Guidance

- DO route custom-provider questions to `/custom-provider` and model-browsing questions to `/better-models`.
- DO remember the wizard writes the exact host `api` spelling and preserves unknown YAML config fields.
- DON'T register providers by hand-editing the models configuration — the wizard validates inputs before writing and hand edits bypass probe-safe credential handling.
- DON'T call the wizard outside an interactive TUI session — print, JSON, and RPC modes intentionally make no change.