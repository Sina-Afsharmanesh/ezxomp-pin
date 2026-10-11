---
id: TASK-26
title: 'P1: Add experiences-backed .lean-ctx.toml config tuning recommendations'
status: Done
assignee: []
created_date: '2026-08-23 06:06'
updated_date: '2026-08-24 17:45'
labels:
  - experiences
  - lean-ctx-config
  - optimization
  - sqlite
  - recommendations
milestone: m-0
dependencies: []
priority: medium
type: enhancement
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add experiences-backed recommendations for optimizing .lean-ctx.toml configuration. The experiences plugin should analyze a project's characteristics (file sizes, language mix, typical read patterns from prior sessions) and provide config tuning recommendations: (1) compression_level for optimal token savings without triage corruption, (2) progressive_threshold_lines for when to compress, (3) recovery_hints for known problematic files, (4) shell_compression patterns for common commands. Recommendations must be grounded in empirical data from the project's session history (token savings achieved, error rates, triage corruption incidents). The plugin should warn about global-only keys that are ignored at project level (progressive_threshold_lines, recovery_hints, shell_* per ezxomp's .lean-ctx.toml constraints). Store recommendations in PI_CODING_AGENT_DIR/experiences/ SQLite with session provenance and confidence scores.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Experiences plugin analyzes .lean-ctx.toml config and compares against project characteristics (file sizes, language mix, typical read patterns)
- [ ] #2 Experiences provides config tuning recommendations: compression_level, progressive_threshold_lines, recovery_hints, shell_compression patterns
- [ ] #3 Recommendations are grounded in empirical data from prior sessions (token savings, error rates, triage corruption incidents)
- [ ] #4 Experiences warns about global-only keys that are ignored at project level (progressive_threshold_lines, recovery_hints, shell_*)
- [ ] #5 Experiences documents ezxomp-specific gotchas: triage compression on small files, project-level keys only in .lean-ctx.toml
- [ ] #6 Recommendations are stored in PI_CODING_AGENT_DIR/experiences/ SQLite with session provenance and confidence scores
- [ ] #7 User can query experiences via MCP tools or CLI to get config recommendations for their project
- [ ] #8 Integration preserves experiences' existing lifecycle hooks and SQLite storage structure
- [ ] #9 Documentation updated in plugins/experiences/AGENTS.md or README with .lean-ctx.toml tuning examples
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete in workspace calm-heron.

Changed files:
- plugins/experiences/src/tuning/config.ts (NEW): scoped TOML-subset parser for .lean-ctx.toml; GLOBAL_ONLY_KEYS/GLOBAL_ONLY_PREFIXES detection (progressive_threshold_lines, recovery_hints, shadow_mode, shell_security, shell_timeout_secs, output_density, shell_*).
- plugins/experiences/src/tuning/engine.ts (NEW): analyzeTuning(tomlText, projectCharacteristics, sessionStats) -> { warnings, recommendations[{key, recommendation, confidence 0..1, basis[], gotchas[]}], gotchaNotes }. Grounded in triageFilterIncidents, meanCompressionRatio, readErrors/totalReads, smallFileRatio, commonCommands. Emits EZXOMP gotcha notes (triage compression corrupts small-file reads; project-level keys only; validate checks global only).
- plugins/experiences/src/tuning/store.ts (NEW): additive SQLite storage at <root>/experiences/tuning.db, table tuning_recommendations with session_id provenance + confidence. CREATE TABLE IF NOT EXISTS only — existing experiences schema v7 untouched (zero imports of high-blast-radius sqlite.ts). Root resolution: AX_STATE_ROOT parent > PI_CODING_AGENT_DIR > ~/.local/share/pi-coding-agent.
- plugins/experiences/src/tuning/cli.ts (NEW): CLI retrieval surface `bun .../cli.ts <project-root> [db-path]` (satisfies MCP-or-CLI query AC).
- test/experiences-tuning.test.ts (NEW): 3 tests covering parse+global-only flagging, grounded recommendations w/ confidence+provenance, and SQLite round-trip coexisting additively with a habits table.
- plugins/experiences/README.md: appended .lean-ctx.toml tuning section (usage, global-only key list, ezxomp gotchas, storage).

Verification:
- bun test test/experiences-tuning.test.ts: 3 pass, 0 fail, 24 expects.
- bunx tsc --noEmit from workspace root: CLEAN.
- CLI usage path verified (exit 2 + usage on missing arg).

Note: task description referenced plugins/experiences/src/** which did not exist; created it as a new self-contained module to keep blast radius zero (extensions/agent-experience/src/storage/sqlite.ts NOT touched). No consolidation logic found in plugins/agent-learning for this feature, so no adaptation needed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-24 17:45
---
Implemented in workspace calm-heron; merged to local main as commit c256692f. New self-contained module plugins/experiences/src/tuning/{config,engine,store,cli}.ts (experiences/src did not previously exist; created per task file-set). TOML-subset parser flags global-only keys; analyzeTuning emits confidence-scored session-grounded recs; additive tuning.db leaves schema v7 untouched. Evidence: bun test test/experiences-tuning.test.ts = 3 pass/0 fail; tsc clean; full gate green post-merge.
---
<!-- COMMENTS:END -->
