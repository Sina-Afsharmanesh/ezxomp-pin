---
name: gsd-graph
description: ezxomp GSD graph subsystems port — knowledge-graph build/query/status/diff over .planning artifacts persisted to .gsd/graphs/, GRAPH.yaml workflow run engine (create/list/status/next/complete/stop), /gsd-graph command, optional session_start autoRebuild. Use when explaining or debugging gsd_graph tools or the workflow run engine.
---
# gsd-graph (ezxomp)

Port of the gsd-pi graph subsystems: GRAPH.yaml workflow step-graph engine and the TS-native knowledge graph.

| Job | How it shows up |
|-----|-----------------|
| knowledge graph | build/query/status/diff over `.planning` artifacts, persisted to `.gsd/graphs/` (writeGraph + acquireBuildLock with parent mkdir; snapshot written after graph persist) |
| run engine | GRAPH.yaml v1 (`version/name/steps[{id,name,title,prompt,status,dependsOn}]`), pending→active→complete|expanded; create/list/status/next/complete/stop with contract-exact shapes |
| surface | `/gsd-graph` command, `gsd_graph` + `gsd_graph_run` tools, session_start autoRebuild via ctx.cwd |

## How to use

- Progress strings are `"Step N/M"`; stop descriptors use `reason` (not stopReason); complete composes `{outcome:"continue", next:<descriptor>}` or milestone-complete.
- `resolveProjectDir` gates every `gsd_graph` mode and `gsd_graph_run`; list/traversal is confined by WORKFLOW_NAME_PATTERN + ".." checks.
- Tests: `bun test test/gsd-graph.registration.test.ts` from the repo root (7 tests) + plugin vitest (64/64).

### DO

- DO respect the plan-authoritative contract shapes for run details and status payloads.
- DON'T build without the lock; don't snapshot before graph persist.
