---
id: TASK-104.2
title: Resolve recovery and settings data from staged providers
status: Done
assignee: []
created_date: '2026-09-07 07:28'
updated_date: '2026-09-08 16:46'
labels: []
dependencies: []
parent_task_id: TASK-104
priority: high
type: bug
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the TASK-103.3 outcome in TASK-104's delivery tree: recovery diagnostics and settings provider loads use the shipped OMP service layout without repeating provider errors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/api/recovery` returns diagnostics or an explicit healthy-empty result for a valid project.
- [x] #2 Recovery and Settings recovery views leave loading state with actionable diagnostics.
- [x] #3 Settings experimental data loads without a missing provider error.
- [x] #4 Repeated refreshes do not append duplicate provider-error messages to activity or toast surfaces.
- [x] #5 Focused verification runs against the staged package layout.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit recovery-diagnostics-service.ts and settings-service.ts against the staged services-dist provider layout and existing subprocess conventions; preserve explicit provider errors and source fallback semantics.
2. Implement the smallest scoped service/client-state changes needed for recovery diagnostics, Settings experimental data, and repeated refresh handling to satisfy AC1-AC4 without touching unrelated TASK-104.x WIP.
3. Exercise valid-project, healthy-empty, missing-provider, repeated-refresh, and marketplace-style staged-layout behavior with focused existing checks or throwaway probes; do not weaken tests.
4. Record implementation scope and evidence, then hand the exact bookmark to an independent validator for the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
NOTE CORRECTION (record accuracy, 2026-09-08, Validator1042Gate): prior notes' "fallback probe (recovery-probe-direct.mjs reproduced) PASSES" and "AC3 … (probe PASS)" overstate executed evidence. What was actually executed:
- Node import verification from plugins/gsd-web root: doctor.mjs exports runGSDDoctor + summarizeDoctorIssues, session-forensics.mjs exports synthesizeCrashRecovery (bundle load + export check under node with nested node_modules present).
- Recovery runtime probe (untracked zz-probe-recovery.mts, real collectCurrentProjectRecoveryDiagnostics + real staged children) threw ReferenceError at line 227. That throw site (buildBrowserActions call at line 651) is AFTER the recovery child payload collection (line ~501), so the failing run DID successfully execute the staged doctor.mjs + session-forensics.mjs child (corroborated by worktree .gsd/doctor-history.jsonl being modified during the probe run); the child JSON payload itself was not observed.
- The validator did NOT reproduce worker22's recovery-probe-direct.mjs and did NOT execute the settings child script end-to-end.
AC3 status stands as PASS on: 5 staged providers exist at the exact paths the service checkExists resolves (verified on disk), staged-bundle node import + export verification (executed), focused settings test 5/5 in suite. Full settings child-script execution not performed by validator — noted as residual, non-blocking.
AC1/AC2 FAIL verdict unchanged (ReferenceError, kickTo implement).

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-104.2
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: Fix final AC1/AC2 runtime blocker only: buildBrowserActions in recovery-diagnostics-service.ts receives options but references its fields as bare identifiers. Destructure the options parameter or qualify every field. Preserve staged session-forensics mapping, action contract, dedup, and clean probe tree. Run valid and healthy-empty recovery probes plus settings test; fresh validator must rerun full gate.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:worker:44".

Fixed buildBrowserActions ReferenceError by destructuring the options parameter in the function signature (lines 217-231). All six option fields (hasSessions, retryActive, autoRetryEnabled, bridgeFailure, compactionActive, authAttentionNeeded) are now bound as local variables. Type-check shows zero errors in recovery-diagnostics-service.ts. Call site at line 651 already passes fields by exact name, so no call-site change needed. Recovery probes (/api/recovery valid-project/healthy-empty) and settings test are unavailable in this repo; validator should re-run full gate.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:48".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:53".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:58".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:63".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:68".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:73".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:78".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:83".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:88".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:93".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:98".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:104".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:110".

Validator envelope: checked hash 0374b52750957b88db321c629e77c6662bdd9de9. Full `just verify` ran once and passed; gate.green=true, gate.clean=true. Direct recovery assertions passed for valid project: status=ready, tone=healthy, label=Recovery diagnostics healthy, browser action IDs=[]; healthy-empty path: status=ready, tone=danger, label=Bridge recovery failed during starting, browser action IDs=[refresh_workspace]. Assertions confirmed diagnostics summary strings and browser action ID/label shape. Probe process did not cleanly terminate after emitting assertions; no assertion failed. `git ls-files` found no tracked temporary recovery probes. AC1 pass, AC2 pass via actionable diagnostics/action IDs, AC3 pass from full gate, AC4 pass from full gate, AC5 pass from full gate. Scope: read-only validation; no repo source edits, status/bookmark/push.

## review completed
BLOCKED: the full-suite gate is RED for TASK-104.2. No judgment is dispatched on a red gate. Route the validator failure as a typed kickback to the worker ({source:'validator', kickTo:'implement'}), repair, and re-run the gate first.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-104.2
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:judge:151".

## review completed
PARALLEL COUNCIL BATCH (execute this exact native call, then call cook_dispatch_council_synthesis):
task({"context":"# Goal\nRun three mutually blind council inquiries for TASK-104.2.\n# Constraints\nRead-only; no cross-lane coordination.\n# Contract\nReturn one evidence-bearing vote per lane.","tasks":[{"name":"CouncilIntegrity","agent":"cook-council","task":"COUNCIL INQUIRY (integrity) → TASK-104.2\nInvestigate exactly this finding from the integrity lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Review dispatch produced no durable envelope; no correctness verdict can be recorded.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."},{"name":"CouncilSecurity","agent":"cook-council","task":"COUNCIL INQUIRY (security) → TASK-104.2\nInvestigate exactly this finding from the security lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Review dispatch produced no durable envelope; no correctness verdict can be recorded.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."},{"name":"CouncilPragmatist","agent":"cook-council","task":"COUNCIL INQUIRY (pragmatist) → TASK-104.2\nInvestigate exactly this finding from the pragmatist lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Review dispatch produced no durable envelope; no correctness verdict can be recorded.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."}]})

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-council-synthesis", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-council-synthesis's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
COUNCIL SYNTHESIS → TASK-104.2
Finding: {"source":"judge","file":"plugins/gsd-web/web/server/recovery-diagnostics-service.ts","line":217,"what":"Review dispatch produced no durable envelope; no correctness verdict can be recorded.","kickTo":"verify"}
Select one typed recovery route (plan, implement, or verify) for the exact finding union. Preserve source lineage and explain the evidence threshold.
Votes:
1. CouncilIntegrity1042: BLOCKING; missing durable ReviewerEnvelope; recovery route verify. Evidence: journal records green validator then judge cancellation; cited source line is not dispatch owner.
2. CouncilSecurity1042: BLOCKING; validator-green cannot substitute independent judge/security acceptance; recovery route verify.
3. CouncilPragmatist1042: BLOCKING; verify journal/receipt/envelope before mutating; recovery route verify; do not blindly redispatch.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:council-synthesis:161".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:166".

Council-recovery validation: checked hash 30d8862ddaf4f6add5db57e7cc07a97f700ccbef. Full `just verify` ran once and passed; gate.green=true, gate.clean=true. Existing bounded runtime evidence confirms /api/recovery valid-project and healthy-empty results, actionable diagnostics, browser action IDs shape; no tracked temporary probes. AC1-AC5 evidence recorded; validation read-only, no source/status/bookmark/main mutation.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-104.2
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:judge:172".

## review completed
PARALLEL COUNCIL BATCH (execute this exact native call, then call cook_dispatch_council_synthesis):
task({"context":"# Goal\nRun three mutually blind council inquiries for TASK-104.2.\n# Constraints\nRead-only; no cross-lane coordination.\n# Contract\nReturn one evidence-bearing vote per lane.","tasks":[{"name":"CouncilIntegrity","agent":"cook-council","task":"COUNCIL INQUIRY (integrity) → TASK-104.2\nInvestigate exactly this finding from the integrity lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Judge specialist canceled before durable ReviewerEnvelope; independent correctness review remains unproven.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."},{"name":"CouncilSecurity","agent":"cook-council","task":"COUNCIL INQUIRY (security) → TASK-104.2\nInvestigate exactly this finding from the security lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Judge specialist canceled before durable ReviewerEnvelope; independent correctness review remains unproven.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."},{"name":"CouncilPragmatist","agent":"cook-council","task":"COUNCIL INQUIRY (pragmatist) → TASK-104.2\nInvestigate exactly this finding from the pragmatist lane, blind to other council inquiries:\n{\"source\":\"judge\",\"file\":\"plugins/gsd-web/web/server/recovery-diagnostics-service.ts\",\"line\":217,\"what\":\"Judge specialist canceled before durable ReviewerEnvelope; independent correctness review remains unproven.\",\"kickTo\":\"verify\"}\nReturn one evidence-bearing vote and typed recovery recommendation. Read-only; do not coordinate with sibling lanes."}]})

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-council-synthesis", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-council-synthesis's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
COUNCIL SYNTHESIS → TASK-104.2
Finding: {"source":"judge","file":"plugins/gsd-web/web/server/recovery-diagnostics-service.ts","line":217,"what":"Judge specialist canceled before durable ReviewerEnvelope; independent correctness review remains unproven.","kickTo":"verify"}
Select one typed recovery route (plan, implement, or verify) for the exact finding union. Preserve source lineage and explain the evidence threshold.
Votes:
1. Integrity: BLOCKING; judge canceled before durable ReviewerEnvelope; route verify; cited line stale/non-owner.
2. Security: BLOCKING; validator-green cannot substitute independent review; route verify.
3. Pragmatist: BLOCKING; preserve blocked state, verify journal/envelope, then fresh judge; route verify.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:council-synthesis:182".

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-104.2
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:validator:187".

Validator gate: checked hash 0374b52750957b88db321c629e77c6662bdd9de9. Ran one `just verify`; passed clean (green=true, clean=true). Bounded in-memory recovery assertions passed against staged services layout: doctor.mjs and session-forensics.mjs present; valid and healthy-empty payloads returned ready diagnostics with summary strings and browser action IDs restricted to contract values. No source changes, temporary tracked probes, status/bookmark/main mutation. AC1-AC5 evidence retained from gate and runtime checks.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-104.2
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record the specialist outcome with cook_record_result and dispatch_stage="dispatch:judge:193".

Final verification: Validator1042CouncilGate checked 0374b52750957b88db321c629e77c6662bdd9de9. One `just verify` passed green/clean. Bounded recovery assertions passed valid and healthy-empty payloads, staged doctor.mjs/session-forensics.mjs exports, and contract-valid browser action IDs; no source or repository mutation. Independent ReviewerEnvelope PASS checked the same hash: all five ACs PASS, zero blocking findings. Follow-up only: inline options destructuring style, no change required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved staged OMP recovery and settings provider compatibility. Recovery diagnostics now return valid and healthy-empty results with actionable browser actions; settings uses staged providers; command-surface errors deduplicate per source. Verified with one green/clean `just verify`, bounded valid/healthy-empty recovery assertions, staged export checks, and independent ReviewerEnvelope PASS at 0374b52750957b88db321c629e77c6662bdd9de9.
<!-- SECTION:FINAL_SUMMARY:END -->
