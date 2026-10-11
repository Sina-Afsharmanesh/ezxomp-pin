---
id: decision-3
title: 'Close TASK-38.4 as superseded: lean-ctx detached from ezxomp'
date: '2026-08-28 04:06'
status: accepted
---
## Context

TASK-38.4 (closure gate for TASK-37) was written expecting lean-ctx to remain a marketplace plugin whose external binary would eventually gain the higher worker ceiling, registry schema, and stale-reap capability. Before the gate was processed, the project **detached lean-ctx entirely** (session 2026-08-28): source archived at `archive/_reference/lean-ctx/`, removed from `.omp-plugin/marketplace.json`, uninstalled from user scope (`omp plugin uninstall lean-ctx@ezxomp`), and all in-repo references removed (commit stack `abd51003..3ba447fc`; handoff: doc-10; capacity known-issue: doc-9).

The external prerequisite TASK-38.4 was waiting on — a new lean-ctx binary release — can never be delivered for this repo: there is no lean-ctx consumer left, and resurrecting the plugin would contradict the user's explicit detach decision.

## Decision

Close **TASK-38.4 as superseded** (terminal status, not Done-by-implementation): the TASK-37 capacity boundary it gated is durably recorded in **doc-9** (Known Issue: lean-ctx Agent-Bus Worker Capacity) and the supersession in **doc-10** (handoff). No production changes are owed — the repository no longer owns any lean-ctx runtime surface.

TASK-37 itself is likewise terminal-by-decision: its remaining scope (registry ceiling, schema, stale reap) lives in the archived external tool. If lean-ctx is ever re-imported, TASK-37 should be reopened with fresh capacity requirements — do not assume this record still applies.

## Consequences

- TASK-38.4 terminal → TASK-38.5's dependency list (38.1, 38.2, 38.3, 38.4) is satisfiable without external input.
- TASK-37 and TASK-38.4 carry the supersession note pointing at doc-9/doc-10 and this decision; no code or test changes required.
- If lean-ctx returns as a marketplace plugin, doc-9's capacity analysis is the entry point, and this decision must be revisited first.
