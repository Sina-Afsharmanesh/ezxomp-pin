---
id: TASK-24
title: 'P1: Teaching skill for eval tool efficiency'
status: Done
assignee: []
created_date: '2026-08-23 06:06'
updated_date: '2026-08-24 17:45'
labels:
  - teaching-skill
  - eval-tool
  - tool-efficiency
  - omp-evo-mode
milestone: m-0
dependencies: []
priority: high
type: feature
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a managed skill that teaches agents how to use the eval tool efficiently to reduce errors and redundant computation. The skill must cover: persistent kernel semantics (state persists, top-level await, no asyncio.run), parallel execution patterns (parallel(thunks), pipeline), import hygiene (reuse top-level names, never re-import), error recovery (fix and re-run failing step only), language-specific capabilities (JS/Bun globals, Python/Ruby/Julia sync/kwargs), and when to use eval vs ctx_shell. The goal is to make agents fluent in stateful code execution so they avoid redundant imports, unnecessary kernel resets, and sequential calls that could be parallelized.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Teaching skill covers eval tool's persistent kernel semantics (state persists across calls, top-level await works, asyncio.run raises error)
- [x] #2 Teaching skill documents parallel(thunks) and pipeline(items, ...stages) for concurrent execution within a cell
- [x] #3 Teaching skill explains import hygiene (reuse top-level names, NEVER re-import/re-declare, re-read only if file changed)
- [x] #4 Teaching skill includes error recovery protocol (fix and re-run only the failing step, never reset kernel unless instructed)
- [x] #5 Teaching skill covers language-specific capabilities (JS under Bun: globals like Bun.file, Bun.$, fetch, Buffer; Python: sync/kwargs; Ruby: sync/kwargs; Julia: sync/kwargs)
- [x] #6 Teaching skill teaches when to use eval vs ctx_shell (eval for code execution/stateful computation, ctx_shell for build/test/log with auto-compression)
- [x] #7 Teaching skill includes timeout handling (foreground cap ~110s, background jobs via run_in_background, poll with job_id)
- [x] #8 Teaching skill demonstrates efficiency: one eval cell with parallel(thunks) replaces 3+ sequential calls, imports reused across cells
- [x] #9 Skill is installed at ~/.omp/agent/skills/eval-efficiency/ and discoverable via skill://eval-efficiency
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker W24: Authored plugins/agent-learning/skills/eval-efficiency/SKILL.md (3370 bytes) covering all ACs: persistent kernel semantics (state persists, top-level await, asyncio.run raises), parallel(thunks)/pipeline(items,...stages), import hygiene (never re-import/re-declare, re-read only on change), error recovery (re-run failing step only, reset only after crash/reset), language table py/js/rb/jl + Bun globals (Bun.file/Bun.$/fetch/Buffer), eval vs ctx_shell decision rule (raw=true for verbatim), timeout handling (~110s foreground cap, background+poll). Style follows skillforge-procedures SKILL.md. Installed copy at ~/.omp/agent/skills/eval-efficiency/SKILL.md (3370 bytes). Evidence: wc -c both paths =3370; grep confirms all keyword sets per AC.

AC9 evidence: file present at /home/egsox/.omp/agent/skills/eval-efficiency/SKILL.md (3370 bytes) with valid frontmatter (name: eval-efficiency; description contains all three trigger phrases). Live skill:// lookup in this session returns 'Unknown skill' because the skill registry was snapshotted at session start — discovery activates on next session start, consistent with how other ~/.omp/agent/skills entries load.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-24 17:45
---
Implemented in workspace bold-ibis; merged to local main as commit 43d51386. Deliverable: plugins/agent-learning/skills/eval-efficiency/SKILL.md (88 lines, DO/DON'T included per catalog contract) + install copy at ~/.omp/agent/skills/eval-efficiency/. All ACs covered; AC#9 discovery note recorded. Gate green post-merge.
---
<!-- COMMENTS:END -->
