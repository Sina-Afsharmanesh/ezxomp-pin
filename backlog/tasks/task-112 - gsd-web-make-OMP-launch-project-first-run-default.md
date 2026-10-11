---
id: TASK-112
title: 'gsd-web: make OMP launch project first-run default'
status: Done
assignee: []
created_date: '2026-09-10 03:08'
updated_date: '2026-09-10 03:26'
labels:
  - frontend
  - omp
dependencies: []
modified_files:
  - CHANGELOG.md
  - plugins/gsd-web/AGENTS.md
  - plugins/gsd-web/web/components/gsd/onboarding-gate.tsx
  - plugins/gsd-web/web/components/gsd/onboarding/step-project.tsx
priority: high
type: feature
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GSD Web already receives GSD_WEB_PROJECT_CWD from OMP launcher, but onboarding repeats project selection. Make supplied launch project authoritative for first-run selection; retain existing project picker only when no launch project exists or user explicitly switches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A valid GSD_WEB_PROJECT_CWD still becomes active before workspace boot
- [x] #2 Onboarding completion no longer presents a second project selection step
- [x] #3 No-launch sessions retain the existing project selection gate and explicit project switching
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace launch-CWD selection and onboarding completion in app-shell and onboarding-gate; retain ProjectSelectionGate as fallback and ProjectsPanel as explicit switcher.
2. Remove StepProject from onboarding sequence; complete ready step by navigating dashboard and refreshing boot.
3. Update local GSD-web contract and changelog; verify with focused tests, web build, and standalone smoke if runnable.
Risk: onboarding has async bridge/auth transitions; alter only terminal navigation, not lock or provider state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npm run build succeeded and staged standalone runtime. Browser smoke with GSD_WEB_PROJECT_CWD=/home/eag1/repo/ezxomp.gsd-web-omp-project-first rendered the dashboard directly with that path as active project; no onboarding project step appeared. No-launch standalone smoke returned launchCwd:null and project:null, then rendered existing project-selection gate. just verify passed: 525 pass, 17 skip, 0 fail; Fallow passed. Web package npm test remains baseline-red because Node strip-types does not resolve @/ aliases in route tests; web typecheck remains baseline-red in vendored code, with no diagnostics in changed files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made OMP launch CWD project-first, removed duplicate onboarding project selection and its component, retained no-launch project picker plus Projects panel switching. Verified standalone launch and fallback browser surfaces, web build, and just verify.
<!-- SECTION:FINAL_SUMMARY:END -->
