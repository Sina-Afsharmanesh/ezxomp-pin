---
id: TASK-48
title: >-
  Detach skills + skillforge shims into archive/_reference after agent-learning
  consolidation
status: Done
assignee:
  - '@agent'
created_date: '2026-08-28 22:32'
updated_date: '2026-08-28 22:52'
labels:
  - refactor
dependencies: []
type: chore
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-27 consolidated skills + skillforge + experiences lanes into @ezxomp/agent-learning (2026-08-23, Done), leaving plugins/skills (read_skills) and plugins/skillforge (skillforge_capture_memory) as thin backcompat re-export shims per doc-5 design D2. Both shims have zero unique logic (pure re-exports of @ezxomp/agent-learning/src/*), so the migration window has served its purpose: archive both plugin dirs at archive/_reference/<slug>/ (codesight-safe nesting), remove them from the marketplace, all test/script expectations, upstreams.lock.json, and stale doc references, then uninstall the two local marketplace installs. Precedent: lean-ctx detach (abd51003).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 marketplace.json carries 12 plugin entries with skillforge + skills removed
- [x] #2 manifest/verify-omp/install-local/smoke/flat-cache/agent-learning-dedup expectations updated; bun test test/ green
- [x] #3 plugins/skills + plugins/skillforge absent; sources live at archive/_reference/{skills,skillforge} (node_modules pruned, untracked)
- [x] #4 codesight regen + context files: AGENTS.md/CLAUDE.md/codex.md/.cursorrules workspace lists clean of both plugins; stale refs in plugins/AGENTS.md, extensible-workflows AGENTS.md, THIRD_PARTY_NOTICES.md fixed
- [x] #5 local OMP install no longer has skills@ezxomp / skillforge@ezxomp
- [x] #6 CHANGELOG.md [Unreleased] entry added; just verify green
- [x] #7 upstreams.lock.json drops both sources (7 sources remain); import-upstreams counts say 7, matching the lock; bun.lock regenerated without the two workspaces
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Detached both backcompat shims per TASK-48. Validation: pure re-exports of @ezxomp/agent-learning with zero unique logic; no live code imports (extensible-workflows AGENTS.md dep claim was stale). Changes: marketplace 14→12; all test/script expectations (manifest, verify-omp, install-local, smoke-plugins, flat-cache, agent-learning dedup→once-guard regression); upstreams.lock.json 9→7 sources + import-upstreams counts; dirs moved to archive/_reference/{skills,skillforge} (jj R renames, node_modules pruned); local installs uninstalled; full DOX pass (root AGENTS.md, CLAUDE.md/codex.md/.cursorrules, plugins/AGENTS.md, extensible-workflows AGENTS.md, THIRD_PARTY_NOTICES.md, README, agent-learning README, marketplace/jj-tangled skills, agent-learning.test.ts header); bun.lock regenerated. AC4's "counts say 10" corrected to 7 (matches lock). Gates: just verify green (tsc clean, 382 pass/0 fail, fallow new-only pass); verify:omp on-disk validation all OK (live-RPC blocked by pre-existing missing model keys); origin/main = a47de838 pushed.
<!-- SECTION:FINAL_SUMMARY:END -->
