# @ezxomp/better-custom

An OMP extension that adds the `/custom-provider` wizard for managing custom entries in the active models configuration. It works only in an interactive TUI session; print, JSON, and RPC modes show a notice and make no change.

## Install

From a checkout, link the package at user scope:

```bash
omp plugin link /absolute/path/to/ezxomp/plugins/better-custom --scope user
```

Start OMP in its terminal UI, then run `/custom-provider`.

The package has no runtime dependencies. Its only dependencies are the pinned OMP peer packages already supplied by the host.

## Provider styles

Choose one of these styles in the wizard. The value in the second column is the exact host `api` spelling written to the models configuration.

| Style | Host `api` |
| --- | --- |
| OpenAI Chat Completions | `openai-completions` |
| OpenAI Responses | `openai-responses` |
| Anthropic Messages | `anthropic-messages` |
| Google Generative AI | `google-generative-ai` |
| Ollama Chat | `ollama-chat` |

## Use the wizard

### Add a provider

1. Run `/custom-provider` and choose **Add provider**.
2. Choose a provider style, enter its endpoint, and give the provider a unique id.
3. Choose an API-key mode and select or enter models.
4. Review the discovered metadata and save. The wizard validates the inputs before it writes the provider.

### Edit a provider

1. Choose **Edit provider**.
2. Select a provider, then change provider settings or choose a model to update its metadata, endpoint override, headers, reasoning, vision, context window, or token limit.
3. Save each accepted change. Unknown fields on the provider and its models are preserved.

### Delete a provider

1. Choose **Delete provider**.
2. Select a provider and confirm the displayed details.
3. The wizard re-reads the selected provider before removal, so a provider changed while the confirmation was open is not deleted.

Canceling a picker ends that pending step. Canceling Add or Delete leaves configuration unchanged; an edit already accepted remains saved.

## Native /model registration

Saved providers are not limited to the configuration file. At extension load every configured custom provider that satisfies the host's registration rules is registered into OMP's native model registry, so its models appear in the built-in `/model` command immediately. When the wizard adds, edits, or deletes a provider, the registry re-syncs from the saved configuration in the same session; a restart is never required. Selecting a custom model in native `/model` switches the active session exactly like any built-in model.

Registration passes credential references through untouched: better-custom never resolves or executes them itself, and does not add resolved secret material to its own state. Once handed to the host model registry, references follow host registry semantics — the host resolves `$ENV` and `!command` references at provider registration time (a `!command` reference therefore executes then, exactly as it does for natively configured providers), so extension load can run registered commands. Keep this in mind when a command reference might touch the network.

Built-in providers can never be shadowed: a custom entry whose id matches any host catalog provider is skipped at registration.

## The /better-models browser

`/better-models` presents every authenticated provider's models in one searchable view, distinct from the reserved native `/model` command. Models are grouped by provider and by model family, each row carries the provider label, family, context window, and a canonical `provider/id` reference, and selecting a row resolves that reference through the session's model query and switches via the same host seam as `/model`. An empty catalog shows a notice instead of an empty picker.

## Free-model lane

The browser marks free models in a dedicated lane. Classification is provider-relative, mirroring pi-free's adaptive predicate without depending on the pi-free package: an explicit `isFree` marker wins outright; inside a provider with at least one positively priced sibling, zero or unpriced input+output cost qualifies; otherwise only a "free" word in the display name qualifies, so an all-zero-cost provider does not mark everything free by accident. Free models appear in their provider and family groups as well as the free lane, and remain selectable through the same `provider/id` seam.

pi-free providers themselves need no adapter here: once pi-free registers them natively they arrive through the host's own authenticated, auth- and hidden-filtered model list, which is the single source this extension reads.

## Discovery and metadata

The add flow and metadata refresh can probe compatible gateway endpoints. Presets bound that best-effort discovery to known gateway shapes: `auto`, `litellm`, `oneapi`, `newapi`, `openrouter`, and `generic`. A failed or unavailable probe does not require a network retry; the wizard can use manually entered models and local fallbacks.

Model metadata is merged in tiers: probe results take precedence, known local rules fill gaps, and built-in defaults fill anything still unknown. This keeps manually entered models usable while letting a gateway supply its own context, output, vision, and reasoning information.

Explicit `reasoning: false` disables thinking even when an older saved model enabled it. Refresh preserves custom effort wire overrides when the gateway supplies no new effort tiers. If any advertised positive tier is provider-native, the complete ordered list maps monotonically onto host effort selectors; entirely canonical lists retain their same-name selectors.

## YAML and JSON configuration

The wizard preserves the discovered models-config path and format. When Bun YAML support is available, YAML is parsed and written with Bun. Without it, the YAML path can use indented JSON, which is valid YAML. A genuine YAML document that needs YAML parsing without that capability fails with a clear error and is not overwritten.

## API-key modes and security

Choose a literal key, an environment reference, a shell-command reference, or no key when the provider permits it.

- `$OPENAI_API_KEY` stores an environment-variable reference.
- `!command` stores a shell-command reference.
- Literal keys, environment references, and command references are stored verbatim in the models configuration.
- Ollama uses `ollama` as its placeholder only without a supplied credential; authenticated Ollama gateways keep their literal or reference key.
- The wizard resolves a reference itself only for an explicit probe. Independently, once a provider is registered, the host model registry may resolve references during registration (see "Native /model registration"). Resolved credentials are never logged by this extension.

The models configuration is not a secret store. Protect its filesystem permissions and avoid placing a literal key there when an environment reference is suitable.

## Limitations

- The command requires OMP's interactive TUI; it intentionally does not mutate configuration in non-interactive modes.
- Gateway probing is best effort and may not identify every private or proxy-backed endpoint.
- The extension does not encrypt literal keys stored in the models configuration.
- A provider without any resolvable key or oauth configuration is skipped at registration and excluded from `/better-models` with a warning: the host requires credentials when models are defined, and keyless providers would fail registry validation.
- The host resolves stored `$ENV` and `!command` credential references during provider registration, so a `!command` reference executes when the extension loads — host behavior shared with natively configured providers, not something this extension controls.
- Registration covers the host APIs listed above; other API shapes are outside these contracts.
