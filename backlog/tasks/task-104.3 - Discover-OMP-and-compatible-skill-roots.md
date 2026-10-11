---
id: TASK-104.3
title: Discover OMP and compatible skill roots
status: In Progress
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-08 17:50'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: high
type: bug
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.2 outcome in TASK-104's delivery tree: skill-health resolves the documented OMP, global-agent, project-local, and compatible roots without treating the vendored empty stub as authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/api/skill-health` produces a report, including an explicit empty report, for a valid attached project.
- [x] #2 Discovery covers `~/.omp/agent/skills`, `~/.agents/skills`, `.agents/skills`, `.gsd/skills`, and documented compatibility roots.
- [x] #3 Diagnostics report resolution method and root information without exposing unrelated absolute paths.
- [x] #4 The vendored empty skill-directory stub is not the OMP lookup authority.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.3
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:4".

Validator gate FAIL. Hash 01753caf8685030239ace838f6c42907d47950af274d22025203107f72a109ba. `just verify` exited 0: tsc clean; 530 tests, 512 pass, 18 skip, 0 fail; Fallow audit passed with existing glob warning. Runtime `/api/skill-health?project=/home/egsox/repo/ezxomp` returned HTTP 500: `skill-health data provider not found; checked=/home/egsox/repo/ezxomp/plugins/gsd-web/web/src/resources/extensions/gsd/tests/resolve-ts.mjs,/home/egsox/repo/ezxomp/plugins/gsd-web/web/src/resources/extensions/gsd/skill-health.ts`. Same failure from `collectSkillHealthData` at `plugins/gsd-web/web/server/skill-health-service.ts:101-104`. Root resolver returned six roots, including `~/.omp/agent/skills`, `~/.agents/skills`, `.agents/skills`, `.gsd/skills`, plus redacted compatibility entries; method/root info present and unrelated paths not exposed in redacted entries. No temporary probe files tracked. Kick to implement: provide valid staged skill-health provider/module resolution; then rerun full gate and runtime route checks.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-104.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Repair validator finding only: collectSkillHealthData in plugins/gsd-web/web/server/skill-health-service.ts still resolves obsolete vendored provider paths and causes /api/skill-health HTTP 500. Inspect staged OMP skill-health provider contract and existing service-runner patterns, switch to correct shipped provider without weakening explicit errors or root diagnostics. Preserve resolveSkillHealthRoots and vendored-stub exclusion. Run bounded valid/empty route checks and focused check; record notes. Do not edit tests or mark AC/Done.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:worker:11".

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-104.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Fix only validator finding. Current service lines 68-89 targets added invalid services-dist/skill-health-bundle.mjs. Authoritative staged provider is existing services-dist/skill-health.mjs (11k lines, bundled ESM). Change skill-health-service.ts to resolve/run existing skill-health.mjs using established subprocess flags/pattern; do not create or modify generated bundles. Remove untracked/added skill-health-bundle.mjs artifact. Preserve root resolver and route. Run one bounded direct provider/route check, record notes; no tests or AC/Done changes.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:worker:12".

Fixed plugins/gsd-web/web/server/skill-health-service.ts:
- Replaced wrong staged bundle resolution (resolveSubprocessModule + resolveSubprocessModule(packageRoot, "web/server/services-dist/skill-health.mjs")) with existing subprocess-runner contract
- Now uses resolveModulePaths(packageRoot, {modules:[{envKey:"GSD_SKILL_HEALTH_MODULE",bundle:"skill-health"}],label:"skill-health"}) as per ts-subprocess-flags.ts pattern
- Uses runSubprocess for invocation with proper env/GSD_SKILL_HEALTH_MODULE pointing to services-dist/skill-health.mjs
- Preserved error handling: resolveModulePaths throws descriptive error if bundle not found
- Preserved root resolver (resolveSkillHealthRoots) unchanged with proper existsSync import
- Preserved redacted compatibility roots
- Removed unused execFile import (now handled by runSubprocess)
- No skill-health-bundle.mjs artifact exists (only skill-health.mjs present in services-dist/)
- No tests modified

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.3
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:18".

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-104.3
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Fix validator finding only: in plugins/gsd-web/web/server/skill-health-service.ts line 5, change subprocess-runner import from ./bridge/subprocess-runner.ts to sibling ./subprocess-runner.ts. Do not change behavior or other files. Run direct module import and bounded collectSkillHealthData check; record notes. No tests/AC/Done changes.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:worker:23".

Fixed import path in plugins/gsd-web/web/server/skill-health-service.ts:6 from `./bridge/subprocess-runner.ts` to `./subprocess-runner.ts`. Verified direct module import of subprocess-runner.ts resolves correctly (exports resolveModulePaths, runSubprocess, SERVICES_DIST_DIR, bundleHref). The full skill-health-service.ts module load fails due to pre-existing bridge-service.ts → vendor-gsd-core dependency issue, not this change.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.3
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:27".

Validator gate pass. Checked hash d4b6b47b43a349471f0097dded239a3fa702512a. `just verify` passed (TypeScript check, full Bun test suite, Fallow new-only audit). Runtime assertions passed with GSD_WEB_PACKAGE_ROOT=plugins/gsd-web: collectSkillHealthData(process.cwd()) and collectSkillHealthData('/tmp') each returned report roots generatedAt/totalUnitsWithSkills/skills/staleSkills/decliningSkills/suggestions, including explicit empty reports (0 units, empty arrays). GET /api/skill-health for valid attached repo and explicit /tmp returned HTTP 200, complete skillHealth, six documented roots, resolutionMethod=documented-compatibility-roots, redacted compatibility diagnostics, no unrelated absolute paths. services-dist/skill-health.mjs present; skill-health-bundle.mjs absent; response had no vendor-gsd-core, resolve-ts.mjs, or skill-health-bundle leakage. Gate green=true, clean=true.
<!-- SECTION:NOTES:END -->
