---
id: TASK-114
title: Fix Ollama api.ToolProperty 400 from z.unknown() tool schemas
status: Done
assignee: []
created_date: '2026-09-10 19:12'
labels: []
dependencies: []
ordinal: 239000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 omp_workflow_route.route and omp_workflow_gate.evidence typed as real schemas (no z.unknown())
- [ ] #2 Fresh OMP session with ollamacloud model through OmniRoute completes without ToolProperty 400
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
p0-tools.ts route/evidence typed (8ebd3ce, 5.1.0-ezxomp.3); live smoke both tools pass structured domain errors via marketplace install; root cause pi-ai normalizeEmptySchemas {}→true + Ollama Go strict unmarshal
<!-- SECTION:FINAL_SUMMARY:END -->
