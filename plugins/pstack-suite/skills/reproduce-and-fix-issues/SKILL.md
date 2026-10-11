name: reproduce-and-fix-issues
description: Reproduce reported bugs systematically and implement minimal fixes with verification.

## Workflow

1. **Read the issue**: Load backlog task details including title, description, labels, and acceptance criteria.
2. **Reproduce locally**:
   - Identify the failure mode from the description.
   - Run the relevant command, test, or UI flow to observe the bug.
   - Capture error output, stack traces, or screenshots as evidence.
3. **Isolate root cause**:
   - Narrow to the smallest code region responsible.
   - Check recent commits (git log) for regressions.
   - Verify against existing tests — do tests already cover this?
4. **Implement fix**:
   - Make the smallest correct change to address the root cause.
   - No refactoring beyond the fix scope.
   - Update callers if the API surface changed.
5. **Verify**:
   - Re-run the reproduction steps to confirm the bug is gone.
   - Run existing tests for the affected module.
   - No regressions in adjacent functionality.
6. **Record**:
   - Add implementation notes to the backlog task.
   - Check off acceptance criteria.
   - Mark task complete with final summary.

## Guardrails
- Do not change test assertions to make them pass.
- Fix the root cause, not the symptom.
- One fix per issue; avoid drive-by cleanup.
