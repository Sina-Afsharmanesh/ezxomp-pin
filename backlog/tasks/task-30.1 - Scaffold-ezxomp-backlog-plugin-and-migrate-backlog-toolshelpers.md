---
id: TASK-30.1
title: Scaffold @ezxomp/backlog plugin and migrate backlog tools+helpers
status: Done
assignee: []
created_date: '2026-08-27 05:07'
updated_date: '2026-08-27 05:20'
labels:
  - refactor
dependencies: []
parent_task_id: TASK-30
type: chore
ordinal: 73000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/backlog exists with package.json/tsconfig/UPSTREAM.json/LICENSE/README/AGENTS.md
- [x] #2 extensions/{types,helpers,tools,instructions,index}.ts compile; registerBacklogTools export preserved
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scaffolded plugins/backlog: package.json (0.1.0-ezxomp.0, omp.extensions=[./extensions/index.ts], peerDep pi-coding-agent 17.3.8), UPSTREAM.json (born-in-repo, note documents verbatim extraction from cook), tsconfig+vitest+mock copied from cook, LICENSE copied from experiences (cook ships none). Modules: types.ts (TaskInfo + narrow BacklogToolsContext), helpers.ts (verbatim backlog-helpers.ts), tools.ts (verbatim 35-tool suite; imports rewritten to ./helpers + BacklogToolsContext; sc usage verified = sc.currentCwd only x36), instructions.ts (4 verbatim backlog.md 1.50.1 guides captured via 'backlog instructions' + BACKLOG_QUALITY_STANDARDS byte-stable block + defaultOverlay()), index.ts (default export: unconditional before_agent_start overlay hook + registerBacklogTools(pi,{currentCwd:process.cwd()})). Tests: tests/smoke.test.ts 4/4 pass (vitest). Workspace linked via bun install.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
plugins/backlog scaffolded with verbatim tools/helpers migration + default-overlay entry; 4/4 vitest smoke tests green (bunx vitest run in plugins/backlog).
<!-- SECTION:FINAL_SUMMARY:END -->
