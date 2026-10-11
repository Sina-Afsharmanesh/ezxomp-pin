# @ezxomp/gsd-graph

GSD knowledge graph + workflow execution graph for OMP (Oh My Pi).

Port of two gsd-pi subsystems:

1. **Workflow execution graph** — per-run `GRAPH.yaml` step DAG driving a
   sequential engine (`pending → active → complete|expanded`), with frozen
   `DEFINITION.yaml`, param substitution, and context injection.
2. **Knowledge graph** — TS-native build/query/status/diff over `.gsd/`
   artifacts (`STATE.md`, `KNOWLEDGE.md`, ROADMAPs, PLANs, LEARNINGS) persisted
   as `.gsd/graphs/graph.json`.

## Status

W1 scaffold — registration stubs only. Command surface (`/gsd-graph`) and tools
(`gsd_graph`, `gsd_graph_run`) land in later work units.

## Settings

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `autoRebuild` | boolean | `false` | Rebuild `.gsd/graphs/graph.json` at session start when it exists and is stale (>24h). |
