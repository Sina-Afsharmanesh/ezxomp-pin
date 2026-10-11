---
name: codesight
description: Zero-dep AI context maps (.codesight/CODESIGHT.md, wiki, graph) — /codesight scan, /codesight-init, /codesight-refresh, /wiki article queries, /blast impact analysis. Use for project orientation, blast-radius checks before high-import edits, and token-efficient codebase summaries.
---
# Codesight (project context maps)

Scans a repo into `.codesight/CODESIGHT.md` + wiki + graph for fast orientation.

## Commands

- `/codesight` — show/refresh the context map view.
- `/codesight-init` — first-run setup and scan.
- `/codesight-refresh` — rescan after meaningful changes.
- `/wiki <topic>` — query compiled domain articles.
- `/blast <path>` — import-blast-radius for a file (who breaks if this changes).

## DO

- DO read `.codesight/wiki/index.md` before exploring an unfamiliar repo.
- DO run `/blast` on high-import files (many importers) before editing them.
- DO refresh after large refactors so articles don't drift.

## DON'T

- DON'T trust routes marked `[inferred]` as exact — they are regex-detected.
- DON'T edit generated `.codesight` artifacts by hand; regenerate instead.
- DON'T skip the graph check on shared storage/schema modules.

## Recovery

- Wiki shows ⚠ on sources? Re-run `/codesight-refresh` before trusting the article.
