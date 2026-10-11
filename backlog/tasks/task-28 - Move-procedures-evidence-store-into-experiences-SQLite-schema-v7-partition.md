---
id: TASK-28
title: Move procedures evidence store into experiences SQLite (schema v7 partition)
status: Done
assignee: []
created_date: '2026-08-23 07:09'
updated_date: '2026-08-28 01:30'
labels:
  - refactor
  - architecture
milestone: m-0
dependencies: []
priority: medium
type: enhancement
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-27 (doc-5 D1-revision). The consolidated procedures lane currently uses the proven atomic-file store at <agentDir>/agent-learning (migrated from <agentDir>/skillforge). This ticket migrates procedures evidence into the experiences SQLite store as a new partition — schema v6 → v7 with a transactional/idempotent migration mirroring the v5→v6 harness — so all learning data lives in one database with checksum/lock discipline.

Constraint discovered during TASK-27: experiences' schema has a fail-closed future-version guard; a v7 database written by the repo version would be refused by the installed npm experiences plugin until it ships v7 support. Coordinate the schema bump with an experiences release (bump both together), or gate v7 writes on detecting the partition owner version.

References: plugins/experiences/extensions/agent-experience/src/storage/{schema,sqlite,migrations}.ts; plugins/agent-learning/src/procedures/store/storage.ts; doc-5 Implementation decisions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AC1 — experiences storage schema gains a procedures partition via a versioned, transactional, idempotent migration; the fail-closed future-version guard story is preserved (older installed plugins still refuse newer DBs safely, documented).
- [x] #2 AC2 — procedures capture/promote/review read+write through the new partition with the same checksum/lock discipline as habits tables; legacy <agentDir>/agent-learning atomic-file store is migrated once and archived.
- [x] #3 AC3 — backup/restore paths cover the new partition; just verify green including overlay/promotion suites.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# TASK-28 Implementation Plan (from PlanT28 final packet)

## Strategy
(b) Runtime capability/version-gated v7 writes. Rationale: migrations.ts:164-167 fail-closed guard (`expected <= 6`) means repo-local v7 writes would brick an installed npm @ezxomp/experiences; TASK-27 D1-REVISION deferred SQLite for exactly this reason. Experiences exports owner capability (`PROCEDURES_PARTITION_SCHEMA_VERSION = 7` or `supportsProceduresPartition()`); agent-learning checks it BEFORE any ledger open/upgrade. Capability absent/unknown or <7 → keep atomic-file store; >=7 → SQLite procedures partition; only supported owner imports/archives active atomic store; never catch a future-version error after attempting a v7 write.

## Sub-ticket DAG
- A Experiences ledger owns v7 procedures partition (no deps) — schema.ts STORAGE_SCHEMA_VERSION/TABLES/INDEXES/SCHEMA_SQL/USER_SCOPED_TABLES; migrations.ts USER_TABLES/migrateUserTable/applyStorageMigrations/assertSupportedStorageVersion; sqlite.ts typed-row helpers + verifyCurrentStorageSchema; capability export. AC: fresh user_version=7; table+index exist; exactly one migration marker; v6 data survives; transactional rollback; idempotent replay; procedures in typed/checksum/redaction/verification lists; future guard stays fail-closed; capability advertised without opening ledger. Checkpoint: fresh/v6-upgrade/replay scenarios green; storage-hardening expectations updated expected<=6→<=7 preserving older-plugin contract.
- B Adapter + legacy cutover (deps A) — NEW plugins/agent-learning/src/procedures/store/experience.ts adapter; update store/storage.ts (getSkillforgePaths, ensureStore, validateStoredMemories, validateRetrievalMemories, legacy migration helper); reuse typed-row helpers, checksumJson, withOwnedLock. AC: project/global/all-partition reads; redaction+canonical data_json+shared checksums; tampered rows rejected/filtered; owned procedures lock w/ contention failure; unsupported owner performs NO v7 open/write; first supported run imports all valid legacy Markdown entries; verify IDs/counts/checksums BEFORE archiving; archive only after success; failed import leaves active root intact; repeat import = no dupes/no second archive; skillforge→agent-learning rename migration intact/non-clobbering. Checkpoint: isolated PI_CODING_AGENT_DIR + AX_STATE_ROOT temp runs.
- C Consumers repoint (deps B) — capture.ts saveMemoryEntry; retrieve.ts validateRetrievalMemories+ranking; promotion.ts promoteMemoryIfEligible/promoteRetrievedMemories/listPendingProposals/applyProposal; extension.ts; overlay.ts. AC: capture→retrieve round-trip from partition; partition semantics/ranking unchanged; tampered not returned; exactly one proposal from DB-backed entry; human-gated review/apply unchanged; proposal JSON stays projection, SQLite owns evidence; fallback preserves atomic behavior; no consumer reads archived legacy root. Checkpoint: overlay/promotion suites + procedures scenario.
- D Backup/restore round-trip (deps A+B; parallel with C after B) — backup.ts createBackup/prevalidateBackup/restoreBackup+journal recovery. AC: manifest advertises v7; prevalidate accepts valid v7 backup; deleted row restored w/ checksum intact; WAL checkpointing + restore journaling safe; fail-closed behavior for unsupported/future backups intact. Checkpoint: authored backup scenario.
- E Final gate (deps C+D) — all RED scenarios green; existing overlay/promotion/storage-hardening suites green; mixed-version fallback covered; isolated temp dirs only; no TASK-29 state/config/doc-5 touched. Orchestrator runs full just verify once at clean checkpoint.

## Risks
R1 migration/data loss (one immediate transaction, preserve rows/checksums, test rollback); R2 installed-plugin bricking (capability detect precedes open); R3 dual-write divergence (one authoritative adapter per mode); R4 archive races (owned lock + atomic non-clobbering rename + idempotent marker); R5 checksum/lock drift (reuse shared helpers only); R6 backup/WAL hazards (checkpoint where required, retain journal recovery); R7 scope violation (tests use temp dirs only; TASK-29 untouched); R8 proposal semantics (JSON stays human-gated projection).

## Verification
RED files remain unchanged as acceptance oracle. Workers run ONLY targeted bun test on touched suites. Full `just verify` reserved for orchestrator closeout.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 PlanT28 final packet received: strategy (b) capability-gated v7 writes locked; RED suite authored (test/agent-learning-procedures-sqlite.test.ts + test/fixtures/agent-learning-procedures-v7-e2e.ts), targeted run 0 pass / 5 fail for expected pre-v7 reasons (6!==7, no procedures table, legacy root unarchived, insert helper rejects). Anchors mapped: schema.ts:1/:3-40/:288, migrations.ts:164-167/:170-185/:120-156, sqlite.ts:107-121/:124-140, checksum.ts:3-20, locks.ts:103-169, backup.ts:171/:243/:412, agent-learning storage.ts:85-124/:189-205/:206+, capture.ts:112-131, retrieve.ts:27-58, promotion.ts:52-130/:132-184.

2026-08-23 FINDING (B fix round 1): WorkT28B turned RED oracle 5/5 green but regressed test/agent-learning.test.ts procedures pipeline e2e (was green pre-T28). Root cause chain: agent-learning adapter getPrivateStateRoot() defaults to ~/.agents/experience when AX_STATE_ROOT unset; REAL user ledger there sits at user_version=999 (pre-existing future-guard probe state); compile-time capability gate passes (7>=7) then initExperienceStorage fail-closed assert throws uncaught -> e2e child crash at capture. Violates strategy (b) 'never catch a future-version error after attempting a v7 write'. Fix contracted to WorkT28B: runtime READ-ONLY PRAGMA user_version probe after root resolution, before lock/init/write; version>cap -> partition unavailable, silent atomic-file fallback; migrate no-ops cleanly on future-version so import never archives off a failed import; real ~/.agents/experience/** untouched. Both suites required green: RED oracle 5/5 + agent-learning.test.ts 28/28.

TASK-28.E final gate — orchestrator-executed (GateT28E spawn 404 dead agentModelOverrides route; GateT28E2 retry 429 FreeUsageLimitError retryAfterMs~49593000 ~13.8h; respawn non-viable per dispatch-failover playbook). Independent runs:

Suites (all suites importing touched subtrees, grep-enumerated): agent-learning-procedures-sqlite 5 pass/0 fail; agent-learning 28 pass/0 fail incl. procedures pipeline e2e; agent-learning-review-gate 9 pass/0 fail; augment 7 pass/0 fail.

Mixed-version demo /tmp/e-gate-fallback.ts (isolated temp AX_STATE_ROOT + PI_CODING_AGENT_DIR): MODE=v7 -> saved.path=sqlite:procedures/gotcha-e-gate-v7-20260823.md, ledger uv=7 procedures=1. MODE=future (seed user_version=999 at $AX_STATE_ROOT/ledger.sqlite) -> silent atomic fallback /agent/agent-learning/memory/projects/<id>/gotchas/...md, no exception; ledger stays uv=999, no procedures table. Real /home/egsox/.agents/experience re-verified uv=999 no-table — untouched.

Probe note: isLedgerFutureVersion readOnly open works under bun via loadSqlite BunDatabaseSync wrapper translating readOnly->readonly+create:false (storage/sqlite.ts:51-54); wrapper path verified.

Follow-up from TASK-38.1: saveMemoryEntry now calls ensureStore after validation before the SQLite adapter, so direct first saves run the shared legacy skillforge -> agent-learning migration instead of bypassing it. The existing legacy e2e was made hermetic by sandboxing AX_STATE_ROOT/AX_SRC and seeding user_version=999 to exercise the documented atomic fallback without relying on a pre-existing host ledger. Evidence: bun test test/agent-learning.test.ts — 28 pass, 0 fail; bun test test/agent-learning-procedures-sqlite.test.ts — 5 pass, 0 fail.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-23 10:46
---
TASK-28 shipped in consolidation commit `195713df24e8`, pushed to origin/main (tangled.org, fast-forward fcf8399→195713df). Contains schema v7 partition + migrations + capability export, experience.ts adapter with future-version silent fallback, backup WAL checkpoint, immutable v7 e2e fixture; E-gate evidence recorded earlier on this task.
---
<!-- COMMENTS:END -->
