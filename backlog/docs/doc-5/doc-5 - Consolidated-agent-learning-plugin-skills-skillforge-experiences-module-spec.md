---
id: doc-5
title: >-
  Consolidated agent-learning plugin: skills, skillforge, experiences module
  spec
type: specification
created_date: '2026-08-23 06:15'
updated_date: '2026-08-23 09:26'
tags:
  - plugin-architecture
  - consolidation
  - agent-learning
  - skills
  - skillforge
  - experiences
  - skills-sh
  - research
---
# Consolidated Agent-Learning Plugin — Module Spec

**Type:** specification
**Date:** 2026-08-23
**Status:** approved (user review 2026-08-23 — pix-* bundle replaced by plugin/tool catalog; skills.sh adapter kept with safety-gated, refreshed definitions)

## Problem statement

OMP natively already provides: multi-root skill discovery (13+ sources incl. `~/.omp/agent/skills` and `.omp/skills`), `skill://<name>` + `/skill:<name>` loading, plugin-shipped skills with `containRoot` containment (Agent Plugin §4.1), `manage_skill`/`learn` write paths into the isolated `~/.omp/agent/managed-skills` directory (64 KB cap, symlink/hard-link refusal, atomic writes), and pluggable memory backends (`memory.backend: mnemopi` with session-start `<memories>` recall, `recall`/`retain`/`reflect`/`memory_edit` tools).

Against that substrate, three ezxomp plugins duplicate capability and split the same problem across three stores:

- `skills` (marketplace, 0.7.4-ezxomp.0): hand-rolled skill discovery/loading that re-scans roots native OMP already scans; unique value = skills.sh remote search/fetch, `!cmd` directive interpolation, and a bundled flat `pix-*` skill set (28 files).
- `skillforge` (marketplace, 0.2.5-ezxomp.1): structured evidence capture (gotcha/decision/pattern, confidence, hits, verification) + promotion thresholds + human-gated skill patches; but owns a separate JSON store and runs its own `before_agent_start` retrieval that duplicates native memory recall.
- `experiences` (npm, 0.1.49-ezxomp.1): the review-first habit pipeline (capture → analyze → numbered review → steering with law/provenance/duplicate detection) — the only human-review layer of the three; skillforge already imports its `hostCenteredOverlay` UI host.

User config today: `memory.backend: mnemopi` with polyphonic/enhanced recall and proactive linking, `autolearn.enabled: true` + `autoContinue: true` — native autolearn writes behavioral lessons straight into `managed-skills/` with **no review gate** (33 skills on disk as of 2026-08-23). The review gate exists (experiences) but is not wired to autolearn.

## Decision

Consolidate the three plugins into one modular package: **`@ezxomp/agent-learning`** with four modules (facts, procedures, habits, surface), using native OMP discovery/memory/manage-skill as the substrate. Skills stays a thin secondary pack; skills.sh adapter remains with refreshed, safety-gated definitions.

## Non-goals

- Building a new skill registry or discovery layer — native discovery is the registry.
- A fourth memory store — procedures store in the unified store (decision: experiences SQLite) OR as tagged lessons in native mnemopi (decision pending).
- Migrating/renaming the `experiences` public surface (`/experience`, `/experience setup`) — kept as subcommands.
- Unbounded review: review gates apply to new + materially reworded learnings; exact normalized evidence still strengthens unchanged approved records.

## Module contracts

### Module 1: surface (was skills plugin — trimmed)
- **Scope:** skills.sh search/fetch (`searchRemoteSkills`/`fetchRemoteSkill`), `!cmd` directive interpolation, bundled catalog.
- **Bundled skills:** REPLACED. The `plugins/skills/skills/*.md` flat bundle (28 files) is removed; the plugin ships a **plugin/tool catalog** instead: one SKILL.md per ezxomp plugin that OMP actually loads, listing every tool/skill the agent can see + DO's / DON'Ts per tool.
- **Catalog content** (per plugin): backlog*, lean-ctx/lean-ctx-tools, experiences/agent-experience, skills/read_skills, skillforge/evidence-*, extensible-workflows, eval, codesight/ccc, omp-pstack-suite, omp-evo-mode, omp-model-fallback, omp-skill-guard. Each entry: what the plugin does, tools exposed, DO / DON'T table, error-recovery hints.
- **skills.sh adapter:** keep `search`/`source`/`name`/`full` flow; update definitions against the live API contract; tool description + README guidance scoped to **install only safe, programming-language-specific skills**; refuse/flag non-language skills in search results (curation in the tool copy, not hard filtering).
- **skills.sh API refresh (verified live 2026-08-23):** `GET https://skills.sh/api/search?q=<q>&limit=N` returns `{query, searchType: fuzzy, searchVersion: legacy, count, duration_ms, skills: [{id, skillId, name, installs, source}]}`. The current adapter reads `skills[].id/.name/.installs/.source` — still valid — but `searchVersion` now signals newer API versions; adapter definitions (descriptions, limits, URL construction) must be updated to the current contract and re-verified.

### Module 2: facts — thin adapter to native memory
- No own store, no own pre-turn injection. `learn`/`retain` route to native backend (mnemopi) — already the case; keep only a shim that translates the plugin surface to native tool calls where needed.

### Module 3: procedures (skillforge pipeline)
- Keep: evidence schema (`trigger[]`, `symptom[]`, `root_cause[]`, `fix[]`, `verification[]`, `confidence` draft→confirmed, `hits`, scope), promotion eligibility (confirmed + hits>=3 + target skills), human-gated apply flow, memory browser overlay.
- Change: store becomes the unified store (experiences SQLite via shared storage API OR tagged native mnemopi lessons — decision pending); `before_agent_start` recall injection removed/merged into native recall; promotion `apply` targets only reviewed patches into user skills or `manage_skill`-isolated managed skills — never silent direct writes.

### Module 4: habits (experiences pipeline)
- Keep the entire pipeline unchanged: capture buffer (bounded, redacted), analyze (manual/scheduled, snapshot batches), numbered review, approval, steering with law file + provenance markers, duplicate detection, fail-closed storage.
- New wiring: native `autolearn` captures route here through the unified review gate (see Gate).

### 5. The unified review gate (cross-cutting)
- Config flag `learning.review: on` (or `autolearn.review`): when on, any lesson/autolearn capture is classified: **fact** → native memory (no review); **procedure/gotcha** → procedures module (promotion thresholds then review); **habit/behavior** → habits module (analysis review). No direct writes to `managed-skills/` from autolearn when the gate is on.
- When off: current behavior (direct managed-skill write) preserved for compatibility.

## Edge cases

- Name collisions with authored skills: managed-skills always resolve last; `manage_skill` create refuses claimed names — the gate must surface the collision instead of failing silently.
- 64 KB cap on managed SKILL.md bodies — proposals to managed skills must truncate/verify evidence.
- Skills.sh search tokens: unchanged (2–200 chars); invalid/unparseable sources dropped silently.
- Existing 33 managed skills: triage by hand before first release — classify each as habit vs procedure; procedures may be promoted into the catalog or kept as user skills; habits move to experiences review queue.

#### Learning-review enforcement (TASK-29, 2026-08-23)
- Source of unreviewed writes: native `autolearn` with `autolearn.autoContinue:true` writes directly to `~/.omp/agent/managed-skills/` bypassing the review pipeline.
- Enforcement-by-config: set `autolearn.autoContinue:false` in `~/.omp/agent/config.yml` (or /settings → Auto-Learn → Auto-run capture at stop OFF); keep `autolearn.enabled:true` so manual `learn`/`retain` stays available.
- Tool-call block rejection: gate MUST NOT register `tool_call` — enforcement cites `runner.ts:265`/`wrapper.ts:65`/`types.ts:930` style approval-deny; this implementation wires guidance only via `before_agent_start`.
- Triage invariant: after promotion/archival (17 promoted, 0 remaining), 0 unclassified entries remain — every prior managed skill was classified as fact/procedure/habit and routed to its lane.

## Migration plan

1. Scaffold `@ezxomp/agent-learning` workspace package (package.json `omp` manifest, 4 modules, re-exports for backward compatibility of `read_skills` — removal is safe: native `skill://` covers read; keep only if existing user skills depend on `read_skills`).
2. Move skills plugin → surface module; delete bundled `pix-*` dir; add catalog.
3. Port skillforge → procedures; archive duplicate store (`~/.omp/agent/skillforge/` → `~/.omp/agent/archived/skillforge-<date>/`).
4. Keep experiences core; wire gate; add `/learning` top-level surface mapping to `/experience` + `/skillforge` sub-commands.
5. DOX + CHANGELOG updates; `just verify` green; smoke test per module.

## Implementation decisions (2026-08-23, TASK-27)

- **D1-revised (procedures store):** unified atomic-file store at `<agentDir>/agent-learning/` with one-time legacy migration from `<agentDir>/skillforge/` (single atomic rename, never clobbers). NOT the experiences SQLite v7 bump: the experiences schema has a fail-closed future-version guard, so a v7 database would brick the installed npm experiences plugin until upgrade. SQLite integration is deferred to a dedicated follow-up ticket.
- **Habits lane:** experiences stays a standalone companion package — 4 other plugins (augment, codesight, extensible-workflows, skillforge/agent-learning) import `@ezxomp/experiences/.../overlay-host.ts` directly, so physically moving the tree would break them. agent-learning routes to it via `/learning experience` and deliberately does NOT re-register its extension (duplicate registration hazard when both are installed).
- **read_skills scope:** list/description cover only the bundled catalog + cached remote bundles; user/project skills belong to native discovery (`skill://`, `/skill:`).
- **skills plugin:** thin backcompat publisher re-exporting agent-learning (shared `once()` key makes double registration a no-op during migration windows).
- **pix-* retirement:** bundled pix skills deleted; legacy `plugins/pix-skills` twin removed; extensible-workflows' gate import repointed to the consolidated module.

## References

- doc-3: Plugin Architecture: Skills, Skillforge, Experiences Integration Map
- doc-4: Plugin Architecture Analysis and Enhancement Plan
- Upstream sources: pi-coding-agent `src/extensibility/skills.ts`, `src/discovery/helpers.ts`, `src/autolearn/managed-skills.ts`, `src/tools/{learn,manage-skill}.ts`, `src/memory-backend/resolve.ts`, docs/mnemosyne-memory-backend.md
- skills.sh live API check 2026-08-23 (search contract shape)
