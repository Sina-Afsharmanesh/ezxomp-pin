---
id: TASK-56
title: >-
  Rearchitect ultra-compact into compact-eng: tools + hooks for efficient
  per-turn context built on OMP-native Shake and snapcompact
status: Done
assignee: []
created_date: '2026-08-30 00:06'
updated_date: '2026-08-30 06:59'
labels:
  - feature
  - architecture
dependencies: []
priority: high
type: feature
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enhance @ezxomp/ultra-compact (fork of pi-ultra-compact) into 'compact-eng' (Compact Engineering): a plugin whose focus is giving the LLM tools and hooks that keep context low turn after turn. Scope from operator order: (1) enable auto-compact built on OMP-native Shake (output shaking, artifact:// recovery) and OMP-native @oh-my-pi/snapcompact 18.0.6 (bitmap-frame context compression, dep of pi-agent-core/pi-coding-agent); (2) research patterns from 'Pi-dcp' (name unverified — researcher must identify the actual project/repo and cite it) and https://github.com/agenticoding/pi-agenticoding; (3) rename plugin ultra-compact -> compact-eng, absorbing Shake and snapcompact into the plugin's surface, extended per the researched repos. Architecture rule: every addition must introduce cohesion and extensibility to the native tools — extend, never overwrite/replace OMP-native Shake or snapcompact behavior. Known facts: plugin is plugins/ultra-compact, @ezxomp/ultra-compact@1.2.1-ezxomp.0, entry extensions/index.ts registers /ultracompact command + before_compact hook, engine extensions/engine.ts (tiered: preemptive ~70% watermark, micro 60-90% no-LLM, full 90%+; eviction levels; snapshot-rollback; circuit breaker). Plugin is marketplace-registered (14 plugins, see docs/omp-marketplace-update.md) so rename has install-identity implications. Deliverables: research doc (evidence + citations), architecture spec doc, rename ADR, rearchitected plugin with auto-compact, just verify green.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A cited Backlog research document covers Pi-dcp identity/candidates, pi-agenticoding patterns, and verified OMP Shake/snapcompact extension contracts.
- [x] #2 A linked compact-eng architecture spec defines extend-not-overwrite native composition, per-turn auto-compaction watermarks, recovery/fallback behavior, and testable interfaces.
- [x] #3 A linked rename ADR covers the clean ultra-compact to compact-eng cutover and marketplace install/cache/version consequences.
- [x] #4 The active marketplace plugin is renamed to compact-eng and every package, command, skill, registry, test, AGENTS.md, README, CHANGELOG, provenance, and generated current-state identity surface is migrated without aliases.
- [x] #5 Automatic turn-boundary behavior keeps context below the configured watermark by delegating through research-verified OMP-native Shake and snapcompact paths, preserving artifact recovery, snapcompact budgets/preserveData, native fallbacks, and text-only/error behavior.
- [x] #6 `just verify` is green, including `bunx tsc --noEmit` and `bun test test/`, and direct-source, local-link, and final marketplace fresh-agent checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
complexity: complex

1. Execute TASK-56.1, TASK-56.2, and TASK-56.3 in parallel as read-only research lanes. Each publishes a cited Backlog research record; Pi-dcp remains unresolved unless primary evidence identifies it. Checkpoint: all three records distinguish observed public extension surfaces from private/unavailable APIs.
2. Execute TASK-56.4 after all research lanes. Publish the single parent research synthesis and pattern matrix. Risk: source disagreement or Pi-dcp ambiguity must remain explicit rather than being normalized into an unsupported premise. Checkpoint: every synthesis claim traces to one of the three records.
3. Execute TASK-56.5 after synthesis. Publish the compact-eng spec covering plugin boundary, per-turn watermark/hysteresis state machine, reentrancy, native Shake/snapcompact delegation, vision/text-model paths, artifact/preserveData continuity, failure/no-progress behavior, marketplace constraints, and behavioral test matrix. Risk: any session_before_compact replacement can disable native speculation and a hook-supplied compaction bypasses native snapcompact selection; only research-verified public APIs may be selected. Checkpoint: map every parent outcome to a concrete file/symbol and observable test.
4. Execute TASK-56.6 after the spec. Record the clean-cutover rename ADR with package/slug/command/skill/version/provenance identities, marketplace cache/install consequences, rejected aliases, rollback, and two-phase validation. Checkpoint: enumerate every current identity surface in plugins/ultra-compact/**, .omp-plugin/marketplace.json, AGENTS.md, README.md, CHANGELOG.md, test/manifest.test.ts, test/smoke-plugins.test.ts, lockfile if affected, and generated CodeSight artifacts.
5. Execute TASK-56.7 in one jj task workspace/bookmark as the irreducible atomic mutation boundary: plugins/ultra-compact -> plugins/compact-eng plus the approved native-composing governor and every active identity/documentation/test caller. Do not split the plugin subtree from shared registry migration because neither half is independently shippable. Make test/compact-eng.test.ts RED contracts green without weakening them; if research changes the approved observable contract, return to planner to revise the plan/tests before implementation. Checkpoints: targeted contract/manifest/smoke tests, plugin typecheck, direct-source isolated live smoke, and a no-stale-ultra-compact identity scan.
6. Execute TASK-56.8 as an independent validator after implementation. Run compact-eng targeted tests, bunx tsc --noEmit, bun test test/, just verify, direct-source isolation, local-link fresh-agent self-check, and final marketplace fresh-agent self-check following skill://ezxomp-plugin-e2e-test and docs/omp-marketplace-update.md. Leave the user-scope shipping state as marketplace-installed. Checkpoint: record verbatim PASS evidence for each gate and each parent acceptance criterion.

Fake-edge analysis: the three source investigations are parallel and file-disjoint; synthesis genuinely consumes all three. The spec consumes the synthesis; the rename ADR consumes the fixed architecture. Implementation consumes both and is intentionally atomic because plugin-path rename, command/hook behavior, tests, marketplace identity, and current-state docs form one loadable package contract. Validation consumes the integrated plugin and does not own production files. Workers use one jj task workspace and task bookmark per docs/parallel-agents.md; workers never push or move main.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## plan completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-56
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-56" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: Operator order (verbatim): 'I want to enhance the ultra-compact plugin and see how we and enable a auto compact functionality based on omp's native Shake and also snapcompact features, lest see how we can ensure that these help keep a models context low turn agter turn, but we need to research patterns from Pi-dcp and https://github.com/agenticoding/pi-agenticoding, we may rename the pligin to compact-eng (Compact Engineering) as the focus of this plugin is to give the llm tools and hooks that ensure the most effecient use of context that is being send back each turn. Shake and snapcompact shoild be apart of this plugin and also extended based on the repos i mentioned. make sure to Architect this well, and each should introduce cohesion and extentability to the native tools not overwrite them'

Grounding facts (verified by orchestrator): repo /home/eag1/repo/ezxomp. Plugin: plugins/ultra-compact, @ezxomp/ultra-compact@1.2.1-ezxomp.0, fork of pi-ultra-compact (Vendex). Entry extensions/index.ts registers /ultracompact command + before_compact hook; engine extensio

## Decomposed into 8 sub-tickets
- TASK-56.1: Pi-dcp identity and context patterns are evidenced
- TASK-56.2: pi-agenticoding context-management patterns are evidenced
- TASK-56.3: OMP Shake and snapcompact extension contracts are evidenced
- TASK-56.4: Compact-eng research synthesis is published
- TASK-56.5: Compact-eng native-composition architecture is specified
- TASK-56.6: Compact-eng clean-cutover rename is decided
- TASK-56.7: Compact-eng ships as a native-composing auto-compaction plugin
- TASK-56.8: Compact-eng passes repository and marketplace gates
Dependencies:
- TASK-56.4 ← TASK-56.1,TASK-56.2,TASK-56.3
- TASK-56.5 ← TASK-56.4
- TASK-56.6 ← TASK-56.5
- TASK-56.7 ← TASK-56.5,TASK-56.6
- TASK-56.8 ← TASK-56.7

complexity: complex

## Context Packet (facts only)

### Observed files and roles
- `docs/authoring-extensions.md:1-173` — marketplace dependency-resolution contract; marketplace registration symlinks cached plugin source and does not install plugin dependencies.
- `docs/parallel-agents.md:1-77` — normative jj workspace/bookmark protocol; coordinator alone integrates, moves `main`, and pushes.
- `plugins/ultra-compact/package.json:1-38` — package identity `@ezxomp/ultra-compact` version `1.2.1-ezxomp.0`, OMP entry `extensions/index.ts`, skill directory, and host peer dependencies.
- `plugins/ultra-compact/extensions/index.ts:14-31` — module state and default configuration.
- `plugins/ultra-compact/extensions/index.ts:66-82` — `/ultracompact` handler delegates to `ctx.compact("ultracompact")`.
- `plugins/ultra-compact/extensions/index.ts:85-299` — `session_before_compact` handler implements threshold, summary, circuit-breaker, and fallback behavior.
- `plugins/ultra-compact/extensions/index.ts:301-337` — extension factory registers `/ultracompact`, session/model hooks, and `session_before_compact`; exports engine/config/result types.
- `plugins/ultra-compact/extensions/engine.ts` — `UltraCompactEngine` implementation.
- `plugins/ultra-compact/extensions/types/index.ts:27-62` — `UltraCompactConfig` fields.
- `plugins/ultra-compact/AGENTS.md:1-26` — plugin-local purpose, ownership, contracts, and verification note.
- `.omp-plugin/marketplace.json:35-40` — marketplace name/source/version for ultra-compact.
- `AGENTS.md:14` — monorepo package identity list contains `@ezxomp/ultra-compact`.
- `README.md:16,35` — install command and catalog row contain `ultra-compact`.
- `CHANGELOG.md:7` — root `[Unreleased]` section.
- `test/manifest.test.ts:14-39,129-130` — expected plugin slug/package/version and skill identity.
- `test/smoke-plugins.test.ts:14,40-44,76` — plugin discovery, engine import, and uniqueness smoke surfaces.
- `test/compact-eng.test.ts:1-99` — planner-authored contract tests for clean command/hook composition, watermark trigger, below-watermark no-op, and concurrent-check coalescing.
- `node_modules/.bun/@oh-my-pi+snapcompact@18.0.6/node_modules/@oh-my-pi/snapcompact/dist/types/snapcompact.d.ts:373-454` — Archive, Options, CompactionPreparation, and CompactionResult contracts.
- `node_modules/.bun/@oh-my-pi+snapcompact@18.0.6/node_modules/@oh-my-pi/snapcompact/dist/types/snapcompact.d.ts:559-594` — archive reconstruction helpers and `compact()` export.
- `node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+1d12b1b75ff4b2d3/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:389-425` — ContextUsage and CompactOptions public types.
- `node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+1d12b1b75ff4b2d3/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:455-535` — ExtensionContext public actions including `getContextUsage()` and `compact()`.
- `node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+1d12b1b75ff4b2d3/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-maintenance.ts:825-850` — native compact path emits `session_before_compact`; hook-provided compaction is marked `fromHook`; native snapcompact selection requires a non-hook result.
- `node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+1d12b1b75ff4b2d3/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-maintenance.ts:1200-1277` — native speculation covers LLM-backed methods and returns early when a `session_before_compact` extension handler exists; Shake and snapcompact are local methods.
- `archive/_reference/lean-ctx/skills/lean-ctx-errors/SKILL.md:28-31` — shaken output marker and exact `artifact://` recovery instruction.

### Exact targeted commands
- `bun test test/compact-eng.test.ts`
- `bun test test/compact-eng.test.ts test/manifest.test.ts test/smoke-plugins.test.ts`
- `bunx tsc --noEmit`
- `bun test test/`
- `just verify`
- `omp --no-extensions -e /home/eag1/repo/ezxomp/plugins/compact-eng/extensions/index.ts`

### Mechanical constraints
- `docs/authoring-extensions.md` is binding before plugin changes.
- `docs/parallel-agents.md` requires one jj task workspace and task bookmark per worker; workers do not push or move `main`.
- Production changes require a root `CHANGELOG.md` `[Unreleased]` entry.
- Plugin-local DOX lives in the plugin `AGENTS.md`; root current-state identity surfaces must be migrated on rename.
- Package version, marketplace version, and manifest-test expected version are byte-identical invariants.
- Final shipping state is a marketplace install; direct-source and local-link layouts are preceding verification gates.

## Planner evidence and decisions
- Scout `Planner56.CompactEngScout` performed read-only repo exploration; no files were changed by the scout.
- ADHD focus shortlisted native delegation, a hysteretic per-turn governor, one atomic clean-cutover mutation boundary, and disjoint research/documentation lanes. Rejected options included a compatibility alias, direct tool-result replacement, and a hook-supplied snapcompact result.
- RED proof: `bun test test/compact-eng.test.ts` returned 0 pass / 3 fail because `plugins/compact-eng/extensions/index.ts` does not exist. Failures cover renamed registration/native-hook preservation, watermark-triggered native compaction, and below-watermark/concurrent-check behavior.
- Plan-split/fake-edge result: TASK-56.1-.3 are independent research outcomes; TASK-56.4 synthesis consumes all three; TASK-56.5 spec consumes synthesis; TASK-56.6 ADR consumes the spec; TASK-56.7 is the atomic code/identity cutover; TASK-56.8 validates the integrated result.

## Context Packet correction
- `test/compact-eng.test.ts:1-100` — planner-authored contract tests; the earlier `:1-99` range is superseded by this exact range.

## AC evidence linkage (coordinator, 2026-08-30; all sub-tickets done, gates green)

- AC1 (research documents): doc-16 (Pi-dcp identity/patterns), doc-15 (pi-agenticoding context-management patterns), doc-14 (OMP 18.0.6 Shake + snapcompact extension contracts), doc-17 (parent research synthesis) — all present in backlog docs, each with objective source citations.
- AC2 (architecture spec): doc-18 "Compact-eng native-composition architecture [TASK-56]" — defines extend-not-overwrite composition, per-turn auto-compaction watermarks, recovery/fallback behavior, testable interfaces.
- AC3 (rename ADR): decision-4 "Clean cutover from ultra-compact to compact-eng [TASK-56]" (accepted) — covers cutover + marketplace install/cache/version consequences; superseded provenance recorded in plugins/compact-eng/UPSTREAM.json.
- AC4 (identity migration, no aliases): TASK-56.7 (rename + all identity surfaces: package, command, skill, registry, tests, AGENTS.md, README, CHANGELOG, provenance, upstreams.lock) — verified by TASK-56.8 AC3/AC4: final user-scope state 12/12 MKT marketplace installs, 0 LOCAL, ultra-compact absent from plugin list and node_modules; fresh-agent verdict=OK.
- AC5 (auto turn-boundary behavior via native paths): TASK-56.7 governor implementation + regression test (auto path fires with isIdle=false at agent_end); live evidence from TASK-56.8 AC3: agent_end watermark crossing at 56054>32768 issued exactly one native compaction request, receipt origin=auto, 56355→28755 tokens, then cooldown; text-only/error paths covered by test/compact-eng.test.ts (75 pass / 0 fail in targeted run).
- AC6 (just verify + fresh-agent checks): TASK-56.8 AC2 (bunx tsc --noEmit exit 0; bun test test/ 388 pass / 18 skip / 0 fail; just verify incl. fallow new-only gates passed) and AC3/AC4 (direct-source, local-link, and final marketplace fresh-agent checks all verdict=OK, 0 load warnings).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ultra-compact rearchitected into compact-eng: per-turn auto-compaction governor extending (not overwriting) OMP-native Shake/snapcompact, clean identity cutover with no aliases. Delivered via 8 sub-tickets (research docs doc-14/15/16/17, architecture doc-18, rename ADR decision-4, implementation TASK-56.7, gate validation TASK-56.8). Final state: main pushed (8c136dad), 12/12 plugins marketplace-installed, live auto-trigger proven end-to-end (agent_end, one native request, 56K→29K tokens), full gate green (tsc, 388-test suite, fallow, direct-source + local-link + marketplace fresh-agent checks all verdict=OK).
<!-- SECTION:FINAL_SUMMARY:END -->
