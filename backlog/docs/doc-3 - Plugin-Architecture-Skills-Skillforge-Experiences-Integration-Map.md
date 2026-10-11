---
id: doc-3
title: 'Plugin Architecture: Skills, Skillforge, Experiences Integration Map'
type: specification
created_date: '2026-08-23 05:58'
tags:
  - plugin-architecture
  - skills
  - skillforge
  - experiences
  - integration
---
# Plugin Architecture: Skills, Skillforge, Experiences Integration Map

**Type:** specification
**Tags:** plugin-architecture, skills, skillforge, experiences, integration
**Date:** 2026-08-23
**Status:** verified

## Purpose

Document the separation of concerns and integration points between three ezxomp plugins that enhance agent capabilities: `skills` (discovery), `skillforge` (improvement), and `experiences/agent-experience` (persistence).

## Plugin Overview

### 1. skills (`plugins/skills/src/index.ts`)

**Entry point:** `export default function(pi: ExtensionAPI): void` at line 648

**Role:** Skill discovery and execution at session startup

**Hooks:**
- `before_agent_start` — loads skills from disk

**Storage:**
- User-global: `~/.omp/agent/skills/<name>/SKILL.md`
- Project-scoped: `<project>/.omp/skills/<name>/SKILL.md`
- URI resolution: `skill://<name>`

**Behavior:**
- Re-scans skill directories at every session start
- Restart required after installing or moving skills
- Provides skill discovery surface for agent harness

### 2. skillforge (`plugins/skillforge/src/index.ts`)

**Entry point:** `export default function skillforgeExtension(pi: ExtensionAPI): void` at line 195

**Role:** Captures verified learnings and proposes skill improvements

**Hooks:**
- `before_agent_start` (line 211) — retrieves memories, promotes to skill patches
- `registerTool` (line 237) — skill patch review/apply tool
- `registerCommand` (line 313) — `skillforge` command

**Storage:**
- `<agentDir>/skillforge/memory/global/gotchas.json`
- `<agentDir>/skillforge/memory/global/decisions.json`
- `<agentDir>/skillforge/memory/global/patterns.json`
- `<agentDir>/skillforge/memory/projects/<project-id>/`
- `<agentDir>/skillforge/promotions/` — skill patch proposals
- `<agentDir>/skillforge/registry.yaml`, `index.json`

**Behavior:**
- Zero-maintenance during normal work
- User-facing command: review/apply pending skill patches
- Uses `writeAtomicFile` for durability
- Promotes stable learnings to skill patch proposals

### 3. experiences/agent-experience (`plugins/experiences/extensions/agent-experience/index.ts`)

**Entry point:** `export default function agentExperienceExtension(pi: ExtensionAPI)` at line 2928

**Role:** Persistent storage layer for agent memory and observations

**Hooks:**
- `session_start` (line 3010)
- `before_agent_start` (line 3107)
- `context` (line 3126)
- `before_provider_request` (line 3223)
- `input` (line 3281)
- `agent_end` (line 3313)
- `tool_execution_start` (line 3342)
- `tool_execution_end` (line 3351)
- `session_before_compact` (line 3360)
- `session_compact` (line 3365)
- `session_shutdown` (line 3371)

**Commands:**
- `experience` (line 3041)

**Storage:**
- SQLite database @ `PI_CODING_AGENT_DIR/experiences/`
- Modules: `private-root.ts`, `checksum.ts`, `sqlite.ts`, `redaction.ts`, `observations.ts`

**Behavior:**
- Hooks into full agent lifecycle
- Provides durable, checksummed, redacted storage
- Captures tool execution observations

## Enhancement Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Session Start                                               │
│  ↓ skills discovers SKILL.md files                          │
│  ↓ loads skill://<name> URI resolution                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Agent Work                                                  │
│  ↓ agent uses skills during tasks                           │
│  ↓ skillforge captures verified patterns                    │
│  ↓ experiences records observations                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Learning Capture                                            │
│  ↓ skillforge stores in memory/global/*.json                │
│  ↓ stable patterns → promotions/ as skill patches           │
│  ↓ experiences persists to SQLite                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Improvement Loop                                            │
│  ↓ user reviews skillforge patches                          │
│  ↓ applied patches become new skills                        │
│  ↓ cycle repeats with improved skill set                    │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

### skills ↔ skillforge

- **skillforge** reads discovered skill paths during `before_agent_start`
- Promotes retrieved memories against active skills
- Skill patches target specific `SKILL.md` files by name

### skillforge ↔ experiences

- **skillforge** uses `writeAtomicFile` for durability
- **experiences** provides SQLite storage layer that could back future skillforge persistence
- Both store structured JSON with schema validation

### experiences ↔ skills

- **experiences** stores observation history (`observations.ts`)
- Could inform skill ranking or discovery priority in future iterations
- Session lifecycle hooks wrap skill execution context

## Teaching Implications

### For evo-mode Plugin

**Current gap:** evo-mode rewrites tool profiles but doesn't teach agents how to use lean-ctx/eval tools efficiently

**Required teaching surface:**
1. **Tool selection by intent** — when to use `ctx_compose` vs `ctx_read` vs `ctx_search`
2. **Compression modes** — `mode=signatures|map|full|anchored|raw` and when each applies
3. **Recovery patterns** — how to handle triage filtering, truncated results, CONFLICT edits
4. **Budget awareness** — token-efficient exploration before deep reads

**Integration opportunity:** skillforge could capture verified lean-ctx usage patterns and promote them to `lean-ctx-errors` skill updates

### For lean-ctx Plugin

**Current gap:** `.lean-ctx.toml` project config may not be optimal for ezxomp's monorepo structure

**Verification needed:**
1. Check compression levels vs file sizes in plugins/
2. Verify `allow_paths` covers all plugin roots
3. Confirm `read_redirect` and `read_dedup` are enabled
4. Test triage thresholds against typical plugin file sizes

**Integration opportunity:** experiences could store per-project lean-ctx performance metrics to auto-tune config

## Next Steps

1. **TASK-15.1.1** — Create teaching skill for lean-ctx tool efficiency
2. **TASK-15.1.2** — Create teaching skill for eval tool efficiency
3. **TASK-15.1.3** — Optimize `.lean-ctx.toml` for ezxomp monorepo
4. **TASK-15.1.4** — Wire skillforge to auto-capture lean-ctx/eval usage patterns
5. **TASK-15.1.5** — Add experiences-backed config tuning recommendations

## References

- `plugins/skills/src/index.ts` — skill discovery implementation
- `plugins/skillforge/src/index.ts` — learning capture implementation
- `plugins/experiences/extensions/agent-experience/index.ts` — persistence layer
- `plugins/experiences/extensions/agent-experience/src/storage/` — storage modules
- TASK-15.1 — parent task for plugin teaching work
