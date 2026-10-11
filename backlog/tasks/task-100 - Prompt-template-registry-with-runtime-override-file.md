---
id: TASK-100
title: Prompt template registry with runtime override file
status: Done
assignee:
  - '@W100'
created_date: '2026-09-06 05:24'
updated_date: '2026-09-06 08:30'
labels:
  - architecture
dependencies:
  - TASK-95
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/prompts.py'
documentation:
  - doc-23
priority: low
type: enhancement
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port skillopt_sleep/prompts.py pattern: central registry of all LLM-facing prompt templates (miner/attempt/judge/reflect equivalents) in one module, user-overridable via a json file under <agentDir>/agent-learning (mtime-checked hot reload). Ships templates only — no LLM calls — so future gated reflection (TASK-95 follow-up) is auditable and tunable without code changes. Aligns with the review-gate contract: any future LLM stage remains behind explicit user invocation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All shipped prompt templates resolve through the registry, none inline
- [x] #2 Override file edits take effect on next read without restart (mtime check)
- [x] #3 No LLM invocation is shipped; registry is data-only
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator audit: fixed hot-reload bug (60s TTL cache served stale overrides; replaced with statSync mtime comparison — verified V1→V2 reload works). Zero network/LLM calls confirmed. 31/31 tests. Bookmark al-prompts @ bcc75af6.

Independent audit (wave 2, al-prompts @ bcc75af6, gate green=1 hash=bcc75af6, 2026-09-06): bun test test/agent-learning-prompts-registry.test.ts = 5 pass/0 fail (22 expect); bun test test/agent-learning.test.ts = 26 pass/0 fail (162 expect). Live probe (single process, 50ms sleeps): override v1 'V1-OVERRIDE' -> write v2 -> reload = 'V2-OVERRIDE' without restart; zero TTL tokens in registry.ts (no 60_000/60000/Date.now/setTimeout); mtime comparison at registry.ts:134,158. git diff main..al-prompts --stat: only prompts/registry.ts (+163) + test/agent-learning-prompts-registry.test.ts (+98). Imports: node:fs, node:path, pi-utils only — no network/LLM/subprocess. Two observations for the integration owner (not blockers for ticket AC 1-3, which are met): (a) 'unknown key' semantics — string-valued unrecognized keys are APPLIED as overrides (get('totally-bogus-key')='hello world', has=true) while unknownKeys only lists non-string values (probe returned ['bad-value']); a key that is unknown to the builtins but string-valued is reported in no list; (b) committed test file is agent-learning-prompts-registry.test.ts, not agent-learning-prompts.test.ts; mtime hot-reload has no committed test — coordinator's fix was verified live but is not regression-pinned. Note: no committed test covers hot reload; verified via live probe only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prompt registry (registry.ts): PromptRegistry interface {get/render/has}, builtin templates (miner/attempt/judge/reflect...), runtime overrides via <agentDir>/agent-learning/prompts.json with mtime hot-reload (fixed from 60s TTL during audit), unknown-key reporting. Data-only, zero LLM/network. 31/31 green. Bookmark al-prompts @ bcc75af6.
<!-- SECTION:FINAL_SUMMARY:END -->
