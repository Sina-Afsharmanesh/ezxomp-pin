---
id: TASK-36
title: Make /cook config use project-local agent profiles
status: Done
assignee: []
created_date: '2026-08-27 18:17'
updated_date: '2026-08-28 04:43'
labels:
  - bug
  - architecture
dependencies: []
references:
  - TASK-35
priority: high
type: bug
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate and correct the scope used by both Cook configuration surfaces: the /cook config slash command and the cook_config LLM-callable tool. The current behavior appears to update a shared or global agent profile instead of the active project local profile. Projects can have different provider catalogs and role-specific models, so both entry points must resolve and persist against the active project scope by default, with explicit non-project scopes preserved only when intentionally selected. Prevent cross-project profile leakage while preserving session overrides, role inheritance, provider/model validation, and compatibility with existing profiles. The two surfaces should share one authoritative scope-resolution path and expose clear scope/provider information in their user-facing responses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The /cook config slash command and cook_config LLM tool both resolve the active project scope through one authoritative configuration path.
- [x] #2 Running either configuration surface from a project reads the effective project-local profile and provider/model catalog rather than silently using or overwriting a global profile.
- [x] #3 Saving a role/provider/model selection through either surface writes to the intended project-local profile path and a subsequent slash-command or cook_config read round-trips the same values.
- [x] #4 Two projects with different provider catalogs and role assignments remain isolated; configuring one project through either surface does not change the other project or the shared personal profile.
- [x] #5 Provider/model validation and role inheritance use the active project's available providers, including extension-registered providers, and unknown configured values fail clearly without silent substitution.
- [x] #6 Both surfaces expose clear scope and provider/model information in their responses or selections, so users and the LLM can distinguish project-local, personal, and global values.
- [x] #7 If project-local configuration is missing, both surfaces follow an explicit documented precedence/fallback rule and never silently write to an unintended scope.
- [x] #8 Any explicit personal/global scope remains available with clear labeling and does not alter the default project-local behavior.
- [x] #9 Tests cover slash and LLM tool scope resolution, cross-project isolation, provider-catalog differences, cross-surface round-trip persistence, fallback/precedence, and backward-compatible existing profiles.
- [x] #10 CHANGELOG.md receives an entry under ## [Unreleased] and the task records exact verification evidence.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Implementation plan is recorded after pickup and identifies the config read/write source, precedence, and scope boundaries.
- [x] #2 Focused tests prove project isolation and configuration round-trip without relying on global machine state.
- [x] #3 Implementation notes document migration and backward-compatibility behavior for existing profiles.
- [x] #4 No provider allowlist or project-specific model assumptions are hardcoded.
- [x] #5 Relevant cook tests and repository verification pass.
- [x] #6 Final summary names changed files and exact verification commands/results.
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope clarified per user: this ticket covers both the /cook config slash command and the cook_config LLM-callable tool. Both must use one authoritative project-scope resolver, share round-trip behavior, and expose clear scope/provider/model information; tests must exercise both entry points and cross-surface persistence.

WT provenance: implementation assigned to branch `task-38-config` at `../ezxomp.task-38-config`, created via `wt switch --create task-38-config --no-cd --no-hooks -y` from main commit 7194001. TASK-36 is the first slice in this worktree; TASK-35 consumes its authoritative scope resolver afterward. Changes will be merged locally only after independent validation and conflict review.

Finalization (coordinator): implemented in WT branch task-38-config (8e106011), merged to main merge dd7c6e70. resolveCookConfig one authoritative path (project → personal → global, legacy JSON last, explicit-null inherits), saveModelConfig project-default writes with template seeding + frontmatter/body preservation + invalid-profile hard error, scope param on both surfaces, validation (exact selection → unique bare id → resolve alias synthesis; ambiguous/unknown rejected), formatModelForContext family+provider/id responses, headless deterministic no-op + scope-aware summary.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Project-local config scope implemented in WT task-38-config (8e106011), merged to main dd7c6e70. Files: plugins/cook/extensions/config.ts (resolveCookConfig/saveModelConfig/validateModelSelection/formatModelForContext/providerFamily), types.ts (ModelEntry provider/family/selection), cook-tools.ts (scope param + scope tags on both surfaces), tests/config-scope.test.ts (24 tests: precedence, isolation, round-trip via tool handler, headless wizard, validation incl. alias synthesis), CHANGELOG. Verified: plugin tsc exit 0; vitest 140/140; bun 116/116; just verify 378 pass / 0 fail.
<!-- SECTION:FINAL_SUMMARY:END -->
