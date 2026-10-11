---
id: TASK-35
title: Show provider families in /cook config
status: Done
assignee: []
created_date: '2026-08-27 18:13'
updated_date: '2026-08-28 04:43'
labels:
  - feature
  - design
dependencies: []
references:
  - 'omp://extensions.md'
priority: medium
type: enhancement
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve the /cook config command so model selection and saved-role summaries make provider ownership obvious. Present models grouped or branched by their canonical provider family and retain the model ID, covering dynamically available providers such as Llama, Cohere Command, NanoGPT, OpenAI, OpenCode, OpenCode Go, and any other registered provider. Do not hardcode a closed provider list: unknown or newly registered providers must remain visible using a normalized raw provider identifier. Preserve role inheritance, explicit overrides, model resolution, and persistence semantics; this is a configuration-display improvement only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The /cook config flow identifies the provider family and model ID for every role option and saved role assignment.
- [x] #2 Available models are grouped or branched by dynamically resolved provider, with known provider families rendered consistently and unknown providers still visible.
- [x] #3 Inherited session-model roles are visibly distinguished from roles with an explicit provider/model override.
- [x] #4 Duplicate model IDs across providers remain unambiguous and selectable without changing the resolved provider/model value.
- [x] #5 The provider display works with the currently registered provider set, including providers added by extensions, without requiring a source-code list update for each new provider.
- [x] #6 Config persistence and role/model resolution are unchanged; the update affects presentation and selection clarity only.
- [x] #7 Tests cover known providers, unknown/dynamic providers, duplicate IDs, inherited roles, and the no-UI/headless fallback.
- [x] #8 CHANGELOG.md receives an entry under ## [Unreleased] and the task records exact verification evidence.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Implementation plan is recorded after the task is picked up and reflects the actual provider-resolution path.
- [x] #2 Focused tests prove provider grouping/labels and preserve existing configuration behavior.
- [x] #3 No hardcoded closed provider allowlist is introduced.
- [x] #4 Implementation notes document the provider-family source and fallback label behavior.
- [x] #5 Relevant cook tests and repository verification pass.
- [x] #6 Final summary names changed files and exact verification commands/results.
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WT provenance: implementation assigned to branch `task-38-config` at `../ezxomp.task-38-config`, created via `wt switch --create task-38-config --no-cd --no-hooks -y` from main commit 7194001. TASK-35 is sequenced after TASK-36 in this worktree and consumes its scope resolver; changes will be merged locally only after independent validation and conflict review.

Finalization (coordinator): implemented in WT branch task-38-config (8e106011), merged to main merge dd7c6e70, consuming TASK-36's resolver. listModels provider families (dynamic + aliases + unknown fallback), duplicate-id [provider] suffix + qualified provider/id persistence, inherit-session option, describeModel/formatModelForContext labels, persistence semantics unchanged.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: CookPlanner38
created: 2026-08-28 00:01
---
Sequenced after TASK-36 because provider-family presentation must consume the authoritative project-local scope and provider catalog.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Provider-family display implemented in WT task-38-config (8e106011), merged to main dd7c6e70. Dynamic provider grouping (OpenAI, OpenAI Codex, OpenCode, OpenCode Go, Cohere Command, Llama, NanoGPT + normalized unknown fallback), duplicate-id disambiguation ([provider] suffix, qualified provider/id persistence), inherit-session distinction, no closed allowlist. Tests in config-scope.test.ts (provider grouping/labels/duplicates/inherited/headless); suites green: vitest 140/140, bun 116/116, just verify passed.
<!-- SECTION:FINAL_SUMMARY:END -->
