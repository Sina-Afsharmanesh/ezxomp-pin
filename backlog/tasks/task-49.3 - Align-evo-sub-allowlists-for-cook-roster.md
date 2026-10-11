---
id: TASK-49.3
title: Align evo-sub allowlists for cook roster
status: Done
assignee:
  - '@Main'
created_date: '2026-08-28 23:34'
updated_date: '2026-08-29 00:04'
labels:
  - feature
  - architecture
dependencies: []
references:
  - 'https://github.com/johanthoren/jeff/tree/main/agents'
parent_task_id: TASK-49
priority: high
type: task
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend evo-sub profile ownership and per-profile tool allowlists to every shipped cook profile, preserving eval-first operation and forbidding child spawning/native mutation tools.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 evo-sub rewrites and restores every shipped profile in both personal and project scopes.
- [x] #2 Each new profile receives stage-appropriate codesight/backlog tools plus eval/hub/web_search/code-nav without task or native write tools.
- [x] #3 Tests prove profile-specific allowlists and byte-exact restore behavior for the expanded roster.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read evo-sub rewrite and profile ownership contracts. 2. Add missing cook station files to ownership and per-profile allowlists. 3. Preserve eval-first and exclude task/native mutation tools. 4. Update focused dual-scope/profile rewrite tests and evo docs. 5. Run only targeted evo tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded evo-sub ownership to cook-audit.md and cook-refute.md (10-profile local roster). Added both role allowlists with eval/hub/web_search base plus code-nav and read-only codesight orientation/impact tools; no task or native mutation tools added. Verified declarations parse with ast-grep and exact new profile entries resolve in source.

Evo worker expanded COOK_SUB_PROFILES and SUB_ROLE_TOOLS for cook-audit.md/cook-refute.md with read-only codesight/backlog_task_view grants; coordinator completed documentation and focused assertions. Cook and evo targeted suites pass, including dual-scope rewrite/restore.

Validation evidence: `bunx vitest run --config vitest.config.ts tests/extension.test.ts tests/evo-sub-dual-scope.test.ts` passed 25/25; Cook focused roster tests passed 24/24; `bunx tsc --noEmit -p plugins/evo/tsconfig.json` passed; `just verify` passed all gates. Expanded ten-profile ownership and role allowlists are exercised through both-scope rewrite/restore tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended evo-sub ownership and per-profile eval-first allowlists to cook-audit and cook-refute, preserving read-only codesight/backlog-task-view access and excluding child spawning/native mutation tools. Verified with Evo focused tests, Cook roster tests, Evo typecheck, and full `just verify`.
<!-- SECTION:FINAL_SUMMARY:END -->
