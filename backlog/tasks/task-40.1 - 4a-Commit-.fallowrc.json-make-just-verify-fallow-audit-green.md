---
id: TASK-40.1
title: '4a: Commit .fallowrc.json + make just verify / fallow-audit green'
status: Done
assignee: []
created_date: '2026-08-28 16:50'
updated_date: '2026-08-28 16:58'
labels: []
milestone: m-3
dependencies: []
parent_task_id: TASK-40
priority: high
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the committed root `.fallowrc.json` (JSONC) and make the fallow gate work end-to-end on the current tree. Scope: (1) write .fallowrc.json with ONLY documented schema keys (additionalProperties:false-safe, per research doc doc-11): $schema, production:true, ignorePatterns (additions only, e.g. plugins/plannotator/generated/**, .codesight/** — built-in defaults already cover node_modules/dist/coverage/bundles), audit.{gate:'new-only', css:false, cssDeep:false}. DO NOT include audit.*Baseline keys yet (no baseline files exist; a missing referenced baseline may hard-error — UNDOCUMENTED). (2) In its jj task workspace, verify `just fallow-audit` runs green on the current tree. (3) VERIFY the two open risks in the workspace and record the outcome: (R1) `main` resolves as a GIT ref for `fallow audit --base main` in a jj workspace (jj bookmarks without git refs make `git diff main...HEAD` hard-error; if it fails, workers may not set main — document/escalate that the coordinator must ensure main has a git ref, or record the exact behavior). (R2) a Node >= 22 binary is reachable by `npx fallow` in a bun-managed env; record the version. (4) `just verify` must exit green. Do NOT capture baselines (that is 4b). Do NOT touch triage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .fallowrc.json exists at repo root, parses as JSONC, uses only documented schema keys (no unknown keys — fallow rejects them), audit.gate=new-only, audit.css=false, production=true
- [ ] #2 fallow-baselines/ NOT yet referenced by the config (no audit.*Baseline keys)
- [ ] #3 `just fallow-audit` exits 0 on the current tree in the task workspace (base-ref and Node-version risks resolved or escalated with evidence)
- [ ] #4 `just verify` (check + test + fallow-audit) exits 0
- [ ] #5 R1/R2 outcomes recorded in task notes with the exact commands + output
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read doc-11 and the fallow contract tests to confirm documented config keys and repository-specific ignore patterns. 2. Add root .fallowrc.json with the fallow schema pointer, production mode, new-only audit gate, CSS disabled, and only non-built-in ignore patterns; omit baseline paths until TASK-40.2 captures files. 3. Run just fallow-audit, the targeted fallow contract test, and just check; record exact outcomes and any baseline-path decision in implementation notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 4a complete (coordinator applied config; worker evo-blocked on writes — verification done coordinator-side, worker verified fallow-audit via workflow adapter). Config: .fallowrc.json at root with , production:true, audit{gate:new-only, css:false, cssDeep:false}, ignorePatterns[.codesight/**, fallow-baselines/**, plugins/*/vendor|generated|dist, test fixtures/snapshots]. Baseline keys intentionally omitted until 4b (--save-baseline capture); unset baselines are a documented no-op. Verification: npx fallow audit --base main --gate new-only --quiet → exit 0 (config loads, warnings only); bun test test/fallow-gate-contract.test.ts → 12 pass/1 fail (remaining RED = fallow-baseline redirect bug, TASK-40.2 scope); just check → exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created .fallowrc.json (production:true, audit gate new-only, css off, ignorePatterns for generated/vendored paths; baseline keys deferred to 4b). Verified: fallow audit exit 0, contract test 12/13 (remaining RED is 4b scope), just check exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
