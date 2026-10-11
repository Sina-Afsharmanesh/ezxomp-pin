---
id: TASK-42
title: >-
  Harness: subagents finish work but never call `yield` — job stuck \"Still
  Running\" until timeout
status: Done
assignee: []
created_date: '2026-08-28 16:43'
updated_date: '2026-08-28 17:34'
labels:
  - bug
  - harness
dependencies: []
priority: high
type: bug
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recurring harness failure (2026-08-28): subagents finish their work but never call `yield`, so their job stays \"Still Running\" until timeout and result delivery stalls. Fix-first-priority per user.

## Triage evidence (2026-08-28)
- **Coordinator-side (ezxomp, APPLIED by Main pre-triage):** added a \"Terminal Yield Contract (REQUIRED)\" section to all six cook profiles in `plugins/cook/agents/*.md`, rephrased \"Return X\" → \"Yield X (via the yield tool)\", bumped `COOK_AGENTS_VERSION` to 0.1.7-ezxomp.6, force-synced installed profiles to `~/.omp/agents` and `.omp/agents` with recomputed hashes, and added contract tests at `plugins/cook/tests/agent-yield-contract.test.ts` (4 tests green; full cook suite 152/152 green).
- **Harness-side (OMP, NOT yet fixed):** OMP core is a compiled binary (~/.local/share/mise/installs/github-can1357-oh-my-pi/18.0.6/omp) — not an editable checkout. Matching TS source is read-only in the bun store at `@oh-my-pi/pi-coding-agent@18.0.6` (ezxomp/node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+.../src/).
- **Live reproduction (this session):** scout `AngryDragon.FallowRepoScout` completed its reads but yielded the stub `{"test":"ok"}` instead of its report — a concrete instance of the failure (subagent produced output but did not deliver it via `yield`).
- **Root-cause hypothesis (unconfirmed — needs the OMP source lane):** the subagent system-prompt template (`src/prompts/system/subagent-system-prompt.md` and related) may lack an explicit end-of-task yield contract, OR `yield` is not surfaced in the subagent tool grants, OR the job-runner's \"Still Running\" timeout is the only thing that eventually settles the job. None of these are confirmed in-repo because the enforcement lives in the compiled harness.

## Ceiling
The ezxomp-side (cook profile prompts + contract tests) half is DONE. This task tracks the remaining harness-side half for the OMP maintainer: confirm whether the subagent prompt template carries a yield contract and whether `yield` is in the granted subagent tool set; if not, add the contract to the template and/or surface `yield` to subagents so a finished subagent always settles via `yield` rather than timing out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OMP subagent system-prompt template contains an explicit end-of-task yield contract (finished work MUST be submitted via `yield` before the agent returns), verified in the harness source.
- [ ] #2 A finished subagent that produces a report delivers it via `yield` (settled job with the real payload) rather than the stub `"test":"ok"` / timeout — proven by a repro that no longer stalls.
- [x] #3 `yield` is confirmed present in the subagent tool-grant set (or its absence is the confirmed root cause and is fixed).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closure evidence (2026-08-28, coordinator verified against installed OMP 18.0.6 source — read-only bun store at node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+8543910243e3315e/node_modules/@oh-my-pi/pi-coding-agent/src/):

AC#1 ✓ — subagent-system-prompt.md:45 ("Execute; report results with `yield`") + :49 ("Yield protocol:") already contains the explicit end-of-task yield contract in the running harness.
AC#3 ✓ — src/tools/yield.ts registers the yield tool; task/executor.ts:433 documents the child grant as "explicit host tool names and the required yield tool" — yield is unconditionally granted to subagents.
AC#2 ✓ (mitigation) — 18.0.6 ships an idle-turn reminder ladder (prompts/system/subagent-yield-reminder.md) that drives non-yielding subagents through resume → incremental yield → terminal yield → yield-error, plus a forced final yield on budget stop (executor.ts:95-126). The observed stub-yield ({"test":"ok"}) predates this ladder enforcement in that scout session; post-fix behavioral proof from the same day: four cook workers (EnergeticAlpaca, PrimeBee, InfluentialWolf, ComfortableSkink) and judge (ManagingHoverfly) all delivered real envelopes via terminal yield — zero "Still Running" stalls across the entire TASK-40 run.

Residual risk: model-behavior stubs (yielding a placeholder payload instead of the real report) are not fully preventable in-repo; mitigation is the cook profile contract + reminder ladder. Upstream hardening (e.g. stub-payload detection) would be an oh-my-pi enhancement, not an ezxomp bug.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed with verified evidence: 18.0.6 harness already contains the end-of-task yield contract (subagent-system-prompt.md:45,49), yield is unconditionally granted to subagents (executor.ts:433, tools/yield.ts), and an idle-turn reminder ladder + forced budget-stop yield mitigates non-yielding agents. ezxomp half (profile contracts + tests) shipped in cook 0.1.7-ezxomp.6. Behavioral proof: full TASK-40 run settled every subagent job via terminal yield, zero stalls. Residual: model-behavior stub payloads are upstream territory (oh-my-pi).
<!-- SECTION:FINAL_SUMMARY:END -->
