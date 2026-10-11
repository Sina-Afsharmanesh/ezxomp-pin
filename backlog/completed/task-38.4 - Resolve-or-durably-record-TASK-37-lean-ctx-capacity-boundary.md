---
id: TASK-38.4
title: Resolve or durably record TASK-37 lean-ctx capacity boundary
status: Done
assignee:
  - '@Task384Leanctx'
created_date: '2026-08-28 00:00'
updated_date: '2026-08-28 04:43'
labels:
  - architecture
  - investigation
dependencies: []
parent_task_id: TASK-38
priority: high
type: chore
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Closure gate for the existing TASK-37 saturation ticket. The repository already owns gateway shutdown prevention and operational docs; the remaining higher ceiling, schema, and safe stale-reap capability are owned by the external lean-ctx binary. Do not edit the daemon registry, kill active workers, or duplicate TASK-37. Keep the ticket pending until its external prerequisite is delivered, or record the exact blocker and terminal decision on TASK-37.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TASK-37 reaches terminal only with objective capacity, lifecycle, stale-reap, diagnostics, documentation, and verification evidence, or its external blocker is explicitly recorded without claiming completion.
- [x] #2 Fresh active workers remain protected and no registry JSON or arbitrary process cleanup is introduced by TASK-38.
- [x] #3 The existing TASK-37 and doc-9 remain the authoritative record of the installed daemon hard cap and escalation path.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Close only after TASK-37 has objective completion evidence or an explicit unresolved external blocker; never claim an unsafe cleanup.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In WT branch `task-38-leanctx` at `../ezxomp.task-38-leanctx`, inspect TASK-37/doc-9 and repository-owned gateway/lifecycle behavior.
2. Implement only safe repository-owned diagnostics/docs/lifecycle improvements; never edit the external registry, kill arbitrary processes, or claim the daemon cap is fixed.
3. Run focused lean-ctx checks and record exact external-capacity evidence or completed fixes.
4. Commit only repository-owned changes, then use independent validator/judge before integration.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel retry evidence (2026-08-28): refreshed models did not resolve the capacity boundary. A read-only `lean-ctx call ctx_agent --project-root /home/eag1/repo/ezxomp --json '{"action":"list"}'` from the main session reports 15 active registrations: daemon PID 3966719, current coder PID 530669, and 13 older coder registrations with last-active ages 28–360 minutes. Every TASK-38.4 subagent retry failed before repository access with MCP -32603 requiring agent-bus registration at 15/15. No registry JSON, process, or global-state mutation was performed. Existing TASK-37 notes/doc-9 remain authoritative: installed daemon hard cap/reap control is external; escalate for daemon/source/config support rather than unsafe cleanup.

WT assignment: branch `task-38-leanctx`, path `../ezxomp.task-38-leanctx`, created with `wt switch --create task-38-leanctx --no-cd --no-hooks -y` from main commit 7194001. This worktree owns TASK-37 repository-boundary diagnostics/docs only; no registry JSON edits or arbitrary process cleanup. No agent dispatched yet.

Agent assignment: @Task384Leanctx will work only in WT branch `task-38-leanctx` at `../ezxomp.task-38-leanctx` (created from main commit 7194001 via WT CLI). External daemon state remains out of scope; no registry/process/global-state mutation.

Worker attempt on WT branch `task-38-leanctx` at `../ezxomp.task-38-leanctx` could not begin: every lean-ctx operation was rejected before execution because agent-bus capacity remained 15/15 for `/home/eag1/repo/ezxomp`. No files, tests, commit, or Backlog updates were produced. Existing TASK-37/doc-9 external cap evidence remains authoritative; no registry/process/global-state mutation was attempted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved durably via decision-3: lean-ctx detached from ezxomp, plugin archived at archive/_reference/lean-ctx, evo retargeted eval-first, capacity blocker void. Evidence: full suite 378 pass / 0 fail at push 3ba447fc; merged main @ dd7c6e70 gates green.
<!-- SECTION:FINAL_SUMMARY:END -->
