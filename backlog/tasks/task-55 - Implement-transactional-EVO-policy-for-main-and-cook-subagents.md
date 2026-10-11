---
id: TASK-55
title: Implement transactional EVO policy for main and cook subagents
status: Done
assignee:
  - '@eag1'
created_date: '2026-08-29 14:21'
updated_date: '2026-08-29 20:39'
labels:
  - feature
  - architecture
dependencies: []
priority: high
type: enhancement
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-54/doc-13 design in @ezxomp/evo: model-agnostic capability policy and routing guidance for the main agent and cook subagents, exact persisted restoration, transactional profile generations, scope-aware subagent policy, hook enforcement, and safe refresh/regeneration. Preserve protocol reads including xd://. Validate through the full plugin end-to-end isolation, local-link, and marketplace protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main EVO persists original active tools and restores them exactly after restart
- [x] #2 Subagent effective grants derive from original profile grants plus versioned EVO policy while preserving role least privilege
- [x] #3 Subagent state uses atomic versioned generations with hashes, conflict detection, and fail-closed restoration
- [x] #4 EVO allows native read for supported protocol URIs including xd:// while blocking filesystem reads with stable redirect guidance
- [x] #5 Task dispatch preflight blocks cook subagents when the active EVO generation is missing, stale, corrupt, or mismatched
- [x] #6 Restore, refresh, and regenerate behavior is covered by tests and the plugin passes direct-source, local-link, and marketplace fresh-agent E2E checks
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 CHANGELOG.md and owning AGENTS.md contracts are updated
- [x] #2 just verify passes and E2E evidence is recorded
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: complex

1. TASK-55.1 owns `plugins/evo/extensions/evo/{atomic,paths,substate}.ts` and any new generation-state module: replace the unversioned sub-only backup with one schema-versioned, hash-bearing, atomically committed main/sub generation and a shared transition serialization boundary; preserve invalid or partial evidence fail-closed. Verify with the planner's generation-shape and corruption contracts.
2. In parallel after TASK-55.1, TASK-55.2 owns `evoMain.ts` + `config.ts` and TASK-55.3 owns `tools.ts` + `frontmatter.ts`. TASK-55.2 persists pre-EVO active tools before mutation and restores those exact names after restart. TASK-55.3 derives child grants from the authoritative original profile, removes denied natives/nested dispatch, adds the required role floor, honors project-over-global precedence, and parses CSV/YAML-array frontmatter without losing byte originals.
3. TASK-55.4 depends on TASK-55.1 and TASK-55.3 and exclusively owns `evoSub.ts`: perform prepare/apply/verify/commit activation; compare-and-swap restore; conflict refusal with retained evidence; immutable-original refresh; and restore-before-rediscovery regenerate. Verify drift, missing/deleted/stale state, LF/CRLF, and overlay-baseline rejection.
4. TASK-55.5 depends on the generation and sub-lifecycle work and owns the shared `extensions/index.ts` integration boundary plus narrowly scoped routing/preflight modules: inject the canonical routing ladder, preserve protocol reads including `xd://`, emit stable reason codes with loop-safe guidance, and validate project-nearest cook profile generation/hash/policy before allowing `task` dispatch.
5. TASK-55.6 depends on all behavior-bearing children and owns only `plugins/evo/AGENTS.md` and root `CHANGELOG.md` for durable contracts/release notes, then records targeted EVO results and the direct-source, local-link, and marketplace fresh-agent E2E sequence. Workers never push or move `main`; each child uses its own jj task workspace and delivers a task bookmark per `docs/parallel-agents.md`.
6. Run the planner-authored targeted contracts: `bunx vitest run plugins/evo/tests/transactional-main-routing.test.ts` and `bunx vitest run plugins/evo/tests/transactional-sub-policy.test.ts`. After implementation, require all nine contracts green before the coordinator alone runs project-wide gates and installed-plugin E2E.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Context Packet (facts only)

- `plugins/evo/extensions/evo/evoMain.ts:24-25` stores `active` and `preEvoSnapshot` as process-local fields; `evoMain.ts:34-44` hydrates persisted `main` and reapplies tools; `evoMain.ts:104-115` falls back to `getAllTools()` when the snapshot is absent.
- `plugins/evo/extensions/evo/substate.ts:25-36` defines the current timestamp/toolListHash/files backup shape; `substate.ts:75-95` writes it with `fs.writeFile`; `substate.ts:97-105` parses or returns null.
- `plugins/evo/extensions/evo/evoSub.ts:34-45` lists ten owned cook profile filenames; `evoSub.ts:115-132` discovers both global and project directories; `evoSub.ts:155-161` writes backup then profile/config mutations; `evoSub.ts:190-257` restores entries and deletes state.
- `plugins/evo/extensions/evo/tools.ts:22-29` names blocked natives; `tools.ts:40-45` names the main protected floor; `tools.ts:103-111` defines the current sub floor; `tools.ts:113-190` defines per-role additions.
- `plugins/evo/extensions/evo/frontmatter.ts:21-70` rewrites one-line `tools:` frontmatter; `frontmatter.ts:72-99` injects the marked subagent brief.
- `plugins/evo/extensions/index.ts:41-42` defines the protocol-URI expression; `index.ts:53-55` constructs both controllers; `index.ts:59-96` registers the current native-tool hook.
- Existing targeted tests are under `plugins/evo/tests/extension.test.ts`, `substate.test.ts`, and `evo-sub-dual-scope.test.ts`; the planner added `plugins/evo/tests/transactional-main-routing.test.ts` and `plugins/evo/tests/transactional-sub-policy.test.ts`.
- Targeted commands: `bunx vitest run plugins/evo/tests/transactional-main-routing.test.ts`; `bunx vitest run plugins/evo/tests/transactional-sub-policy.test.ts`.
- RED evidence: the main/routing file ran 3 tests with 3 failures (missing generation state, missing routing injection, missing task preflight). The sub-policy file ran 6 tests with 6 failures (global copy mutated despite project shadow, unversioned state, drift overwritten, refresh absent, regenerate absent, YAML-array original grant not present in effective tools).
- Mechanical constraints: planner changes tests and Backlog plan only; production files remain unchanged; child workers use dedicated jj workspaces/bookmarks and never push or move `main`; coordinator owns project-wide validation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Transactional EVO policy shipped as @ezxomp/evo 0.1.7-ezxomp.5. AC1: main-generation.json persists exact original active tools; restart-restore proven by transactional-main-routing tests + E2E off-restore under both layouts. AC2: sub effective grants derived from original profile grants via versioned policy with per-role least privilege (transactional-sub-policy, dual-scope). AC3: atomic schema-v1 generations with SHA-256 hashes, CAS conflict refusal, fail-closed retention (generation-state, substate tests). AC4: protocol-URI reads incl. xd:// allowed, fs reads blocked with EVO_FS_READ_USE_NAV (routing tests). AC5: cook task-dispatch preflight blocks on missing/stale/corrupt/mismatched generation with EVO_SUBSTATE_INVALID. AC6: 46/46 evo vitest + just verify 382/0 + fallow-audit clean + full E2E (direct-source isolation, local-link fresh-agent verdict=OK, marketplace fresh-agent verdict=OK). DoD: CHANGELOG [Unreleased] + plugins/evo/AGENTS.md contracts updated (commit b931bb7, pushed to origin). All eight children closed.
<!-- SECTION:FINAL_SUMMARY:END -->
