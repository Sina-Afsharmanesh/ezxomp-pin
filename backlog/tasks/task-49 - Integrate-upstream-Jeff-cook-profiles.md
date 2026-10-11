---
id: TASK-49
title: Integrate upstream Jeff cook profiles
status: Done
assignee:
  - '@Main'
created_date: '2026-08-28 23:14'
updated_date: '2026-08-29 00:05'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/johanthoren/jeff/tree/main/agents'
priority: high
type: feature
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring useful agent-profile improvements from upstream johanthoren/jeff into the existing @ezxomp/cook plugin. Preserve the current cook lifecycle and native task dispatch, inject each profile at the correct stage/role boundary, apply the same tool rewrite and active-surface rules, and install the complete supported roster at project scope under .omp/agents with freshness/drift handling. Upstream reference: https://github.com/johanthoren/jeff/tree/main/agents
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cook plugin ships the approved upstream-derived profile roster with explicit stage/role contracts and no unsupported profile is silently installed.
- [x] #2 Cook stage dispatch selects the correct profile for each supported stage and preserves native task dispatch plus active tool-surface/tool-rewrite constraints.
- [x] #3 Project-level session initialization installs or refreshes the complete roster under .omp/agents and freshness/drift detection covers the roster.
- [x] #4 Tests exercise profile roster installation, stage/profile mapping, and project-level refresh or rewrite behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the existing OMP-specific planner/worker/validator/judge profiles as the local equivalents of upstream Jeff plan/implement/verify/review; do not install duplicate aliases. Add only the upstream stations with no local equivalent: cook-audit (conditional independent security review) and cook-refute (single-finding adversarial check). Do not add cook-execute or cook-refactor because this plugin has no operation/refactor stage contract to inject them into.
2. Add an explicit stage/profile registry in plugins/cook/extensions/constants.ts and update dispatch/prompt contracts so existing stages retain their local profiles while conditional audit/refute dispatches use their distinct profiles. Preserve the active task-tool probe and invalid-stage/role guards.
3. Extend project profile installation in plugins/cook/extensions/agents.ts and its contract tests to cover the complete 10-profile roster, marker exactness, project-level install/refresh, and stage/profile mapping. Correct sync ownership so cook skips both project and personal scopes while evo-sub owns rewritten profiles; retain awaited project-before-personal ordering.
4. Extend plugins/evo/extensions/evo/evoSub.ts and tools.ts role allowlists/ownership to include cook-audit.md and cook-refute.md without task or native write access, preserving eval-first operation and role-specific codesight/backlog capabilities.
5. Add or revise targeted cook/evo tests for roster, dispatch identity, conditional audit/refute contracts, evo rewrite coverage, and project-sync/evo-sub interaction. Run plugin-targeted tests, then the required full just verify gate after worker changes. Update cook/evo AGENTS contracts, package/UPSTREAM/marketplace/test manifest versions, and CHANGELOG.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Upstream Jeff main exposes ten stage profiles: plan, implement, refactor, execute, review, verify, audit, refute, council, and council-synthesis. Local OMP already has functional planner/worker/validator/judge equivalents plus scout/researcher and the two council profiles. The final scope therefore adds only the two distinct supported stations, cook-audit and cook-refute; execute/refactor remain deferred because no local operation/refactor stage contract exists.

Integration seams: native dispatch in plugins/cook/extensions/cook-tools.ts emits task({agent: "cook-<profile>"...}) after probing the active tool surface; plugins/cook/extensions/constants.ts owns the stage-to-profile registry; plugins/cook/extensions/agents.ts owns atomic project/personal installation and exact marker hashes; plugins/evo/extensions/evo/evoSub.ts and tools.ts own both-scope rewrite/restore and per-profile eval-first allowlists. Project sync skips both scopes while evo-sub owns byte-exact backups and remains awaited before personal sync.

Parallel implementation: TASK-49.1 delivered profile templates/roster/sync/metadata; TASK-49.2 delivered stage mapping and audit/refute dispatch; TASK-49.3 delivered evo-sub ownership and allowlists. The first isolated planner stalled before yielding, so the coordinator repaired the scoped contract tests and recorded this final plan directly through Backlog.

Final validation: targeted Cook suite (cook-agents, cook-dispatch, refute-parallel, protocol-prose, renderers-dag) passed 57/57; targeted Evo suite (extension, evo-sub-dual-scope) passed 25/25; Cook and Evo TypeScript checks passed; `just verify` passed Fallow, typecheck, 400 tests (382 pass, 18 intentional skip, 0 fail).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the supported upstream Jeff cook stations into @ezxomp/cook without duplicating existing OMP equivalents: added cook-audit and cook-refute, mapped conditional dispatch through a shared stage/profile registry, expanded project marker/hash installation to ten profiles, and made sync fail-safe across both evo-sub-owned scopes. Updated evo-sub allowlists, OMP docs, marketplace/provenance version 0.1.7-ezxomp.6, and changelog. Verified with focused Cook tests (57/57), focused Evo tests (25/25), Cook/Evo typechecks, and full `just verify` (Fallow + 400 tests: 382 pass, 18 intentional skips, 0 fail).
<!-- SECTION:FINAL_SUMMARY:END -->
