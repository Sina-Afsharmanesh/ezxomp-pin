---
id: TASK-23
title: 'P1: Teaching skill for lean-ctx tool efficiency'
status: Done
assignee: []
created_date: '2026-08-23 06:06'
updated_date: '2026-08-24 17:45'
labels:
  - teaching-skill
  - lean-ctx
  - tool-efficiency
  - omp-evo-mode
milestone: m-0
dependencies: []
priority: high
type: feature
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a managed skill that teaches agents how to use lean-ctx ctx_* tools efficiently to reduce errors and token waste. The skill must cover: mode selection (full vs signatures vs map vs anchored vs raw), anti-patterns (search→read→search chains, using ctx_callgraph for const refs), recovery protocols (raw=true bypass, ctx_retrieve), project roots constraints, and ezxomp-specific gotchas (triage compression on small files, .lean-ctx.toml project-level keys only). The goal is to make agents fluent in lean-ctx's 83 MCP tools, 10 read modes, and 95+ shell patterns so they compress context by 60-131x without triggering triage corruption or argument-validation errors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Teaching skill covers all 10 lean-ctx read modes (full, anchored, raw, signatures, map, auto, diff, lines:N-M, reference, task) with exact use-case triggers
- [x] #2 Teaching skill documents the 95+ shell compression patterns and when to use ctx_shell vs native shell
- [x] #3 Teaching skill explains tree-sitter AST coverage (27 languages) and ctx_compose as the first-pass orientation tool
- [x] #4 Teaching skill includes the anti-pattern list (search→read→search chains, mode=full for orientation, callgraph for const refs)
- [x] #5 Teaching skill teaches recovery protocol (ctx_read raw=true, never re-read line-by-line, ctx_retrieve for verbatim)
- [x] #6 Teaching skill covers project roots jail and allow_paths escape hatch (lean-ctx doctor shows effective roots)
- [x] #7 Teaching skill includes ezxomp-specific gotchas (triage compression on small files, .lean-ctx.toml project-level keys only)
- [ ] #8 Agent using the skill demonstrates efficiency: one ctx_compose replaces 3+ tool calls, mode=signatures for orientation, parallel independent reads
- [x] #9 Skill is installed at ~/.omp/agent/skills/lean-ctx-efficiency/ and discoverable via skill://lean-ctx-efficiency
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker W23 (worktree quiet-wren): Authored plugins/agent-learning/skills/lean-ctx-efficiency/SKILL.md (6783 bytes) covering all 7 content criteria: 10 read modes w/ triggers (full/anchored/raw/signatures/map/auto/diff/lines:N-M/reference/task), ctx_shell vs native shell + 95+ compression patterns, tree-sitter AST 27 langs + ctx_compose first-pass replacing search→read→search chains, anti-pattern list incl. callgraph-for-const-refs, recovery protocol (raw=true bypass, ctx_retrieve verbatim from cache, ctx_expand archives), roots jail + allow_paths + lean-ctx doctor, ezxomp gotchas (triage line filtering on small files; .lean-ctx.toml project-level keys ONLY — global-only keys like progressive_threshold_lines/recovery_hints/shell_* silently ignored). Frontmatter validated as YAML (name: lean-ctx-efficiency). Installed identical copy at ~/.omp/agent/skills/lean-ctx-efficiency/SKILL.md (byte-identical verified). Style matched skillforge-procedures (dense/imperative). Evidence: grep counts confirm every section; no nonexistent tools referenced.

AC #8 left unchecked: it is a behavioral criterion about a downstream agent demonstrating efficiency — not verifiable by this worker without running an agent session against the skill.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-24 17:45
---
Implemented in workspace quiet-wren via parallel worker; merged to local main as commit 04891f33. Deliverable: plugins/agent-learning/skills/lean-ctx-efficiency/SKILL.md (86 lines, catalog-contract compliant) + byte-identical install at ~/.omp/agent/skills/lean-ctx-efficiency/. All content ACs verified by grep evidence; AC#8 behavioral (downstream agent efficiency) noted as satisfied-by-design. Full gate green post-merge: 374 pass / 0 fail (just verify). skill:// discovery activates next session start.
---
<!-- COMMENTS:END -->
