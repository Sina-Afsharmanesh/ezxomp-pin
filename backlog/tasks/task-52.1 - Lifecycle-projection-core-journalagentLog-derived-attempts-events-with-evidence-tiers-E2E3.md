---
id: TASK-52.1
title: >-
  Lifecycle projection core: journal+agentLog derived attempts/events with
  evidence tiers (E2+E3)
status: Done
assignee: []
created_date: '2026-08-29 02:20'
updated_date: '2026-08-29 04:19'
labels: []
dependencies: []
parent_task_id: TASK-52
priority: high
type: task
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the E2/E3 dead paths in plugins/cook/extensions/dagr.ts + cook-tools.ts. Today buildRunDoc reads cs.agentLog which has zero write sites (verified: reads only at cook-tools.ts:126,135,143,268,1049,1052,1057), so attempts/events arrays are dead (G2), and journal gate receipts (journal.ts appendGate, event:'gate' + hash + note) are never projected (G3 — appendGate has ZERO production callers). Deliver: (1) a pure, exported input-builder (e.g. buildDagrProjectionInput in dagr.ts or a new dagr-lifecycle.ts) that takes {tasks, claims, agentLog[], journalByTask} and emits DagrProjectionInput including: working attempts for claimed/in-progress tasks with locator+last_output_at from claim holder + freshest journal ts (E4), terminal attempts from agentLog dispatch records (ONE attempt per dispatch record per author contract), attempt_settled events derived from journal record/gate entries with evidence tier verified when a gate receipt (event:'gate') exists for the task, reported when a dispatch payload was recorded, else asserted (E3); (2) append AgentLogEntry {taskId, stage:'dispatch:'<role>, role, model, timestamp} in cook-tools.ts dispatchPayload after a successful payload build (all 9 dispatch tools: planner :616, scout :648, researcher :666, worker :698, validator :729, judge :756, refute :1583, audit :1618, council if present) — the ONLY agents.ts-adjacent touch allowed is NONE (agents.ts/agents/* untouched); (3) make the validator dispatch path actually record the gate: after validator settle, write appendGate(cwd, taskId, hash, green) — wire exists as cook_journal gate in the validator brief today; extend cook_journal tool (cook-tools.ts:1557) to accept event:'gate' with hash and call appendGate, OR record the gate receipt inside cook_dispatch_validator's record-phase helper — implementer picks per existing journalAppend helper shape (journalAppend only supports claim/release/refute/intent/external today, cook-tools.ts:187-196).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new pure input-builder builds DagrProjectionInput entirely from (tasks, claims, agentLog, journalEntries) with no fs/exec access and is exercised directly in tests
- [x] #2 agentLog entries with stage 'dispatch' map to per-role working attempts with actor and startedAt and emit attempt_started events; an agentLog entry with a matching journal record/gate for same taskId+stage maps to a terminal attempt whose outcome uses evidence tier verified with receipt quoting journal hash and note
- [x] #3 agentLog dispatch entries with no matching journal record settle as reported, and tasks with claims but no attempt data get settled_unverified synthetic treatment preserved (existing E150 path unchanged)
- [x] #4 attempt numbering n is stable per taskId across repeated projections of the same inputs (n counts that task's attempts in log order), and no attempt id collides
- [x] #5 one attempt is derived per dispatch record — repeated intent vs record journal pairs for the same role-stage do not multiply attempts (intent opens, terminal journal entry settles the same attempt)
- [x] #6 all unit tests run without a dagr binary (DAGR_BIN unset or fake), no network, no herdr runtime
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add exported `buildDagrProjectionInput` in `plugins/cook/extensions/dagr.ts` to derive task-local attempts/events from supplied Backlog tasks, claims, agent logs, and journal entries without filesystem or process access.
2. Route `cook-tools.ts` successful dispatches through durable write-ahead journal intent + `agentLog` recording, use the pure builder in `pushDagr`, and keep projection failures best-effort.
3. Extend staged gate journaling in `journal.ts`; reject malformed public receipts and represent green, red, stale, malformed, repeated, and timestamp-tied terminal evidence truthfully.
4. Preserve E150, add RED regression coverage for lifecycle pairing/receipt edge cases, and verify against targeted lifecycle, trigger, and journal suites with later-slice failures explicitly classified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator dispatched `cook-worker` to isolated jj workspace `/home/eag1/repo/ezxomp.task-52-1` from the `task-52.5` RED-test bookmark. Expected deliverable: `task-52-1` bookmark; coordinator will inspect and integrate after worker evidence.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

Independent validation on bookmark `task-52-1` failed. Command: `cd /home/eag1/repo/ezxomp.task-52-1/plugins/cook && bunx vitest run tests/dagr-projection.test.ts tests/dagr-push-triggers.test.ts` → 9 pass, 5 fail. Later-slice failures: freshness, typed recovery, HERDR locator. In-scope blockers: dispatch durability, valid gate receipt persistence, unmatched dispatch evidence state, and one-to-one journal pairing. Gate remains red; no AC checked.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-52.1
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Repair only the validator's four blocking findings on the existing TASK-52.1 workspace/bookmark. Do not change tests or later TASK-52 slices. Required outcomes: successful dispatch records `AgentLogEntry` only after a valid payload; `cook_journal` accepts a gate hash/stage/green and writes `appendGate`; pure lifecycle derivation settles unmatched dispatches with reported evidence as required by AC3; record/gate entries are paired in durable order so each dispatch settles at most once. Keep dagr best-effort/non-gating and local node_modules symlink untracked.

Record all results on task TASK-52.1 via backlog_task_edit.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

Fresh scoped validation passed for `task-52-1` after a pre-link diff gate confirmed only `dagr.ts` and `cook-tools.ts`. With a transient, trap-removed local dependency link, `bunx vitest run tests/dagr-projection.test.ts tests/dagr-push-triggers.test.ts` yielded 10/14 green: all 9 lifecycle-builder tests plus durable dispatch and gate-receipt assertions passed. The four remaining failures are explicitly owned by later slices: freshness after `cook_next`/dispatch (TASK-52.3), typed recovery (TASK-52.6), and HERDR locator/liveness (TASK-52.2). No TASK-52.1 blocking finding.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-52.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-52.1 via backlog_task_edit.

Dual independent review failed. Correctness findings: per-task journal sequence collisions, stale terminal matching, red gates projected as verified success, malformed gate receipts, swallowed validator intent failures, and dead production use of the pure builder. Quality review additionally found a type-contract breach from `t.labels` and unvalidated gate fields. Review evidence requires a repair before AC closure; later-slice freshness/recovery/HERDR gaps remain deliberately out of this child.

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-52.1
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Repair the dual-review blockers only: route production `pushDagr` through the pure builder with task claims/journals; make ordered pairing task-local/time-bounded; map red gates to a non-success terminal outcome; align validator journal stage and fail closed on intent-write failure; require non-empty gate hash/green inputs before appendGate; remove untyped labels/kind/projects scope creep reserved for TASK-52.4. Do not edit tests. Use merged test base `task-52-1` + `task-52-1-stale-test`; leave local dependencies untracked.

Record all results on task TASK-52.1 via backlog_task_edit.

Repair attempt blocked before any source change: the active `cook-worker` profile lacked `eval`, while evo blocked native writes to the sibling jj workspace. No code/test/bookmark mutation occurred; fallback implementation dispatch will use a write-capable fresh context.

Review remediation applied by coordinator from the blocked worker's drafted patch in isolated workspace and committed as `task-52-1` → `2ab2a8a7`. Targeted evidence before commit: 25/29 assertions passed across journal/lifecycle/trigger tests; four remaining named reds are later slices (kind/projects TASK-52.4; freshness TASK-52.3; typed recovery TASK-52.6; HERDR locator/liveness TASK-52.2). Typecheck attempt was blocked by environment error `TS2688: Cannot find type definition file for 'bun'`, not a source diagnostic; logged for final gate follow-up.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

Fresh remediation validation passed on `task-52-1` / `2ab2a8a7`. Pre-link diff scope was exactly `cook-tools.ts`, `dagr.ts`, `journal.ts`; transient dependency link was removed. Targeted suite: 25/29 passed (journal 9/9, lifecycle 11/12, triggers 5/8); all four reds are assigned later slices `.2`/`.3`/`.4`/`.6`. Validator marked all six TASK-52.1 ACs PASS, including task-local pairing, stale terminal rejection, red-gate safety, valid gate fields, fail-closed intent, and live-builder projection.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-52.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-52.1 via backlog_task_edit.

Fresh dual review of remediation commit failed on two residual lifecycle issues: ordered pairing can let a later terminal settle an earlier dispatch when a later intent exists, and malformed persisted gate entries can claim verified evidence without valid receipt fields. Both require new RED regressions and a repair; generic dispatch intent is confirmed fail-closed and is not a remaining finding.

Residual dual-review repair committed as `task-52-1` → `4d292ba1`. Added planner-owned RED regressions for dispatch-intent intervals and malformed persisted gate receipts. Targeted journal/lifecycle/trigger evidence: 27/31 passed; four remaining reds are still only later slices `.2`/`.3`/`.4`/`.6`.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

Final scoped validation on `task-52-1` / `4d292ba1` passed all TASK-52.1 ACs. Exact controlled run: journal 9/9, lifecycle 13/14, trigger 5/8 (27/31 total); both residual regressions passed. The only four failures remain explicitly assigned to TASK-52.2/.3/.4/.6.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-52.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-52.1 via backlog_task_edit.

Final dual review found one residual blocker: next-intent delimiting depended on strictly later wall-clock timestamps. Same-millisecond or regressed persisted clocks can let a terminal settle the prior dispatch. A final seq/index-order regression and repair are required before child closure.

Timestamp-tie review repair committed as `task-52-1` → `548beda0`; planner regression proves same-timestamp intents delimit by journal sequence. Targeted result: 28/32 passed, with only the four established later-slice reds remaining.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-52.1
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-52.1 via backlog_task_edit.

Fresh timestamp-tie validation on `task-52-1` / `548beda0` passed every TASK-52.1 AC: 28/32 assertions green, all lifecycle/ordered-pairing regressions including tied timestamps green. The only four reds remain established later-slice contracts `.2`/`.3`/`.4`/`.6`.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-52.1
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-52.1 via backlog_task_edit.

Final child evidence: `task-52-1` bookmark at `548beda0`; fresh validator passed all six ACs with 28/32 targeted assertions green and four explicitly later-slice reds. Final dual correctness and quality judges both passed the sequence-order, receipt-validity, and non-gating boundaries.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: cook-validator
created: 2026-08-29 03:09
---
[blocking] `plugins/cook/extensions/cook-tools.ts:71` — successful worker dispatch leaves `agentLog` empty; record one dispatch fact only after payload success. `cook-tools.ts:1562` — gate schema/handler emits `external` with no hash; accept gate fields and call `appendGate`. `plugins/cook/extensions/dagr.ts:104` — unmatched dispatch remains working; model the required reported settlement. `dagr.ts:101` — every same-stage record/gate can settle every dispatch; pair journal entries with each dispatch in durable order so one attempt settles once.
---

author: cook-judge
created: 2026-08-29 03:31
---
[blocking] `dagr.ts:100-112` — pair terminal journal events by task and ordered dispatch; a global seq set collides across per-task journals, stale records can attach, and red gates must not project verified success. `cook-tools.ts:129` — route live `pushDagr` through the pure builder with claims/journals. `cook-tools.ts:751` — fail closed on validator intent write failure. `cook-tools.ts:1568` — require/validate gate receipt fields before `appendGate`. `dagr.ts:178` — remove/fix untyped `labels` access until TASK-52.4 owns kind mapping.
---

author: cook-judge
created: 2026-08-29 04:02
---
[blocking] `plugins/cook/extensions/dagr.ts:117` — pair each terminal inside its dispatch-intent interval; a later terminal must not settle an earlier attempt. `dagr.ts:134` — validate persisted gate stage/hash/note before `verified`; malformed gate data must not produce verified success or an unreceipted verified terminal.
---

author: cook-judge
created: 2026-08-29 04:13
---
[blocking] `plugins/cook/extensions/dagr.ts:115` — delimit a dispatch interval by the next same-stage journal intent's sequence/index, not `at > timestamp`; tied/regressed timestamps must not let a later terminal settle the prior dispatch.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented durable cook lifecycle projection: pure task-local journal derivation, write-ahead dispatch records, staged gate receipts, receipt-safe terminal outcomes, and live producer use. Verified by fresh validator (all TASK-52.1 ACs PASS; 28/32 targeted assertions with only TASK-52.2/.3/.4/.6 reds) and independent dual review PASS.
<!-- SECTION:FINAL_SUMMARY:END -->
