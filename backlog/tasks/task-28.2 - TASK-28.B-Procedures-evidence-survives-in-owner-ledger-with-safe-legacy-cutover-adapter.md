---
id: TASK-28.2
title: >-
  TASK-28.B: Procedures evidence survives in owner ledger with safe legacy
  cutover (adapter)
status: Done
assignee: []
created_date: '2026-08-23 09:08'
updated_date: '2026-08-23 09:57'
labels:
  - enhancement
milestone: m-0
dependencies:
  - TASK-28.1
parent_task_id: TASK-28
priority: medium
type: enhancement
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sub-ticket B of TASK-28 (planner packet §3.B). Focused adapter plugins/agent-learning/src/procedures/store/experience.ts; update store/storage.ts (getSkillforgePaths, ensureStore, validateStoredMemories, validateRetrievalMemories, legacy migration helper); REUSE experiences typed-row helpers + checksumJson + withOwnedLock — no parallel implementations. When owner supports v7, project/global procedure evidence uses SQLite; unsupported owners keep the atomic-file store. RED oracle: scenarios procedures/legacy in test/agent-learning-procedures-sqlite.test.ts (currently failing: no such table: procedures; legacy root remains). Checkpoint runs isolated PI_CODING_AGENT_DIR + AX_STATE_ROOT temp dirs. Targeted tests only; no git/jj.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Project, global, and all-partition reads work through the adapter
- [x] #2 Rows use redaction, typed fields, canonical data_json, and shared checksum semantics
- [x] #3 Reads reject or filter tampered checksums
- [x] #4 Writes use an owned procedures lock and fail on lock contention
- [x] #5 Unknown or old owner capability performs no v7 database open/write
- [x] #6 First supported run imports all valid legacy Markdown entries
- [x] #7 Import verifies IDs/counts/checksums before archiving
- [x] #8 Active <agentDir>/agent-learning is archived only after successful import
- [x] #9 Failed import leaves the active root intact for retry
- [x] #10 Repeated import produces no duplicate rows or second archive
- [x] #11 Existing skillforge→agent-learning compatibility migration remains intact and non-clobbering
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 Orchestrator judgment GREEN after fix round 1 (re-prompt for e2e regression). Independent verification: RED oracle 5 pass/0 fail AND test/agent-learning.test.ts 28 pass/0 fail re-run by orchestrator. Fix round 1 added runtime isLedgerFutureVersion probe (experience.ts:34): readOnly DatabaseSync PRAGMA user_version, ENOENT->init path, v>STORAGE_SCHEMA_VERSION->partition unavailable (writeProcedureMemory/read return null, migrate no-op no archive), placed before lock/init at :129/:142/:197/:343. Real ~/.agents/experience ledger (user_version=999 pre-existing) verified untouched post-fix; manual v999 temp-root probe confirms decision table end-to-end. Files: NEW experience.ts (~360L); storage.ts gates :96/:115/:131 + no-recreate archived root; capture.ts saveMemoryEntry gates before write, returns display path containing agent-learning (e2e asserts hold). Deviations audited: resolveProjectId duplicated from storage.ts to break circular import (acceptable, noted); no test edits.
<!-- SECTION:NOTES:END -->
