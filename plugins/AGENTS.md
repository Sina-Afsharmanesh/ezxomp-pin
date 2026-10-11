# plugins

## Purpose

Contains all OMP plugin packages. Each subdirectory is a standalone plugin with its own `package.json`, source, and tests. Plugins extend the agent harness with domain-specific capabilities.

## Ownership

Each plugin owns its own subtree. Plugin maintainers are responsible for their plugin's contracts, tests, and documentation.

## Local Contracts

- Each plugin is a Bun workspace package under `plugins/*`
- Plugins must export their extension points via `package.json` `omp` field
- Cross-plugin imports should go through the shared `@ezxomp/*` namespace
- High-import files (see root `AGENTS.md`) require extra caution

## Work Guidance

- **Read [`docs/authoring-extensions.md`](../docs/authoring-extensions.md) first** — it is the cross-cutting contract for OMP marketplace plugins: OMP's install path never runs `npm install`, so host deps go in `peerDependencies`, third-party runtime deps must be vendored inside the consuming plugin (precedent: `plugins/evo/vendor/` and `plugins/cook/vendor/`, see `plugins/evo/vendor/VENDORED.md`), and `Type` imports come from standalone `typebox`, not peer-only `@oh-my-pi/omptype/typebox`.
- Run `just check` from the project root for type-checking across all plugins
- Run `bun test test/<plugin>.test.ts` for plugin-specific tests

## Verification

- `just verify` from project root runs the full gate
- Each plugin should have at least one smoke test in `test/`

## Work Guidance

- New plugins register in `.omp-plugin/marketplace.json`, `test/manifest.test.ts` (`EXPECTED_PLUGINS`/ids/versions), and require an `UPSTREAM.json` with matching `localForkVersion`.
- `plugins/agent-learning` owns the learning-lane contracts (surface/facts/procedures/gate); the habits lane stays in `experiences` as its companion — never re-register experiences' extension from another package.

## Child DOX Index

- [`agent-learning/AGENTS.md`](agent-learning/AGENTS.md) — unified learning lanes: catalog + skills.sh surface, facts shim, procedures store/migration contract, review gate.
- [`backlog/AGENTS.md`](backlog/AGENTS.md) — Backlog.md integration: backlog_* tool suite, shared helpers, default instruction overlay born from the cook extraction.
- [`cook/AGENTS.md`](cook/AGENTS.md) — Backlog.md cookbook workflow consuming @ezxomp/backlog for all backlog tooling.
- [`gsd-web/AGENTS.md`](gsd-web/AGENTS.md) — GSD-Pi Web UI port: standalone Next host, launcher/registry contracts, settings surface, rpc bridge.
- [`gsd-browser/AGENTS.md`](gsd-browser/AGENTS.md) — gsd-browser tool suite: degradation reason codes, Brave key precedence, capture `.gitignore` gate, zero-runtime-dep surface.
- [`gsd-loop/AGENTS.md`](gsd-loop/AGENTS.md) — autonomous GSD loop kernel: per-cwd `.gsd-loop/` state, pure kernel guard pipeline, `gsd_loop_*` tools + `/gsd-loop` command.
- [`gsd-graph/AGENTS.md`](gsd-graph/AGENTS.md) — GSD graph plugin contracts (GRAPH.yaml engine + knowledge graph, `.gsd/` persistence, naming rules).
