---
id: TASK-28.4
title: 'TASK-28.D: Backup and restore round-trip procedures evidence'
status: Done
assignee: []
created_date: '2026-08-23 09:09'
updated_date: '2026-08-23 10:06'
labels:
  - enhancement
milestone: m-0
dependencies:
  - TASK-28.1
  - TASK-28.2
parent_task_id: TASK-28
priority: medium
type: enhancement
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket D of TASK-28 (planner packet §3.D). Extend plugins/experiences/extensions/agent-experience/src/storage/backup.ts (createBackup :171, prevalidateBackup :243, restoreBackup :412, restore journal/recovery) so the ledger backup artifact includes the new procedures partition. RED oracle: backup scenario in test/agent-learning-procedures-sqlite.test.ts (currently failing Unsupported table: procedures). May run in parallel with TASK-28.C after B lands. Checkpoint: authored backup scenario asserting row/checksum round-trip. Targeted tests only; no git/jj; temp dirs only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backup manifest advertises schema version 7
- [x] #2 Prevalidation accepts a valid v7 backup
- [x] #3 A procedures row deleted from live storage is restored with its checksum intact
- [x] #4 WAL checkpointing and restore journaling remain safe
- [x] #5 Existing fail-closed behavior for unsupported/future backups remains intact
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 Orchestrator judgment GREEN after fix round 0 (verification-led). WorkT28D audit found backup surface already v7-capable via generic table copy + typed schema constants; single change landed: backup.ts:193 explicit PRAGMA wal_checkpoint(TRUNCATE) on the node-sqlite backup path (symmetry with bunSqliteBackup). Manifest advertises storageSchemaVersion 7 (:204), prevalidate accepts <=7 rejects >7 (:154), restore byte-faithful with checksum intact (:412), journal recovery safe (:355/:384/:402). D ran evidence scripts (manifest v7, prevalidate v7 accept/reject, row roundtrip, journal clean) + bun 5/5. Orchestrator independently verified: jj diff shows exactly the one checkpoint line; RED oracle incl. backup scenario 5/5 re-run green.
<!-- SECTION:NOTES:END -->
