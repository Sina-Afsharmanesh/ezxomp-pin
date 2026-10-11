---
id: doc-4
title: Plugin Architecture Analysis and Enhancement Plan
type: specification
created_date: '2026-08-23 06:07'
tags:
  - plugin-architecture
  - skills
  - skillforge
  - experiences
  - lean-ctx
  - eval-tool
---
# Plugin Architecture Analysis: Skills, Skillforge, Experiences

**Date:** 2026-08-23
**Type:** Specification
**Tags:** plugin-architecture, skills, skillforge, experiences, lean-ctx, eval-tool, teaching-skill

## Overview

This document analyzes the three installed OMP plugins in ezxomp (`skills`, `skillforge`, `experiences`) and identifies enhancement opportunities for lean-ctx and eval tool efficiency.

## Plugin Separation of Concerns

### 1. skills (`/plugins/skills/src/index.ts`, entry line 648)

**Purpose:** Skill discovery and registry.

**Capabilities:**
- Loads skills from `~/.omp/agent/skills/` (user-global) and `.omp/skills/` (project-scoped)
- Exposes skills via `skill://<name>` URI scheme
- Re-scans at session startup; restart required after installing/moving skills
- No persistence layer — purely discovery and routing

**Storage:** None (skills are file-based in skill directories)

**Entry Point:** `export default function(api: ExtensionAPI)` at line 648

### 2. skillforge (`/plugins/skillforge/src/index.ts`, entry line 195)

**Purpose:** Learning capture → skill patch proposals.

**Capabilities:**
- Captures gotchas, decisions, and patterns during agent sessions
- Generates promotion proposals for improving skills based on observed usage
- Hooks: `before_agent_start` (line 211), `registerTool` (line 237), `registerCommand` (line 313)

**Storage:**
- `<agentDir>/skillforge/memory/global/{gotchas,decisions,patterns}`
- `<agentDir>/skillforge/promotions/` for improvement proposals

**Entry Point:** `export default function(api: ExtensionAPI)` at line 195

### 3. experiences (`/plugins/experiences/extensions/agent-experience/index.ts`, entry line 2928)

**Purpose:** Persistent SQLite-backed storage layer for agent experiences.

**Capabilities:**
- 12 lifecycle hooks from `session_start` (line 3010) through `session_shutdown` (line 3371)
- SQLite database at `PI_CODING_AGENT_DIR/experiences/`
- Stores session history, tool usage patterns, config recommendations

**Storage:** `PI_CODING_AGENT_DIR/experiences/` (SQLite)

**Entry Point:** `export default function(api: ExtensionAPI)` at line 2928

## Integration Flow

```
(1) skills discovers → (2) agent uses → (3) skillforge captures →
(4) promotions → (5) experiences stores → (6) user applies patches
```

### Enhancement Opportunities

#### TASK-23: Teaching skill for lean-ctx tool efficiency

**Problem:** Agents make predictable errors with lean-ctx tools:
- Using `ctx_read(mode=full)` for orientation instead of `mode=signatures`
- Chaining `ctx_search → ctx_read → ctx_search(action=symbol)` instead of one `ctx_compose`
- Using `ctx_callgraph` for const/variable refs (it tracks call edges only)
- Not using `raw=true` or `ctx_retrieve` for verbatim recovery
- Hitting triage corruption on small files (e.g., 853-byte `.lean-ctx.toml`)

**Solution:** A managed skill at `~/.omp/agent/skills/lean-ctx-efficiency/` that teaches:
- All 10 read modes with exact use-case triggers
- 95+ shell compression patterns
- Tree-sitter AST coverage (27 languages)
- Anti-pattern list and recovery protocols
- Project roots constraints and ezxomp-specific gotchas

**Expected Impact:** 60-131x token compression without triage corruption or argument-validation errors.

#### TASK-24: Teaching skill for eval tool efficiency

**Problem:** Agents waste computation and trigger errors with eval:
- Re-importing modules across cells (state persists — NEVER re-import)
- Using `asyncio.run()` (raises error — top-level await works)
- Sequential calls that could use `parallel(thunks)` or `pipeline()`
- Resetting kernel unnecessarily instead of fixing and re-running failing step

**Solution:** A managed skill at `~/.omp/agent/skills/eval-efficiency/` that teaches:
- Persistent kernel semantics
- Parallel execution patterns
- Import hygiene rules
- Error recovery protocol
- Language-specific capabilities (JS/Bun globals, Python/Ruby/Julia sync/kwargs)
- When to use eval vs ctx_shell

**Expected Impact:** Fewer redundant imports, no unnecessary kernel resets, parallel execution where applicable.

#### TASK-25: Wire skillforge to auto-capture lean-ctx/eval patterns

**Problem:** Skillforge currently requires manual pattern capture; inefficient tool usage goes unrecorded.

**Solution:** Hook into lean-ctx and eval tool calls to automatically:
- Record tool call sequences and efficiency metrics
- Detect inefficient patterns (search→read→search chains, redundant imports)
- Generate promotion proposals with before/after comparisons
- Inject relevant patterns at session startup via `before_agent_start` hook

**Storage:** Preserve existing structure (`memory/global/patterns`, `promotions/`)

#### TASK-26: Add experiences-backed .lean-ctx.toml config tuning

**Problem:** `.lean-ctx.toml` configuration is static; projects don't benefit from empirical session data.

**Solution:** Experiences plugin analyzes:
- Project characteristics (file sizes, language mix, typical read patterns)
- Prior session data (token savings, error rates, triage corruption incidents)
- Provides recommendations for `compression_level`, `progressive_threshold_lines`, `recovery_hints`
- Warns about global-only keys ignored at project level

**Storage:** `PI_CODING_AGENT_DIR/experiences/` SQLite with session provenance and confidence scores

## Current .lean-ctx.toml State

```toml
# lean-ctx project-local config for ezxomp
# PROJECT-LEVEL KEYS ONLY. Global-only keys are IGNORED here.
# Verified project keys: make native->ctx routing deterministic.
# Trust PINS TO THIS FILE'S CONTENTS: re-run `lean-ctx trust` after ANY edit.
```

**Observations:**
- Minimal config (project-level keys only)
- Global-only keys (`progressive_threshold_lines`, `recovery_hints`, `shell_*`) correctly omitted
- Triage filtering (8-9 lines) is from global config (`progressive_threshold_lines=450`), not project config
- No config issues found; triage corruption on small files is a pipeline limitation, not a config problem

## Next Steps

1. **Implement TASK-23:** Create lean-ctx-efficiency managed skill
2. **Implement TASK-24:** Create eval-efficiency managed skill
3. **Implement TASK-25:** Wire skillforge auto-capture hooks
4. **Implement TASK-26:** Add experiences config tuning recommendations
5. **Measure Impact:** Track token savings, error rates, and triage corruption incidents before/after

## References

- TASK-15 (workflowz v2): Parent task, now complete
- TASK-23: Teaching skill for lean-ctx tool efficiency
- TASK-24: Teaching skill for eval tool efficiency
- TASK-25: Wire skillforge to auto-capture lean-ctx/eval usage patterns
- TASK-26: Add experiences-backed .lean-ctx.toml config tuning recommendations
- doc-3: Plugin Architecture: Skills, Skillforge, Experiences Integration Map
