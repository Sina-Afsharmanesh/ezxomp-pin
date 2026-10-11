# gsd-graph

## Purpose

Port of the gsd-pi graph subsystems to OMP: the GRAPH.yaml workflow step graph
(sequential engine, pending→active→complete|expanded) and the TS-native
knowledge graph over `.gsd/` artifacts (`build|query|status|diff`).

## Scope anchors

- Two ported subsystems; four excluded (gsd-core graphify, reactive task graph,
  plan-dependency-graph, external `@opengsd/gsd-graph` product) — see plan
  `.local/plan-gsd-graph.md` for dispositions.
- Persistence: `<projectDir>/.gsd/` (not OMP-namespaced) for cross-tool interop
  and Git worktree isolation.
- Register exactly `gsd-graph` / `gsd_graph` / `gsd_graph_run` — never
  `gsd:graphify` or `/gsd-graphify` (upstream naming drift resolved by
  exclusion).
- One shipped setting: `autoRebuild` (boolean, default false) — session_start
  stale rebuild replaces upstream's post-git-op hook.
- Third-party runtime deps vendored in-tree (`vendor/`, js-yaml via
  `js-yaml.mjs` ESM bootstrap) per the marketplace no-npm-install contract.
