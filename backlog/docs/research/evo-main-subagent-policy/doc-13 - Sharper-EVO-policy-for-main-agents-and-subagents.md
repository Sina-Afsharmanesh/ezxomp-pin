---
id: doc-13
title: Sharper EVO policy for main agents and subagents
type: other
created_date: '2026-08-29 10:16'
updated_date: '2026-08-29 10:17'
tags:
  - evo
  - architecture
  - subagents
  - tool-policy
---
# Sharper EVO policy for main agents and subagents

Date: 2026-08-29
Task: TASK-54

## Decision

Keep EVO model-agnostic. EVO should be three coordinated layers:

1. **Capability policy** — which tools the main agent or each subagent may execute.
2. **Routing mindset** — a short, always-injected decision ladder telling the model which allowed tool is cheapest and correct for the intent.
3. **Enforcement and recovery** — hooks stop violations and redirect the model; transactional state restores exact pre-EVO grants.

Do not make EVO depend on native Code Mode or provider payload rewriting. Do not silently fall back to broader original grants while EVO is expected to be active.

## Current facts and gaps

### Main agent

`MainEvoController.activate()` snapshots active tools only in memory. After restart, `hydrate()` reapplies EVO without restoring that snapshot; a later `/evo off` falls back to every registered tool. This broadens a previously restricted tool set instead of restoring it exactly. Main transitions and config read-modify-write are also unlocked and can interleave.

### Subagents

`SubEvoController.activate()` rewrites ten hard-coded cook profile names in global and project directories, storing full original bytes in one `sub-state.json`. The original bytes are sufficient for exact restoration, but:

- state writing is not atomic;
- there is no generation, lock, per-profile original hash, or applied-overlay hash;
- current profile drift is counted and then overwritten on off;
- missing profiles are skipped and the recovery state is deleted;
- persisted `sub=true` can hydrate with no valid backup;
- the hard-coded role tool lists are not derived from original profile grants;
- new tools and renamed profiles require source changes;
- global and project copies are both mutated without respecting project-nearest discovery precedence;
- frontmatter rewriting assumes a one-line CSV `tools:` value, although profiles may use YAML arrays.

The current tool hook supports allow or block-with-guidance. OMP's `ToolCallEventResult.input` can replace arguments for the same tool, but it cannot replace one tool name with another.

## Sharpened policy

### Main effective grants

At activation:

```text
original grants = current getActiveTools()
effective EVO grants = policy(getAllTools(), original grants, protected floor)
```

Persist the original grants before applying EVO. The main policy may expose all registered plugin/MCP tools while denying selected native surfaces. New plugin tools join only on an explicit refresh or a new activation generation, never halfway through a turn.

Main protected floor:

- `eval` for mutation, shell, batching, and bounded raw access;
- `task` and `hub` for orchestration;
- `read` only for protocol URIs;
- `ask` and lifecycle/state tools when registered.

### Subagent effective grants

Start from the profile's actual original grants rather than a hard-coded replacement list:

```text
effective = registered(original grants - denied natives - denied child orchestration)
          + required role floor
          + explicitly versioned role additions
```

This preserves least privilege and the profile author's intent. A worker keeps worker grants; a judge does not gain mutation or dispatch rights. Unknown or newly added plugin tools are not granted to children merely because they exist; they enter through original profile grants or an explicit policy category.

Cook child floor:

- `eval`, `hub`, and `yield`;
- role-owned Backlog/Cook tools already present in original grants;
- codesight/code-nav tools already present or explicitly added by the versioned role policy;
- `web_search` only for roles whose contract permits external research.

Never grant nested dispatch tools to roles that are not orchestrators.

## Routing mindset

Inject one concise canonical block into the main agent at `before_agent_start` while EVO main is active, and derive the subagent block from the same policy version.

Decision ladder:

1. **Domain operation:** use the owning plugin tool directly — Backlog, Cook, Workflowz, experiences, browser, computer, or another specialized surface.
2. **Repository orientation:** Codesight summary/wiki/hot files.
3. **Grounded code work:** Codesight symbol/index/impact, then code-nav definition/references/trace or AST tools.
4. **Protocol artifact:** native `read` only for `skill://`, `agent://`, `artifact://`, `history://`, `memory://`, `local://`, `issue://`, `pr://`, `omp://`, or another accepted protocol URI.
5. **Mutation, shell, batch, or bounded raw bytes:** persistent `eval` kernel. Raw reads are last, always bounded.
6. **Parallel work:** `task`; coordination and completion through `hub`/`yield`.

This ladder is advisory because a hook cannot reliably infer intent. Capability boundaries are enforceable.

## Hook outcomes

Each call receives one terminal outcome:

- **Allow:** tool and input satisfy policy.
- **Block:** prohibited capability or unsafe state; no retry instruction when there is no valid alternative.
- **Redirect:** implemented as `block: true` plus one concrete alternative and valid argument example. OMP cannot redirect to a different tool automatically.
- **Replacement:** only `ToolCallEventResult.input` for deterministic same-tool normalization. Revalidate the replacement. Never use replacement to simulate another tool.

Loop protection:

- Track `(turn, tool, reason-code)`; give teaching guidance once.
- A repeated violation returns a shorter hard block, not the same long lecture.
- Never redirect A to B when B's policy redirects back to A.
- Replacement is applied at most once per tool-call ID.
- Reasons use stable codes such as `EVO_FS_READ_USE_NAV`, `EVO_MUTATION_USE_EVAL`, and `EVO_SUBSTATE_INVALID` for tests and telemetry.

## Transactional state model

Persist one schema-versioned generation:

```text
generationId
policyVersion
catalogHash
status: preparing | active | restoring | failed
main.originalToolNames
profiles[]:
  canonicalPath
  scope: project | global
  profileName
  originalContent
  originalHash
  effectiveContentHash
  originalToolNames
  effectiveToolNames
  phase: prepared | applied | restored | failed
```

Invariants:

1. State is atomically durable before any tool/profile mutation.
2. Profile writes use atomic rename plus compare-and-swap against the expected hash.
3. `config.main/sub=true` is committed only after every effective state is verified.
4. Invalid, missing, stale, foreign, partial, or conflicting state fails closed and preserves evidence.
5. A child spawn captures one generation for its lifetime; later refreshes affect later children only.
6. Project-nearest profile wins. Mutate the project copy when present; use the global copy only as fallback for that role.
7. Main and sub transitions share a mutex so command, hydration, turn refresh, and spawn preflight cannot interleave.

## Restore, refresh, and regenerate

- **Restore (`/evo off`, `/evo-sub off`):** return to byte-exact original grants from the active generation. If current bytes do not match the expected EVO overlay, refuse by default and preserve both versions. `--force` must archive drift before restoring.
- **Refresh (`/evo refresh`, `/evo-sub refresh`):** keep immutable originals, rebuild effective grants from the current plugin catalog and policy, then commit a new effective generation.
- **Regenerate (`/evo-sub regenerate`):** first complete a verified restore, then rediscover authoritative current profiles and activate a new generation. Never derive originals from a file that still contains an EVO marker or whose hash conflicts with active state.
- **Fallback:** if activation or spawn preflight cannot prove a valid effective generation, restore verified originals when safe and refuse the spawn. Never silently spawn with broader original grants while config still says EVO is active. Explicit `/evo-sub off` is the operator-controlled fallback to original profile grants.

Compatibility requires profile mutation today because OMP has no public per-dispatch tool-overlay API. A future sidecar-only overlay is preferable once OMP exposes that API.

## Spawn preflight

The main EVO `tool_call` hook should inspect `task` dispatches while sub mode is active:

1. Resolve the actual project-nearest cook profile.
2. Require a committed generation and matching effective hash.
3. Confirm policy version/catalog generation.
4. Allow the task call only after validation.
5. Block with `EVO_SUBSTATE_INVALID` and recovery instructions on mismatch.

This ensures a persisted flag alone never authorizes a stale or half-rewritten profile.

## Verification scenarios

1. Main on/off in one session restores the exact restricted starting set.
2. Restart while main EVO is active, then off, restores the persisted original set.
3. Config or tool-set failure at every transition leaves either the old committed generation or a recoverable failed generation.
4. Project profile shadows global; only the winning profile is used for that project.
5. Sub on/off restores LF, CRLF, CSV, and YAML-array profiles byte-for-byte.
6. User edit during EVO causes a conflict and no overwrite.
7. Deleted/new profile during EVO preserves recovery state and blocks ambiguous completion.
8. Corrupt, truncated, stale, or missing state blocks child spawn.
9. Refresh adds/removes catalog tools only according to policy and original grants.
10. Regenerate cannot adopt an EVO overlay as the baseline.
11. Repeated blocked native calls receive one redirect then concise hard blocks; no A↔B loop.
12. Worker, judge, scout, researcher, planner, validator, council, audit, and refute profiles retain role-specific least privilege.

## Implementation order

1. Version and atomically persist unified main/sub generation state with hashes and a transition lock.
2. Fix exact main restoration across restarts.
3. Replace hard-coded sub surfaces with original-grant-derived policy categories.
4. Add scope-aware transactional profile rewrite, conflict detection, restore, refresh, and regenerate.
5. Add task-spawn preflight.
6. Centralize the concise routing block and stable hook reason codes.
7. Add transition, corruption, drift, scope, spawn, and retry-loop tests.

Three independent cook specialists reviewed this design: a source-mapping scout, routing researcher, and restoration judge. The judge classified the current restore design as failing until drift overwrite, missing-state clearing, non-atomic state, hard-coded grants, precedence, and fresh-session restoration are corrected.
