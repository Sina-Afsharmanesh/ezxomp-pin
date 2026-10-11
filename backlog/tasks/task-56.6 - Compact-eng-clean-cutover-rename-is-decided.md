---
id: TASK-56.6
title: Compact-eng clean-cutover rename is decided
status: Done
assignee: []
created_date: '2026-08-30 00:14'
updated_date: '2026-08-30 01:39'
labels:
  - architecture
  - design
dependencies:
  - TASK-56.5
documentation:
  - decision-4
modified_files:
  - >-
    backlog/decisions/decision-4 -
    Clean-cutover-from-ultra-compact-to-compact-eng-TASK-56.md
parent_task_id: TASK-56
priority: high
type: docs
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record the rename decision after the architecture is fixed. Decide the one-step ultra-compact to compact-eng cutover and enumerate marketplace/install/cache/package/command/skill/provenance/version/documentation consequences, rejected compatibility aliases, rollback, and two-phase marketplace validation. Use a Backlog ADR/decision record; no production edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Backlog ADR/decision linked to TASK-56 states the selected plugin slug, package name, command, skill name, version policy, and provenance treatment.
- [x] #2 Consequences cover plugins directory, package manifest, .omp-plugin/marketplace.json, root AGENTS.md, README.md, CHANGELOG.md [Unreleased], plugin AGENTS/README/CHANGELOG/UPSTREAM, root manifest/smoke tests, lockfile when applicable, and generated CodeSight refresh.
- [x] #3 The ADR rejects or justifies compatibility aliases against the clean-cutover requirement and explains uninstall/reinstall/cache consequences.
- [x] #4 Rollback and the docs/omp-marketplace-update.md two-phase direct-source/link/marketplace verification sequence are explicit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: simple

1. Read TASK-56, its facts-only context packet, and fixed architecture `doc-18`; isolate the TASK-56.6 rename boundary from runtime implementation.
2. Inventory every active ultra-compact identity surface in the marketplace, package/provenance files, root docs, scripts, tests, lockfile, recipes, and generated CodeSight artifacts.
3. Record an accepted Backlog decision linked to TASK-56 selecting the clean-cutover identities, major-version policy, provenance treatment, install/cache handling, validation gates, rollback, and rejected alternatives.
4. Verify the persisted decision against TASK-56.6 AC 1-4, link the artifact to the task, then record evidence and close the documentation ticket. No production files or tests are changed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Context Packet (facts only)

### Observed files and roles
- `backlog/decisions/decision-4 - Clean-cutover-from-ultra-compact-to-compact-eng-TASK-56.md:1-128` — accepted decision linked by title and task documentation field to TASK-56; contains Context, Decision, Consequences, Rollback, and Alternatives considered.
- `doc-18` — post-cutover architecture and `plugins/compact-eng/` file/symbol map; section 9 assigns rename mechanics to TASK-56.6.
- `docs/omp-marketplace-update.md:1-105` — two-phase local-link then marketplace protocol; final shipping state is marketplace install.
- `.omp-plugin/marketplace.json:35-40` — current `ultra-compact` marketplace name/source/version/attribution.
- `plugins/ultra-compact/package.json:1-38` — current package `@ezxomp/ultra-compact@1.2.1-ezxomp.0`, entrypoint, skill root, and OMP 18.0.6 peer dependencies.
- `plugins/ultra-compact/UPSTREAM.json:1-18` — locked `pi-ultra-compact@1.2.1` tarball origin, integrity, imported paths, and local fork version.
- `AGENTS.md:14`, `README.md:16,35`, and `CHANGELOG.md:7` — root identity/catalog/install and `[Unreleased]` surfaces.
- `scripts/import-upstreams.ts:70`, `scripts/install-local.ts:19`, and `scripts/verify-omp.ts:24,64-69,442` — fork-version, link, package/command, and skill expectations.
- `test/manifest.test.ts:16,23,36,129-130` and `test/smoke-plugins.test.ts:14,40-44,76` — active slug/package/version/skill/discovery/engine expectations.
- `bun.lock:189-191,375` — current workspace directory, package, version, and workspace resolution.
- `.codesight/CODESIGHT.md:4,1701-1702`, `.codesight/libs.md:1617-1618`, and `.codesight/wiki/overview.md:7` — generated current-state package/path/symbol references.
- Root `package.json` uses workspace glob `plugins/*`; root `justfile` runs generic test recipes and contains no plugin identity literal.

### Exact verification performed
- Read back decision-4 after creation and confirmed all four required sections and identity/install/rollback consequences are persisted.
- `backlog task edit TASK-56.6 --doc decision-4 --modified-file <decision path> --plain` confirmed task documentation linkage and the single modified decision artifact.
- No tests, formatters, linters, builds, production edits, CodeSight refresh, install changes, VCS mutations, or marketplace changes were run; this ticket is documentation/decision-only by scope.

## Quality and AC evidence
- AC1: decision-4 selects `compact-eng`, `@ezxomp/compact-eng`, `/compact-eng`, `skills/compact-eng/SKILL.md`, `2.0.0-ezxomp.0`, and immutable upstream plus explicit rearchitecture provenance.
- AC2: decision-4 Consequences items 1-9 enumerate the plugin move/manifest, marketplace, root and plugin docs, scripts/tests, root generic manifests/recipes, lockfile, and `/codesight-refresh` implications.
- AC3: decision-4 rejects command/package/skill/path aliases and records existing cached install behavior plus ordered old-uninstall/new-install and stale-key handling.
- AC4: decision-4 records auditable jj rollback and direct-source, local-link/fresh-agent, push, marketplace/fresh-agent validation with both new-present and old-absent checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published accepted Backlog decision-4, linked it to TASK-56. The ADR defines the one-step `ultra-compact` → `compact-eng` cutover, selects `@ezxomp/compact-eng`, `/compact-eng`, `skills/compact-eng/SKILL.md`, and `2.0.0-ezxomp.0`, preserves upstream provenance while naming the ezxomp rearchitecture, inventories every affected identity surface, rejects aliases, specifies install/cache migration, and records jj rollback plus direct-source/local-link/marketplace fresh-agent gates. Verified by reading back decision-4 and confirming the task documentation/modified-file linkage; no production or install state was changed.
<!-- SECTION:FINAL_SUMMARY:END -->
