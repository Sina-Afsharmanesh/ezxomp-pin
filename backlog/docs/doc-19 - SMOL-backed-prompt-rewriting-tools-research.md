---
id: doc-19
title: SMOL-backed prompt rewriting tools research
type: other
created_date: '2026-08-31 00:57'
updated_date: '2026-08-31 00:57'
---
# Research: SMOL-backed Prompt Rewriting Tools

**Date:** 2026-08-31
**Type:** Research
**Related:** TASK-58
**Status:** Draft

## Goal
Research existing prompt-rewriting tools that use lightweight models (SMOL) for regeneration iterations. Identify patterns for durability, error handling, model resolution, and cost optimization relevant to the augment plugin.

## Key Findings

### SMOL Model Configuration in OMP
- Defined in `~/.omp/agent/config.yml` under `modelRoles.smol`
- Example: `openai/gpt-4.1-mini:minimal`
- Accessible via:
  - CLI: `omp config get modelRoles.smol`
  - Env var: `PI_SMOL_MODEL`
  - Temp override: `omp --smol MODEL_ID`
- Source: [oh-my-pi/docs/settings.md](https://github.com/can1357/oh-my-pi/blob/main/docs/settings.md) (36 sources)

### Cited Tools/Approaches
1. **Prompt Leverage Framework** (augment plugin internal)
   - Objective → Context → Work Style → Tool Rules → Output Contract → Verification → Done Criteria
   - Disabled for SMOL to avoid token waste (per constraints below).

2. **Cohere Command / no Token Use**
   - [no-token-use github](https://github.com/AlvaroBeckerig/e232cf961487846360d7d1295de7b377)
   - Example of regeneration-only flow without token cost.

3. **Industry Prior Art** (not yet researched)
   - Prompt optimization tools
   - Self-questioning workflows using cheap models
   - Iterative expansion/contraction using SMOL

## Constraints for SMOL-backed Regeneration
- Do NOT ask SMOL to generate framework blocks (Objective, Context, etc.) — they are generated offline in `prompt-leverage.ts`.
- SMOL purposes: correct grammar, add missing execution details, polish tone, strip redundant sections.
- Current augment design: single-pass generation. Regeneration iterates on the same basic rewrite with added retry reminder, not a separate "proto-prompt → refine → retry" loop.

## Open Questions
1. Are there established patterns for multi-iteration regeneration with SMOL?
2. Should SMOL generate modified constraints rather than full rewrites?
3. What token limits make sense for SMOL vs full-model passes?
4. How do other tools handle SMOL failures (rate limits, coverage, timeout)?

## Next Steps
- Search for comprehensive prompt-rewriting tool docs (evo-mode, other ezxomp plugins).
- Surface comparative metrics (speed, cost, quality lift).
- Provide concrete augmentation patterns tailored to augment use case.
