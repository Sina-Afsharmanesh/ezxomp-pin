---
id: TASK-28.1
title: >-
  TASK-28.A: Experiences ledger owns v7 procedures partition (schema,
  migrations, capability export)
status: Done
assignee: []
created_date: '2026-08-23 09:07'
updated_date: '2026-08-23 09:31'
labels:
  - enhancement
milestone: m-0
dependencies: []
parent_task_id: TASK-28
priority: medium
type: enhancement
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket A of TASK-28 (planner packet §3.A). Add typed `procedures` table owned by experiences schema v7 using the same row envelope as habits/evidence/contexts, plus a static owner-capability export consumed by agent-learning BEFORE any ledger open. Targets: plugins/experiences/extensions/agent-experience/src/storage/schema.ts (STORAGE_SCHEMA_VERSION, STORAGE_REQUIRED_TABLES, STORAGE_REQUIRED_INDEXES, STORAGE_SCHEMA_SQL, USER_SCOPED_TABLES), storage/migrations.ts (USER_TABLES, migrateUserTable, applyStorageMigrations, assertSupportedStorageVersion), storage/sqlite.ts (buildTypedStorageRow, insertStorageRecord, selectStorageRecords, verifyCurrentStorageSchema), capability export in experiences package. RED oracle: scenarios fresh/upgrade in test/agent-learning-procedures-sqlite.test.ts (currently failing 6!==7). Update existing storage-hardening expectations from `expected <= 6` to `expected <= 7` while preserving the older-plugin fail-closed guard contract. Targeted tests only; no formatters/linters/project suites; no git/jj; tests use temp dirs only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fresh storage reports PRAGMA user_version = 7
- [x] #2 procedures table and required index exist
- [x] #3 Exactly one migration marker for version 7 exists
- [x] #4 v6 data survives the v6→v7 upgrade
- [x] #5 Upgrade is transactional and rolls back on failure
- [x] #6 Reopening/replaying the migration is idempotent
- [x] #7 procedures is included in typed-table, checksum, redaction, and schema-verification lists
- [x] #8 Existing future-version behavior remains fail-closed
- [x] #9 New owner advertises v7 capability without opening the ledger
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 Orchestrator verification (independent re-run): bun test test/agent-learning-procedures-sqlite.test.ts -> 3 pass / 2 fail where fresh+upgrade+backup GREEN, procedures+legacy intentionally RED (owned by tickets B/D). schema.ts STORAGE_SCHEMA_VERSION=7 confirmed, procedures table in SCHEMA_SQL + USER_SCOPED_TABLES. Capability exports confirmed: agent-experience/index.ts:73 re-exports PROCEDURES_PARTITION_SCHEMA_VERSION=7, supportsProceduresPartition(), getProceduresPartitionCapability() from schema.ts:314-321 — advertised without opening ledger. Note: planner referenced an 'existing storage-hardening suite' that does not exist in-repo (no *.test.ts under plugins/experiences); future-version fail-closed semantics preserved by unchanged assert logic. Files: schema.ts (+38/-), migrations.ts (2), sqlite.ts (+15), index.ts re-export.
<!-- SECTION:NOTES:END -->
