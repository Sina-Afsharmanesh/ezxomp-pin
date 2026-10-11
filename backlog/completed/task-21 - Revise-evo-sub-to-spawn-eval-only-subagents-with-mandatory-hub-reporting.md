---
id: TASK-21
title: Revise /evo-sub to spawn eval-only subagents with mandatory hub reporting
status: Done
assignee: []
created_date: '2026-08-22 12:49'
updated_date: '2026-08-22 14:54'
labels:
  - feature
dependencies: []
priority: high
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Field evidence from 11 dispatches: giving subagents ONLY the eval tool raised task-completion success from ~50% to ~80-90%. Dominant killers: runtime budget ceiling (~10-30min turns end exit-1), brief ambiguities, stacked agents on one file. What worked: fresh spawns + pre-digested evidence + eval-only tool policy + write-first checkpoints.

Order: revise the MECHANICS of the /evo-sub slash command so that:
1. Spawned subagents see only the eval tool in their tool profile.
2. Subagent instructions mandate keeping Main updated via the HUB protocol.

NON-GOAL: do not touch /evo itself - only /evo-sub mechanics.

Survival patterns to encode in the sub-brief template (from failure inventory):
- Pre-digested evidence in every brief (zero exploration homework)
- Write-first checkpoint: file on disk within ~3 tool calls so partial progress survives death
- Single-file ownership per agent (no stacking)

First station: scout must LOCATE the /evo-sub definition (candidate homes: plugin commands dirs, ~/.omp/agent, .opencode, oh-my-pi install), determine how its subagent tool profile is constructed, and map where instruction text is injected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Invoking /evo-sub produces subagent profiles whose effective tool surface is exactly eval and hub; hub is the sole exception because it is required to report to Main, and no native, MCP, lean-ctx, task, or web tool is exposed
- [x] #2 Dispatched subagent instructions explicitly require hub reports to Main covering findings, status, and blockers at milestones and on completion
- [x] #3 The subagent brief embeds all proven survival patterns: supplied evidence means no exploration homework, a file change lands within about three tool calls, and one agent owns one file
- [x] #4 The /evo registration block, evoMain implementation, main-config behavior, and native tool-call block hook are unchanged
- [x] #5 The plugin-owned test and typecheck scripts pass, and a timestamped backup manifest proves only approved /evo-sub surfaces and the six target profiles changed despite the plugin tree not being git-tracked
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish recoverability before every write. Outside `~/.omp/omp-evo-mode`, create a timestamped backup directory and SHA-256 manifest. Snapshot `tests/extension.test.ts`; every source file immediately before it is touched (`extensions/evo/tools.ts`, `frontmatter.ts`, `evoSub.ts`, and only if truly needed `substate.ts` or `extensions/index.ts`); and all six real target profiles: cook-judge.md, cook-planner.md, cook-researcher.md, cook-scout.md, cook-validator.md, cook-worker.md. Also hash the read-only /evo boundary witnesses (`extensions/index.ts` lines 70-131, `evoMain.ts`, `config.ts`). Append newly touched paths to the manifest before writing. Risk: this plugin is not git-tracked, so no git-status claim is valid. Checkpoint: manifest copies and hashes exist before each mutation.

2. Complete TASK-21.1 first: retain the RED contract in `tests/extension.test.ts`. It must pin `buildEvoSubTools()` to ordered `["eval", "hub"]`; prove the frontmatter round trip; require the stable `<!-- evo-sub:brief:start -->` body marker once; require findings/status/blockers reports to Main at milestones and completion plus the three survival patterns; exercise all six cook profiles, one non-cook profile, on/off byte restoration, legacy sub-state hydration, and the `/evo` isolation source guard. Checkpoint: `bun run test -- tests/extension.test.ts` is intentionally RED only for these unimplemented behaviors; record the output.

3. Complete TASK-21.2: in `extensions/evo/tools.ts`, add `buildEvoSubTools` with the fixed two-item result and leave `buildEvoMainTools`, `EVO_MAIN_TOOLS_BASE`, and prefix behavior byte-identical. In `extensions/evo/evoSub.ts`, replace its current `buildEvoMainTools` call at activation with the new builder. Preserve `writeSubState`'s original-content snapshots and the two-tool hash. Risk: reusing the dynamic main builder leaks tools again. Checkpoint: allowlist and source-guard tests advance; existing /evo tests remain green.

4. Complete TASK-21.3: extend `extensions/evo/frontmatter.ts` with a narrowly scoped, stable-marker body-injection transform. It must append after YAML frontmatter, return identical content when already marked, and contain the exact reporting/survival requirements tested in step 2. In `extensions/evo/evoSub.ts`, discover only the exact six cook profile filenames rather than every `*.md`, combine frontmatter rewrite plus body injection, and snapshot the untouched original before the combined write. Do not add an external brief template. Risk: a snapshot taken after injection would make off destructive; retaining every-profile discovery would mutate unrelated users. Checkpoint: active profiles have only `tools: eval, hub` plus one marker; unrelated profiles stay byte-identical; off restores every original byte.

5. Complete TASK-21.4: keep lifecycle truth in `SubEvoController.hydrate()` and `/evo-sub` status. On persisted `sub: true`, restore the controller's effective two-tool in-memory state so `allowlistSize()` reports 2 after `session_start` or `turn_start`, without rewriting profiles or replacing an existing snapshot. `extensions/index.ts` lines 60-67 and 135-173 may be adjusted only if necessary for that /evo-sub status behavior; do not touch `/evo` lines 98-131. Keep `SubStateFile`'s current `timestamp`, `toolListHash`, and `files` readable; avoid a schema change because full original content already restores bodies. If metadata becomes unavoidable, make it optional when reading old state. Checkpoint: a legacy snapshot hydrates, status is non-mutating, and off restores it byte-exactly.

6. Complete TASK-21.5: execute the plugin's own scripts from `~/.omp/omp-evo-mode`: `bun run test` and `bun run typecheck`, then an isolated `OMP_HOME` on → status/debug → off cycle. Compare hashes against the manual manifest: permitted changes are `/evo-sub` surfaces, its tests, and only the six profile files; the /evo boundary witnesses must match. Current prerequisite risk: `bun run typecheck` exits 127 because neither `node_modules/.bin/tsc` nor `node_modules/typescript/package.json` exists. Resolve that declared-script prerequisite rather than silently substituting a global/compiler bypass, then record command output and manifest evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Kernel-read evidence: `extensions/index.ts:60-67` hydrates `subCtl` on session and turn start; `:135-173` implements on/off/debug/status. `evoSub.ts:79` currently calls `buildEvoMainTools`; `:83-86` selects every `.md`; `:105-117` snapshots original bytes then persists the active flag. `frontmatter.ts` rewrites only YAML tools today. `substate.ts` already stores complete original content, so body restoration needs no schema change.

Live target inventory is exactly six profiles: cook-judge.md, cook-planner.md, cook-researcher.md, cook-scout.md, cook-validator.md, cook-worker.md. The current scout profile body is the brief; no external template exists.

RED proof recorded after planner test authoring: `bun run test -- tests/extension.test.ts` exited 1 with 20 tests, 14 passed, 6 expected failures. Failures prove the current broad main-derived tools, missing `buildEvoSubTools`, missing marked injector, all-profile mutation, main-builder coupling, and hydrated status size 0. Planner backup: `~/.omp/agent/evo-mode/planner-backups/TASK-21/2026-08-22T13-09-06-031Z/extension.test.ts` with SHA-256 `6f4e2216e41d843484ac9f1afb571bcd0eb14ee989d21a8eb62f634073e36a66`.

Package scripts inspected: `test` is `vitest run`; `typecheck` is `tsc --noEmit`. `bun run typecheck` currently exits 127 (`tsc: command not found`); `node_modules/.bin/tsc` and `node_modules/typescript/package.json` are absent. This is a verification prerequisite, not evidence of a source failure.

Constraint reconciliation: literal eval-only conflicts with mandatory hub reporting. The executable contract is exactly `[eval, hub]`, with hub only for reporting Main. The parent AC and child tasks use that explicit exception. The old parent request for scoped git status is replaced by a backup-manifest comparison because this plugin tree is not git-tracked.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/evo-sub revision landed and independently verified end-to-end. Mechanics: /evo-sub on now rewrites the six cook agent profiles (~/.omp/agents/cook-{judge,planner,researcher,scout,validator,worker}.md) to a dedicated minimal allowlist buildEvoSubTools() -> ["eval","hub"] (hub present solely for the mandatory reporting duty; buildEvoMainTools untouched - /evo boundary hash-witnessed), injects exactly one idempotent marked survival brief per profile (hub reports to Main for findings/status/blockers at milestones+completion; pre-digested evidence/no exploration homework; file change within ~3 tool calls; single-file ownership), snapshots originals to sub-state.json, and off restores byte-for-byte. Hydrate recovery is read-only across restarts with legacy-snapshot tolerance. Stations: scout located the sole definition (~/.omp/omp-evo-mode); planner decomposed 5 sequential tickets with RED-first contracts; workers EvoW22/EvoW23/EvoW24 implemented (one death+revival, zero cold restarts); judges EvoJudge+EvoJudge4 REVIEW_PASSED batched rounds, 0 blocking; validator EvoVal VERIFIED with literal no-mock OMP_HOME on/status/off cycle (ASSERTIONS=PASS). Final gates: plugin suite 23/23 exit 0; typecheck exit 0 under corrected typeRoots (pre-existing /root hardcode documented as env prerequisite); boundary witnesses + manifest chain auditable despite non-git tree. Follow-ups parked: END-marker collision hardening (optional, non-corrupting); sub:true+missing-snapshot status edge (truthful display).
<!-- SECTION:FINAL_SUMMARY:END -->
