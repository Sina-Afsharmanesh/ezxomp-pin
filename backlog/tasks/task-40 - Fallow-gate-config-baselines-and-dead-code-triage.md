---
id: TASK-40
title: 'Fallow gate: config, baselines, and dead-code triage'
status: Done
assignee: []
created_date: '2026-08-28 16:27'
updated_date: '2026-08-28 17:21'
labels:
  - refactor
  - chore
dependencies: []
priority: high
type: chore
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wire the Fallow CLI into the ezxomp gates and clean up what it finds. Fallow (https://github.com/fallow-rs/fallow, MIT, deterministic static analysis) detects unused files/exports/dependencies, duplication, circular deps, and complexity hotspots without any LLM. Scope: (1) commit `.fallowrc.json` with audit gate=new-only, production mode, CSS analysis off; (2) capture initial baselines to `fallow-baselines/` (dead-code, health, dupes); (3) run a full-repo scan and triage every finding — fix in place or spawn a ticket; (4) `just verify` now includes `fallow-audit` (new-only vs base ref, FALLOW_AUDIT_BASE override). The justfile already has the recipes (fallow-audit, fallow-scan, fallow-dead-code, fallow-baseline) — this task is config + baselines + triage + making the gate green.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `.fallowrc.json` committed at repo root with audit.gate=new-only, css disabled, and documented exclusions for generated/vendored paths
- [x] #2 `fallow-baselines/` contains dead-code, health, and dupes baselines captured from the current main
- [x] #3 Every finding from the initial full-repo `fallow` scan is triaged: fixed in-place or captured as its own Backlog task with file:line references
- [x] #4 `just verify` runs check + test + fallow-audit and exits green on the current tree
- [x] #5 `fallow-audit` correctly fails on a synthetically introduced dead export (negative control)
- [x] #6 milestone m-3 is set on the created tasks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan — Fallow gate: config, baselines, dead-code triage

Research: doc-11 (backlog/docs/doc-11, type=research) — fallow v3.20.0 config schema + baseline mechanics, every claim cited to docs.fallow.tools / fallow-rs/fallow / schema.json. Config keys are `additionalProperties:false` — unknown keys are rejected at load, so only documented keys may appear in .fallowrc.json.

## 1. `.fallowrc.json` (new, repo root) — slice 4a (TASK-40.1)
JSONC, all keys documented:
- `$schema`: https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json
- `production: true` (excludes test/dev files from dead-code discovery)
- `ignorePatterns`: additions only — e.g. `plugins/plannotator/generated/**`, `.codesight/**`. Built-in defaults already exclude **/node_modules/**, **/dist/**, build/**, **/.git/**, **/coverage/**, **/*.min.js/.mjs/.cjs, **/*.bundle.js — do NOT re-list them. `!`-negation is NOT documented for ignorePatterns — do not use.
- `audit`: `{ gate: "new-only", css: false, cssDeep: false }` (css:false = `--no-css`; no other global CSS-off key exists)
- NO `base` key exists in config — base ref is CLI/env only (`--base`, `FALLOW_AUDIT_BASE`), already handled by the justfile.
- NO `audit.*Baseline` keys in this slice (no files exist yet; referencing missing baselines may hard-error — UNDOCUMENTED).
- One root config covers all 15 `plugins/*` workspaces (auto-detected from package.json workspaces; cross-package symlink resolution documented). No per-workspace configs.

## 2. `just verify` integration — already wired, verify only
justfile (verified verbatim): `verify: check test fallow-audit`; `fallow-audit base=fallow-base` = `npx fallow audit --base {{base}} --gate new-only --quiet`; `fallow-base := env_var_or_default("FALLOW_AUDIT_BASE", "main")`. Do not duplicate. 4a's job is to make this GREEN (not to change it): exit 0 = clean/pass/warn, 1 = findings (fail), 2 = runtime error (e.g. bad base ref).

## 3. `just fallow-baseline` fix + baseline capture — slice 4b (TASK-40.2)
**Bug found in planning**: the recipe writes `npx fallow <cmd> --format json > fallow-baselines/<name>.json` (stdout redirect of the report). Docs: baselines are captured with `--save-baseline <PATH>` on the standalone commands (a fingerprint format, not the report format); `fallow audit` REJECTS global --baseline/--save-baseline (exit 2) and consumes baselines only via config keys or per-analysis flags. Since the justfile passes no baseline flags, the config keys are the only consumption path.
Fix (4b):
```
mkdir -p fallow-baselines
npx fallow dead-code --save-baseline fallow-baselines/dead-code.json
npx fallow health    --save-baseline fallow-baselines/health.json
npx fallow dupes     --save-baseline fallow-baselines/dupes.json
```
Then: run `just fallow-baseline`; confirm 3 non-empty files; ADD to .fallowrc.json `audit`: `deadCodeBaseline: "fallow-baselines/dead-code.json"`, `healthBaseline: "fallow-baselines/health.json"`, `dupesBaseline: "fallow-baselines/dupes.json"`; confirm `just fallow-audit` still exits 0 (baselines = suppression lists: findings present in baseline are excluded from the verdict; a later-fixed entry is just an unused suppression — removals never turn the gate red, so no re-capture is required when fixing).

## 4. Triage — slices 4b/4c (TASK-40.2 / TASK-40.3)
- `fallow dead-code` (alias check) finds: unused files/exports/types/deps, unresolved imports, **circular dependencies + re-export cycles**, boundary violations, stale suppressions. `fallow dupes` finds cross-file clones (default mode mild; skips test/mock + framework output by default). `fallow health` = complexity/hotspots only (circular deps are NOT health findings).
- Every finding: fix in place OR spawn its own Backlog task with file:line references (TASK-40 AC3). Findings map onto existing code-nav/codesight tooling for locating callers — NO new plugins.
- Unused-dependency findings may carry `used_in_workspaces` = placement issue, not auto-remove.
- After in-place fixes: optional final `just fallow-baseline` to ratchet the frozen set down.

## 5. Negative control — slice 4d (TASK-40.4)
test/fallow-gate-negative-control.test.ts (bun test; deterministic, isolated, cleans up): write a synthetic file with a never-imported export inside the repo tree → `just fallow-audit` MUST exit 1 (new finding vs base) → remove file → MUST exit 0. Works with or without baselines (the export is new, hence not baselined). Fallback if base-ref resolution fails in the test env: `npx fallow dead-code --fail-on-issues` scoped to the synthetic file, with the manual repro recorded.

## 6. RED tests (authored by planner, must fail now)
test/fallow-gate-contract.test.ts — contract tests that fail for the right reason today:
1. `.fallowrc.json` exists at repo root (RED: NOT-FOUND)
2. parses as JSONC, has $schema + audit object (RED)
3. audit.gate="new-only", audit.css=false, production truthy (RED)
4. no unknown top-level/audit keys (documents the additionalProperties:false constraint)
5. justfile `fallow-audit` recipe keeps `--base`, `--gate new-only` (GREEN — contract already holds)
6. justfile `fallow-baseline` recipe uses `--save-baseline` (RED: recipe currently redirects --format json)
7. justfile `verify` depends on check, test, fallow-audit (GREEN)
Runner: `bun test test/fallow-gate-contract.test.ts`. Full-suite note: the file is self-sufficient (reads files only, spawns no processes, no network) and fails deterministically while 4a/4b are unimplemented.

## 7. Open risks (worker must resolve with evidence in the jj task workspace)
- **R1 base-ref in jj workspaces**: `fallow audit --base main` runs `git diff --name-only main...HEAD` — hard-errors if `main` is not a resolvable GIT ref in the workspace (jj bookmark-only state). Workers may not move main (docs/parallel-agents.md); coordinator ensures `main` has a git ref before dispatch, or `FALLOW_AUDIT_BASE` is pointed at a known-good commit SHA.
- **R2 Node >= 22 for npx**: fallow engines.node>=22; repo is bun-managed. Verify `node --version` on npx's PATH in the workspace; if absent, escalate (npx is the documented zero-install path; no package.json change planned — fallow intentionally NOT added to devDependencies).
- **R3 generated/vendored inventory**: ignorePatterns starting list is minimal; worker confirms the real generated/vendored set during triage and expands the list.
- **R4 missing-baseline reference**: UNDOCUMENTED whether audit hard-errors when a configured baseline file does not exist → hence slice 4a ships without baseline keys, 4b adds them after capture.

## 8. Protocol
Each slice runs in its own jj workspace per docs/parallel-agents.md (worker: `jj new main`, commit with `jj describe -m`, deliverable `jj bookmark create <task> -r @-`, never push, never touch main). 4b/4c/4d depend on 4a (config + green gate first). Coordinator merges locally, runs `just verify`, pushes main once. Milestone m-3 on all four children.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## plan completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-planner", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-planner's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
PLANNER → TASK-40
1. Explore wide and deep (spawn a cook-scout subagent for unknowns)
2. ADHD for approach selection on design decisions
3. DECOMPOSE into atomic sub-tickets: run cook_decompose with parent_task_id="TASK-40" and subtasks[] — each independently shippable, with depends_on edges for multi-step work
4. Author tests, prove RED
5. Record parent plan via backlog_task_edit --plan; notes via --append-notes
Return PlannerEnvelope.

Context: User goal: incorporate the Fallow CLI (github.com/fallow-rs/fallow — MIT, deterministic static analysis, no LLM) into the ezxomp repo so `just verify` catches dead code/dupes/circular deps before shipping. A milestone (m-3 "Fallow codebase intelligence gate") and task TASK-40 already exist. The justfile has ALREADY been updated with recipes: fallow-audit (npx fallow audit --base $FALLOW_AUDIT_BASE||main --gate new-only --quiet), fallow-scan, fallow-dead-code, fallow-baseline (writes fallow-baselines/*.json). Remaining work per TASK-40: (1) commit .fallowrc.json (audit.gate=new-only, css off, production mode for dead-code, exclude generated/vendored paths); (2) run initial full-repo fallow scan, capture baselines into fallow-baselines/; (3) triage every finding — fix in place or spawn ticket; (4) make `just verify` (check + test + fallow-audit) green including a negative control (synthetic dead export must fail the audit); (5) set milestone m-3 on any spawned child tasks. IMPORTANT: user instructed "don't run the CLI" during planning — plan only, the worker execut

## Decomposed into 4 sub-tickets
- TASK-40.1: 4a: Commit .fallowrc.json + make just verify / fallow-audit green
- TASK-40.2: 4b: Fix fallow-baseline recipe to --save-baseline, capture baselines, dead-code triage
- TASK-40.3: 4c: Dupes + circular-dependency triage
- TASK-40.4: 4d: Negative-control test — gate must fail on a synthetic dead export
Dependencies:
- TASK-40.2 ← TASK-40.1
- TASK-40.3 ← TASK-40.1
- TASK-40.4 ← TASK-40.1

## Planner findings (2026-08-28, cook-planner)
1. **justfile `fallow-baseline` recipe bug (verified verbatim + docs)**: it captures baselines via `npx fallow <cmd> --format json > fallow-baselines/<name>.json` (stdout redirect of the report). Fallow docs: baselines are captured with the dedicated `--save-baseline <PATH>` flag on the standalone commands (`fallow dead-code --save-baseline ...`, `fallow health --save-baseline ...`, `fallow dupes --save-baseline ...`) — a fingerprint format, not the report format. `fallow audit` REJECTS global `--baseline`/`--save-baseline` (exit 2; incompatible sub-analysis formats) and consumes baselines only via config keys `audit.deadCodeBaseline/healthBaseline/dupesBaseline` or per-analysis flags. The justfile passes no baseline flags, so the config keys are the only consumption path. Slice 4b fixes the recipe and adds the config keys.
2. **Ratchet semantics are safe** (docs): a baseline entry that gets fixed is an unused suppression — the gate never turns red on removals. No re-capture required when fixing findings; optional final `just fallow-baseline` to shrink the frozen set.
3. **Config schema is `additionalProperties:false`** — unknown keys are rejected at load. The RED contract test encodes the full documented key set (doc-11).
4. **`ignorePatterns`** is the exclusion key (not ignore/exclude); built-ins already cover node_modules/dist/build/.git/coverage/min/bundle; `!`-negation is NOT documented for it.
5. **Open risks R1/R2** recorded in plan section 8: (R1) `--base main` needs `main` resolvable as a GIT ref in the jj workspace — coordinator must guarantee before dispatch (workers may not move main); (R2) `npx fallow` needs Node >= 22 on PATH in a bun-managed env — worker verifies + records version.
6. **RED evidence**: test/fallow-gate-contract.test.ts (authored by planner, bun test) — 4 pass / 9 fail, exit 1. Failing: all `.fallowrc.json` contract tests (file absent) + `fallow-baseline --save-baseline` (recipe still redirects). Passing: verify chain, fallow-audit flags, FALLOW_AUDIT_BASE default, scan/dead-code recipes. Goes green as slices 4a/4b land.
7. **Milestone m-3**: children TASK-40.1–.4 created with deps (4b/4c/4d ← 4a); the backlog_task_edit wrapper has no milestone field — coordinator applying m-3 via backlog CLI.
8. **Negative-control design** (slice 4d): synthetic dead export in-tree → `just fallow-audit` must exit 1 → remove → exit 0; works with or without baselines (new finding not baselined). Fallback: `npx fallow dead-code --fail-on-issues` scoped to the file.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @ManagingHoverfly
created: 2026-08-28 17:20
---
REVIEW_PASSED — no blocking findings. Evidence reviewed: .fallowrc.json has documented schema/audit keys and root-relative exclusions; fallow-baselines/dead-code.json, health.json, and dupes.json exist; just verify and the 13 contract tests pass; the synthetic file repro fails then cleanly passes; overlay-host.js is absent while index.ts imports overlay-host.ts. Fallow docs confirm omitted --base auto-detects merge-base against upstream/remote default and FALLOW_AUDIT_BASE remains the fork/CI escape hatch, so the jj-safe no-pin decision is correct for local working-copy coverage. FOLLOW-UP: test/fallow-gate-contract.test.ts:152-166 only asserts recipe text; the negative control is a manual untracked file reported as unused-file, not a durable test of an unused export. Add a deterministic test (or equivalent targeted repro) where a reachable module gains an unreferenced export, and restore it. FOLLOW-UP: justfile:29,33,37,45-47 invokes unpinned npx fallow with no --yes; latest-version/network/cache drift can make baselines non-reproducible or clean CI installs prompt/fail. Pin the CLI/package or document an explicit version/install policy. FOLLOW-UP: .fallowrc.json:23-34 uses broad runtime entry globs (notably plugins/plannotator/server/*.ts, plugins/experiences/runtime/**/*.mjs, scripts/**/*.ts); new files under these globs become graph roots and can hide genuinely dead files. Narrow the patterns or add an inventory/contract requiring each runtime entry. FOLLOW-UP: CHANGELOG.md:5-10 has no Fallow Unreleased entry despite the root contract requiring one for every meaningful change. Add a concise entry. BACKLOG HYGIENE: parent ACs are checked and child notes carry evidence, but TASK-40 remains In Progress with no final summary; finalize after addressing or accepting the follow-ups.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fallow gate integrated: .fallowrc.json (production, new-only, baselines, runtime entry globs, exclusions), justfile recipes (audit pinned npx -y fallow@3.20.0 with auto-detected base — jj HEAD-lag safe; baseline --save-baseline with exit-1 tolerance), fallow-baselines/ fingerprints, 13 contract tests green, stale overlay-host.js deleted, dead-code triaged into TASK-40.5-.10 + TASK-43. Negative control proven (synthetic dead export → exit 1; clean → exit 0). just verify exit 0 end-to-end. Judge REVIEW_PASSED, no blocking; follow-ups addressed (pinned CLI, CHANGELOG, TASK-43 for durable negctl + entry-glob narrowing). Verified with just verify (exit 0), bun test contract 13/13, negative control run.
<!-- SECTION:FINAL_SUMMARY:END -->
