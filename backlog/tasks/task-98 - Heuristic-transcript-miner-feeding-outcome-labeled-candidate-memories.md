---
id: TASK-98
title: Heuristic transcript miner feeding outcome-labeled candidate memories
status: Done
assignee:
  - '@W98'
created_date: '2026-09-06 05:24'
updated_date: '2026-09-06 07:27'
labels:
  - feature
  - investigation
dependencies: []
references:
  - 'https://github.com/microsoft/SkillOpt/blob/main/skillopt_sleep/harvest_pi.py'
documentation:
  - doc-23
priority: medium
type: feature
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port skillopt_sleep/mine.py heuristic_mine (zero API): read local OMP session JSONL under ~/.pi/agent/sessions (schema already documented in upstream harvest_pi.py), detect retry chains and lexical feedback to produce outcome-labeled task records (success/fail/mixed/unknown), and store them as candidate evidence for the procedures lane. Complements the usage lane (TASK-25) which only sees tool calls; this mines user intents and correction signals. Read-only harvest, secret-shaped-string redaction, respects the doc-23 data boundary: no LLM calls, no outbound content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Miner runs offline with zero network calls, unit-tested on fixture transcripts
- [x] #2 Retry chains and lexical feedback produce outcome labels; recovered tool errors never poison labels
- [x] #3 Secret-shaped strings are redacted before any record is persisted
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator audit fixes: ingestion-level redaction (userPrompts/assistantFinals pass redactSecrets before record build — leak probe on secrets fixture now clean), iserror-test fixture added (recovered tool error + positive feedback → outcome success, AC2 verified empirically), deterministic mtime order for harvest tests, parseSince helper for YYYYMMDDHHMMSS/ISO/epoch since values, dangling.jsonl fixture for v2 whole-rejection test. 43/43 tests green (miner 17 + suite 26). Bookmark al-mine @ 6502e801.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Heuristic transcript miner ported (miner.ts + types.ts): digestPiSession (v1/v2/v3 tree with active-branch resolution + whole-rejection of malformed graphs), mineTranscripts (outcome labels success/fail/mixed/unknown from lexical feedback + retry chains), dedupTasks (sessionId-keyed merge preferring resolved outcomes), redactSecrets (AWS/gh/xox/PEMR/generic key=value entropy rules) wired at INGESTION, harvestTranscripts (mtime-desc walk, parseSince, limit). 6 fixtures incl. recovered-error + dangling-parentId cases. Verified: 17 unit tests + 26 suite = 43/43 green; zero-network import audit (node:fs/path/crypto only); leak probe clean. Bookmark al-mine @ 6502e801.
<!-- SECTION:FINAL_SUMMARY:END -->
